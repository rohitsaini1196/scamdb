import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const MODERATOR_EMAILS = (process.env.MODERATOR_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

async function assertModerator() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Check email whitelist or is_moderator flag
  if (MODERATOR_EMAILS.includes(user.email ?? "")) return user;

  const service = await createServiceClient();
  const { data: trust } = await service
    .from("user_trust")
    .select("is_moderator")
    .eq("user_id", user.id)
    .single();

  return trust?.is_moderator ? user : null;
}

export async function POST(req: NextRequest) {
  const mod = await assertModerator();
  if (!mod) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { action, notes } = body;

  // Support single reportId or bulk reportIds array
  const reportIds: string[] = body.reportIds
    ? body.reportIds
    : body.reportId
    ? [body.reportId]
    : [];

  if (!reportIds.length || !action) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const validActions = ["approved", "rejected", "hidden", "note"];
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const service = await createServiceClient();

  if (action !== "note") {
    const { error } = await service
      .from("reports")
      .update({ status: action })
      .in("id", reportIds);
    if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  await service.from("moderation_actions").insert(
    reportIds.map((reportId) => ({
      report_id: reportId,
      action,
      moderator_id: mod.id,
      notes: notes ?? null,
    }))
  );

  return NextResponse.json({ ok: true });
}
