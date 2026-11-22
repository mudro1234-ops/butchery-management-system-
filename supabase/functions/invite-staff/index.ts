import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://butchery-management-system-three.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Sign in required" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error: userError } = await caller.auth.getUser();
    if (userError || !user) return json({ error: "Your session is invalid. Sign in again." }, 401);

    const body = await req.json();
    const businessId = String(body.businessId || "");
    const email = String(body.email || "").trim().toLowerCase();
    const displayName = String(body.displayName || "").trim();
    const role = String(body.role || "");
    const departmentId = body.departmentId ? String(body.departmentId) : null;
    if (!businessId || !email || !displayName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return json({ error: "Enter a valid staff name and email." }, 400);
    if (!["manager", "cashier", "stock_clerk"].includes(role))
      return json({ error: "Choose a valid staff role." }, 400);

    const { data: owner } = await admin.from("business_members")
      .select("id").eq("business_id", businessId).eq("user_id", user.id)
      .eq("role", "owner").eq("active", true).maybeSingle();
    if (!owner) return json({ error: "Only the business owner can invite staff." }, 403);

    if (departmentId) {
      const { data: dept } = await admin.from("departments").select("id")
        .eq("id", departmentId).eq("business_id", businessId).eq("active", true).maybeSingle();
      if (!dept) return json({ error: "That department does not belong to this business." }, 400);
    }

    const { data: existing } = await admin.from("business_members").select("id")
      .eq("business_id", businessId).eq("active", true);
    // Existing accounts are checked by exact email through Auth Admin.
    const { data: inviteRow, error: rowError } = await admin.from("staff_invitations").insert({
      business_id: businessId, email, display_name: displayName, role,
      department_id: departmentId, invited_by: user.id,
    }).select("id").single();
    if (rowError) return json({ error: rowError.message.includes("duplicate") ? "An invitation for this email is already pending." : rowError.message }, 400);

    const redirectTo = `https://butchery-management-system-three.vercel.app/staff/accept?invitation=${inviteRow.id}`;
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { full_name: displayName, staff_invitation_id: inviteRow.id },
    });
    if (inviteError || !invited.user) {
      await admin.from("staff_invitations").delete().eq("id", inviteRow.id);
      return json({ error: inviteError?.message || "Could not send invitation email." }, 400);
    }
    const { error: updateError } = await admin.from("staff_invitations")
      .update({ auth_user_id: invited.user.id }).eq("id", inviteRow.id);
    if (updateError) {
      await admin.auth.admin.deleteUser(invited.user.id);
      await admin.from("staff_invitations").delete().eq("id", inviteRow.id);
      return json({ error: "Invitation could not be linked securely. Please try again." }, 500);
    }
    return json({ ok: true, message: `Invitation sent to ${email}. The link expires in 48 hours.` });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected invitation error." }, 500);
  }
});
