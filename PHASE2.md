# ScamDB India — Phase 2 Plan

## What exists already (don't rebuild)

| Component | Status |
|---|---|
| Regex extraction (phone + UPI) | ✅ `scripts/ingest-reddit.ts` |
| Source attribution schema | ✅ `source_type`, `source_url`, `source_confidence`, `captured_at` on `reports` |
| Moderation queue | ✅ `/moderation` with approve/reject/hide |
| Normalization | ✅ `src/lib/normalize.ts` |
| Entity deduplication | ✅ `UNIQUE(type, normalized_value)` on `entities` |

---

## Architecture Target

```
Reddit (cron 6h)
    ↓
raw_signals table          ← NEW
    ↓
Deterministic extraction   ← enhance existing
    ↓
LLM enrichment             ← NEW (Haiku / Gemini Flash)
    ↓
reports (status=pending)   ← existing
    ↓
Moderation queue           ← existing
    ↓
Public entity page         ← existing
```

---

## Sprint 1 — Raw Signal Storage + Reddit Cron

**Goal:** Stop losing signals. Store everything raw before processing.

### DB migration

New table: `raw_signals`

```sql
create table raw_signals (
  id uuid primary key default uuid_generate_v4(),
  source_type text not null,           -- 'reddit', 'manual'
  source_url text,
  title text,
  content text not null,
  author text,
  author_score integer default 0,      -- reddit post score
  screenshot_urls text[] default '{}',
  captured_at timestamptz not null default now(),
  status text not null default 'unprocessed',
                                       -- unprocessed | processing | done | skipped
  processed_at timestamptz,
  error text
);

create index raw_signals_status_idx on raw_signals (status, captured_at);
create index raw_signals_source_idx on raw_signals (source_type, captured_at desc);
```

### Cron setup (Vercel)

Add to `vercel.ts` / `next.config.ts`:
- `GET /api/cron/ingest-reddit` — runs every 6 hours
- Protected by `CRON_SECRET` env var

### Script changes

Upgrade `ingest-reddit.ts` to:
1. Fetch posts from Reddit
2. Store in `raw_signals` (don't process immediately)
3. Return raw signal IDs

**Deliverables:**
- [x] `raw_signals` migration applied
- [x] `/api/cron/ingest` route (at `src/app/api/cron/ingest/route.ts`)
- [x] `CRON_SECRET` protection in route
- [ ] Cron configured in `vercel.json` (every 6h) — **missing, needs vercel.json**
- [x] `scripts/ingest-reddit.ts` writes to `raw_signals`

**Effort:** 1 day

---

## Sprint 2 — Deterministic Processing

**Goal:** Extract entities from `raw_signals` without LLM. Fast, free, deterministic.

### Processor script

`scripts/process-signals.ts` — reads `raw_signals` where `status=unprocessed`:

1. Run phone regex + UPI regex on `title + content`
2. Score with keyword list (scam, fraud, fake, UPI, job, etc.)
3. Skip if score < threshold (not scam-related)
4. Infer category + platform from text
5. Upsert entity → insert pending report with source attribution
6. Set `raw_signals.status = done`

### Enhanced regex (from spec)

```ts
// Phone — stricter than current, handles +91 prefix
const PHONE_RE = /(?:\+91[\-\s]?|91[\-\s]?|0)?([6-9]\d{9})\b/g;

// UPI — broader provider list
const UPI_RE = /\b([a-zA-Z0-9._\-]{2,64}@[a-zA-Z]{2,20})\b/g;
```

### Cron: `/api/cron/process-signals`

Runs after ingest (or on demand). Processes up to 50 signals per run.

**Deliverables:**
- [x] `scripts/process-signals.ts`
- [x] `/api/cron/process` API route (at `src/app/api/cron/process/route.ts`)
- [ ] Cron every 6h offset 30min — **needs vercel.json** (same blocker as Sprint 1)
- [x] Keyword scoring inline in route (phone regex, UPI regex, category/platform inference)

**Effort:** 1 day

---

## Sprint 3 — LLM Enrichment

**Goal:** For signals that pass deterministic filter, use LLM to improve category, summary, platform detection.

### Model choice

Claude Haiku (cheapest, fastest, already on Anthropic):
- Input: raw signal text (max 2000 chars)
- Output: structured JSON

```ts
interface LLMEnrichment {
  entities: Array<{ type: "phone" | "upi"; value: string }>;
  category: ReportCategory;
  platform: Platform;
  summary: string;        // max 200 chars, neutral language
  confidence: "low" | "medium" | "high";
  is_scam_related: boolean;
}
```

### Prompt

```
You are a fraud signal analyst for ScamDB India, a public fraud awareness database.

Extract information from this community post about a suspected scam. 
Return ONLY valid JSON. Use neutral language — never say "scammer" or "criminal".

Post:
{content}

Return:
{
  "entities": [{"type": "phone"|"upi", "value": "..."}],
  "category": "financial_fraud"|"impersonation"|"lottery_scam"|"job_scam"|"investment_fraud"|"romance_scam"|"phishing"|"fake_customer_support"|"other",
  "platform": "whatsapp"|"phone_call"|"sms"|"telegram"|"instagram"|"facebook"|"email"|"upi_app"|"other",
  "summary": "one sentence, max 200 chars, neutral language",
  "confidence": "low"|"medium"|"high",
  "is_scam_related": true|false
}
```

### When to call LLM

Only if:
- Deterministic regex found ≥1 entity
- Keyword score ≥ threshold
- Signal not already processed

Skip LLM if:
- No entities found (waste of tokens)
- Signal score too low

### Cost estimate

Haiku: ~$0.25/1M input tokens. At 2000 chars/signal ≈ 500 tokens:
- 1000 signals/day = 500K tokens = ~$0.13/day. Negligible.

### New env var

```
ANTHROPIC_API_KEY=
```

**Deliverables:**
- [x] `src/lib/llm-enrich.ts` — exists, uses OpenAI GPT-4o-mini (not Haiku — decide before wiring)
- [ ] Wire into `/api/cron/process` after regex pass — **not done**
- [ ] `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` on Vercel (decide provider first)
- [x] Fallback pattern implemented (returns null on failure, caller falls back to deterministic)

**Decision needed:** Keep OpenAI (`OPENAI_API_KEY`) or switch to Claude Haiku (`ANTHROPIC_API_KEY`).

**Effort:** 0.5 days (scaffold exists, just wire + decide provider)

---

## Sprint 4 — Screenshot Processing

**Goal:** Extract entities from screenshot evidence using vision model.

**Scope:** Screenshots uploaded by users to evidence bucket. NOT auto-scraped images.

### Approach

On report submission with screenshots:
1. Download from Supabase storage (service role)
2. Send to vision model (Haiku vision or Gemini Flash)
3. Extract phone/UPI from image
4. Cross-reference with manually entered entity value
5. Flag discrepancy to moderator if mismatch

### Moderator UI addition

Add to moderation card:
- "Evidence mentions: 9876543210 ✓ matches" (green)
- "Evidence mentions: 9999999999 ✗ differs from reported" (orange — flag)

**Deliverables:**
- [ ] `src/lib/screenshot-extract.ts`
- [ ] Called during report submission (async, non-blocking)
- [ ] Moderator card shows extraction result
- [ ] Mismatch flagged clearly

**Effort:** 1.5 days

---

## Sprint 5 — Source Labels in Public UI

**Goal:** Show source type + confidence on public report cards (not raw URL).

### UI treatment

```
┌─ Report card ─────────────────────────────┐
│ [Investment Fraud] [via Telegram]  Jan 25 │
│                                           │
│ Added to a group promising 3x returns...  │
│ ₹2,00,000 involved                       │
│                                           │
│ 🔵 Police advisory · High confidence     │
│   OR                                      │
│ 🟡 Reddit community report · Medium      │
│   OR                                      │
│ ⚪ Community report                       │
└───────────────────────────────────────────┘
```

### Source badge component

```tsx
// source_type + source_confidence → badge
"police_advisory" + "high"   → blue  "Police Advisory"
"news"            + "high"   → blue  "News Report"  
"reddit"          + "medium" → amber "Community Report"
"reddit"          + "low"    → gray  "Unverified Report"
"manual"          + any      → gray  "Community Report"
```

No raw URLs shown publicly. Moderators see full URL.

**Deliverables:**
- [x] `SourceBadge` component at `src/components/shared/source-badge.tsx`
- [x] Wired into `entity-page-content.tsx` (line 276)
- [ ] Add to moderation queue with full URL visible to mods — not done

**Effort:** 0.5 days (mostly done)

---

## Sprint 6 — Moderation Improvements

**Goal:** Handle higher volume from automated ingestion without burning out moderator.

### Additions

**Bulk actions** — approve/reject all reports for an entity at once

**Smart ordering** — queue sorted by:
1. High confidence + police source (approve fast)
2. Multiple reports same entity (cluster view)
3. Low confidence + anonymous source (review carefully)

**Auto-approve rule** (expand existing):
- source = `police_advisory` + confidence = `high` → auto-approve (no human needed)
- Everything else → manual queue

**Duplicate merge UI** — if 3+ reports same entity same week, show "merge into one" option

**Deliverables:**
- [ ] Bulk approve/reject buttons
- [ ] Smart queue ordering
- [ ] `police_advisory` auto-approve rule
- [ ] Merge UI (basic — just picks best description)

**Effort:** 1.5 days

---

## Status Summary (May 2026)

| Sprint | Goal | Status |
|---|---|---|
| 1 | Raw signal storage + GitHub Actions cron | ✅ Complete |
| 2 | Deterministic processing | ✅ Complete |
| 3 | LLM enrichment (OpenAI GPT-4o-mini) | ✅ Complete |
| 4 | Screenshot processing | ❌ Deferred post-ITR |
| 5 | Source labels in UI + mod queue | ✅ Complete |
| 6 | Bulk moderation, smart ordering, auto-approve | ✅ Complete |

**Remaining:** Sprint 4 (screenshot OCR) — ~1.5 days when resuming post-ITR.

---

## New Env Vars Needed

```
ANTHROPIC_API_KEY=       # Sprint 3 — LLM enrichment
CRON_SECRET=             # Sprint 1 — protect cron endpoints
```

---

## Explicitly Out of Scope (Phase 2)

- Vector DB / semantic search
- Agent workflows
- Autonomous moderation
- Facebook / Telegram scraping
- Public API
- Comments / social features
