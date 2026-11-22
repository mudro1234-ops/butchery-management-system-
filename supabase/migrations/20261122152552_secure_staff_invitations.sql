create table if not exists public.staff_invitations (
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 email text not null, display_name text not null,
 role public.staff_role not null check (role in ('manager','cashier','stock_clerk')),
 department_id uuid references public.departments(id) on delete set null, auth_user_id uuid,
 invited_by uuid not null references auth.users(id),
 status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
 expires_at timestamptz not null default (now() + interval '48 hours'), accepted_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists staff_invitations_business_idx on public.staff_invitations(business_id, created_at desc);
alter table public.staff_invitations enable row level security;
create policy staff_invitations_owner_read on public.staff_invitations for select to authenticated
using ((select private.has_business_role(business_id, array['owner']::public.staff_role[])));
create or replace function public.accept_staff_invitation(p_invitation_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_inv public.staff_invitations%rowtype; v_email text;
begin
 if auth.uid() is null then raise exception 'You must be signed in to accept this invitation'; end if;
 select lower(email) into v_email from auth.users where id=auth.uid();
 select * into v_inv from public.staff_invitations where id=p_invitation_id for update;
 if not found then raise exception 'Invitation not found'; end if;
 if v_inv.status <> 'pending' then raise exception 'This invitation is no longer available'; end if;
 if v_inv.expires_at <= now() then
   update public.staff_invitations set status='expired' where id=v_inv.id;
   raise exception 'This invitation has expired. Ask the owner to send a new one.';
 end if;
 if v_inv.auth_user_id is distinct from auth.uid() or v_email is distinct from lower(v_inv.email) then
   raise exception 'This invitation was issued to a different email account';
 end if;
 if v_inv.department_id is not null and not exists (
   select 1 from public.departments d where d.id=v_inv.department_id and d.business_id=v_inv.business_id and d.active
 ) then raise exception 'The assigned department is no longer available'; end if;
 insert into public.business_members(business_id,user_id,role,department_id,display_name,active)
 values(v_inv.business_id,auth.uid(),v_inv.role,v_inv.department_id,v_inv.display_name,true)
 on conflict(business_id,user_id) do nothing;
 update public.staff_invitations set status='accepted',accepted_at=now() where id=v_inv.id;
 return jsonb_build_object('business_id',v_inv.business_id,'role',v_inv.role);
end;
$$;
revoke all on function public.accept_staff_invitation(uuid) from public, anon;
grant execute on function public.accept_staff_invitation(uuid) to authenticated;
