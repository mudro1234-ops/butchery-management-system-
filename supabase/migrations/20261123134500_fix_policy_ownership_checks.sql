drop policy if exists supplier_payments_manager_insert on public.supplier_payments;
drop policy if exists supplier_payments_manager_update on public.supplier_payments;
create policy supplier_payments_manager_insert on public.supplier_payments for insert to authenticated
with check (
  recorded_by=(select auth.uid())
  and private.has_department_access(supplier_payments.business_id,null,array[]::public.staff_role[])
  and exists(select 1 from public.suppliers s where s.id=supplier_payments.supplier_id and s.business_id=supplier_payments.business_id)
  and (supplier_payments.purchase_id is null or exists(
    select 1 from public.purchases p where p.id=supplier_payments.purchase_id
      and p.business_id=supplier_payments.business_id and p.supplier_id=supplier_payments.supplier_id
  ))
);
create policy supplier_payments_manager_update on public.supplier_payments for update to authenticated
using (private.has_department_access(supplier_payments.business_id,null,array[]::public.staff_role[]))
with check (
  private.has_department_access(supplier_payments.business_id,null,array[]::public.staff_role[])
  and exists(select 1 from public.suppliers s where s.id=supplier_payments.supplier_id and s.business_id=supplier_payments.business_id)
  and (supplier_payments.purchase_id is null or exists(
    select 1 from public.purchases p where p.id=supplier_payments.purchase_id
      and p.business_id=supplier_payments.business_id and p.supplier_id=supplier_payments.supplier_id
  ))
);

drop policy if exists batches_stock_insert on public.stock_batches;
drop policy if exists batches_stock_update on public.stock_batches;
create policy batches_stock_insert on public.stock_batches for insert to authenticated
with check (
  private.has_department_access(stock_batches.business_id,stock_batches.department_id,array['stock_clerk']::public.staff_role[])
  and exists(select 1 from public.products p where p.id=stock_batches.product_id and p.business_id=stock_batches.business_id and p.department_id=stock_batches.department_id)
);
create policy batches_stock_update on public.stock_batches for update to authenticated
using (private.has_department_access(stock_batches.business_id,stock_batches.department_id,array['stock_clerk']::public.staff_role[]))
with check (
  private.has_department_access(stock_batches.business_id,stock_batches.department_id,array['stock_clerk']::public.staff_role[])
  and exists(select 1 from public.products p where p.id=stock_batches.product_id and p.business_id=stock_batches.business_id and p.department_id=stock_batches.department_id)
);

drop policy if exists carcasses_stock_insert on public.beef_carcasses;
drop policy if exists carcasses_stock_update on public.beef_carcasses;
create policy carcasses_stock_insert on public.beef_carcasses for insert to authenticated
with check (
  private.has_department_access(beef_carcasses.business_id,beef_carcasses.department_id,array['stock_clerk']::public.staff_role[])
  and (beef_carcasses.supplier_id is null or exists(select 1 from public.suppliers s where s.id=beef_carcasses.supplier_id and s.business_id=beef_carcasses.business_id))
);
create policy carcasses_stock_update on public.beef_carcasses for update to authenticated
using (private.has_department_access(beef_carcasses.business_id,beef_carcasses.department_id,array['stock_clerk']::public.staff_role[]))
with check (
  private.has_department_access(beef_carcasses.business_id,beef_carcasses.department_id,array['stock_clerk']::public.staff_role[])
  and (beef_carcasses.supplier_id is null or exists(select 1 from public.suppliers s where s.id=beef_carcasses.supplier_id and s.business_id=beef_carcasses.business_id))
);

drop policy if exists movements_stock_insert on public.stock_movements;
drop policy if exists movements_stock_update on public.stock_movements;
create policy movements_stock_insert on public.stock_movements for insert to authenticated
with check (
  private.has_department_access(stock_movements.business_id,stock_movements.department_id,array['stock_clerk']::public.staff_role[])
  and exists(select 1 from public.products p where p.id=stock_movements.product_id and p.business_id=stock_movements.business_id and p.department_id=stock_movements.department_id)
  and (stock_movements.batch_id is null or exists(select 1 from public.stock_batches b where b.id=stock_movements.batch_id and b.business_id=stock_movements.business_id and b.department_id=stock_movements.department_id and b.product_id=stock_movements.product_id))
);
create policy movements_stock_update on public.stock_movements for update to authenticated
using (private.has_department_access(stock_movements.business_id,stock_movements.department_id,array['stock_clerk']::public.staff_role[]))
with check (
  private.has_department_access(stock_movements.business_id,stock_movements.department_id,array['stock_clerk']::public.staff_role[])
  and exists(select 1 from public.products p where p.id=stock_movements.product_id and p.business_id=stock_movements.business_id and p.department_id=stock_movements.department_id)
  and (stock_movements.batch_id is null or exists(select 1 from public.stock_batches b where b.id=stock_movements.batch_id and b.business_id=stock_movements.business_id and b.department_id=stock_movements.department_id and b.product_id=stock_movements.product_id))
);

drop policy if exists expenses_manager_insert on public.expenses;
create policy expenses_manager_insert on public.expenses for insert to authenticated
with check (
  recorded_by=(select auth.uid())
  and private.has_department_access(expenses.business_id,expenses.department_id,array[]::public.staff_role[])
  and (expenses.supplier_id is null or exists(select 1 from public.suppliers s where s.id=expenses.supplier_id and s.business_id=expenses.business_id))
);