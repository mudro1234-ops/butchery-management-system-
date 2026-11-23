-- Tighten department helper so managers cannot attach foreign or nonexistent departments.
create or replace function private.has_department_access(
  p_business_id uuid,
  p_department_id uuid,
  p_roles public.staff_role[]
) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members m
    where m.business_id=p_business_id
      and m.user_id=(select auth.uid())
      and m.active=true
      and (
        (p_department_id is null and m.role in ('owner'::public.staff_role,'manager'::public.staff_role))
        or (
          p_department_id is not null
          and exists(select 1 from public.departments d where d.id=p_department_id and d.business_id=p_business_id)
          and (
            m.role in ('owner'::public.staff_role,'manager'::public.staff_role)
            or (m.role=any(p_roles) and m.department_id=p_department_id)
          )
        )
      )
  );
$$;

-- Ensure supplier payments cannot be linked across businesses or to another supplier's purchase.
drop policy if exists supplier_payments_manager_insert on public.supplier_payments;
drop policy if exists supplier_payments_manager_update on public.supplier_payments;
create policy supplier_payments_manager_insert on public.supplier_payments for insert to authenticated
with check (
  recorded_by=(select auth.uid())
  and private.has_department_access(business_id,null,array[]::public.staff_role[])
  and exists(select 1 from public.suppliers s where s.id=supplier_id and s.business_id=business_id)
  and (purchase_id is null or exists(
    select 1 from public.purchases p
    where p.id=purchase_id and p.business_id=business_id and p.supplier_id=supplier_id
  ))
);
create policy supplier_payments_manager_update on public.supplier_payments for update to authenticated
using (private.has_department_access(business_id,null,array[]::public.staff_role[]))
with check (
  private.has_department_access(business_id,null,array[]::public.staff_role[])
  and exists(select 1 from public.suppliers s where s.id=supplier_id and s.business_id=business_id)
  and (purchase_id is null or exists(
    select 1 from public.purchases p
    where p.id=purchase_id and p.business_id=business_id and p.supplier_id=supplier_id
  ))
);

-- Cross-check department and product ownership for direct stock operations too.
drop policy if exists batches_stock_insert on public.stock_batches;
drop policy if exists batches_stock_update on public.stock_batches;
create policy batches_stock_insert on public.stock_batches for insert to authenticated
with check (
  private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[])
  and exists(select 1 from public.products p where p.id=product_id and p.business_id=business_id and p.department_id=department_id)
);
create policy batches_stock_update on public.stock_batches for update to authenticated
using (private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[]))
with check (
  private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[])
  and exists(select 1 from public.products p where p.id=product_id and p.business_id=business_id and p.department_id=department_id)
);

drop policy if exists carcasses_stock_insert on public.beef_carcasses;
drop policy if exists carcasses_stock_update on public.beef_carcasses;
create policy carcasses_stock_insert on public.beef_carcasses for insert to authenticated
with check (
  private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[])
  and (supplier_id is null or exists(select 1 from public.suppliers s where s.id=supplier_id and s.business_id=business_id))
);
create policy carcasses_stock_update on public.beef_carcasses for update to authenticated
using (private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[]))
with check (
  private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[])
  and (supplier_id is null or exists(select 1 from public.suppliers s where s.id=supplier_id and s.business_id=business_id))
);

drop policy if exists movements_stock_insert on public.stock_movements;
drop policy if exists movements_stock_update on public.stock_movements;
create policy movements_stock_insert on public.stock_movements for insert to authenticated
with check (
  private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[])
  and exists(select 1 from public.products p where p.id=product_id and p.business_id=business_id and p.department_id=department_id)
  and (batch_id is null or exists(select 1 from public.stock_batches b where b.id=batch_id and b.business_id=business_id and b.department_id=department_id and b.product_id=product_id))
);
create policy movements_stock_update on public.stock_movements for update to authenticated
using (private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[]))
with check (
  private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[])
  and exists(select 1 from public.products p where p.id=product_id and p.business_id=business_id and p.department_id=department_id)
  and (batch_id is null or exists(select 1 from public.stock_batches b where b.id=batch_id and b.business_id=business_id and b.department_id=department_id and b.product_id=product_id))
);

drop policy if exists expenses_manager_insert on public.expenses;
create policy expenses_manager_insert on public.expenses for insert to authenticated
with check (
  recorded_by=(select auth.uid())
  and private.has_department_access(business_id,department_id,array[]::public.staff_role[])
  and (supplier_id is null or exists(select 1 from public.suppliers s where s.id=supplier_id and s.business_id=business_id))
);
