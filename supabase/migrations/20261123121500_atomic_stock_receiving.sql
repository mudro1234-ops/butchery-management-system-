create or replace function public.receive_stock(
  p_business_id uuid,
  p_department_id uuid,
  p_product_id uuid,
  p_batch_code text,
  p_quantity numeric,
  p_unit public.stock_unit,
  p_unit_cost numeric default 0,
  p_expiry_date date default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_batch_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Received quantity must be greater than zero'; end if;
  if p_unit_cost is null or p_unit_cost < 0 then raise exception 'Unit cost cannot be negative'; end if;
  if length(trim(coalesce(p_batch_code,''))) < 2 then raise exception 'Enter a batch reference'; end if;
  if not private.has_department_access(p_business_id,p_department_id,array['stock_clerk']::public.staff_role[]) then
    raise exception 'You do not have stock receiving access for this department';
  end if;
  if not exists (
    select 1 from public.products p
    where p.id=p_product_id and p.business_id=p_business_id
      and p.department_id=p_department_id and p.active=true and p.unit=p_unit
  ) then raise exception 'Select an active product from this department with the matching unit'; end if;

  insert into public.stock_batches(
    business_id,department_id,product_id,batch_code,quantity_received,
    quantity_on_hand,unit,unit_cost,expiry_date
  ) values (
    p_business_id,p_department_id,p_product_id,trim(p_batch_code),p_quantity,
    p_quantity,p_unit,p_unit_cost,p_expiry_date
  ) returning id into v_batch_id;

  insert into public.stock_movements(
    business_id,department_id,product_id,batch_id,movement_type,quantity,
    unit,unit_cost,reference_type,reference_id,reason,created_by
  ) values (
    p_business_id,p_department_id,p_product_id,v_batch_id,'receipt',p_quantity,
    p_unit,p_unit_cost,'stock_batch',v_batch_id,'Initial stock receiving',(select auth.uid())
  );
  return v_batch_id;
end;
$$;
revoke all on function public.receive_stock(uuid,uuid,uuid,text,numeric,public.stock_unit,numeric,date) from public, anon;
grant execute on function public.receive_stock(uuid,uuid,uuid,text,numeric,public.stock_unit,numeric,date) to authenticated;