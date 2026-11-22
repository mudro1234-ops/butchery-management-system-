"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AcceptStaffInvitation() {
  const router = useRouter();
  const [message, setMessage] = useState("Verifying your invitation…");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    (async () => {
      const invitationId = new URLSearchParams(window.location.search).get("invitation");
      if (!invitationId) { if (active) setError("This invitation link is incomplete."); return; }
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        if (active) setError("Open the invitation from the same email address it was sent to, then sign in or complete the email verification.");
        return;
      }
      const { error: acceptError } = await supabase.rpc("accept_staff_invitation", { p_invitation_id: invitationId });
      if (acceptError) { if (active) setError(acceptError.message); return; }
      if (active) {
        setMessage("Your staff account is active. Taking you to your workspace…");
        window.setTimeout(() => router.replace("/dashboard"), 900);
      }
    })();
    return () => { active = false; };
  }, [router]);
  return <main className="formwrap"><section className="formcard"><Link href="/" style={{color:"var(--green)",fontWeight:800,textDecoration:"none"}}>BUTCHERY OS</Link><div className="eyebrow" style={{marginTop:25}}>Staff account activation</div><h1 className="heading">Join your team</h1>{error?<><p className="error">{error}</p><p className="sub">If the link has expired or was sent to the wrong email, ask the business owner to issue a new invitation.</p><Link className="btn" href="/login">Go to sign in</Link></>:<p className="success">{message}</p>}</section></main>;
}
