drop policy if exists products_stock_insert on public.products;
create policy products_stock_insert on public.products for insert to authenticated
with check (
  private.has_department_access(business_id,department_id,array['stock_clerk']::public.staff_role[])
  and (
    coalesce(expected_sale_price,0)=0
    or private.has_department_access(business_id,null,array[]::public.staff_role[])
  )
);