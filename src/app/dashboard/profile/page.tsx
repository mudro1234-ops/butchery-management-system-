"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AccountPage() {
  const router = useRouter();
  const [email,setEmail] = useState("");
  const [name,setName] = useState("");
  const [role,setRole] = useState("");
  const [department,setDepartment] = useState("Business-wide");
  const [password,setPassword] = useState("");
  const [confirm,setConfirm] = useState("");
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);

  useEffect(()=>{let alive=true;(async()=>{
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){router.replace("/login");return;}
    const {data:m}=await supabase.from("business_members").select("display_name,role,department_id,business_id").eq("user_id",user.id).eq("active",true).maybeSingle();
    if(!alive)return;
    setEmail(user.email||"");setName(m?.display_name||String(user.user_metadata?.full_name||""));setRole(m?.role||"");
    if(m?.department_id){const {data:d}=await supabase.from("departments").select("name").eq("id",m.department_id).maybeSingle();if(alive)setDepartment(d?.name||"Assigned department");}
  })();return()=>{alive=false}},[router]);

  async function changePassword(e:FormEvent){
    e.preventDefault();setError("");setMessage("");
    if(password.length<8){setError("Use at least 8 characters.");return;}
    if(password!==confirm){setError("The passwords do not match.");return;}
    setBusy(true);
    const {error}=await supabase.auth.updateUser({password});
    setBusy(false);
    if(error)setError(error.message);else{setMessage("Your password has been updated.");setPassword("");setConfirm("");}
  }
  async function signOut(){await supabase.auth.signOut();router.replace("/login");}
  return <div className="shell"><aside className="sidebar"><div className="brand">BUTCHERY<span style={{color:"#8ec6a6"}}>OS</span><small>MANAGEMENT SUITE</small></div><nav className="nav"><Link href="/dashboard">Overview</Link><Link href="/dashboard/profile" className="active">My account</Link>{role==="owner"&&<Link href="/dashboard/settings">Business settings</Link>}</nav><div className="sidefoot">Your account and sign-in security.</div></aside>
    <main className="main"><header className="topbar"><div className="crumb"><Link href="/dashboard">Workspace</Link> / <strong>My account</strong></div><button className="btn secondary" onClick={signOut}>Sign out</button></header>
      <section className="content"><div className="eyebrow">Personal workspace</div><h1 className="heading">My account</h1><p className="sub">Your sign-in identity and assigned workspace access.</p>
        <div className="grid" style={{gridTemplateColumns:"repeat(2,minmax(0,1fr))"}}><article className="card"><div className="metric-label">Account email</div><div style={{fontWeight:800,marginTop:10,overflowWrap:"anywhere"}}>{email||"—"}</div></article><article className="card"><div className="metric-label">Assigned role</div><div style={{fontWeight:800,marginTop:10,textTransform:"capitalize"}}>{role.replace("_"," ")||"—"}</div><div className="metric-note">{department}</div></article></div>
        <section className="card" style={{maxWidth:560}}><h2 className="section-title">Change password</h2><p className="sub">Choose a strong password that you do not use on other websites.</p><form onSubmit={changePassword}><div className="field"><label>New password</label><input type="password" minLength={8} required autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} /></div><div className="field"><label>Confirm new password</label><input type="password" minLength={8} required autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} /></div>{error&&<p className="error">{error}</p>}{message&&<p className="success">{message}</p>}<button className="btn" disabled={busy}>{busy?"Updating…":"Update password"}</button></form></section>
      </section>
    </main>
  </div>;
}
