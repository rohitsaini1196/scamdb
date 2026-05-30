import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { normalizeEntity } from "@/lib/normalize";
import { AUTO_APPROVE_TRUSTED_CATEGORIES } from "@/lib/constants";
import { reportRateLimit } from "@/lib/ratelimit";
import type { ReportCategory, Platform } from "@/types/database";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 5 reports per user per hour
  const { success, remaining } = await reportRateLimit.limit(user.id);
  if (!success) {
    return NextResponse.json(
      { error: "Too many reports. Try again later." },
      { status: 429, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }

  let body: {
    entityType: string;
    entityValue: string;
    displayValue: string;
    category: ReportCategory;
    platform: Platform;
    description: string;
    amountLost: number | null;
    evidenceUrls: string[];
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    entityType,
    entityValue,
    displayValue,
    category,
    platform,
    description,
    amountLost,
    evidenceUrls,
    turnstileToken,
  } = body as typeof body & { turnstileToken?: string };

  // Verify Turnstile token if secret key is configured
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  if (turnstileSecret) {
    if (!turnstileToken) {
      return NextResponse.json({ error: "CAPTCHA required" }, { status: 400 });
    }
    const verification = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: turnstileSecret, response: turnstileToken }),
      }
    );
    const result = await verification.json() as { success: boolean };
    if (!result.success) {
      return NextResponse.json({ error: "CAPTCHA verification failed" }, { status: 400 });
    }
  }

  if (!entityType || !entityValue || !category || !platform || !description) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (description.length < 20 || description.length > 1000) {
    return NextResponse.json({ error: "Description length invalid" }, { status: 400 });
  }

  if (entityType !== "phone" && entityType !== "upi") {
    return NextResponse.json({ error: "Invalid entity type" }, { status: 400 });
  }

  const normalized = normalizeEntity(entityType, entityValue);
  const service = await createServiceClient();

  // Check user trust
  const { data: trust } = await service
    .from("user_trust")
    .select("is_trusted, is_moderator, approved_report_count")
    .eq("user_id", user.id)
    .single();

  // Determine initial status
  const isTrusted = trust?.is_trusted || trust?.is_moderator;
  const autoApproveCategories = AUTO_APPROVE_TRUSTED_CATEGORIES as string[];
  const initialStatus =
    isTrusted && autoApproveCategories.includes(category) ? "approved" : "pending";

  // Upsert entity
  const { data: entity, error: entityError } = await service
    .from("entities")
    .upsert(
      {
        type: entityType,
        normalized_value: normalized,
        display_value: displayValue,
      },
      { onConflict: "type,normalized_value", ignoreDuplicates: false }
    )
    .select()
    .single();

  if (entityError || !entity) {
    return NextResponse.json({ error: "Failed to create entity" }, { status: 500 });
  }

  // Insert report
  const { data: report, error: reportError } = await service
    .from("reports")
    .insert({
      entity_id: entity.id,
      category,
      platform,
      description,
      amount_lost: amountLost,
      evidence_urls: evidenceUrls,
      status: initialStatus,
      created_by: user.id,
    })
    .select()
    .single();

  if (reportError || !report) {
    return NextResponse.json({ error: "Failed to submit report" }, { status: 500 });
  }

  return NextResponse.json({ id: report.id, status: report.status }, { status: 201 });
}
