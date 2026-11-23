create or replace function public.approve_stock_count(p_count_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_count public.stock_counts%rowtype;
  v_batch public.stock_batches%rowtype;
  v_variance numeric;
  v_new_quantity numeric;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_count from public.stock_counts where id=p_count_id for update;
  if not found then raise exception 'Stock count not found'; end if;
  if not private.has_department_access(v_count.business_id,null,array[]::public.staff_role[]) then
    raise exception 'Only a business owner or manager can approve stock counts';
  end if;
  if v_count.approved_by is not null then raise exception 'This stock count has already been approved'; end if;
  if v_count.batch_id is null then raise exception 'This count is not linked to a stock batch'; end if;
  select * into v_batch from public.stock_batches where id=v_count.batch_id
    and business_id=v_count.business_id and department_id=v_count.department_id for update;
  if not found then raise exception 'The counted stock batch no longer exists'; end if;
  v_variance:=v_count.counted_quantity-v_batch.quantity_on_hand;
  v_new_quantity:=v_batch.quantity_on_hand+v_variance;
  if v_new_quantity<0 then raise exception 'Stock adjustment cannot result in negative stock'; end if;
  update public.stock_batches set quantity_on_hand=v_new_quantity where id=v_batch.id;
  insert into public.stock_movements(
    business_id,department_id,product_id,batch_id,movement_type,quantity,unit,unit_cost,
    reference_type,reference_id,reason,created_by,approved_by
  ) values(
    v_count.business_id,v_count.department_id,v_count.product_id,v_batch.id,'count_adjustment',
    v_variance,v_batch.unit,coalesce(v_batch.unit_cost,0),'stock_count',v_count.id,
    'Approved physical stock count variance',v_count.counted_by,v_uid
  );
  update public.stock_counts set system_quantity=v_batch.quantity_on_hand,
    variance=v_variance,approved_by=v_uid,counted_at=coalesce(counted_at,now())
    where id=v_count.id;
  return jsonb_build_object('stock_count_id',v_count.id,'variance',v_variance,'new_quantity',v_new_quantity);
end;
$$;
revoke all on function public.approve_stock_count(uuid) from public,anon;
grant execute on function public.approve_stock_count(uuid) to authenticated;