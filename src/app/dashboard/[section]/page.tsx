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
  const [products,setProducts] = useState<Array<{id:string;name:string;unit:string;department_id:string}>>([]);
  const [productForm,setProductForm] = useState({name:"",category:"",animal_type:"",cut_name:"",grade:"",unit:"kg",department_id:"",barcode:"",track_expiry:false});
  const [stockForm,setStockForm] = useState({department_id:"",product_id:"",batch_code:"",quantity:"",unit_cost:"0",expiry_date:""});
  const [savingProduct,setSavingProduct] = useState(false);
  const [savingStock,setSavingStock] = useState(false);
  const [stockMessage,setStockMessage] = useState("");
  const [suppliers,setSuppliers] = useState<Array<{id:string;name:string}>>([]);
  const [carcassForm,setCarcassForm] = useState({department_id:"",supplier_id:"",carcass_code:"",grade:"Commercial",input_weight_kg:"",purchase_price_per_kg:"",invoice_no:""});
  const [savingCarcass,setSavingCarcass] = useState(false);
  const [carcassMessage,setCarcassMessage] = useState("");
  const [purchaseForm,setPurchaseForm] = useState({department_id:"",supplier_id:"",reference_no:"",invoice_no:"",currency:"USD",exchange_rate:"1",product_id:"",quantity:"",unit_cost:"",batch_code:"",expiry_date:""});
  const [savingPurchase,setSavingPurchase] = useState(false);
  const [purchaseMessage,setPurchaseMessage] = useState("");





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
        const {data:supplierRows}=await supabase.from("suppliers").select("id,name").eq("business_id",membership.business_id).eq("active",true).order("name");
        setSuppliers((supplierRows||[]) as Array<{id:string;name:string}>);
        const redMeat=deptRows.find(d=>d.code==="red_meat")?.id || membership.department_id || deptRows[0]?.id || "";
        setCarcassForm(v=>({...v,department_id:v.department_id||redMeat}));
      }
      if (slug==="purchases") {
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
        const {data:productRows}=await supabase.from("products").select("id,name,unit,department_id").eq("business_id",membership.business_id).eq("active",true).order("name");
        const list=(productRows||[]) as Array<{id:string;name:string;unit:string;department_id:string}>;
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
      grade:productForm.grade.trim()||null, unit:productForm.unit,
      barcode:productForm.barcode.trim()||null, track_expiry:productForm.track_expiry, active:true
    }).select("id,name,unit,department_id").single();
    if(insertError) setStockMessage(insertError.message);
    else {
      setProducts(v=>[...v,data as {id:string;name:string;unit:string;department_id:string}].sort((a,b)=>a.name.localeCompare(b.name)));
      setProductForm(v=>({...v,name:"",category:"",animal_type:"",cut_name:"",grade:"",barcode:""}));
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
