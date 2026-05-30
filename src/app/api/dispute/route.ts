import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { searchRateLimit } from "@/lib/ratelimit";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

export async function POST(req: NextRequest) {
  // Rate limit by IP — 5 disputes per hour
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const { success } = await searchRateLimit.limit(`dispute:${ip}`);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: { value: string; reason: string; contact: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { value, reason, contact } = body;

  if (!value?.trim() || !reason?.trim() || !contact?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Max lengths
  if (value.length > 100 || reason.length > 2000 || contact.length > 254) {
    return NextResponse.json({ error: "Input too long" }, { status: 400 });
  }

  if (reason.length < 20) {
    return NextResponse.json({ error: "Reason too short" }, { status: 400 });
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    return NextResponse.json({ error: "Invalid contact email" }, { status: 400 });
  }

  const service = await createServiceClient();

  // Safe entity lookup — use separate eq conditions, not raw .or() with user input
  const cleanDigits = value.replace(/\D/g, "");
  const normalized = cleanDigits.length >= 10
    ? cleanDigits.slice(-10)
    : value.trim().toLowerCase();

  const { data: entity } = await service
    .from("entities")
    .select("id")
    .eq("normalized_value", normalized)
    .maybeSingle();

  if (!entity) {
    // Accept silently — don't leak whether entity exists
    return NextResponse.json({ ok: true });
  }

  const { data: report } = await service
    .from("reports")
    .select("id")
    .eq("entity_id", entity.id)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (report) {
    await service.from("moderation_actions").insert({
      report_id: report.id,
      action: "note",
      moderator_id: SYSTEM_USER_ID,
      notes: `DISPUTE REQUEST\nContact: ${contact}\nReason: ${reason}`,
    });
  }

  return NextResponse.json({ ok: true });
}
