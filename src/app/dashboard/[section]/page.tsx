"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Role = "owner" | "manager" | "cashier" | "stock_clerk";
type Row = Record<string, unknown>;
type Section = {
  title: string; eyebrow: string; description: string; table: string;
  columns: string[]; labels: Record<string,string>; roles: Role[];
};

const sections: Record<string, Section> = {
  sales: { title:"Sales & POS", eyebrow:"Front counter", description:"Review posted sales, receipts, cashier activity and sales totals. The live checkout workflow will use controlled stock deduction and shift validation.", table:"sales", columns:["receipt_no","sold_at","total","currency","status","cashier_id"], labels:{receipt_no:"Receipt",sold_at:"Date",total:"Total",currency:"Currency",status:"Status",cashier_id:"Cashier"}, roles:["owner","manager","cashier"] },
  stock: { title:"Stock & Products", eyebrow:"Inventory control", description:"View product catalogue, batch quantities, expiry dates and current stock by department.", table:"stock_batches", columns:["batch_code","product_id","quantity_received","quantity_on_hand","unit","unit_cost","expiry_date","received_at"], labels:{batch_code:"Batch",product_id:"Product ID",quantity_received:"Received",quantity_on_hand:"On hand",unit:"Unit",unit_cost:"Unit cost",expiry_date:"Expiry",received_at:"Received"}, roles:["owner","manager","stock_clerk"] },
  processing: { title:"Carcass Processing", eyebrow:"Yield & traceability", description:"Track beef carcasses, grade, input weight and processing reconciliation. Saleable cuts and usable by-products must be recorded separately from waste.", table:"beef_carcasses", columns:["carcass_code","grade","input_weight_kg","purchase_price_per_kg","total_purchase_cost","payment_status","status","received_at"], labels:{carcass_code:"Carcass ID",grade:"Grade",input_weight_kg:"Input kg",purchase_price_per_kg:"Buy price/kg",total_purchase_cost:"Purchase cost",payment_status:"Payment",status:"Status",received_at:"Received"}, roles:["owner","manager","stock_clerk"] },
  suppliers: { title:"Suppliers", eyebrow:"Purchasing", description:"Manage supplier relationships and review the supplier register. Supplier balances will reconcile purchases against payments.", table:"suppliers", columns:["name","contact_name","phone","email","address","active"], labels:{name:"Supplier",contact_name:"Contact",phone:"Phone",email:"Email",address:"Address",active:"Active"}, roles:["owner","manager","stock_clerk"] },
  purchases: { title:"Purchases & Deliveries", eyebrow:"Procurement", description:"Review recorded supplier purchases, invoices, delivery dates and payment status. Payments are tracked separately to avoid counting the purchase cost twice.", table:"purchases", columns:["reference_no","invoice_no","purchase_date","supplier_id","subtotal","currency","status"], labels:{reference_no:"Reference",invoice_no:"Invoice",purchase_date:"Purchase date",supplier_id:"Supplier ID",subtotal:"Subtotal",currency:"Currency",status:"Status"}, roles:["owner","manager","stock_clerk"] },
  expenses: { title:"Expenses", eyebrow:"Business costs", description:"Review operating costs such as rent, utilities, transport, wages, cleaning and repairs, with department or business-wide attribution.", table:"expenses", columns:["category","description","amount","currency","payment_method","incurred_at","department_id","approved_by"], labels:{category:"Category",description:"Description",amount:"Amount",currency:"Currency",payment_method:"Payment",incurred_at:"Date",department_id:"Department",approved_by:"Approved by"}, roles:["owner","manager"] },
  "cash-up": { title:"Shifts & Cash-up", eyebrow:"Cash control", description:"Review cashier shifts, opening float, expected cash, actual cash and variance. Cashiers can manage their own shifts; managers review closures.", table:"cashier_shifts", columns:["cashier_id","department_id","opened_at","closed_at","opening_cash","expected_cash","actual_cash","variance","status"], labels:{cashier_id:"Cashier",department_id:"Department",opened_at:"Opened",closed_at:"Closed",opening_cash:"Opening",expected_cash:"Expected",actual_cash:"Actual",variance:"Variance",status:"Status"}, roles:["owner","manager","cashier"] },
  reports: { title:"Reports & Performance", eyebrow:"Business intelligence", description:"A live snapshot of posted sales, recorded cost of goods sold and operating expenses. Net profit is only meaningful once every sale has accurate cost data.", table:"sales", columns:["receipt_no","sold_at","subtotal","discount","total","cost_of_goods","currency","status"], labels:{receipt_no:"Receipt",sold_at:"Date",subtotal:"Subtotal",discount:"Discount",total:"Sales",cost_of_goods:"COGS",currency:"Currency",status:"Status"}, roles:["owner","manager"] },
  settings: { title:"Business Settings", eyebrow:"Configuration", description:"Review the business identity, reporting currency and enabled departments. Staff accounts and invitations are managed separately.", table:"businesses", columns:["name","country","base_currency","supported_currencies","created_at"], labels:{name:"Business",country:"Country",base_currency:"Base currency",supported_currencies:"Currencies",created_at:"Created"}, roles:["owner"] }
};

function display(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string" && value.includes("T")) {
    const date = new Date(value); if (!Number.isNaN(date.getTime())) return date.toLocaleString();
  }
  return String(value);
}

export default function ModulePage() {
  const params = useParams<{section:string}>();
  const router = useRouter();
  const slug = params.section;
  const section = sections[slug];
  const [role,setRole] = useState<Role|null>(null);
  const [businessId,setBusinessId] = useState("");
  const [businessName,setBusinessName] = useState("");
  const [rows,setRows] = useState<Row[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [currency,setCurrency] = useState("USD");
  const [departmentCount,setDepartmentCount] = useState(0);
  const [supplierForm,setSupplierForm] = useState({name:"",contact_name:"",phone:"",email:"",address:"",notes:""});
  const [savingSupplier,setSavingSupplier] = useState(false);
  const [supplierMessage,setSupplierMessage] = useState("");
  const [departments,setDepartments] = useState<Array<{id:string;name:string;code?:string}>>([]);
  const [products,setProducts] = useState<Array<{id:string;name:string;unit:string;department_id:string;expected_sale_price?:number}>>([]);
  const [productForm,setProductForm] = useState({name:"",category:"",animal_type:"",cut_name:"",grade:"",unit:"kg",expected_sale_price:"0",department_id:"",barcode:"",track_expiry:false});
  const [stockForm,setStockForm] = useState({department_id:"",product_id:"",batch_code:"",quantity:"",unit_cost:"0",expiry_date:""});
  const [savingProduct,setSavingProduct] = useState(false);
  const [savingStock,setSavingStock] = useState(false);
  const [stockMessage,setStockMessage] = useState("");
  const [suppliers,setSuppliers] = useState<Array<{id:string;name:string}>>([]);
  const [carcassForm,setCarcassForm] = useState({department_id:"",supplier_id:"",carcass_code:"",grade:"Commercial",input_weight_kg:"",purchase_price_per_kg:"",invoice_no:""});
  const [savingCarcass,setSavingCarcass] = useState(false);
  const [carcassMessage,setCarcassMessage] = useState("");
  const [processingCarcasses,setProcessingCarcasses] = useState<Array<{id:string;carcass_code:string;grade:string;input_weight_kg:number;total_purchase_cost:number}>>([]);
  const [processingForm,setProcessingForm] = useState({carcass_id:"",waste_loss_kg:"0",unallocated_kg:"0",notes:"",outputs:[{product_id:"",output_type:"saleable",weight_kg:""}]});
  const [processingMessage,setProcessingMessage] = useState("");
  const [savingProcessing,setSavingProcessing] = useState(false);
  const [stockCounts,setStockCounts] = useState<Array<{id:string;product_id:string;batch_id:string|null;counted_quantity:number;system_quantity:number;variance:number|null;approved_by:string|null;notes:string|null}>>([]);
  const [stockCountForm,setStockCountForm] = useState({department_id:"",batch_id:"",counted_quantity:"",notes:""});
  const [stockCountMessage,setStockCountMessage] = useState("");
  const [savingCount,setSavingCount] = useState(false);


  const [purchaseForm,setPurchaseForm] = useState({department_id:"",supplier_id:"",reference_no:"",invoice_no:"",currency:"USD",exchange_rate:"1",product_id:"",quantity:"",unit_cost:"",batch_code:"",expiry_date:""});
  const [savingPurchase,setSavingPurchase] = useState(false);
  const [purchaseMessage,setPurchaseMessage] = useState("");
  const [posBatches,setPosBatches] = useState<Array<{id:string;batch_code:string;product_id:string;quantity_on_hand:number;unit:string;unit_cost:number;department_id:string}>>([]);
  const [posForm,setPosForm] = useState({department_id:"",shift_id:"",batch_id:"",quantity:"",unit_price:"",discount:"0",currency:"USD",exchange_rate:"1",payment_method:"cash"});
  const [posMessage,setPosMessage] = useState("");
  const [openShift,setOpenShift] = useState<{id:string;department_id:string;opening_cash:number}|null>(null);
  const [shiftForm,setShiftForm] = useState({department_id:"",opening_cash:"0",actual_cash:"",closing_notes:""});
  const [shiftMessage,setShiftMessage] = useState("");
  const [savingSale,setSavingSale] = useState(false);
  const [savingShift,setSavingShift] = useState(false);
  const [expenseForm,setExpenseForm] = useState({department_id:"",category:"",description:"",amount:"",currency:"USD",exchange_rate:"1",payment_method:"cash",receipt_reference:""});
  const [expenseMessage,setExpenseMessage] = useState("");
  const [supplierPayForm,setSupplierPayForm] = useState({supplier_id:"",purchase_id:"",amount:"",currency:"USD",payment_method:"cash",reference_no:""});
  const [supplierPayMessage,setSupplierPayMessage] = useState("");
  const [savingFinance,setSavingFinance] = useState(false);







  useEffect(() => {
    let alive = true;
    (async () => {
      const {data:{user}} = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const {data:membership,error:memberError} = await supabase.from("business_members").select("business_id,role,department_id").eq("user_id",user.id).eq("active",true).maybeSingle();
      if (memberError || !membership) { router.replace("/setup"); return; }
      if (!section || !section.roles.includes(membership.role as Role)) { router.replace("/dashboard"); return; }
      if (!alive) return;
      setRole(membership.role as Role); setBusinessId(membership.business_id);
      const [business, departments, records] = await Promise.all([
        supabase.from("businesses").select("name,base_currency").eq("id",membership.business_id).single(),
        supabase.from("departments").select("id,name,code").eq("business_id",membership.business_id).eq("active",true),
        section.table==="businesses" ? supabase.from("businesses").select(section.columns.join(",")).eq("id",membership.business_id).order("created_at",{ascending:false}).limit(1) : supabase.from(section.table).select(section.columns.join(",")).eq("business_id",membership.business_id).order(section.table==="sales"?"sold_at":section.table==="cashier_shifts"?"opened_at":section.table==="expenses"?"incurred_at":section.table==="purchases"?"purchase_date":section.table==="beef_carcasses"?"received_at":section.table==="stock_batches"?"received_at":"created_at",{ascending:false}).limit(100)
      ]);
      if (!alive) return;
      setBusinessName(business.data?.name || "Business"); setCurrency(business.data?.base_currency || "USD");
      setDepartmentCount(departments.data?.length || 0);
      const deptRows=(departments.data||[]) as Array<{id:string;name:string;code?:string}>;
      setDepartments(deptRows);
      if (slug==="processing") {
        const [{data:supplierRows},{data:carcassRows},{data:productRows}]=await Promise.all([
          supabase.from("suppliers").select("id,name").eq("business_id",membership.business_id).eq("active",true).order("name"),
          supabase.from("beef_carcasses").select("id,carcass_code,grade,input_weight_kg,total_purchase_cost").eq("business_id",membership.business_id).eq("status","received").order("received_at",{ascending:true}),
          supabase.from("products").select("id,name,unit,department_id,expected_sale_price").eq("business_id",membership.business_id).eq("active",true).order("name")
        ]);
        setSuppliers((supplierRows||[]) as Array<{id:string;name:string}>);
        setProcessingCarcasses((carcassRows||[]) as Array<{id:string;carcass_code:string;grade:string;input_weight_kg:number;total_purchase_cost:number}>);
        setProducts((productRows||[]) as Array<{id:string;name:string;unit:string;department_id:string;expected_sale_price?:number}>);
        const redMeat=deptRows.find(d=>d.code==="red_meat")?.id || membership.department_id || deptRows[0]?.id || "";
        setCarcassForm(v=>({...v,department_id:v.department_id||redMeat}));
      }

      if (slug==="sales" || slug==="cash-up") {
        if(slug==="sales") {
          const {data:productRows}=await supabase.from("products").select("id,name,unit,department_id,expected_sale_price").eq("business_id",membership.business_id).eq("active",true).order("name");
          setProducts((productRows||[]) as Array<{id:string;name:string;unit:string;department_id:string;expected_sale_price?:number}>);
        }
        const [{data:shiftRows},{data:batchRows}]=await Promise.all([
          supabase.from("cashier_shifts").select("id,department_id,opening_cash").eq("business_id",membership.business_id).eq("cashier_id",user.id).eq("status","open").order("opened_at",{ascending:false}).limit(1),
          supabase.from("stock_batches").select("id,batch_code,product_id,quantity_on_hand,unit,unit_cost,department_id").eq("business_id",membership.business_id).gt("quantity_on_hand",0).order("received_at",{ascending:true})
        ]);
        const shift=(shiftRows||[])[0] as {id:string;department_id:string;opening_cash:number}|undefined;
        if(shift) setOpenShift(shift);
        const defaultDepartment=membership.department_id || deptRows[0]?.id || "";
        setShiftForm(v=>({...v,department_id:v.department_id||defaultDepartment}));
        setPosForm(v=>({...v,department_id:v.department_id||defaultDepartment,shift_id:v.shift_id||(shift?.id||"")}));
        setPosBatches((batchRows||[]) as Array<{id:string;batch_code:string;product_id:string;quantity_on_hand:number;unit:string;unit_cost:number;department_id:string}>);
      }
      if (slug==="purchases" || slug==="expenses") {
        const [{data:productRows},{data:supplierRows}]=await Promise.all([
          supabase.from("products").select("id,name,unit,department_id").eq("business_id",membership.business_id).eq("active",true).order("name"),
          supabase.from("suppliers").select("id,name").eq("business_id",membership.business_id).eq("active",true).order("name")
        ]);
        setProducts((productRows||[]) as Array<{id:string;name:string;unit:string;department_id:string}>);
        setSuppliers((supplierRows||[]) as Array<{id:string;name:string}>);
        const preferredDepartment=membership.department_id || deptRows[0]?.id || "";
        setPurchaseForm(v=>({...v,department_id:v.department_id||preferredDepartment}));
      }
      if (slug==="stock") {
        const [{data:batchRows},{data:countRows}]=await Promise.all([
          supabase.from("stock_batches").select("id,batch_code,product_id,quantity_on_hand,unit,unit_cost,department_id").eq("business_id",membership.business_id).order("received_at",{ascending:true}),
          supabase.from("stock_counts").select("id,product_id,batch_id,counted_quantity,system_quantity,variance,approved_by,notes").eq("business_id",membership.business_id).order("counted_at",{ascending:false}).limit(50)
        ]);
        setPosBatches((batchRows||[]) as Array<{id:string;batch_code:string;product_id:string;quantity_on_hand:number;unit:string;unit_cost:number;department_id:string}>);
        setStockCounts((countRows||[]) as Array<{id:string;product_id:string;batch_id:string|null;counted_quantity:number;system_quantity:number;variance:number|null;approved_by:string|null;notes:string|null}>);
        const defaultDepartment=membership.department_id || deptRows[0]?.id || "";
        setStockCountForm(v=>({...v,department_id:v.department_id||defaultDepartment}));
      if (slug==="stock") {
        const {data:productRows}=await supabase.from("products").select("id,name,unit,department_id").eq("business_id",membership.business_id).eq("active",true).order("name");
        const list=(productRows||[]) as Array<{id:string;name:string;unit:string;department_id:string;expected_sale_price?:number}>;
        setProducts(list);
        const preferredDepartment=membership.department_id || deptRows[0]?.id || "";
        setProductForm(v=>({...v,department_id:v.department_id||preferredDepartment}));
        setStockForm(v=>({...v,department_id:v.department_id||preferredDepartment}));
      }

      if (records.error) setError(records.error.message); else setRows((records.data || []) as unknown as Row[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  },[router,slug]);



  async function saveExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingFinance(true);setExpenseMessage("");
    const {data:{user}}=await supabase.auth.getUser();
    const amount=Number(expenseForm.amount),rate=Number(expenseForm.exchange_rate);
    if(!Number.isFinite(amount)||amount<=0||!Number.isFinite(rate)||rate<=0){setExpenseMessage("Enter a positive amount and exchange rate.");setSavingFinance(false);return;}
    const {error:insertError}=await supabase.from("expenses").insert({
      business_id:businessId,department_id:expenseForm.department_id||null,
      category:expenseForm.category.trim(),description:expenseForm.description.trim(),
      amount,currency:expenseForm.currency,exchange_rate:rate,payment_method:expenseForm.payment_method,
      receipt_reference:expenseForm.receipt_reference.trim()||null,recorded_by:user?.id||null
    });
    if(insertError) setExpenseMessage(insertError.message);
    else {
      setExpenseForm(v=>({...v,category:"",description:"",amount:"",receipt_reference:""}));
      const {data}=await supabase.from("expenses").select(section.columns.join(",")).eq("business_id",businessId).order("incurred_at",{ascending:false}).limit(100);
      setRows((data||[]) as unknown as Row[]);setExpenseMessage("Expense recorded.");
    }
    setSavingFinance(false);
  }

  async function saveSupplierPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingFinance(true);setSupplierPayMessage("");
    const {data:{user}}=await supabase.auth.getUser();
    const amount=Number(supplierPayForm.amount);
    if(!supplierPayForm.supplier_id||!Number.isFinite(amount)||amount<=0){setSupplierPayMessage("Choose a supplier and enter a positive payment amount.");setSavingFinance(false);return;}
    const {error:insertError}=await supabase.from("supplier_payments").insert({
      business_id:businessId,supplier_id:supplierPayForm.supplier_id,
      purchase_id:supplierPayForm.purchase_id||null,amount,currency:supplierPayForm.currency,
      payment_method:supplierPayForm.payment_method,reference_no:supplierPayForm.reference_no.trim()||null,
      recorded_by:user?.id||null
    });
    if(insertError) setSupplierPayMessage(insertError.message);
    else {setSupplierPayForm(v=>({...v,purchase_id:"",amount:"",reference_no:""}));setSupplierPayMessage("Supplier payment recorded separately from purchase cost.");}
    setSavingFinance(false);
  }

  async function openCashierShift(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!businessId||!shiftForm.department_id) return;
    setSavingShift(true);setShiftMessage("");
    const {data:{user}}=await supabase.auth.getUser();
    const amount=Number(shiftForm.opening_cash);
    if(!Number.isFinite(amount)||amount<0){setShiftMessage("Opening float cannot be negative.");setSavingShift(false);return;}
    const {data,error:insertError}=await supabase.from("cashier_shifts").insert({
      business_id:businessId,department_id:shiftForm.department_id,cashier_id:user?.id,
      opening_cash:amount,status:"open"
    }).select("id,department_id,opening_cash").single();
    if(insertError) setShiftMessage(insertError.message);
    else {setOpenShift(data);setPosForm(v=>({...v,department_id:data.department_id,shift_id:data.id}));setShiftMessage("Cashier shift opened.");}
    setSavingShift(false);
  }

  async function closeCashierShift(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!openShift) return;
    setSavingShift(true);setShiftMessage("");
    const actual=Number(shiftForm.actual_cash);
    if(!Number.isFinite(actual)||actual<0){setShiftMessage("Enter a valid counted cash amount.");setSavingShift(false);return;}
    const {data:transactions,error:txError}=await supabase.from("cash_transactions").select("transaction_type,amount,payment_method").eq("shift_id",openShift.id);
    if(txError){setShiftMessage(txError.message);setSavingShift(false);return;}
    const cashRows=transactions||[];
    const cashSales=cashRows.filter(t=>t.payment_method==="cash"&&t.transaction_type==="sale").reduce((n,t)=>n+Number(t.amount),0);
    const cashOut=cashRows.filter(t=>t.payment_method==="cash"&&["expense","refund","cash_out"].includes(t.transaction_type)).reduce((n,t)=>n+Number(t.amount),0);
    const expected=Number(openShift.opening_cash)+cashSales-cashOut;
    const {error:updateError}=await supabase.from("cashier_shifts").update({
      expected_cash:expected,actual_cash:actual,variance:Number((actual-expected).toFixed(2)),
      status:"closed",closed_at:new Date().toISOString(),closing_notes:shiftForm.closing_notes.trim()||null
    }).eq("id",openShift.id);
    if(updateError) setShiftMessage(updateError.message);
    else {setOpenShift(null);setShiftForm(v=>({...v,actual_cash:"",closing_notes:""}));setShiftMessage("Shift closed and cash variance recorded.");}
    setSavingShift(false);
  }

  async function submitSale(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!businessId||!posForm.department_id||!posForm.shift_id||!posForm.batch_id) return;
    setSavingSale(true);setPosMessage("");
    const batch=posBatches.find(b=>b.id===posForm.batch_id);
    const quantity=Number(posForm.quantity),price=Number(posForm.unit_price),discount=Number(posForm.discount),rate=Number(posForm.exchange_rate);
    if(!batch||!Number.isFinite(quantity)||quantity<=0||quantity>Number(batch.quantity_on_hand)||!Number.isFinite(price)||price<0||!Number.isFinite(discount)||discount<0||!Number.isFinite(rate)||rate<=0) {
      setPosMessage("Check the batch, available quantity, selling price, discount and exchange rate.");setSavingSale(false);return;
    }
    const {data,error:rpcError}=await supabase.rpc("post_sale",{
      p_business_id:businessId,p_department_id:posForm.department_id,p_shift_id:posForm.shift_id,
      p_currency:posForm.currency,p_exchange_rate:rate,p_discount:discount,p_payment_method:posForm.payment_method,
      p_lines:[{batch_id:batch.id,quantity,unit_price:price}]
    });
    if(rpcError) setPosMessage(rpcError.message);
    else {
      const result=data as {receipt_no:string;total:number};
      setPosForm(v=>({...v,batch_id:"",quantity:"",unit_price:"",discount:"0"}));
      const {data:batchRows}=await supabase.from("stock_batches").select("id,batch_code,product_id,quantity_on_hand,unit,unit_cost,department_id").eq("business_id",businessId).gt("quantity_on_hand",0).order("received_at",{ascending:true});
      setPosBatches((batchRows||[]) as Array<{id:string;batch_code:string;product_id:string;quantity_on_hand:number;unit:string;unit_cost:number;department_id:string}>);
      const {data:records}=await supabase.from("sales").select(section.columns.join(",")).eq("business_id",businessId).order("sold_at",{ascending:false}).limit(100);
      setRows((records||[]) as unknown as Row[]);
      setPosMessage("Sale posted: "+result.receipt_no+". Total "+posForm.currency+" "+Number(result.total).toFixed(2)+".");
    }
    setSavingSale(false);
  }

  async function recordPurchase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!businessId || !purchaseForm.department_id || !purchaseForm.product_id) return;
    setSavingPurchase(true); setPurchaseMessage("");
    const product=products.find(p=>p.id===purchaseForm.product_id);
    const quantity=Number(purchaseForm.quantity), unitCost=Number(purchaseForm.unit_cost), rate=Number(purchaseForm.exchange_rate);
    if(!product || !Number.isFinite(quantity)||quantity<=0||!Number.isFinite(unitCost)||unitCost<0||!Number.isFinite(rate)||rate<=0) {
      setPurchaseMessage("Check the product, quantity, unit cost and exchange rate."); setSavingPurchase(false); return;
    }
    const {data:{user}}=await supabase.auth.getUser();
    const {error:rpcError}=await supabase.rpc("record_stock_purchase",{
      p_business_id:businessId,p_department_id:purchaseForm.department_id,p_supplier_id:purchaseForm.supplier_id||null,
      p_reference_no:purchaseForm.reference_no.trim(),p_invoice_no:purchaseForm.invoice_no.trim()||null,
      p_currency:purchaseForm.currency,p_exchange_rate:rate,p_product_id:product.id,
      p_quantity:quantity,p_unit_cost:unitCost,p_batch_code:purchaseForm.batch_code.trim(),
      p_expiry_date:purchaseForm.expiry_date||null
    });
    if(rpcError) setPurchaseMessage(rpcError.message);
    else {
      setPurchaseForm(v=>({...v,reference_no:"",invoice_no:"",product_id:"",quantity:"",unit_cost:"",batch_code:"",expiry_date:""}));
      const {data,error:reloadError}=await supabase.from("purchases").select(section.columns.join(",")).eq("business_id",businessId).order("purchase_date",{ascending:false}).limit(100);
      if(reloadError) setPurchaseMessage("Purchase recorded, but the register could not refresh: "+reloadError.message);
      else {setRows((data||[]) as unknown as Row[]);setPurchaseMessage("Purchase recorded. Purchase line, stock batch and stock movement were created together.");}
    }
    setSavingPurchase(false);
  }

  async function submitStockCount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const batch=posBatches.find(b=>b.id===stockCountForm.batch_id);
    const quantity=Number(stockCountForm.counted_quantity);
    if(!batch||!Number.isFinite(quantity)||quantity<0){setStockCountMessage("Select a batch and enter a valid physical count.");return;}
    setSavingCount(true);setStockCountMessage("");
    const {data:{user}}=await supabase.auth.getUser();
    const {error:insertError}=await supabase.from("stock_counts").insert({
      business_id:businessId,department_id:batch.department_id,product_id:batch.product_id,batch_id:batch.id,
      counted_quantity:quantity,system_quantity:Number(batch.quantity_on_hand),
      variance:Number((quantity-Number(batch.quantity_on_hand)).toFixed(3)),
      counted_by:user?.id||null,notes:stockCountForm.notes.trim()||null
    });
    if(insertError) setStockCountMessage(insertError.message);
    else {
      setStockCountForm(v=>({...v,batch_id:"",counted_quantity:"",notes:""}));
      const {data}=await supabase.from("stock_counts").select("id,product_id,batch_id,counted_quantity,system_quantity,variance,approved_by,notes").eq("business_id",businessId).order("counted_at",{ascending:false}).limit(50);
      setStockCounts((data||[]) as Array<{id:string;product_id:string;batch_id:string|null;counted_quantity:number;system_quantity:number;variance:number|null;approved_by:string|null;notes:string|null}>);
      setStockCountMessage("Physical count submitted for manager approval. Stock has not changed yet.");
    }
    setSavingCount(false);
  }

  async function approveStockCount(id:string) {
    setStockCountMessage("");
    const {error:approveError}=await supabase.rpc("approve_stock_count",{p_count_id:id});
    if(approveError) setStockCountMessage(approveError.message);
    else {
      const [{data:countRows},{data:batchRows}]=await Promise.all([
        supabase.from("stock_counts").select("id,product_id,batch_id,counted_quantity,system_quantity,variance,approved_by,notes").eq("business_id",businessId).order("counted_at",{ascending:false}).limit(50),
        supabase.from("stock_batches").select("id,batch_code,product_id,quantity_on_hand,unit,unit_cost,department_id").eq("business_id",businessId).order("received_at",{ascending:true})
      ]);
      setStockCounts((countRows||[]) as Array<{id:string;product_id:string;batch_id:string|null;counted_quantity:number;system_quantity:number;variance:number|null;approved_by:string|null;notes:string|null}>);
      setPosBatches((batchRows||[]) as Array<{id:string;batch_code:string;product_id:string;quantity_on_hand:number;unit:string;unit_cost:number;department_id:string}>);
      setStockCountMessage("Stock count approved and adjustment movement recorded.");
    }
  }

  async function finalizeProcessing(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!businessId||!processingForm.carcass_id) return;
    setSavingProcessing(true);setProcessingMessage("");
    const outputs=processingForm.outputs.map(o=>({product_id:o.product_id,output_type:o.output_type,weight_kg:Number(o.weight_kg)}));
    if(outputs.some(o=>!o.product_id||!Number.isFinite(o.weight_kg)||o.weight_kg<=0)){
      setProcessingMessage("Each output line needs a product and a positive weight.");setSavingProcessing(false);return;
    }
    const {data,error:rpcError}=await supabase.rpc("finalize_beef_processing",{
      p_business_id:businessId,p_carcass_id:processingForm.carcass_id,p_outputs:outputs,
      p_waste_loss_kg:Number(processingForm.waste_loss_kg||0),p_unallocated_kg:Number(processingForm.unallocated_kg||0),
      p_notes:processingForm.notes.trim()||null
    });
    if(rpcError) setProcessingMessage(rpcError.message);
    else {
      const result=data as {yield_percent:number;saleable_output_kg:number;usable_byproduct_kg:number};
      setProcessingForm({carcass_id:"",waste_loss_kg:"0",unallocated_kg:"0",notes:"",outputs:[{product_id:"",output_type:"saleable",weight_kg:""}]});
      const [{data:records},{data:carcassRows}]=await Promise.all([
        supabase.from("beef_carcasses").select(section.columns.join(",")).eq("business_id",businessId).order("received_at",{ascending:false}).limit(100),
        supabase.from("beef_carcasses").select("id,carcass_code,grade,input_weight_kg,total_purchase_cost").eq("business_id",businessId).eq("status","received").order("received_at",{ascending:true})
      ]);
      setRows((records||[]) as unknown as Row[]);
      setProcessingCarcasses((carcassRows||[]) as Array<{id:string;carcass_code:string;grade:string;input_weight_kg:number;total_purchase_cost:number}>);
      setProcessingMessage("Processing approved. Yield "+Number(result.yield_percent).toFixed(2)+"%; saleable "+Number(result.saleable_output_kg).toFixed(3)+" kg; usable by-products "+Number(result.usable_byproduct_kg).toFixed(3)+" kg.");
    }
    setSavingProcessing(false);
  }

  async function receiveCarcass(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!businessId || !carcassForm.department_id || !carcassForm.carcass_code.trim()) return;
    setSavingCarcass(true); setCarcassMessage("");
    const {data:{user}}=await supabase.auth.getUser();
    const weight=Number(carcassForm.input_weight_kg), price=Number(carcassForm.purchase_price_per_kg);
    if(!Number.isFinite(weight)||weight<=0||!Number.isFinite(price)||price<0) {
      setCarcassMessage("Enter a valid carcass weight and a non-negative buying price per kg.");
      setSavingCarcass(false); return;
    }
    const {error:insertError}=await supabase.from("beef_carcasses").insert({
      business_id:businessId,department_id:carcassForm.department_id,
      supplier_id:carcassForm.supplier_id||null,carcass_code:carcassForm.carcass_code.trim(),
      grade:carcassForm.grade,input_weight_kg:weight,purchase_price_per_kg:price,
      total_purchase_cost:Number((weight*price).toFixed(2)),invoice_no:carcassForm.invoice_no.trim()||null,
      received_by:user?.id||null,payment_status:"unpaid",status:"received"
    });
    if(insertError) setCarcassMessage(insertError.message);
    else {
      setCarcassForm(v=>({...v,supplier_id:"",carcass_code:"",input_weight_kg:"",purchase_price_per_kg:"",invoice_no:""}));
      const {data,error:reloadError}=await supabase.from("beef_carcasses").select(section.columns.join(",")).eq("business_id",businessId).order("received_at",{ascending:false}).limit(100);
      if(reloadError) setCarcassMessage("Carcass saved, but the register could not refresh: "+reloadError.message);
      else {setRows((data||[]) as unknown as Row[]);setCarcassMessage("Carcass received and recorded. It is ready for processing.");}
    }
    setSavingCarcass(false);
  }

  async function createProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!businessId || !productForm.department_id || !productForm.name.trim()) return;
    setSavingProduct(true); setStockMessage("");
    const {data,error:insertError}=await supabase.from("products").insert({
      business_id:businessId, department_id:productForm.department_id,
      name:productForm.name.trim(), category:productForm.category.trim()||null,
      animal_type:productForm.animal_type.trim()||null, cut_name:productForm.cut_name.trim()||null,
      grade:productForm.grade.trim()||null, unit:productForm.unit, expected_sale_price:Number(productForm.expected_sale_price||0),
      barcode:productForm.barcode.trim()||null, track_expiry:productForm.track_expiry, active:true
    }).select("id,name,unit,department_id,expected_sale_price").single();
    if(insertError) setStockMessage(insertError.message);
    else {
      setProducts(v=>[...v,data as {id:string;name:string;unit:string;department_id:string;expected_sale_price?:number}].sort((a,b)=>a.name.localeCompare(b.name)));
      setProductForm(v=>({...v,name:"",category:"",animal_type:"",cut_name:"",grade:"",expected_sale_price:"0",barcode:""}));
      setStockMessage("Product added to the catalogue.");
    }
    setSavingProduct(false);
  }

  async function receiveStock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!businessId || !stockForm.department_id || !stockForm.product_id) return;
    setSavingStock(true); setStockMessage("");
    const product=products.find(p=>p.id===stockForm.product_id);
    if(!product) { setStockMessage("Select a valid product."); setSavingStock(false); return; }
    const {error:receiveError}=await supabase.rpc("receive_stock",{
      p_business_id:businessId,p_department_id:stockForm.department_id,p_product_id:stockForm.product_id,
      p_batch_code:stockForm.batch_code.trim(),p_quantity:Number(stockForm.quantity),p_unit:product.unit,
      p_unit_cost:Number(stockForm.unit_cost||0),p_expiry_date:stockForm.expiry_date||null
    });
    if(receiveError) setStockMessage(receiveError.message);
    else {
      setStockForm(v=>({...v,product_id:"",batch_code:"",quantity:"",unit_cost:"0",expiry_date:""}));
      const {data,error:reloadError}=await supabase.from("stock_batches").select(section.columns.join(",")).eq("business_id",businessId).order("received_at",{ascending:false}).limit(100);
      if(reloadError) setStockMessage("Stock received, but the register could not refresh: "+reloadError.message);
      else {setRows((data||[]) as unknown as Row[]);setStockMessage("Stock received successfully. Batch and movement were recorded together.");}
    }
    setSavingStock(false);
  }

  async function createSupplier(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!businessId || !supplierForm.name.trim()) return;
    setSavingSupplier(true); setSupplierMessage("");
    const { error: insertError } = await supabase.from("suppliers").insert({
      business_id: businessId,
      name: supplierForm.name.trim(),
      contact_name: supplierForm.contact_name.trim() || null,
      phone: supplierForm.phone.trim() || null,
      email: supplierForm.email.trim() || null,
      address: supplierForm.address.trim() || null,
      notes: supplierForm.notes.trim() || null,
      active: true
    });
    if (insertError) {
      setSupplierMessage(insertError.message);
    } else {
      setSupplierForm({name:"",contact_name:"",phone:"",email:"",address:"",notes:""});
      const {data,error:reloadError}=await supabase.from("suppliers").select(section.columns.join(",")).eq("business_id",businessId).order("created_at",{ascending:false}).limit(100);
      if (reloadError) setSupplierMessage("Supplier saved, but the register could not refresh: "+reloadError.message);
      else { setRows((data||[]) as unknown as Row[]); setSupplierMessage("Supplier added successfully."); }
    }
    setSavingSupplier(false);
  }

  const totals = useMemo(() => {
    const sum = (key:string) => rows.reduce((n,r)=>n+Number(r[key]||0),0);
    return {sales:sum("total"),cogs:sum("cost_of_goods"),expenses:sum("amount"),stock:sum("quantity_on_hand")};
  },[rows]);

  if (loading) return <main className="formwrap"><p className="sub">Loading your workspace…</p></main>;
  if (!section) return <main className="formwrap"><section className="formcard"><h1 className="heading">Page not found</h1><Link href="/dashboard" className="btn">Return to overview</Link></section></main>;

  const links = [
    {href:"/dashboard",label:"Overview",roles:["owner","manager","cashier","stock_clerk"]},
    {href:"/dashboard/sales",label:"Sales & POS",roles:["owner","manager","cashier"]},
    {href:"/dashboard/stock",label:"Stock & Products",roles:["owner","manager","stock_clerk"]},
    {href:"/dashboard/processing",label:"Carcass Processing",roles:["owner","manager","stock_clerk"]},
    {href:"/dashboard/suppliers",label:"Suppliers",roles:["owner","manager","stock_clerk"]},
    {href:"/dashboard/purchases",label:"Purchases",roles:["owner","manager","stock_clerk"]},
    {href:"/dashboard/expenses",label:"Expenses",roles:["owner","manager"]},
    {href:"/dashboard/cash-up",label:"Shifts & Cash-up",roles:["owner","manager","cashier"]},
    {href:"/dashboard/reports",label:"Reports",roles:["owner","manager"]},
    {href:"/dashboard/settings",label:"Business settings",roles:["owner"]},
    {href:"/dashboard/profile",label:"My account",roles:["owner","manager","cashier","stock_clerk"]},
    {href:"/dashboard/staff",label:"Staff",roles:["owner"]}
  ];
  return <div className="shell">
    <aside className="sidebar"><div className="brand">BUTCHERY<span style={{color:"#8ec6a6"}}>OS</span><small>MANAGEMENT SUITE</small></div>
      <nav className="nav"><div className="navlabel">Workspace</div>{links.filter(l=>l.roles.includes(role || "cashier")).map(l=><Link key={l.href} className={l.href==="/dashboard/"+slug?"active":""} href={l.href}>{l.label}</Link>)}<div className="navlabel">Administration</div></nav>
      <div className="sidefoot">Department-led operations · Zimbabwe-ready</div>
    </aside>
    <main className="main"><header className="topbar"><div className="crumb"><Link href="/dashboard">Workspace</Link> / <strong>{section.title}</strong></div><div className="row"><span className="muted" style={{fontSize:12}}>{role?.replace("_"," ")}</span><Link className="btn secondary" href="/dashboard">Overview</Link></div></header>
      <section className="content"><div className="eyebrow">{section.eyebrow}</div><div className="row"><div><h1 className="heading">{section.title}</h1><p className="sub">{section.description}</p></div><span className="pill">{businessName}</span></div>
      {error && <p className="error">{error}</p>}
      <div className="grid" style={{gridTemplateColumns:"repeat(3,minmax(0,1fr))"}}>{slug==="sales"||slug==="reports"?<><article className="card"><div className="metric-label">Sales in loaded records</div><div className="metric">{currency} {totals.sales.toFixed(2)}</div></article><article className="card"><div className="metric-label">Cost of goods sold</div><div className="metric">{currency} {totals.cogs.toFixed(2)}</div></article><article className="card"><div className="metric-label">Records shown</div><div className="metric">{rows.length}</div></article></>:slug==="expenses"?<><article className="card"><div className="metric-label">Loaded expenses</div><div className="metric">{currency} {totals.expenses.toFixed(2)}</div></article><article className="card"><div className="metric-label">Departments</div><div className="metric">{departmentCount}</div></article><article className="card"><div className="metric-label">Records shown</div><div className="metric">{rows.length}</div></article></>:<><article className="card"><div className="metric-label">Records shown</div><div className="metric">{rows.length}</div></article><article className="card"><div className="metric-label">Departments</div><div className="metric">{departmentCount}</div></article><article className="card"><div className="metric-label">Workspace</div><div className="metric" style={{fontSize:18}}>{role?.replace("_"," ")}</div></article></>}</div>


      {slug==="expenses" && (role==="owner" || role==="manager") && <section className="card" style={{marginBottom:16}}>
        <h2 className="section-title">Record operating expense</h2>
        <form onSubmit={saveExpense} className="formgrid" style={{marginTop:14}}>
          <label>Department<select value={expenseForm.department_id} onChange={e=>setExpenseForm(v=>({...v,department_id:e.target.value}))}><option value="">Business-wide expense</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
          <label>Expense category<input required value={expenseForm.category} onChange={e=>setExpenseForm(v=>({...v,category:e.target.value}))} placeholder="Rent, utilities, transport..."/></label>
          <label>Description<input required value={expenseForm.description} onChange={e=>setExpenseForm(v=>({...v,description:e.target.value}))} placeholder="What was paid for?"/></label>
          <label>Amount<input required type="number" min="0.01" step="0.01" value={expenseForm.amount} onChange={e=>setExpenseForm(v=>({...v,amount:e.target.value}))}/></label>
          <label>Currency<select value={expenseForm.currency} onChange={e=>setExpenseForm(v=>({...v,currency:e.target.value}))}><option>USD</option><option>ZiG</option></select></label>
          <label>Exchange rate to base currency<input required type="number" min="0.000001" step="0.000001" value={expenseForm.exchange_rate} onChange={e=>setExpenseForm(v=>({...v,exchange_rate:e.target.value}))}/></label>
          <label>Payment method<select value={expenseForm.payment_method} onChange={e=>setExpenseForm(v=>({...v,payment_method:e.target.value}))}><option value="cash">Cash</option><option value="mobile_money">Mobile money</option><option value="bank">Bank</option><option value="card">Card</option><option value="other">Other</option></select></label>
          <label>Receipt reference<input value={expenseForm.receipt_reference} onChange={e=>setExpenseForm(v=>({...v,receipt_reference:e.target.value}))}/></label>
          <button className="btn" type="submit" disabled={savingFinance}>{savingFinance?"Saving…":"Record expense"}</button>
        </form>
        {expenseMessage && <p className={expenseMessage==="Expense recorded."?"success":"notice"} style={{marginTop:12}}>{expenseMessage}</p>}
      </section>}
      {slug==="purchases" && (role==="owner" || role==="manager") && <section className="card" style={{marginBottom:16}}>
        <h2 className="section-title">Record supplier payment</h2>
        <p className="muted" style={{fontSize:12,marginTop:6}}>Payments reduce supplier balances; they do not create another stock cost or expense.</p>
        <form onSubmit={saveSupplierPayment} className="formgrid" style={{marginTop:14}}>
          <label>Supplier<select required value={supplierPayForm.supplier_id} onChange={e=>setSupplierPayForm(v=>({...v,supplier_id:e.target.value}))}><option value="">Choose supplier</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>Purchase ID (optional)<input value={supplierPayForm.purchase_id} onChange={e=>setSupplierPayForm(v=>({...v,purchase_id:e.target.value}))} placeholder="Link to a purchase UUID"/></label>
          <label>Payment amount<input required type="number" min="0.01" step="0.01" value={supplierPayForm.amount} onChange={e=>setSupplierPayForm(v=>({...v,amount:e.target.value}))}/></label>
          <label>Currency<select value={supplierPayForm.currency} onChange={e=>setSupplierPayForm(v=>({...v,currency:e.target.value}))}><option>USD</option><option>ZiG</option></select></label>
          <label>Payment method<select value={supplierPayForm.payment_method} onChange={e=>setSupplierPayForm(v=>({...v,payment_method:e.target.value}))}><option value="cash">Cash</option><option value="mobile_money">Mobile money</option><option value="bank">Bank</option><option value="card">Card</option><option value="other">Other</option></select></label>
          <label>Payment reference<input value={supplierPayForm.reference_no} onChange={e=>setSupplierPayForm(v=>({...v,reference_no:e.target.value}))}/></label>
          <button className="btn" type="submit" disabled={savingFinance}>{savingFinance?"Saving…":"Record supplier payment"}</button>
        </form>
        {supplierPayMessage && <p className={supplierPayMessage.includes("recorded")?"success":"notice"} style={{marginTop:12}}>{supplierPayMessage}</p>}
      </section>}
      {slug==="cash-up" && <section className="card" style={{marginBottom:16}}>
        <h2 className="section-title">Cashier shift control</h2>
        {openShift ? <form onSubmit={closeCashierShift} className="formgrid" style={{marginTop:14}}>
          <div className="notice">Open shift · {departments.find(d=>d.id===openShift.department_id)?.name||"Department"} · Opening float {currency} {Number(openShift.opening_cash).toFixed(2)}</div>
          <label>Counted closing cash<input required type="number" min="0" step="0.01" value={shiftForm.actual_cash} onChange={e=>setShiftForm(v=>({...v,actual_cash:e.target.value}))}/></label>
          <label>Closing notes<input value={shiftForm.closing_notes} onChange={e=>setShiftForm(v=>({...v,closing_notes:e.target.value}))} placeholder="Explain any cash discrepancy"/></label>
          <button className="btn" type="submit" disabled={savingShift}>{savingShift?"Closing shift…":"Close shift & reconcile"}</button>
        </form> : <form onSubmit={openCashierShift} className="formgrid" style={{marginTop:14}}>
          <label>Department<select required value={shiftForm.department_id} onChange={e=>setShiftForm(v=>({...v,department_id:e.target.value}))}><option value="">Choose department</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
          <label>Opening cash float<input required type="number" min="0" step="0.01" value={shiftForm.opening_cash} onChange={e=>setShiftForm(v=>({...v,opening_cash:e.target.value}))}/></label>
          <button className="btn" type="submit" disabled={savingShift}>{savingShift?"Opening shift…":"Open cashier shift"}</button>
        </form>}
        {shiftMessage && <p className={shiftMessage.includes("opened")||shiftMessage.includes("closed")?"success":"notice"} style={{marginTop:12}}>{shiftMessage}</p>}
      </section>}
      {slug==="sales" && <section className="card" style={{marginBottom:16}}>
        <h2 className="section-title">Point of sale</h2>
        <p className="muted" style={{fontSize:12,marginTop:6}}>Select a live stock batch. Posting a sale checks available stock, records cost of goods, creates the payment transaction and deducts stock in one database transaction.</p>
        {!openShift ? <div className="notice" style={{marginTop:12}}>Open a cashier shift in Shifts & Cash-up before posting sales.</div> : <form onSubmit={submitSale} className="formgrid" style={{marginTop:14}}>
          <label>Department<select required value={posForm.department_id} onChange={e=>setPosForm(v=>({...v,department_id:e.target.value,batch_id:""}))}><option value="">Choose department</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
          <label>Stock batch<select required value={posForm.batch_id} onChange={e=>setPosForm(v=>({...v,batch_id:e.target.value}))}><option value="">Choose available batch</option>{posBatches.filter(b=>b.department_id===posForm.department_id).map(b=><option key={b.id} value={b.id}>{b.batch_code} · {products.find(p=>p.id===b.product_id)?.name||b.product_id} · {b.quantity_on_hand} {b.unit}</option>)}</select></label>
          <label>Quantity<input required type="number" min="0.001" step="0.001" value={posForm.quantity} onChange={e=>setPosForm(v=>({...v,quantity:e.target.value}))}/></label>
          <label>Selling price per unit<input required type="number" min="0" step="0.01" value={posForm.unit_price} onChange={e=>setPosForm(v=>({...v,unit_price:e.target.value}))}/></label>
          <label>Discount<input type="number" min="0" step="0.01" value={posForm.discount} onChange={e=>setPosForm(v=>({...v,discount:e.target.value}))}/></label>
          <label>Currency<select value={posForm.currency} onChange={e=>setPosForm(v=>({...v,currency:e.target.value}))}><option>USD</option><option>ZiG</option></select></label>
          <label>Exchange rate to base currency<input required type="number" min="0.000001" step="0.000001" value={posForm.exchange_rate} onChange={e=>setPosForm(v=>({...v,exchange_rate:e.target.value}))}/></label>
          <label>Payment method<select value={posForm.payment_method} onChange={e=>setPosForm(v=>({...v,payment_method:e.target.value}))}><option value="cash">Cash</option><option value="mobile_money">Mobile money</option><option value="bank">Bank transfer</option><option value="card">Card</option><option value="other">Other</option></select></label>
          <div className="notice">Line total before discount: {posForm.currency} {(Number(posForm.quantity||0)*Number(posForm.unit_price||0)).toFixed(2)}</div>
          <button className="btn" type="submit" disabled={savingSale}>{savingSale?"Posting sale…":"Complete sale"}</button>
        </form>}
        {posMessage && <p className={posMessage.startsWith("Sale posted")?"success":"notice"} style={{marginTop:12}}>{posMessage}</p>}
      </section>}
      {slug==="purchases" && (role==="owner" || role==="manager" || role==="stock_clerk") && <section className="card" style={{marginBottom:16}}>
        <h2 className="section-title">Record supplier purchase and delivery</h2>
        <p className="muted" style={{fontSize:12,marginTop:6}}>This records the purchase, line item, incoming stock batch and stock movement atomically. Supplier payments are recorded separately and do not add the purchase cost again.</p>
        <form onSubmit={recordPurchase} className="formgrid" style={{marginTop:14}}>
          <label>Purchase reference<input required value={purchaseForm.reference_no} onChange={e=>setPurchaseForm(v=>({...v,reference_no:e.target.value}))} placeholder="e.g. PUR-2026-001"/></label>
          <label>Department<select required value={purchaseForm.department_id} onChange={e=>setPurchaseForm(v=>({...v,department_id:e.target.value,product_id:""}))}><option value="">Choose department</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
          <label>Supplier<select value={purchaseForm.supplier_id} onChange={e=>setPurchaseForm(v=>({...v,supplier_id:e.target.value}))}><option value="">Select supplier</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>Invoice number<input value={purchaseForm.invoice_no} onChange={e=>setPurchaseForm(v=>({...v,invoice_no:e.target.value}))} placeholder="Supplier invoice"/></label>
          <label>Product<select required value={purchaseForm.product_id} onChange={e=>setPurchaseForm(v=>({...v,product_id:e.target.value}))}><option value="">Choose product</option>{products.filter(p=>p.department_id===purchaseForm.department_id).map(p=><option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}</select></label>
          <label>Quantity<input required type="number" min="0.001" step="0.001" value={purchaseForm.quantity} onChange={e=>setPurchaseForm(v=>({...v,quantity:e.target.value}))}/></label>
          <label>Unit cost<input required type="number" min="0" step="0.01" value={purchaseForm.unit_cost} onChange={e=>setPurchaseForm(v=>({...v,unit_cost:e.target.value}))}/></label>
          <label>Currency<select value={purchaseForm.currency} onChange={e=>setPurchaseForm(v=>({...v,currency:e.target.value}))}><option>USD</option><option>ZiG</option></select></label>
          <label>Exchange rate to base currency<input required type="number" min="0.000001" step="0.000001" value={purchaseForm.exchange_rate} onChange={e=>setPurchaseForm(v=>({...v,exchange_rate:e.target.value}))}/></label>
          <label>Stock batch reference<input required value={purchaseForm.batch_code} onChange={e=>setPurchaseForm(v=>({...v,batch_code:e.target.value}))} placeholder="Batch / delivery code"/></label>
          <label>Expiry date (optional)<input type="date" value={purchaseForm.expiry_date} onChange={e=>setPurchaseForm(v=>({...v,expiry_date:e.target.value}))}/></label>
          <div className="notice">Line total: {purchaseForm.currency} {(Number(purchaseForm.quantity||0)*Number(purchaseForm.unit_cost||0)).toFixed(2)}</div>
          <button className="btn" type="submit" disabled={savingPurchase || products.filter(p=>p.department_id===purchaseForm.department_id).length===0}>{savingPurchase?"Recording purchase…":"Record purchase & receive stock"}</button>
        </form>
        {purchaseMessage && <p className={purchaseMessage.includes("recorded.")?"success":"notice"} style={{marginTop:12}}>{purchaseMessage}</p>}
      </section>}
      {slug==="processing" && (role==="owner" || role==="manager") && <section className="card" style={{marginBottom:16}}>
        <h2 className="section-title">Process carcass and reconcile yield</h2>
        <p className="muted" style={{fontSize:12,marginTop:6}}>Only a manager or owner can finalize processing. All output weights must reconcile to the carcass input. Usable bones and fat are recorded as by-products, not waste. Cost is allocated using each output's expected sales value.</p>
        <form onSubmit={finalizeProcessing} style={{marginTop:14}}>
          <div className="formgrid">
            <label>Received carcass<select required value={processingForm.carcass_id} onChange={e=>setProcessingForm(v=>({...v,carcass_id:e.target.value}))}><option value="">Choose unprocessed carcass</option>{processingCarcasses.map(c=><option key={c.id} value={c.id}>{c.carcass_code} · {c.grade} · {c.input_weight_kg} kg</option>)}</select></label>
            <label>Waste / processing loss (kg)<input type="number" min="0" step="0.001" value={processingForm.waste_loss_kg} onChange={e=>setProcessingForm(v=>({...v,waste_loss_kg:e.target.value}))}/></label>
            <label>Unallocated discrepancy (kg)<input type="number" min="0" step="0.001" value={processingForm.unallocated_kg} onChange={e=>setProcessingForm(v=>({...v,unallocated_kg:e.target.value}))}/></label>
            <label>Processing notes<input value={processingForm.notes} onChange={e=>setProcessingForm(v=>({...v,notes:e.target.value}))} placeholder="Cutting notes / variance explanation"/></label>
          </div>
          <h3 className="section-title" style={{marginTop:18}}>Saleable cuts and usable by-products</h3>
          {processingForm.outputs.map((o,i)=><div key={i} className="formgrid" style={{marginTop:10}}>
            <label>Product<select required value={o.product_id} onChange={e=>setProcessingForm(v=>({...v,outputs:v.outputs.map((line,j)=>j===i?{...line,product_id:e.target.value}:line)}))}><option value="">Choose kg product</option>{products.filter(p=>p.department_id===(departments.find(d=>d.code==="red_meat")?.id||carcassForm.department_id)&&p.unit==="kg").map(p=><option key={p.id} value={p.id}>{p.name} · expected {currency} {Number(p.expected_sale_price||0).toFixed(2)}/kg</option>)}</select></label>
            <label>Output type<select value={o.output_type} onChange={e=>setProcessingForm(v=>({...v,outputs:v.outputs.map((line,j)=>j===i?{...line,output_type:e.target.value}:line)}))}><option value="saleable">Saleable cut</option><option value="byproduct">Usable by-product</option></select></label>
            <label>Weight (kg)<input required type="number" min="0.001" step="0.001" value={o.weight_kg} onChange={e=>setProcessingForm(v=>({...v,outputs:v.outputs.map((line,j)=>j===i?{...line,weight_kg:e.target.value}:line)}))}/></label>
            <button className="btn secondary" type="button" disabled={processingForm.outputs.length===1} onClick={()=>setProcessingForm(v=>({...v,outputs:v.outputs.filter((_,j)=>j!==i)}))}>Remove line</button>
          </div>)}
          <button className="btn secondary" type="button" style={{marginTop:12}} onClick={()=>setProcessingForm(v=>({...v,outputs:[...v.outputs,{product_id:"",output_type:"saleable",weight_kg:""}]}))}>Add output line</button>
          <button className="btn" type="submit" disabled={savingProcessing||processingCarcasses.length===0} style={{marginTop:14,marginLeft:10}}>{savingProcessing?"Finalizing…":"Approve processing & create stock batches"}</button>
        </form>
        {processingMessage && <p className={processingMessage.startsWith("Processing approved")?"success":"notice"} style={{marginTop:12}}>{processingMessage}</p>}
      </section>}
      {slug==="processing" && (role==="owner" || role==="manager" || role==="stock_clerk") && <section className="card" style={{marginBottom:16}}>
        <h2 className="section-title">Receive a beef carcass</h2>
        <p className="muted" style={{fontSize:12,marginTop:6}}>Record each carcass separately so its grade, supplier, weight and purchase cost remain traceable through cutting.</p>
        <form onSubmit={receiveCarcass} className="formgrid" style={{marginTop:14}}>
          <label>Carcass ID / tag<input required value={carcassForm.carcass_code} onChange={e=>setCarcassForm(v=>({...v,carcass_code:e.target.value}))} placeholder="e.g. BEEF-2026-001"/></label>
          <label>Department<select required value={carcassForm.department_id} onChange={e=>setCarcassForm(v=>({...v,department_id:e.target.value}))}>{departments.filter(d=>d.code==="red_meat").map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
          <label>Grade<select value={carcassForm.grade} onChange={e=>setCarcassForm(v=>({...v,grade:e.target.value}))}><option>Commercial</option><option>Economy</option><option>Super</option></select></label>
          <label>Supplier<select value={carcassForm.supplier_id} onChange={e=>setCarcassForm(v=>({...v,supplier_id:e.target.value}))}><option value="">Select supplier (optional)</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>Carcass weight (kg)<input required type="number" min="0.001" step="0.001" value={carcassForm.input_weight_kg} onChange={e=>setCarcassForm(v=>({...v,input_weight_kg:e.target.value}))} placeholder="0.000"/></label>
          <label>Buying price per kg<input required type="number" min="0" step="0.01" value={carcassForm.purchase_price_per_kg} onChange={e=>setCarcassForm(v=>({...v,purchase_price_per_kg:e.target.value}))} placeholder="0.00"/></label>
          <label>Invoice number<input value={carcassForm.invoice_no} onChange={e=>setCarcassForm(v=>({...v,invoice_no:e.target.value}))} placeholder="Supplier invoice"/></label>
          <div className="notice">Carcass purchase cost: {currency} {(Number(carcassForm.input_weight_kg||0)*Number(carcassForm.purchase_price_per_kg||0)).toFixed(2)}</div>
          <button className="btn" type="submit" disabled={savingCarcass}>{savingCarcass?"Saving carcass…":"Record carcass"}</button>
        </form>
        {carcassMessage && <p className={carcassMessage.includes("recorded")?"success":"notice"} style={{marginTop:12}}>{carcassMessage}</p>}
      </section>}
      {slug==="stock" && <section className="card" style={{marginBottom:16}}>
        <h2 className="section-title">Physical stock count</h2>
        <p className="muted" style={{fontSize:12,marginTop:6}}>Stock clerks submit counts; a manager approves any variance before on-hand stock changes.</p>
        <form onSubmit={submitStockCount} className="formgrid" style={{marginTop:14}}>
          <label>Department<select required value={stockCountForm.department_id} onChange={e=>setStockCountForm(v=>({...v,department_id:e.target.value,batch_id:""}))}><option value="">Choose department</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
          <label>Batch<select required value={stockCountForm.batch_id} onChange={e=>setStockCountForm(v=>({...v,batch_id:e.target.value}))}><option value="">Choose batch</option>{posBatches.filter(b=>b.department_id===stockCountForm.department_id).map(b=><option key={b.id} value={b.id}>{b.batch_code} · {products.find(p=>p.id===b.product_id)?.name||b.product_id} · system {b.quantity_on_hand} {b.unit}</option>)}</select></label>
          <label>Physical quantity counted<input required type="number" min="0" step="0.001" value={stockCountForm.counted_quantity} onChange={e=>setStockCountForm(v=>({...v,counted_quantity:e.target.value}))}/></label>
          <label>Notes / explanation<input value={stockCountForm.notes} onChange={e=>setStockCountForm(v=>({...v,notes:e.target.value}))}/></label>
          <button className="btn" type="submit" disabled={savingCount}>{savingCount?"Submitting…":"Submit count for approval"}</button>
        </form>
        {stockCountMessage && <p className={stockCountMessage.includes("submitted")||stockCountMessage.includes("approved")?"success":"notice"} style={{marginTop:12}}>{stockCountMessage}</p>}
        <h3 className="section-title" style={{marginTop:18}}>Recent physical counts</h3>
        {stockCounts.length===0?<p className="muted" style={{fontSize:12,marginTop:10}}>No physical counts recorded yet.</p>:<div style={{overflowX:"auto",marginTop:10}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr><th style={{textAlign:"left",padding:8}}>Batch</th><th style={{textAlign:"left",padding:8}}>System</th><th style={{textAlign:"left",padding:8}}>Counted</th><th style={{textAlign:"left",padding:8}}>Variance</th><th style={{textAlign:"left",padding:8}}>Status</th><th style={{padding:8}}>Action</th></tr></thead><tbody>{stockCounts.map(sc=><tr key={sc.id} style={{borderTop:"1px solid var(--line)"}}><td style={{padding:8}}>{posBatches.find(b=>b.id===sc.batch_id)?.batch_code||"Batch"}</td><td style={{padding:8}}>{sc.system_quantity}</td><td style={{padding:8}}>{sc.counted_quantity}</td><td style={{padding:8}}>{sc.variance??"—"}</td><td style={{padding:8}}>{sc.approved_by?"Approved":"Pending"}</td><td style={{padding:8}}>{(role==="owner"||role==="manager")&&!sc.approved_by?<button className="btn secondary" type="button" onClick={()=>approveStockCount(sc.id)}>Approve</button>:"—"}</td></tr>)}</tbody></table></div>}
      </section>}
      {slug==="stock" && (role==="owner" || role==="manager" || role==="stock_clerk") && <>
        <section className="card" style={{marginBottom:16}}>
          <h2 className="section-title">Product catalogue</h2>
          <p className="muted" style={{fontSize:12,marginTop:6}}>Create products within the correct department. Units include kilograms, pieces, crates and packets.</p>
          <form onSubmit={createProduct} className="formgrid" style={{marginTop:14}}>
            <label>Product name<input required value={productForm.name} onChange={e=>setProductForm(v=>({...v,name:e.target.value}))} placeholder="e.g. Beef rump steak"/></label>
            <label>Department<select required value={productForm.department_id} onChange={e=>setProductForm(v=>({...v,department_id:e.target.value}))}><option value="">Choose department</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
            <label>Category<input value={productForm.category} onChange={e=>setProductForm(v=>({...v,category:e.target.value}))} placeholder="Beef / chicken / pork"/></label>
            <label>Animal type<input value={productForm.animal_type} onChange={e=>setProductForm(v=>({...v,animal_type:e.target.value}))} placeholder="Beef, goat, chicken..."/></label>
            <label>Cut / product type<input value={productForm.cut_name} onChange={e=>setProductForm(v=>({...v,cut_name:e.target.value}))} placeholder="Rump, brisket, wings..."/></label>
            <label>Grade<input value={productForm.grade} onChange={e=>setProductForm(v=>({...v,grade:e.target.value}))} placeholder="Commercial / Economy / Super"/></label>
            <label>Expected selling price per unit<input required type="number" min="0" step="0.01" value={productForm.expected_sale_price} onChange={e=>setProductForm(v=>({...v,expected_sale_price:e.target.value}))} placeholder="0.00"/></label>
            <label>Stock unit<select value={productForm.unit} onChange={e=>setProductForm(v=>({...v,unit:e.target.value}))}><option value="kg">Kilograms (kg)</option><option value="piece">Pieces</option><option value="crate">Crates</option><option value="packet">Packets</option><option value="other">Other</option></select></label>
            <label>Barcode (optional)<input value={productForm.barcode} onChange={e=>setProductForm(v=>({...v,barcode:e.target.value}))} placeholder="Barcode"/></label>
            <label style={{display:"flex",alignItems:"center",gap:8}}><input type="checkbox" checked={productForm.track_expiry} onChange={e=>setProductForm(v=>({...v,track_expiry:e.target.checked}))}/> Track expiry dates</label>
            <button className="btn" type="submit" disabled={savingProduct}>{savingProduct?"Saving product…":"Add product"}</button>
          </form>
        </section>
        <section className="card" style={{marginBottom:16}}>
          <h2 className="section-title">Receive stock into a batch</h2>
          <p className="muted" style={{fontSize:12,marginTop:6}}>A successful receipt creates the batch and its stock movement in one database transaction. Negative quantities are rejected.</p>
          <form onSubmit={receiveStock} className="formgrid" style={{marginTop:14}}>
            <label>Department<select required value={stockForm.department_id} onChange={e=>setStockForm(v=>({...v,department_id:e.target.value,product_id:""}))}><option value="">Choose department</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
            <label>Product<select required value={stockForm.product_id} onChange={e=>setStockForm(v=>({...v,product_id:e.target.value}))}><option value="">Choose product</option>{products.filter(p=>p.department_id===stockForm.department_id).map(p=><option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}</select></label>
            <label>Batch / delivery reference<input required value={stockForm.batch_code} onChange={e=>setStockForm(v=>({...v,batch_code:e.target.value}))} placeholder="e.g. INV-2026-001"/></label>
            <label>Quantity received<input required type="number" min="0.001" step="0.001" value={stockForm.quantity} onChange={e=>setStockForm(v=>({...v,quantity:e.target.value}))} placeholder="0.000"/></label>
            <label>Unit cost<input required type="number" min="0" step="0.01" value={stockForm.unit_cost} onChange={e=>setStockForm(v=>({...v,unit_cost:e.target.value}))} placeholder="0.00"/></label>
            <label>Expiry date (if applicable)<input type="date" value={stockForm.expiry_date} onChange={e=>setStockForm(v=>({...v,expiry_date:e.target.value}))}/></label>
            <button className="btn" type="submit" disabled={savingStock || products.filter(p=>p.department_id===stockForm.department_id).length===0}>{savingStock?"Receiving stock…":"Receive stock"}</button>
          </form>
          {stockMessage && <p className={stockMessage.includes("successfully")||stockMessage.includes("catalogue")?"success":"notice"} style={{marginTop:12}}>{stockMessage}</p>}
        </section>
      </>}
      {slug==="suppliers" && (role==="owner" || role==="manager") && <section className="card" style={{marginBottom:16}}>
        <h2 className="section-title">Add supplier</h2>
        <p className="muted" style={{fontSize:12,marginTop:6}}>Save a supplier once, then select them when recording deliveries and purchases.</p>
        <form onSubmit={createSupplier} className="formgrid" style={{marginTop:14}}>
          <label>Supplier / company name<input required value={supplierForm.name} onChange={e=>setSupplierForm(v=>({...v,name:e.target.value}))} placeholder="e.g. Mbare Meat Suppliers"/></label>
          <label>Contact person<input value={supplierForm.contact_name} onChange={e=>setSupplierForm(v=>({...v,contact_name:e.target.value}))} placeholder="Contact name"/></label>
          <label>Phone<input value={supplierForm.phone} onChange={e=>setSupplierForm(v=>({...v,phone:e.target.value}))} placeholder="+263..."/></label>
          <label>Email<input type="email" value={supplierForm.email} onChange={e=>setSupplierForm(v=>({...v,email:e.target.value}))} placeholder="supplier@example.com"/></label>
          <label>Address<input value={supplierForm.address} onChange={e=>setSupplierForm(v=>({...v,address:e.target.value}))} placeholder="Town / address"/></label>
          <label>Notes<input value={supplierForm.notes} onChange={e=>setSupplierForm(v=>({...v,notes:e.target.value}))} placeholder="Products supplied, payment terms..."/></label>
          <button className="btn" type="submit" disabled={savingSupplier}>{savingSupplier?"Saving supplier…":"Save supplier"}</button>
        </form>
        {supplierMessage && <p className={supplierMessage.includes("successfully")?"success":"notice"} style={{marginTop:12}}>{supplierMessage}</p>}
      </section>}
      <section className="card"><div className="row"><h2 className="section-title">{section.title} register</h2><span className="muted" style={{fontSize:11}}>Latest 100 records · live database</span></div>
      {rows.length===0?<div className="notice" style={{marginTop:16}}>No records are available yet. Once authorized transactions are entered, they will appear here. This page does not create sample data.</div>:<div style={{overflowX:"auto",marginTop:14}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr>{section.columns.map(c=><th key={c} style={{textAlign:"left",padding:11,whiteSpace:"nowrap",background:"#f7faf7"}}>{section.labels[c]||c}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={String(r.id||i)} style={{borderTop:"1px solid var(--line)"}}>{section.columns.map(c=><td key={c} style={{padding:11,whiteSpace:"nowrap",maxWidth:240,overflow:"hidden",textOverflow:"ellipsis"}}>{display(r[c])}</td>)}</tr>)}</tbody></table></div>}
      </section>
      {slug==="processing"&&<div className="notice" style={{marginTop:16}}>Processing control rule: input carcass weight must reconcile to saleable cuts + usable by-products + waste/loss + any explicit unallocated discrepancy. Do not classify saleable bones or fat as waste.</div>}
      {slug==="cash-up"&&<div className="notice" style={{marginTop:16}}>Cash reconciliation formula: opening float + cash sales − cash expenses/refunds = expected cash. Compare with counted cash and record the variance; bank and mobile-money totals are reconciled separately.</div>}
      {slug==="reports"&&<div className="notice" style={{marginTop:16}}>Profit reporting is not yet a complete accounting statement. The dashboard must also reconcile purchase cost allocation, stock movements and expenses before presenting net profit.</div>}
      </section>
    </main>
  </div>;
}
