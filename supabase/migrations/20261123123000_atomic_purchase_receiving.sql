create or replace function public.record_stock_purchase(
  p_business_id uuid,
  p_department_id uuid,
  p_supplier_id uuid,
  p_reference_no text,
  p_invoice_no text,
  p_currency text,
  p_exchange_rate numeric,
  p_product_id uuid,
  p_quantity numeric,
  p_unit_cost numeric,
  p_batch_code text,
  p_expiry_date date default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_purchase_id uuid;
  v_batch_id uuid;
  v_unit public.stock_unit;
  v_total numeric(14,2);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  if p_unit_cost is null or p_unit_cost < 0 then raise exception 'Unit cost cannot be negative'; end if;
  if p_exchange_rate is null or p_exchange_rate <= 0 then raise exception 'Exchange rate must be greater than zero'; end if;
  if length(trim(coalesce(p_reference_no,''))) < 2 then raise exception 'Purchase reference is required'; end if;
  if length(trim(coalesce(p_batch_code,''))) < 2 then raise exception 'Stock batch reference is required'; end if;
  if not private.has_department_access(p_business_id,p_department_id,array['stock_clerk']::public.staff_role[]) then
    raise exception 'You do not have purchasing access for this department';
  end if;
  if p_supplier_id is not null and not exists(select 1 from public.suppliers s where s.id=p_supplier_id and s.business_id=p_business_id and s.active) then
    raise exception 'Select an active supplier from this business';
  end if;
  select unit into v_unit from public.products
    where id=p_product_id and business_id=p_business_id and department_id=p_department_id and active;
  if not found then raise exception 'Select an active product from this department'; end if;
  v_total := round(p_quantity*p_unit_cost,2);

  insert into public.purchases(business_id,department_id,supplier_id,reference_no,invoice_no,currency,exchange_rate,subtotal,status,created_by)
  values(p_business_id,p_department_id,p_supplier_id,trim(p_reference_no),nullif(trim(coalesce(p_invoice_no,'')),''),upper(trim(coalesce(p_currency,'USD'))),p_exchange_rate,v_total,'received',(select auth.uid()))
  returning id into v_purchase_id;

  insert into public.purchase_items(business_id,purchase_id,product_id,description,quantity,unit,unit_cost,line_total)
  select p_business_id,v_purchase_id,p.id,p.name,p_quantity,v_unit,p_unit_cost,v_total
  from public.products p where p.id=p_product_id;

  insert into public.stock_batches(business_id,department_id,product_id,batch_code,quantity_received,quantity_on_hand,unit,unit_cost,expiry_date)
  values(p_business_id,p_department_id,p_product_id,trim(p_batch_code),p_quantity,p_quantity,v_unit,p_unit_cost,p_expiry_date)
  returning id into v_batch_id;

  insert into public.stock_movements(business_id,department_id,product_id,batch_id,movement_type,quantity,unit,unit_cost,reference_type,reference_id,reason,created_by)
  values(p_business_id,p_department_id,p_product_id,v_batch_id,'purchase_receipt',p_quantity,v_unit,p_unit_cost,'purchase',v_purchase_id,'Stock received against supplier purchase',(select auth.uid()));
  return v_purchase_id;
end;
$$;
revoke all on function public.record_stock_purchase(uuid,uuid,uuid,text,text,text,numeric,uuid,numeric,numeric,text,date) from public,anon;
grant execute on function public.record_stock_purchase(uuid,uuid,uuid,text,text,text,numeric,uuid,numeric,numeric,text,date) to authenticated;