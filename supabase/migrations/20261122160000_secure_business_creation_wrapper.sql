-- Keep the privileged onboarding operation in the private schema.
-- The public API wrapper is SECURITY INVOKER and is callable only by authenticated users.
create or replace function private.create_business(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_business_id uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;
  if length(trim(coalesce(p_name,''))) < 2 then
    raise exception 'Business name must contain at least 2 characters';
  end if;
  if exists(select 1 from public.business_members where user_id=v_uid and active=true) then
    raise exception 'This user already belongs to an active business';
  end if;
  insert into public.businesses(name) values (trim(p_name))
  returning id into v_business_id;
  insert into public.departments(business_id,code,name) values
    (v_business_id,'red_meat','Red Meat'),
    (v_business_id,'chicken_offals_sausages','Chicken, Offals & Sausages'),
    (v_business_id,'pork_fish','Pork & Fish');
  insert into public.business_members(business_id,user_id,role,display_name,active)
  values(v_business_id,v_uid,'owner',coalesce((select nullif(raw_user_meta_data->>'full_name','') from auth.users where id=v_uid),'Owner'),true);
  return v_business_id;
end;
$function$;

revoke all on function private.create_business(text) from public, anon;
grant execute on function private.create_business(text) to authenticated;

create or replace function public.create_business(p_name text)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.create_business(p_name);
$function$;

revoke all on function public.create_business(text) from public, anon;
grant execute on function public.create_business(text) to authenticated;
