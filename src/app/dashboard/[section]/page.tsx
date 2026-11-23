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
        supabase.from("departments").select("id").eq("business_id",membership.business_id).eq("active",true),
        section.table==="businesses" ? supabase.from("businesses").select(section.columns.join(",")).eq("id",membership.business_id).order("created_at",{ascending:false}).limit(1) : supabase.from(section.table).select(section.columns.join(",")).eq("business_id",membership.business_id).order(section.table==="sales"?"sold_at":section.table==="cashier_shifts"?"opened_at":section.table==="expenses"?"incurred_at":section.table==="purchases"?"purchase_date":section.table==="beef_carcasses"?"received_at":section.table==="stock_batches"?"received_at":"created_at",{ascending:false}).limit(100)
      ]);
      if (!alive) return;
      setBusinessName(business.data?.name || "Business"); setCurrency(business.data?.base_currency || "USD");
      setDepartmentCount(departments.data?.length || 0);
      if (records.error) setError(records.error.message); else setRows((records.data || []) as unknown as Row[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  },[router,slug]);


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
