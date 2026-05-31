import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { enrichSignal } from "@/lib/llm-enrich";

const SEED_USER_ID = "00000000-0000-0000-0000-000000000001";
const BATCH_SIZE = 50;

const PHONE_RE = /(?:\+91[\-\s]?|91[\-\s]?|0)?([6-9]\d{9})\b/g;
const UPI_RE = /\b([a-zA-Z0-9._\-]{2,64}@(?:ybl|okhdfcbank|okicici|oksbi|okaxis|paytm|apl|ibl|upi|barodampay|hdfcbank|icici|sbi|kotak|pnb|boi|bob|airtel|jio|phonepe|gpay|amazon|slice|navi|fi|jupiter|razorpay|cashfree|freecharge|mobikwik|rapl|yapl|abfspay|axisb|axl|dlb|federal|fbl|idfcbank|idfcfirst|rbl|indus|kbl|tjsb|uco|unionbank|ubi|yesbank|yesg|citi|hsbc|sc|scb|dbs|equitas|jkb|karb|aubank|finobank|paytmqr|waaxis|wahdfcbank|waicici|wasbi))\b/gi;

const SCAM_KEYWORDS = [
  "scam","scammer","scammers","fraud","fraudster","cheated","duped",
  "fake","phishing","otp","upi fraud","loan scam","investment scam",
  "job scam","lottery","impersonation","lost money","cybercrime",
  "beware","warning","cyber crime","cheat",
];

function scoreText(t: string) {
  return SCAM_KEYWORDS.filter((kw) => t.toLowerCase().includes(kw)).length;
}

function inferCategory(t: string): string {
  const l = t.toLowerCase();
  if (/lottery|prize|won|lucky draw/.test(l)) return "lottery_scam";
  if (/job|recruit|work from home|wfh|hiring/.test(l)) return "job_scam";
  if (/invest|trading|crypto|stock|returns|doubl/.test(l)) return "investment_fraud";
  if (/romance|dating|love|army|soldier|nri|abroad/.test(l)) return "romance_scam";
  if (/customer.?support|helpdesk|refund|anydesk/.test(l)) return "fake_customer_support";
  if (/phish|kyc|aadhaar|otp|link|verify/.test(l)) return "phishing";
  if (/police|cbi|trai|customs|arrest|warrant/.test(l)) return "impersonation";
  return "financial_fraud";
}

function inferPlatform(t: string): string {
  const l = t.toLowerCase();
  if (/whatsapp/.test(l)) return "whatsapp";
  if (/telegram/.test(l)) return "telegram";
  if (/instagram/.test(l)) return "instagram";
  if (/facebook/.test(l)) return "facebook";
  if (/\bcall\b|phone|rang/.test(l)) return "phone_call";
  if (/\bsms\b|text message/.test(l)) return "sms";
  if (/email|gmail/.test(l)) return "email";
  if (/upi|gpay|phonepe|paytm/.test(l)) return "upi_app";
  return "other";
}

function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("91") && d.length === 12) d = d.slice(2);
  if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  return d;
}

function extractEntities(text: string) {
  const results: { type: "phone" | "upi"; normalized: string }[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  const pr = new RegExp(PHONE_RE.source, "g");
  while ((m = pr.exec(text)) !== null) {
    const n = normalizePhone(m[1] || m[0]);
    if (n.length === 10 && /^[6-9]/.test(n) && !seen.has(`p:${n}`)) {
      seen.add(`p:${n}`); results.push({ type: "phone", normalized: n });
    }
  }

  const ur = new RegExp(UPI_RE.source, "gi");
  while ((m = ur.exec(text)) !== null) {
    const n = m[0].toLowerCase().trim();
    if (!seen.has(`u:${n}`)) { seen.add(`u:${n}`); results.push({ type: "upi", normalized: n }); }
  }

  return results;
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();

  const { data: signals } = await service
    .from("raw_signals")
    .select("*")
    .eq("status", "unprocessed")
    .order("captured_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (!signals?.length) return NextResponse.json({ queued: 0, skipped: 0 });

  let queued = 0;
  let skipped = 0;

  for (const signal of signals) {
    const rawText = `${signal.title ?? ""}\n${signal.content}`;
    // Strip HTML that may come from RSS content field
    const text = rawText
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
      .replace(/\s{2,}/g, " ").trim();

    const entities = extractEntities(text);

    // No phone/UPI = no report possible. Skip regardless of keywords.
    if (!entities.length) {
      await service.from("raw_signals").update({ status: "skipped", processed_at: new Date().toISOString(), error: "no_entities" }).eq("id", signal.id);
      skipped++; continue;
    }

    // Entities present. High-trust sources (govt twitter, police advisory) skip the
    // keyword gate entirely — the source IS the signal. For general/social sources,
    // require >=1 scam keyword to avoid legit business numbers slipping through.
    // Moderation queue is the final human gate either way.
    const trustedSource =
      signal.source_type === "police_advisory" ||
      (signal.source_type === "twitter" && (signal.author_score ?? 0) >= 50);

    if (!trustedSource) {
      const score = scoreText(text);
      if (score < 1) {
        await service.from("raw_signals").update({ status: "skipped", processed_at: new Date().toISOString(), error: `low_score:${score}` }).eq("id", signal.id);
        skipped++; continue;
      }
    }

    await service.from("raw_signals").update({ status: "processing" }).eq("id", signal.id);

    let category = inferCategory(text);
    let platform = inferPlatform(text);
    const confidence =
      signal.source_type === "police_advisory"
        ? "high"
        : (signal.author_score ?? 0) >= 10
        ? "medium"
        : "low";
    let description = text.replace(/\s+/g, " ").trim().slice(0, 800);

    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      const enriched = await enrichSignal(text, apiKey);
      if (enriched?.is_scam_related) {
        category = enriched.category;
        platform = enriched.platform;
        if (enriched.summary) description = enriched.summary;
      }
    }

    // Police advisories go straight to approved — no human review needed
    const autoApprove = signal.source_type === "police_advisory";
    const reportStatus = autoApprove ? "approved" : "pending";

    for (const entity of entities) {
      const { data: ent } = await service
        .from("entities")
        .upsert(
          { type: entity.type, normalized_value: entity.normalized, display_value: entity.normalized },
          { onConflict: "type,normalized_value" }
        )
        .select()
        .single();

      if (!ent) continue;

      await service.from("reports").insert({
        entity_id: ent.id,
        category: category as import("@/types/database").ReportCategory,
        platform: platform as import("@/types/database").Platform,
        description,
        evidence_urls: [],
        status: reportStatus,
        source_type: signal.source_type as import("@/types/database").SourceType,
        source_url: signal.source_url,
        source_confidence: confidence as import("@/types/database").SourceConfidence,
        captured_at: signal.captured_at,
        created_by: SEED_USER_ID,
      });
      queued++;
    }

    await service.from("raw_signals")
      .update({ status: "done", processed_at: new Date().toISOString() })
      .eq("id", signal.id);
  }

  return NextResponse.json({ queued, skipped, timestamp: new Date().toISOString() });
}
