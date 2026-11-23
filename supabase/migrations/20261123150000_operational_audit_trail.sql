create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_record jsonb;
  v_business_id uuid;
  v_entity_id uuid;
  v_reason text;
begin
  if tg_op='INSERT' then
    v_after:=to_jsonb(new);
    v_record:=v_after;
  elsif tg_op='UPDATE' then
    v_before:=to_jsonb(old);
    v_after:=to_jsonb(new);
    v_record:=v_after;
  else
    v_before:=to_jsonb(old);
    v_record:=v_before;
  end if;
  v_business_id:=nullif(v_record->>'business_id','')::uuid;
  v_entity_id:=nullif(v_record->>'id','')::uuid;
  v_reason:=coalesce(v_record->>'void_reason',v_record->>'reason',v_record->>'notes');
  insert into public.audit_logs(business_id,actor_id,action,entity_table,entity_id,before_data,after_data,reason)
  values(v_business_id,(select auth.uid()),lower(tg_op),tg_table_name,v_entity_id,v_before,v_after,v_reason);
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.audit_row_change() from public,anon,authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'suppliers','products','purchases','purchase_items','beef_carcasses',
    'stock_batches','processing_runs','processing_outputs','stock_movements',
    'sales','sale_items','cashier_shifts','cash_transactions','supplier_payments',
    'expenses','stock_counts','business_members','departments','staff_invitations'
  ] loop
    execute format('drop trigger if exists audit_%I_changes on public.%I',v_table,v_table);
    execute format('create trigger audit_%I_changes after insert or update or delete on public.%I for each row execute function private.audit_row_change()',v_table,v_table);
  end loop;
end $$;

create index if not exists audit_logs_business_created_idx
on public.audit_logs(business_id,created_at desc);