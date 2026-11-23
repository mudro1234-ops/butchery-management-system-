-- Move inventory writes behind validated atomic RPCs.
create or replace function public.receive_stock(
  p_business_id uuid,p_department_id uuid,p_product_id uuid,p_batch_code text,
  p_quantity numeric,p_unit public.stock_unit,p_unit_cost numeric default 0,p_expiry_date date default null
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_batch_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_quantity is null or p_quantity<=0 then raise exception 'Received quantity must be greater than zero'; end if;
  if p_unit_cost is null or p_unit_cost<0 then raise exception 'Unit cost cannot be negative'; end if;
  if length(trim(coalesce(p_batch_code,'')))<2 then raise exception 'Enter a batch reference'; end if;
  if not private.has_department_access(p_business_id,p_department_id,array['stock_clerk']::public.staff_role[]) then raise exception 'You do not have stock receiving access for this department'; end if;
  if not exists(select 1 from public.products p where p.id=p_product_id and p.business_id=p_business_id and p.department_id=p_department_id and p.active and p.unit=p_unit) then
    raise exception 'Select an active product from this department with the matching unit';
  end if;
  insert into public.stock_batches(business_id,department_id,product_id,batch_code,quantity_received,quantity_on_hand,unit,unit_cost,expiry_date)
  values(p_business_id,p_department_id,p_product_id,trim(p_batch_code),p_quantity,p_quantity,p_unit,p_unit_cost,p_expiry_date)
  returning id into v_batch_id;
  insert into public.stock_movements(business_id,department_id,product_id,batch_id,movement_type,quantity,unit,unit_cost,reference_type,reference_id,reason,created_by)
  values(p_business_id,p_department_id,p_product_id,v_batch_id,'receipt',p_quantity,p_unit,p_unit_cost,'stock_batch',v_batch_id,'Initial stock receiving',(select auth.uid()));
  return v_batch_id;
end;
$$;
revoke all on function public.receive_stock(uuid,uuid,uuid,text,numeric,public.stock_unit,numeric,date) from public,anon;
grant execute on function public.receive_stock(uuid,uuid,uuid,text,numeric,public.stock_unit,numeric,date) to authenticated;

create or replace function public.record_stock_purchase(
  p_business_id uuid,p_department_id uuid,p_supplier_id uuid,p_reference_no text,p_invoice_no text,
  p_currency text,p_exchange_rate numeric,p_product_id uuid,p_quantity numeric,p_unit_cost numeric,
  p_batch_code text,p_expiry_date date default null
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare v_purchase_id uuid; v_batch_id uuid; v_unit public.stock_unit; v_total numeric(14,2);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_quantity is null or p_quantity<=0 then raise exception 'Quantity must be greater than zero'; end if;
  if p_unit_cost is null or p_unit_cost<0 then raise exception 'Unit cost cannot be negative'; end if;
  if p_exchange_rate is null or p_exchange_rate<=0 then raise exception 'Exchange rate must be greater than zero'; end if;
  if length(trim(coalesce(p_reference_no,'')))<2 or length(trim(coalesce(p_batch_code,'')))<2 then raise exception 'Purchase and batch references are required'; end if;
  if not private.has_department_access(p_business_id,p_department_id,array['stock_clerk']::public.staff_role[]) then raise exception 'You do not have purchasing access for this department'; end if;
  if p_supplier_id is not null and not exists(select 1 from public.suppliers s where s.id=p_supplier_id and s.business_id=p_business_id and s.active) then raise exception 'Select an active supplier from this business'; end if;
  select unit into v_unit from public.products where id=p_product_id and business_id=p_business_id and department_id=p_department_id and active;
  if not found then raise exception 'Select an active product from this department'; end if;
  v_total:=round(p_quantity*p_unit_cost,2);
  insert into public.purchases(business_id,department_id,supplier_id,reference_no,invoice_no,currency,exchange_rate,subtotal,status,created_by)
  values(p_business_id,p_department_id,p_supplier_id,trim(p_reference_no),nullif(trim(coalesce(p_invoice_no,'')),''),upper(trim(coalesce(p_currency,'USD'))),p_exchange_rate,v_total,'received',(select auth.uid()))
  returning id into v_purchase_id;
  insert into public.purchase_items(business_id,purchase_id,product_id,description,quantity,unit,unit_cost,line_total)
  select p_business_id,v_purchase_id,p.id,p.name,p_quantity,v_unit,p_unit_cost,v_total from public.products p where p.id=p_product_id;
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

create or replace function private.close_cashier_shift(p_shift_id uuid,p_actual_cash numeric,p_closing_notes text default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_shift public.cashier_shifts%rowtype; v_net_cash numeric:=0; v_expected numeric;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_actual_cash is null or p_actual_cash<0 then raise exception 'Counted cash cannot be negative'; end if;
  select * into v_shift from public.cashier_shifts where id=p_shift_id for update;
  if not found then raise exception 'Cashier shift not found'; end if;
  if v_shift.status<>'open' then raise exception 'This shift is already closed'; end if;
  if not ((v_shift.cashier_id=auth.uid() and private.has_department_access(v_shift.business_id,v_shift.department_id,array['cashier']::public.staff_role[]))
    or private.has_department_access(v_shift.business_id,v_shift.department_id,array[]::public.staff_role[])) then
    raise exception 'You cannot close this cashier shift';
  end if;
  select coalesce(sum(case
    when payment_method='cash' and transaction_type='sale' then amount
    when payment_method='cash' and transaction_type in ('expense','refund','cash_out') then -amount
    else 0 end),0)
  into v_net_cash from public.cash_transactions where shift_id=p_shift_id;
  v_expected:=coalesce(v_shift.opening_cash,0)+v_net_cash;
  update public.cashier_shifts set expected_cash=v_expected,actual_cash=p_actual_cash,
    variance=round(p_actual_cash-v_expected,2),status='closed',closed_at=now(),
    closing_notes=nullif(trim(coalesce(p_closing_notes,'')),'')
  where id=p_shift_id;
  return jsonb_build_object('shift_id',p_shift_id,'expected_cash',v_expected,'actual_cash',p_actual_cash,'variance',round(p_actual_cash-v_expected,2));
end;
$$;
revoke all on function private.close_cashier_shift(uuid,numeric,text) from public,anon;
grant execute on function private.close_cashier_shift(uuid,numeric,text) to authenticated;
create or replace function public.close_cashier_shift(p_shift_id uuid,p_actual_cash numeric,p_closing_notes text default null)
returns jsonb language sql security invoker set search_path=''
as $$ select private.close_cashier_shift(p_shift_id,p_actual_cash,p_closing_notes); $$;
revoke all on function public.close_cashier_shift(uuid,numeric,text) from public,anon;
grant execute on function public.close_cashier_shift(uuid,numeric,text) to authenticated;

create or replace function private.void_sale(p_sale_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_sale public.sales%rowtype; v_item record; v_method public.payment_method; v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Provide a cancellation reason of at least five characters'; end if;
  select * into v_sale from public.sales where id=p_sale_id for update;
  if not found then raise exception 'Sale not found'; end if;
  if not private.has_department_access(v_sale.business_id,v_sale.department_id,array[]::public.staff_role[]) then
    raise exception 'Only a manager or owner can cancel a completed sale';
  end if;
  if v_sale.status<>'posted' then raise exception 'Only a posted sale can be cancelled'; end if;
  select payment_method into v_method from public.cash_transactions
    where reference_type='sale' and reference_id=v_sale.id order by created_at desc limit 1;
  if v_method is null then v_method:='other'::public.payment_method; end if;
  for v_item in select si.*,b.unit_cost as batch_unit_cost from public.sale_items si
    join public.stock_batches b on b.id=si.batch_id
    where si.sale_id=v_sale.id
  loop
    update public.stock_batches set quantity_on_hand=quantity_on_hand+v_item.quantity where id=v_item.batch_id;
    insert into public.stock_movements(business_id,department_id,product_id,batch_id,movement_type,quantity,unit,unit_cost,reference_type,reference_id,reason,created_by,approved_by)
    values(v_sale.business_id,v_sale.department_id,v_item.product_id,v_item.batch_id,'sale_void_reversal',v_item.quantity,v_item.unit,v_item.batch_unit_cost,'sale',v_sale.id,'Sale cancelled: '||trim(p_reason),v_uid,v_uid);
  end loop;
  update public.sales set status='void',void_reason=trim(p_reason),voided_by=v_uid where id=v_sale.id;
  insert into public.cash_transactions(business_id,department_id,shift_id,transaction_type,payment_method,amount,currency,reference_type,reference_id,notes,recorded_by)
  values(v_sale.business_id,v_sale.department_id,v_sale.shift_id,'refund',v_method,coalesce(v_sale.total,0),v_sale.currency,'sale_void',v_sale.id,'Sale cancellation: '||trim(p_reason),v_uid);
  return jsonb_build_object('sale_id',v_sale.id,'receipt_no',v_sale.receipt_no,'status','void','reason',trim(p_reason));
end;
$$;
revoke all on function private.void_sale(uuid,text) from public,anon;
grant execute on function private.void_sale(uuid,text) to authenticated;
create or replace function public.void_sale(p_sale_id uuid,p_reason text)
returns jsonb language sql security invoker set search_path=''
as $$ select private.void_sale(p_sale_id,p_reason); $$;
revoke all on function public.void_sale(uuid,text) from public,anon;
grant execute on function public.void_sale(uuid,text) to authenticated;

-- Inventory ledgers are append-only; all quantity changes must go through validated RPCs.
drop policy if exists batches_stock_insert on public.stock_batches;
drop policy if exists batches_stock_update on public.stock_batches;
drop policy if exists batches_stock_delete on public.stock_batches;
drop policy if exists movements_stock_insert on public.stock_movements;
drop policy if exists movements_stock_update on public.stock_movements;
drop policy if exists movements_stock_delete on public.stock_movements;
drop policy if exists products_stock_delete on public.products;
drop policy if exists purchases_stock_insert on public.purchases;
drop policy if exists purchases_stock_update on public.purchases;
drop policy if exists purchases_stock_delete on public.purchases;
drop policy if exists purchase_items_stock_insert on public.purchase_items;
drop policy if exists purchase_items_stock_update on public.purchase_items;
drop policy if exists purchase_items_stock_delete on public.purchase_items;
drop policy if exists carcasses_stock_update on public.beef_carcasses;
drop policy if exists carcasses_stock_delete on public.beef_carcasses;
drop policy if exists processing_runs_stock_insert on public.processing_runs;
drop policy if exists processing_runs_stock_update on public.processing_runs;
drop policy if exists processing_outputs_stock_insert on public.processing_outputs;
drop policy if exists processing_outputs_stock_update on public.processing_outputs;
drop policy if exists stock_counts_manager_approve on public.stock_counts;
drop policy if exists supplier_payments_manager_update on public.supplier_payments;
drop policy if exists supplier_payments_manager_delete on public.supplier_payments;
drop policy if exists shifts_cashier_update on public.cashier_shifts;
drop policy if exists sales_cashier_insert_department on public.sales;
drop policy if exists sales_manager_update_department on public.sales;
drop policy if exists sale_items_cashier_insert_department on public.sale_items;
drop policy if exists cash_transactions_staff_insert_department on public.cash_transactions;

-- Product pricing and stock units are manager-controlled; clerks may maintain catalogue descriptions.
create or replace function private.protect_product_pricing()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is not null
    and (new.expected_sale_price is distinct from old.expected_sale_price or new.unit is distinct from old.unit)
    and not private.has_department_access(new.business_id,null,array[]::public.staff_role[]) then
    raise exception 'Only an owner or manager can change product selling prices or stock units';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_product_pricing() from public,anon,authenticated;
drop trigger if exists protect_product_pricing on public.products;
create trigger protect_product_pricing before update on public.products
for each row execute function private.protect_product_pricing();