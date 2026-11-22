"use client";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AcceptStaffInvitation() {
  const router = useRouter();
  const [invitationId, setInvitationId] = useState("");
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Verifying your personal invitation…");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const id = new URLSearchParams(window.location.search).get("invitation") || "";
      if (!id) { if (active) setError("This invitation link is incomplete."); return; }
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        if (active) setError("This link must be opened from the email address it was sent to. Complete the email verification first.");
        return;
      }
      if (active) { setInvitationId(id); setEmail(user.email || ""); setReady(true); setMessage(""); }
    })();
    return () => { active = false; };
  }, []);

  async function activate(e: FormEvent) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      if (password.length < 8) throw new Error("Use a password with at least 8 characters.");
      if (password !== confirmPassword) throw new Error("The passwords do not match.");
      const { error: passwordError } = await supabase.auth.updateUser({ password });
      if (passwordError) throw passwordError;
      const { error: acceptError } = await supabase.rpc("accept_staff_invitation", { p_invitation_id: invitationId });
      if (acceptError) throw acceptError;
      setMessage("Your account is active. Opening your staff workspace…");
      router.replace("/dashboard");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not activate this invitation."); }
    finally { setBusy(false); }
  }

  return <main className="formwrap"><section className="formcard">
    <Link href="/" style={{color:"var(--green)",fontWeight:800,textDecoration:"none"}}>BUTCHERY OS</Link>
    <div className="eyebrow" style={{marginTop:25}}>Staff account activation</div><h1 className="heading">Join your team</h1>
    {ready ? <><p className="sub">Invitation verified for <strong>{email}</strong>. Create your personal password to activate your account.</p>
      <form onSubmit={activate}>
        <div className="field"><label>Create password</label><input type="password" minLength={8} required autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 8 characters"/></div>
        <div className="field"><label>Confirm password</label><input type="password" minLength={8} required autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Enter password again"/></div>
        {error && <p className="error">{error}</p>}
        <button className="btn" disabled={busy} style={{width:"100%"}}>{busy ? "Activating account…" : "Set password & activate account"}</button>
      </form>
    </> : error ? <><p className="error">{error}</p><p className="sub">If the invitation expired or was sent to another email, ask the owner to issue a new invitation.</p><Link className="btn" href="/login">Go to sign in</Link></> : <p className="success">{message}</p>}
  </section></main>;
}
