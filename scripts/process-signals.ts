/**
 * Signal processor — reads raw_signals, extracts entities, queues for moderation.
 *
 * Usage:
 *   npm run process:signals           — process up to 50 unprocessed signals
 *   npm run process:signals -- --dry  — preview extractions only
 *   npm run process:signals -- --limit=100
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import { enrichSignal } from "../src/lib/llm-enrich";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const isDry = process.argv.includes("--dry");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const BATCH_SIZE = limitArg ? parseInt(limitArg.split("=")[1]) : 50;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ws = require("ws");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { realtime: { transport: ws } }
);

const SEED_USER_ID = "00000000-0000-0000-0000-000000000001";

// ── Regex ──────────────────────────────────────────────────────────────────

const PHONE_RE = /(?:\+91[\-\s]?|91[\-\s]?|0)?([6-9]\d{9})\b/g;
const UPI_RE = /\b([a-zA-Z0-9._\-]{2,64}@(?:ybl|okhdfcbank|okicici|oksbi|okaxis|paytm|apl|ibl|upi|barodampay|hdfcbank|icici|sbi|kotak|pnb|boi|bob|airtel|jio|phonepe|gpay|amazon|slice|navi|fi|jupiter|razorpay|cashfree|freecharge|mobikwik))\b/gi;

const SCAM_KEYWORDS = [
  "scam","fraud","cheated","duped","fake","phishing","otp","upi fraud",
  "loan scam","investment scam","job scam","lottery","impersonation",
  "lost money","cybercrime","beware","warning",
];

const KEYWORD_SCORE_THRESHOLD = 1;

// ── Inference ──────────────────────────────────────────────────────────────

function scoreText(text: string): number {
  const t = text.toLowerCase();
  return SCAM_KEYWORDS.filter((kw) => t.includes(kw)).length;
}

function inferCategory(text: string): string {
  const t = text.toLowerCase();
  if (/lottery|prize|won|lucky draw/.test(t)) return "lottery_scam";
  if (/job|recruit|work from home|wfh|hiring|salary/.test(t)) return "job_scam";
  if (/invest|trading|crypto|stock|returns|profit|doubl/.test(t)) return "investment_fraud";
  if (/romance|dating|love|army|soldier|nri|abroad/.test(t)) return "romance_scam";
  if (/customer.?support|helpdesk|refund|anydesk|teamviewer/.test(t)) return "fake_customer_support";
  if (/phish|kyc|aadhaar|otp|link|click|verify/.test(t)) return "phishing";
  if (/police|cbi|it.?dept|trai|customs|arrest|warrant/.test(t)) return "impersonation";
  return "financial_fraud";
}

function inferPlatform(text: string): string {
  const t = text.toLowerCase();
  if (/whatsapp/.test(t)) return "whatsapp";
  if (/telegram/.test(t)) return "telegram";
  if (/instagram/.test(t)) return "instagram";
  if (/facebook/.test(t)) return "facebook";
  if (/\bcall\b|phone|rang/.test(t)) return "phone_call";
  if (/\bsms\b|text message/.test(t)) return "sms";
  if (/email|gmail/.test(t)) return "email";
  if (/upi|gpay|phonepe|paytm|bhim/.test(t)) return "upi_app";
  return "other";
}

function normalizePhone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("91") && d.length === 12) d = d.slice(2);
  if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  return d;
}

interface Extraction {
  type: "phone" | "upi";
  normalized: string;
  display: string;
}

function extract(text: string): Extraction[] {
  const results: Extraction[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  const phoneRe = new RegExp(PHONE_RE.source, "g");
  while ((m = phoneRe.exec(text)) !== null) {
    const normalized = normalizePhone(m[1] || m[0]);
    if (normalized.length === 10 && /^[6-9]/.test(normalized) && !seen.has(`phone:${normalized}`)) {
      seen.add(`phone:${normalized}`);
      results.push({ type: "phone", normalized, display: normalized });
    }
  }

  const upiRe = new RegExp(UPI_RE.source, "gi");
  while ((m = upiRe.exec(text)) !== null) {
    const normalized = m[0].toLowerCase().trim();
    if (!seen.has(`upi:${normalized}`)) {
      seen.add(`upi:${normalized}`);
      results.push({ type: "upi", normalized, display: normalized });
    }
  }

  return results;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function processSignals() {
  console.log(`Signal processor — ${isDry ? "DRY RUN" : "LIVE"} (batch: ${BATCH_SIZE})\n`);

  // Fetch unprocessed signals
  const { data: signals, error } = await supabase
    .from("raw_signals")
    .select("*")
    .eq("status", "unprocessed")
    .order("captured_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) { console.error("Fetch failed:", error.message); process.exit(1); }
  if (!signals?.length) { console.log("No unprocessed signals."); return; }

  console.log(`Processing ${signals.length} signals...\n`);

  let extracted = 0;
  let skipped = 0;
  let failed = 0;

  for (const signal of signals) {
    const fullText = `${signal.title ?? ""}\n${signal.content}`;
    const score = scoreText(fullText);

    if (score < KEYWORD_SCORE_THRESHOLD) {
      if (!isDry) {
        await supabase.from("raw_signals")
          .update({ status: "skipped", processed_at: new Date().toISOString(), error: `low_score:${score}` })
          .eq("id", signal.id);
      }
      skipped++;
      continue;
    }

    const entities = extract(fullText);

    if (entities.length === 0) {
      if (!isDry) {
        await supabase.from("raw_signals")
          .update({ status: "skipped", processed_at: new Date().toISOString(), error: "no_entities" })
          .eq("id", signal.id);
      }
      skipped++;
      continue;
    }

    // Try LLM enrichment — falls back to deterministic if fails
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    let category = inferCategory(fullText);
    let platform = inferPlatform(fullText);
    let confidence = (signal.author_score >= 10 ? "medium" : "low") as "low" | "medium" | "high";
    let description = fullText.replace(/\s+/g, " ").trim().slice(0, 800);

    if (OPENAI_KEY && !isDry) {
      const enriched = await enrichSignal(fullText, OPENAI_KEY);
      if (enriched && enriched.is_scam_related) {
        category = enriched.category;
        platform = enriched.platform;
        confidence = enriched.confidence;
        description = enriched.summary.length >= 20
          ? enriched.summary
          : description;
      } else if (enriched && !enriched.is_scam_related) {
        // LLM says not scam — skip
        await supabase.from("raw_signals")
          .update({ status: "skipped", processed_at: new Date().toISOString(), error: "llm:not_scam" })
          .eq("id", signal.id);
        skipped++;
        continue;
      }
    }

    if (isDry) {
      console.log(`  [DRY] score:${score} | ${entities.map((e) => `${e.type}:${e.normalized}`).join(", ")}`);
      console.log(`        cat:${category} | via:${platform} | conf:${confidence}`);
      console.log(`        src: ${signal.source_url}`);
      extracted += entities.length;
      continue;
    }

    // Mark as processing
    await supabase.from("raw_signals")
      .update({ status: "processing" })
      .eq("id", signal.id);

    let signalOk = true;

    for (const entity of entities) {
      // Upsert entity
      const { data: ent, error: entErr } = await supabase
        .from("entities")
        .upsert(
          { type: entity.type, normalized_value: entity.normalized, display_value: entity.display },
          { onConflict: "type,normalized_value" }
        )
        .select()
        .single();

      if (entErr || !ent) { signalOk = false; continue; }

      // Insert pending report
      const { error: repErr } = await supabase.from("reports").insert({
        entity_id: ent.id,
        category,
        platform,
        description,
        evidence_urls: [],
        status: "pending",
        source_type: signal.source_type,
        source_url: signal.source_url,
        source_confidence: confidence,
        captured_at: signal.captured_at,
        created_by: SEED_USER_ID,
      });

      if (!repErr) {
        console.log(`  ✓ [${entity.type.toUpperCase()}] ${entity.normalized} → pending`);
        extracted++;
      } else {
        signalOk = false;
      }
    }

    await supabase.from("raw_signals")
      .update({
        status: signalOk ? "done" : "skipped",
        processed_at: new Date().toISOString(),
        error: signalOk ? null : "partial_failure",
      })
      .eq("id", signal.id);

    if (!signalOk) failed++;
  }

  console.log(`\nDone. ${extracted} entities queued, ${skipped} signals skipped, ${failed} failed.`);
  console.log("Review at https://scamdb.in/moderation");
}

processSignals().catch((err) => {
  console.error("Processing failed:", err);
  process.exit(1);
});
