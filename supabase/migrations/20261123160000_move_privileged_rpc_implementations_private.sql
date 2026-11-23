-- Keep privileged implementations in the non-exposed private schema.
alter function public.approve_stock_count(uuid) set schema private;
alter function public.finalize_beef_processing(uuid,uuid,jsonb,numeric,numeric,text) set schema private;
alter function public.receive_stock(uuid,uuid,uuid,text,numeric,public.stock_unit,numeric,date) set schema private;
alter function public.record_stock_purchase(uuid,uuid,uuid,text,text,text,numeric,uuid,numeric,numeric,text,date) set schema private;

grant usage on schema private to authenticated;
revoke all on function private.approve_stock_count(uuid) from public,anon;
revoke all on function private.finalize_beef_processing(uuid,uuid,jsonb,numeric,numeric,text) from public,anon;
revoke all on function private.receive_stock(uuid,uuid,uuid,text,numeric,public.stock_unit,numeric,date) from public,anon;
revoke all on function private.record_stock_purchase(uuid,uuid,uuid,text,text,text,numeric,uuid,numeric,numeric,text,date) from public,anon;
grant execute on function private.approve_stock_count(uuid) to authenticated;
grant execute on function private.finalize_beef_processing(uuid,uuid,jsonb,numeric,numeric,text) to authenticated;
grant execute on function private.receive_stock(uuid,uuid,uuid,text,numeric,public.stock_unit,numeric,date) to authenticated;
grant execute on function private.record_stock_purchase(uuid,uuid,uuid,text,text,text,numeric,uuid,numeric,numeric,text,date) to authenticated;

create or replace function public.approve_stock_count(p_count_id uuid)
returns jsonb language sql security invoker set search_path=''
as $$ select private.approve_stock_count(p_count_id); $$;
create or replace function public.finalize_beef_processing(
  p_business_id uuid,p_carcass_id uuid,p_outputs jsonb,
  p_waste_loss_kg numeric default 0,p_unallocated_kg numeric default 0,p_notes text default null
) returns jsonb language sql security invoker set search_path=''
as $$ select private.finalize_beef_processing(p_business_id,p_carcass_id,p_outputs,p_waste_loss_kg,p_unallocated_kg,p_notes); $$;
create or replace function public.receive_stock(
  p_business_id uuid,p_department_id uuid,p_product_id uuid,p_batch_code text,
  p_quantity numeric,p_unit public.stock_unit,p_unit_cost numeric default 0,p_expiry_date date default null
) returns uuid language sql security invoker set search_path=''
as $$ select private.receive_stock(p_business_id,p_department_id,p_product_id,p_batch_code,p_quantity,p_unit,p_unit_cost,p_expiry_date); $$;
create or replace function public.record_stock_purchase(
  p_business_id uuid,p_department_id uuid,p_supplier_id uuid,p_reference_no text,p_invoice_no text,
  p_currency text,p_exchange_rate numeric,p_product_id uuid,p_quantity numeric,p_unit_cost numeric,
  p_batch_code text,p_expiry_date date default null
) returns uuid language sql security invoker set search_path=''
as $$ select private.record_stock_purchase(p_business_id,p_department_id,p_supplier_id,p_reference_no,p_invoice_no,p_currency,p_exchange_rate,p_product_id,p_quantity,p_unit_cost,p_batch_code,p_expiry_date); $$;

revoke all on function public.approve_stock_count(uuid) from public,anon;
revoke all on function public.finalize_beef_processing(uuid,uuid,jsonb,numeric,numeric,text) from public,anon;
revoke all on function public.receive_stock(uuid,uuid,uuid,text,numeric,public.stock_unit,numeric,date) from public,anon;
revoke all on function public.record_stock_purchase(uuid,uuid,uuid,text,text,text,numeric,uuid,numeric,numeric,text,date) from public,anon;
grant execute on function public.approve_stock_count(uuid) to authenticated;
grant execute on function public.finalize_beef_processing(uuid,uuid,jsonb,numeric,numeric,text) to authenticated;
grant execute on function public.receive_stock(uuid,uuid,uuid,text,numeric,public.stock_unit,numeric,date) to authenticated;
grant execute on function public.record_stock_purchase(uuid,uuid,uuid,text,text,text,numeric,uuid,numeric,numeric,text,date) to authenticated;