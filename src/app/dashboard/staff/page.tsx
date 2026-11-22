"use client";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Dept = { id: string; name: string };
type Member = { id: string; display_name: string; role: string; department_id: string | null; active: boolean };
type Invite = { id: string; email: string; display_name: string; role: string; status: string; expires_at: string };

export default function StaffPage() {
  const router = useRouter();
  const [businessId, setBusinessId] = useState("");
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("cashier");
  const [departmentId, setDepartmentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login"); return; }
    const { data: membership } = await supabase.from("business_members")
      .select("business_id,role").eq("user_id", user.id).eq("active", true).maybeSingle();
    if (!membership) { router.replace("/setup"); return; }
    if (membership.role !== "owner") { setError("Only the business owner can manage staff invitations."); setLoading(false); return; }
    setBusinessId(membership.business_id);
    const [d, m, i] = await Promise.all([
      supabase.from("departments").select("id,name").eq("business_id", membership.business_id).eq("active", true).order("name"),
      supabase.from("business_members").select("id,display_name,role,department_id,active").eq("business_id", membership.business_id).order("display_name"),
      supabase.from("staff_invitations").select("id,email,display_name,role,status,expires_at").eq("business_id", membership.business_id).order("created_at", { ascending: false }),
    ]);
    setDepartments(d.data || []); setMembers(m.data || []); setInvites(i.data || []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function sendInvite(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("invite-staff", {
        body: { businessId, email, displayName: name, role, departmentId: departmentId || null },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMessage(data.message || "Invitation sent.");
      setName(""); setEmail("");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not send invitation."); }
    finally { setBusy(false); }
  }

  if (loading) return <main className="formwrap"><p className="sub">Loading staff workspace…</p></main>;
  return <div className="shell">
    <aside className="sidebar"><div className="brand">BUTCHERY<span style={{color:"#8ec6a6"}}>OS</span><small>MANAGEMENT SUITE</small></div>
      <nav className="nav"><div className="navlabel">Workspace</div><Link href="/dashboard">▦ Overview</Link><Link href="/dashboard">▤ Sales & POS</Link><Link href="/dashboard">◫ Stock & Products</Link><Link href="/dashboard">♧ Carcass Processing</Link><Link href="/dashboard">♙ Suppliers</Link><Link href="/dashboard">▧ Expenses</Link><Link href="/dashboard">◷ Reports & Cash-up</Link><div className="navlabel">Administration</div><Link className="active" href="/dashboard/staff">⚙ Staff & Settings</Link></nav>
      <div className="sidefoot">Secure invitations. Individual staff accounts.</div>
    </aside>
    <main className="main"><header className="topbar"><div className="crumb"><Link href="/dashboard">Workspace</Link> / <strong>Staff management</strong></div><Link className="btn secondary" href="/dashboard">Back to dashboard</Link></header>
      <section className="content"><div className="eyebrow">Administration</div><h1 className="heading">Staff management</h1><p className="sub">Invite staff using their own email address. Each invitation is linked to one person and expires after 48 hours.</p>
      {error && <p className="error">{error}</p>}{message && <p className="success">{message}</p>}
      {!businessId ? null : <div className="grid" style={{gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",alignItems:"start"}}>
        <section className="card"><h2 className="section-title">Invite a staff member</h2><p className="sub">They will receive a private activation link by email.</p>
          <form onSubmit={sendInvite}>
            <div className="field"><label>Staff member's full name</label><input required value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Tendai Moyo"/></div>
            <div className="field"><label>Email address</label><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="staff@example.com"/></div>
            <div className="field"><label>Role</label><select value={role} onChange={e=>setRole(e.target.value)}><option value="cashier">Cashier</option><option value="stock_clerk">Stock clerk</option><option value="manager">Manager</option></select></div>
            <div className="field"><label>Assigned department</label><select value={departmentId} onChange={e=>setDepartmentId(e.target.value)}><option value="">All departments / business-wide</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
            <button className="btn" disabled={busy} style={{width:"100%"}}>{busy ? "Sending invitation…" : "Send secure invitation"}</button>
          </form>
        </section>
        <section className="card"><h2 className="section-title">Invitation security</h2><ul style={{fontSize:12,lineHeight:1.9,color:"var(--muted)",paddingLeft:18}}><li>Invitation is addressed to the exact email entered.</li><li>Only the matching authenticated account can activate it.</li><li>Link expires after 48 hours and cannot be reused.</li><li>Staff set their own password; the owner never sees it.</li><li>Staff permissions follow their assigned role and department.</li></ul></section>
      </div>}
      <section className="card" style={{marginTop:18}}><h2 className="section-title">Current staff</h2><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12,marginTop:14}}><thead><tr><th style={{textAlign:"left",padding:10}}>Name</th><th style={{textAlign:"left",padding:10}}>Role</th><th style={{textAlign:"left",padding:10}}>Department access</th><th style={{textAlign:"left",padding:10}}>Status</th></tr></thead><tbody>{members.map(m=><tr key={m.id} style={{borderTop:"1px solid var(--line)"}}><td style={{padding:10}}>{m.display_name}</td><td style={{padding:10}}>{m.role.replace("_"," ")}</td><td style={{padding:10}}>{departments.find(d=>d.id===m.department_id)?.name || "Business-wide"}</td><td style={{padding:10}}>{m.active ? "Active" : "Inactive"}</td></tr>)}</tbody></table></div></section>
      <section className="card" style={{marginTop:18}}><h2 className="section-title">Recent invitations</h2>{invites.length===0?<p className="sub">No invitations have been sent yet.</p>:invites.map(i=><div key={i.id} style={{display:"flex",justifyContent:"space-between",gap:12,borderTop:"1px solid var(--line)",padding:"12px 0",fontSize:12}}><div><strong>{i.display_name}</strong><div className="muted">{i.email} · {i.role.replace("_"," ")}</div></div><div className="muted">{i.status} · expires {new Date(i.expires_at).toLocaleDateString()}</div></div>)}</section>
      </section>
    </main>
  </div>;
}
