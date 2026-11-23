alter table public.products
  add column if not exists expected_sale_price numeric(14,2) not null default 0;
alter table public.products
  add constraint products_expected_sale_price_nonnegative
  check (expected_sale_price >= 0);

create or replace function public.finalize_beef_processing(
  p_business_id uuid,
  p_carcass_id uuid,
  p_outputs jsonb,
  p_waste_loss_kg numeric default 0,
  p_unallocated_kg numeric default 0,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_carcass public.beef_carcasses%rowtype;
  v_line jsonb;
  v_product public.products%rowtype;
  v_output_type text;
  v_weight numeric;
  v_saleable numeric := 0;
  v_byproduct numeric := 0;
  v_value_total numeric := 0;
  v_allocated numeric;
  v_cost numeric;
  v_run_id uuid;
  v_batch_id uuid;
  v_batch_code text;
  v_lines integer := 0;
  v_sum numeric;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not private.has_department_access(p_business_id,null,array[]::public.staff_role[]) then
    raise exception 'Only a business owner or manager can approve and finalize carcass processing';
  end if;
  if jsonb_typeof(p_outputs)<>'array' or jsonb_array_length(p_outputs)=0 then
    raise exception 'Add at least one saleable cut or usable by-product';
  end if;
  if coalesce(p_waste_loss_kg,0)<0 or coalesce(p_unallocated_kg,0)<0 then
    raise exception 'Waste and unallocated weights cannot be negative';
  end if;
  select * into v_carcass from public.beef_carcasses
    where id=p_carcass_id and business_id=p_business_id for update;
  if not found then raise exception 'Carcass not found in this business'; end if;
  if v_carcass.status<>'received' then raise exception 'Only a received, unprocessed carcass can be processed'; end if;

  for v_line in select value from jsonb_array_elements(p_outputs)
  loop
    v_lines:=v_lines+1;
    if v_lines>100 then raise exception 'A processing run cannot contain more than 100 output lines'; end if;
    v_weight:=(v_line->>'weight_kg')::numeric;
    v_output_type:=v_line->>'output_type';
    if v_weight is null or v_weight<=0 then raise exception 'Every processing output must have a positive weight'; end if;
    if v_output_type not in ('saleable','byproduct') then raise exception 'Output type must be saleable or byproduct'; end if;
    select * into v_product from public.products
      where id=(v_line->>'product_id')::uuid
        and business_id=p_business_id and department_id=v_carcass.department_id
        and active=true and unit='kg' for share;
    if not found then raise exception 'Every output must use an active kg product in the carcass department'; end if;
    if coalesce(v_product.expected_sale_price,0)<=0 then
      raise exception 'Set an expected selling price above zero for product % before processing',v_product.name;
    end if;
    if v_output_type='saleable' then v_saleable:=v_saleable+v_weight;
    else v_byproduct:=v_byproduct+v_weight; end if;
    v_value_total:=v_value_total+(v_weight*v_product.expected_sale_price);
  end loop;

  v_sum:=v_saleable+v_byproduct+coalesce(p_waste_loss_kg,0)+coalesce(p_unallocated_kg,0);
  if abs(v_carcass.input_weight_kg-v_sum)>0.01 then
    raise exception 'Carcass reconciliation does not balance. Input % kg; recorded outputs, waste and unallocated total % kg',
      v_carcass.input_weight_kg,v_sum;
  end if;
  if v_value_total<=0 then raise exception 'Output expected sales value must be greater than zero'; end if;

  v_cost:=coalesce(v_carcass.total_purchase_cost,v_carcass.input_weight_kg*v_carcass.purchase_price_per_kg);
  insert into public.processing_runs(
    business_id,carcass_id,input_weight_kg,saleable_output_kg,usable_byproduct_kg,
    waste_loss_kg,unallocated_kg,yield_percent,notes,processed_by,verified_by,approved_at
  ) values (
    p_business_id,p_carcass_id,v_carcass.input_weight_kg,v_saleable,v_byproduct,
    coalesce(p_waste_loss_kg,0),coalesce(p_unallocated_kg,0),
    round(((v_saleable+v_byproduct)/v_carcass.input_weight_kg)*100,2),
    nullif(trim(coalesce(p_notes,'')),''),v_uid,v_uid,now()
  ) returning id into v_run_id;

  for v_line in select value from jsonb_array_elements(p_outputs)
  loop
    v_weight:=(v_line->>'weight_kg')::numeric;
    v_output_type:=v_line->>'output_type';
    select * into v_product from public.products
      where id=(v_line->>'product_id')::uuid and business_id=p_business_id
        and department_id=v_carcass.department_id;
    v_allocated:=round(v_cost*((v_weight*v_product.expected_sale_price)/v_value_total),2);
    v_batch_code:=v_carcass.carcass_code||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
    insert into public.stock_batches(
      business_id,department_id,product_id,source_carcass_id,batch_code,
      quantity_received,quantity_on_hand,unit,unit_cost
    ) values (
      p_business_id,v_carcass.department_id,v_product.id,p_carcass_id,v_batch_code,
      v_weight,v_weight,'kg',round(v_allocated/v_weight,4)
    ) returning id into v_batch_id;

    insert into public.processing_outputs(
      business_id,processing_run_id,product_id,batch_id,output_type,weight_kg,
      allocated_cost,allocated_cost_per_kg
    ) values (
      p_business_id,v_run_id,v_product.id,v_batch_id,v_output_type,v_weight,
      v_allocated,round(v_allocated/v_weight,4)
    );
    insert into public.stock_movements(
      business_id,department_id,product_id,batch_id,movement_type,quantity,unit,
      unit_cost,reference_type,reference_id,reason,created_by,approved_by
    ) values (
      p_business_id,v_carcass.department_id,v_product.id,v_batch_id,'processing_output',
      v_weight,'kg',round(v_allocated/v_weight,4),'processing_run',v_run_id,
      'Approved carcass processing output',v_uid,v_uid
    );
  end loop;

  update public.beef_carcasses set status='processed',verified_by=v_uid where id=p_carcass_id;
  return jsonb_build_object(
    'processing_run_id',v_run_id,'carcass_id',p_carcass_id,
    'saleable_output_kg',v_saleable,'usable_byproduct_kg',v_byproduct,
    'waste_loss_kg',coalesce(p_waste_loss_kg,0),'unallocated_kg',coalesce(p_unallocated_kg,0),
    'yield_percent',round(((v_saleable+v_byproduct)/v_carcass.input_weight_kg)*100,2)
  );
end;
$$;
revoke all on function public.finalize_beef_processing(uuid,uuid,jsonb,numeric,numeric,text) from public,anon;
grant execute on function public.finalize_beef_processing(uuid,uuid,jsonb,numeric,numeric,text) to authenticated;