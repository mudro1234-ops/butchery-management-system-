-- A staff invitation must never silently succeed when the same user already has a membership.
-- This prevents accepting an invitation from marking it accepted without applying the invited role.
create or replace function private.accept_staff_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_inv public.staff_invitations%rowtype;
  v_email text;
begin
  if auth.uid() is null then raise exception 'You must be signed in to accept this invitation'; end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  select * into v_inv from public.staff_invitations where id = p_invitation_id for update;
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
    select 1 from public.departments d
    where d.id = v_inv.department_id and d.business_id = v_inv.business_id and d.active
  ) then raise exception 'The assigned department is no longer available'; end if;
  if exists (
    select 1 from public.business_members bm
    where bm.business_id=v_inv.business_id and bm.user_id=auth.uid()
  ) then
    raise exception 'This account already has access to this business. Ask the owner to review the existing staff role.';
  end if;
  insert into public.business_members (business_id,user_id,role,department_id,display_name,active)
  values (v_inv.business_id,auth.uid(),v_inv.role,v_inv.department_id,v_inv.display_name,true);
  update public.staff_invitations set status='accepted',accepted_at=now() where id=v_inv.id;
  return jsonb_build_object('business_id',v_inv.business_id,'role',v_inv.role);
end;
$function$;
revoke all on function private.accept_staff_invitation(uuid) from public, anon;
grant execute on function private.accept_staff_invitation(uuid) to authenticated;
