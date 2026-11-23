create unique index if not exists cashier_shifts_one_open_per_cashier_department
on public.cashier_shifts(cashier_id,department_id)
where status='open';