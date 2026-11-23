create or replace function private.post_sale(
  p_business_id uuid,
  p_department_id uuid,
  p_shift_id uuid,
  p_currency text,
  p_exchange_rate numeric,
  p_discount numeric,
  p_payment_method public.payment_method,
  p_lines jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_shift public.cashier_shifts%rowtype;
  v_sale_id uuid;
  v_receipt text;
  v_line jsonb;
  v_batch public.stock_batches%rowtype;
  v_product public.products%rowtype;
  v_qty numeric;
  v_price numeric;
  v_subtotal numeric := 0;
  v_cogs numeric := 0;
  v_total numeric;
  v_line_total numeric;
  v_line_cost numeric;
  v_items integer := 0;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines)=0 then raise exception 'Add at least one product to the sale'; end if;
  if p_exchange_rate is null or p_exchange_rate<=0 then raise exception 'Exchange rate must be greater than zero'; end if;
  if p_discount is null or p_discount<0 then raise exception 'Discount cannot be negative'; end if;
  if not private.has_department_access(p_business_id,p_department_id,array['cashier']::public.staff_role[]) then
    raise exception 'You do not have sales access for this department';
  end if;
  select * into v_shift from public.cashier_shifts
    where id=p_shift_id and business_id=p_business_id and department_id=p_department_id
      and status='open' and cashier_id=v_uid for update;
  if not found then raise exception 'Open your own cashier shift before making a sale'; end if;

  v_receipt := 'R-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.sales(business_id,department_id,shift_id,receipt_no,currency,exchange_rate,subtotal,discount,total,cost_of_goods,status,cashier_id)
  values(p_business_id,p_department_id,p_shift_id,v_receipt,upper(trim(coalesce(p_currency,'USD'))),p_exchange_rate,0,0,0,0,'draft',v_uid)
  returning id into v_sale_id;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_items := v_items+1;
    if v_items>100 then raise exception 'A sale cannot contain more than 100 lines'; end if;
    v_qty := (v_line->>'quantity')::numeric;
    v_price := (v_line->>'unit_price')::numeric;
    if v_qty is null or v_qty<=0 or v_price is null or v_price<0 then raise exception 'Each sale line needs a positive quantity and non-negative selling price'; end if;
    select * into v_batch from public.stock_batches
      where id=(v_line->>'batch_id')::uuid and business_id=p_business_id
        and department_id=p_department_id for update;
    if not found then raise exception 'A selected stock batch is not available in this department'; end if;
    if v_batch.quantity_on_hand < v_qty then raise exception 'Insufficient stock in batch %',v_batch.batch_code; end if;
    select * into v_product from public.products where id=v_batch.product_id and business_id=p_business_id and active;
    if not found then raise exception 'The product linked to a stock batch is no longer active'; end if;
    v_line_total := round(v_qty*v_price,2);
    v_line_cost := round(v_qty*coalesce(v_batch.unit_cost,0),2);
    v_subtotal := v_subtotal+v_line_total;
    v_cogs := v_cogs+v_line_cost;
    insert into public.sale_items(business_id,sale_id,product_id,batch_id,quantity,unit,unit_price,unit_cost,line_total,line_cost)
    values(p_business_id,v_sale_id,v_product.id,v_batch.id,v_qty,v_batch.unit,v_price,coalesce(v_batch.unit_cost,0),v_line_total,v_line_cost);
    update public.stock_batches set quantity_on_hand=quantity_on_hand-v_qty where id=v_batch.id;
    insert into public.stock_movements(business_id,department_id,product_id,batch_id,movement_type,quantity,unit,unit_cost,reference_type,reference_id,reason,created_by)
    values(p_business_id,p_department_id,v_product.id,v_batch.id,'sale',-v_qty,v_batch.unit,coalesce(v_batch.unit_cost,0),'sale',v_sale_id,'POS sale deduction',v_uid);
  end loop;

  if p_discount>v_subtotal then raise exception 'Discount cannot exceed the sale subtotal'; end if;
  v_total := round(v_subtotal-p_discount,2);
  update public.sales set subtotal=v_subtotal,discount=p_discount,total=v_total,cost_of_goods=v_cogs,status='posted' where id=v_sale_id;
  insert into public.cash_transactions(business_id,department_id,shift_id,transaction_type,payment_method,amount,currency,reference_type,reference_id,notes,recorded_by)
  values(p_business_id,p_department_id,p_shift_id,'sale',p_payment_method,v_total,upper(trim(coalesce(p_currency,'USD'))),'sale',v_sale_id,'POS receipt '||v_receipt,v_uid);
  return jsonb_build_object('sale_id',v_sale_id,'receipt_no',v_receipt,'subtotal',v_subtotal,'discount',p_discount,'total',v_total,'cost_of_goods',v_cogs);
end;
$$;
revoke all on function private.post_sale(uuid,uuid,uuid,text,numeric,numeric,public.payment_method,jsonb) from public,anon;
grant execute on function private.post_sale(uuid,uuid,uuid,text,numeric,numeric,public.payment_method,jsonb) to authenticated;
create or replace function public.post_sale(
  p_business_id uuid,p_department_id uuid,p_shift_id uuid,p_currency text,
  p_exchange_rate numeric,p_discount numeric,p_payment_method public.payment_method,p_lines jsonb
) returns jsonb language sql security invoker set search_path=''
as $$ select private.post_sale(p_business_id,p_department_id,p_shift_id,p_currency,p_exchange_rate,p_discount,p_payment_method,p_lines); $$;
revoke all on function public.post_sale(uuid,uuid,uuid,text,numeric,numeric,public.payment_method,jsonb) from public,anon;
grant execute on function public.post_sale(uuid,uuid,uuid,text,numeric,numeric,public.payment_method,jsonb) to authenticated;