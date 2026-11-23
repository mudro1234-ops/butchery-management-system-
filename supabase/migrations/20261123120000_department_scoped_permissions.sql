-- Department-scoped access for operational data.
create or replace function private.has_department_access(
  p_business_id uuid,
  p_department_id uuid,
  p_roles public.staff_role[]
) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.business_members m
    where m.business_id = p_business_id
      and m.user_id = (select auth.uid())
      and m.active = true
      and (
        m.role in ('owner'::public.staff_role, 'manager'::public.staff_role)
        or (m.role = any(p_roles) and p_department_id is not null and m.department_id = p_department_id)
      )
  );
$$;
revoke all on function private.has_department_access(uuid,uuid,public.staff_role[]) from public;
grant execute on function private.has_department_access(uuid,uuid,public.staff_role[]) to authenticated;

drop policy if exists products_member_read on public.products;
drop policy if exists products_stock_write on public.products;
create policy products_department_read on public.products for select to authenticated using (private.has_department_access(business_id,department_id,array['owner','manager','cashier','stock_clerk']::public.staff_role[]));
create policy products_stock_insert on public.products for insert to authenticated with check (private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[]));
create policy products_stock_update on public.products for update to authenticated using (private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[])) with check (private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[]));
create policy products_stock_delete on public.products for delete to authenticated using (private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[]));

drop policy if exists purchases_member_read on public.purchases;
drop policy if exists purchases_stock_write on public.purchases;
create policy purchases_department_read on public.purchases for select to authenticated using (private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[]));
create policy purchases_stock_insert on public.purchases for insert to authenticated with check (private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[]));
create policy purchases_stock_update on public.purchases for update to authenticated using (private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[])) with check (private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[]));
create policy purchases_stock_delete on public.purchases for delete to authenticated using (private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[]));

drop policy if exists purchase_items_member_read on public.purchase_items;
drop policy if exists purchase_items_stock_write on public.purchase_items;
create policy purchase_items_department_read on public.purchase_items for select to authenticated using (exists(select 1 from public.purchases p where p.id=purchase_id and p.business_id=purchase_items.business_id and private.has_department_access(p.business_id,p.department_id,array['stock_clerk']::public.staff_role[])));
create policy purchase_items_stock_insert on public.purchase_items for insert to authenticated with check (exists(select 1 from public.purchases p where p.id=purchase_id and p.business_id=purchase_items.business_id and private.has_department_access(p.business_id,p.department_id,array['stock_clerk']::public.staff_role[])));
create policy purchase_items_stock_update on public.purchase_items for update to authenticated using (exists(select 1 from public.purchases p where p.id=purchase_id and p.business_id=purchase_items.business_id and private.has_department_access(p.business_id,p.department_id,array['stock_clerk']::public.staff_role[]))) with check (exists(select 1 from public.purchases p where p.id=purchase_id and p.business_id=purchase_items.business_id and private.has_department_access(p.business_id,p.department_id,array['stock_clerk']::public.staff_role[])));
create policy purchase_items_stock_delete on public.purchase_items for delete to authenticated using (exists(select 1 from public.purchases p where p.id=purchase_id and p.business_id=purchase_items.business_id and private.has_department_access(p.business_id,p.department_id,array['stock_clerk']::public.staff_role[])));

drop policy if exists beef_carcasses_member_read on public.beef_carcasses;
drop policy if exists carcass_stock_write on public.beef_carcasses;
create policy carcasses_department_read on public.beef_carcasses for select to authenticated using (private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[]));
create policy carcasses_stock_insert on public.beef_carcasses for insert to authenticated with check (private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[]));
create policy carcasses_stock_update on public.beef_carcasses for update to authenticated using (private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[])) with check (private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[]));
create policy carcasses_stock_delete on public.beef_carcasses for delete to authenticated using (private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[]));

drop policy if exists stock_batches_member_read on public.stock_batches;
drop policy if exists batch_stock_write on public.stock_batches;
create policy batches_department_read on public.stock_batches for select to authenticated using (private.has_department_access(business_id,department_id,array['cashier','stock_clerk']::public.staff_role[]));
create policy batches_stock_insert on public.stock_batches for insert to authenticated with check (private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[]));
create policy batches_stock_update on public.stock_batches for update to authenticated using (private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[])) with check (private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[]));
create policy batches_stock_delete on public.stock_batches for delete to authenticated using (private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[]));

drop policy if exists stock_movements_member_read on public.stock_movements;
drop policy if exists movement_stock_write on public.stock_movements;
create policy movements_department_read on public.stock_movements for select to authenticated using (private.has_department_access(business_id,department_id,array['cashier','stock_clerk']::public.staff_role[]));
create policy movements_stock_insert on public.stock_movements for insert to authenticated with check (private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[]));
create policy movements_stock_update on public.stock_movements for update to authenticated using (private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[])) with check (private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[]));
create policy movements_stock_delete on public.stock_movements for delete to authenticated using (private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[]));

drop policy if exists sales_member_read on public.sales;
drop policy if exists sales_cashier_insert on public.sales;
drop policy if exists sales_manager_update on public.sales;
create policy sales_department_read on public.sales for select to authenticated using (private.has_department_access(business_id,department_id,array['cashier']::public.staff_role[]));
create policy sales_cashier_insert_department on public.sales for insert to authenticated with check (cashier_id=(select auth.uid()) and private.has_department_access(business_id,department_id,array['cashier']::public.staff_role[]));
create policy sales_manager_update_department on public.sales for update to authenticated using (private.has_department_access(business_id,department_id,array[]::public.staff_role[])) with check (private.has_department_access(business_id,department_id,array[]::public.staff_role[]));

drop policy if exists sale_items_member_read on public.sale_items;
drop policy if exists sale_items_cashier_insert on public.sale_items;
create policy sale_items_department_read on public.sale_items for select to authenticated using (exists(select 1 from public.sales s where s.id=sale_id and s.business_id=sale_items.business_id and private.has_department_access(s.business_id,s.department_id,array['cashier']::public.staff_role[])));
create policy sale_items_cashier_insert_department on public.sale_items for insert to authenticated with check (exists(select 1 from public.sales s where s.id=sale_id and s.business_id=sale_items.business_id and s.cashier_id=(select auth.uid()) and private.has_department_access(s.business_id,s.department_id,array['cashier']::public.staff_role[])));

drop policy if exists cashier_shifts_member_read on public.cashier_shifts;
drop policy if exists shift_cashier_manage on public.cashier_shifts;
create policy shifts_department_read on public.cashier_shifts for select to authenticated using ((cashier_id=(select auth.uid()) and private.has_department_access(business_id,department_id,array['cashier']::public.staff_role[])) or private.has_department_access(business_id,department_id,array[]::public.staff_role[]));
create policy shifts_cashier_insert on public.cashier_shifts for insert to authenticated with check (cashier_id=(select auth.uid()) and private.has_department_access(business_id,department_id,array['cashier']::public.staff_role[]));
create policy shifts_cashier_update on public.cashier_shifts for update to authenticated using ((cashier_id=(select auth.uid()) and private.has_department_access(business_id,department_id,array['cashier']::public.staff_role[])) or private.has_department_access(business_id,department_id,array[]::public.staff_role[])) with check ((cashier_id=(select auth.uid()) and private.has_department_access(business_id,department_id,array['cashier']::public.staff_role[])) or private.has_department_access(business_id,department_id,array[]::public.staff_role[]));

drop policy if exists expenses_member_read on public.expenses;
drop policy if exists expenses_staff_insert on public.expenses;
drop policy if exists expenses_manager_update on public.expenses;
create policy expenses_manager_read on public.expenses for select to authenticated using (private.has_department_access(business_id,department_id,array[]::public.staff_role[]));
create policy expenses_manager_insert on public.expenses for insert to authenticated with check (recorded_by=(select auth.uid()) and private.has_department_access(business_id,department_id,array[]::public.staff_role[]));
create policy expenses_manager_update_only on public.expenses for update to authenticated using (private.has_department_access(business_id,department_id,array[]::public.staff_role[])) with check (private.has_department_access(business_id,department_id,array[]::public.staff_role[]));

drop policy if exists supplier_payments_member_read on public.supplier_payments;
drop policy if exists supplier_payments_manager_write on public.supplier_payments;
create policy supplier_payments_manager_read on public.supplier_payments for select to authenticated using (private.has_department_access(business_id,null,array[]::public.staff_role[]));
create policy supplier_payments_manager_insert on public.supplier_payments for insert to authenticated with check (recorded_by=(select auth.uid()) and private.has_department_access(business_id,null,array[]::public.staff_role[]));
create policy supplier_payments_manager_update on public.supplier_payments for update to authenticated using (private.has_department_access(business_id,null,array[]::public.staff_role[])) with check (private.has_department_access(business_id,null,array[]::public.staff_role[]));
create policy supplier_payments_manager_delete on public.supplier_payments for delete to authenticated using (private.has_department_access(business_id,null,array[]::public.staff_role[]));

drop policy if exists cash_transactions_member_read on public.cash_transactions;
drop policy if exists cash_transactions_staff_insert on public.cash_transactions;
create policy cash_transactions_department_read on public.cash_transactions for select to authenticated using (private.has_department_access(business_id,department_id,array['cashier']::public.staff_role[]));
create policy cash_transactions_staff_insert_department on public.cash_transactions for insert to authenticated with check (recorded_by=(select auth.uid()) and private.has_department_access(business_id,department_id,array['cashier']::public.staff_role[]));

drop policy if exists stock_counts_member_read on public.stock_counts;
drop policy if exists stock_counts_clerk_insert on public.stock_counts;
drop policy if exists stock_counts_manager_update on public.stock_counts;
create policy stock_counts_department_read on public.stock_counts for select to authenticated using (private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[]));
create policy stock_counts_clerk_insert_department on public.stock_counts for insert to authenticated with check (counted_by=(select auth.uid()) and private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[]));
create policy stock_counts_manager_approve on public.stock_counts for update to authenticated using (private.has_department_access(business_id,department_id,array[]::public.staff_role[])) with check (private.has_department_access(business_id,department_id,array[]::public.staff_role[]));

drop policy if exists processing_runs_member_read on public.processing_runs;
drop policy if exists processing_stock_write on public.processing_runs;
create policy processing_runs_department_read on public.processing_runs for select to authenticated using (exists(select 1 from public.beef_carcasses c where c.id=carcass_id and c.business_id=processing_runs.business_id and private.has_department_access(c.business_id,c.department_id,array['stock_clerk']::public.staff_role[])));
create policy processing_runs_stock_insert on public.processing_runs for insert to authenticated with check (exists(select 1 from public.beef_carcasses c where c.id=carcass_id and c.business_id=processing_runs.business_id and private.has_department_access(c.business_id,c.department_id,array['stock_clerk']::public.staff_role[])));
create policy processing_runs_stock_update on public.processing_runs for update to authenticated using (exists(select 1 from public.beef_carcasses c where c.id=carcass_id and c.business_id=processing_runs.business_id and private.has_department_access(c.business_id,c.department_id,array['stock_clerk']::public.staff_role[]))) with check (exists(select 1 from public.beef_carcasses c where c.id=carcass_id and c.business_id=processing_runs.business_id and private.has_department_access(c.business_id,c.department_id,array['stock_clerk']::public.staff_role[])));

drop policy if exists processing_outputs_member_read on public.processing_outputs;
drop policy if exists processing_output_stock_write on public.processing_outputs;
create policy processing_outputs_department_read on public.processing_outputs for select to authenticated using (exists(select 1 from public.processing_runs r join public.beef_carcasses c on c.id=r.carcass_id where r.id=processing_run_id and r.business_id=processing_outputs.business_id and private.has_department_access(c.business_id,c.department_id,array['stock_clerk']::public.staff_role[])));
create policy processing_outputs_stock_insert on public.processing_outputs for insert to authenticated with check (exists(select 1 from public.processing_runs r join public.beef_carcasses c on c.id=r.carcass_id where r.id=processing_run_id and r.business_id=processing_outputs.business_id and private.has_department_access(c.business_id,c.department_id,array['stock_clerk']::public.staff_role[])));
create policy processing_outputs_stock_update on public.processing_outputs for update to authenticated using (exists(select 1 from public.processing_runs r join public.beef_carcasses c on c.id=r.carcass_id where r.id=processing_run_id and r.business_id=processing_outputs.business_id and private.has_department_access(c.business_id,c.department_id,array['stock_clerk']::public.staff_role[]))) with check (exists(select 1 from public.processing_runs r join public.beef_carcasses c on c.id=r.carcass_id where r.id=processing_run_id and r.business_id=processing_outputs.business_id and private.has_department_access(c.business_id,c.department_id,array['stock_clerk']::public.staff_role[])));

drop policy if exists suppliers_member_read on public.suppliers;
drop policy if exists suppliers_manager_write on public.suppliers;
create policy suppliers_stock_read on public.suppliers for select to authenticated using (private.has_department_access(business_id,null,array[]::public.staff_role[]) or private.has_business_role(business_id,array['stock_clerk']::public.staff_role[]));
create policy suppliers_manager_insert on public.suppliers for insert to authenticated with check (private.has_department_access(business_id,null,array[]::public.staff_role[]));
create policy suppliers_manager_update on public.suppliers for update to authenticated using (private.has_department_access(business_id,null,array[]::public.staff_role[])) with check (private.has_department_access(business_id,null,array[]::public.staff_role[]));

drop policy if exists audit_logs_member_read on public.audit_logs;
create policy audit_logs_management_read on public.audit_logs for select to authenticated using (private.has_department_access(business_id,null,array[]::public.staff_role[]));
