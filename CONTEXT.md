# ScamDB India — Project Context

## What This Is

Public utility for India. Search suspicious phone numbers and UPI IDs.
Community-reported, moderator-reviewed, SEO-first.

Not a social platform. Not a discussion forum. Not a vigilante site.

---

## Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Next.js 16 App Router + Tailwind + shadcn/ui | Speed, SEO, ISR |
| Backend | Supabase (Postgres + Auth + Storage) | Zero DevOps, built-in RLS |
| Auth | Google OAuth only | Frictionless, no email spam |
| Rate limiting | Upstash Redis | 5 reports/user/hour on /api/reports |
| CAPTCHA | Cloudflare Turnstile | Installed, removed from form temporarily (domain config issue) |
| Hosting | Vercel | Zero config, auto-deploys |

## Supabase Project

- ID: `hjarvlresxzgdzvwqaas`
- Region: `ap-south-1` (Mumbai)
- URL: `https://hjarvlresxzgdzvwqaas.supabase.co`

---

## URL Structure

```
/phone/[10-digit-number]     — phone entity page
/upi/[upi-id]                — UPI entity page
/search?q=...                — search results
/report                      — submit report (auth required)
/moderation                  — moderation queue (mod only)
/entity/[type]/[value]       — legacy redirect to new URLs
```

---

## Entity Types Supported (MVP)

- `phone` — Indian mobile numbers, normalized to 10 digits
- `upi` — UPI IDs (lowercase, trimmed)

Excluded for now: Telegram handles, Instagram, domains, crypto wallets, emails.

---

## Key Decisions

**No auto-publish.** Every report goes through moderation queue before becoming public.

**Trusted user tier.** After 5 approved reports, user is `is_trusted`. Trusted users in low-risk categories get auto-approved.

**Moderation gated by env var.** `MODERATOR_EMAILS` in Vercel env. No hardcoded logic.

**Language rules (non-negotiable):**
- ❌ "Scammer", "Criminal", "Fraudster", "Confirmed fraud"
- ✅ "Suspicious activity reported", "Community caution advised", "Reports found"

**Confidence score.** Simple step function (1 report = 30, 2 = 50, ≤5 = 65, ≤10 = 80, 10+ = 90). No ML.

**SEO-first URLs.** `/phone/9876543210`, `/upi/name@ybl` — crawlable, indexable.

**Auth:** Google OAuth only. No email/password.

---

## Schema Summary

```
entities        — normalized entity + report_count (denormalized for perf)
reports         — category, platform, description, evidence_urls, status,
                  source_type, source_url, source_confidence, captured_at
moderation_actions — audit log of moderator decisions
user_trust      — tracks approved report count, trusted/moderator flags
```

Triggers handle `report_count` updates and `user_trust` row creation automatically.

System seed user: `00000000-0000-0000-0000-000000000001` (for seeded/ingested data).

---

## Current State (May 2026)

### Phase 1 — Complete
- [x] Full MVP built and deployed on Vercel
- [x] Supabase schema live with RLS, triggers, storage
- [x] Google OAuth working, session persists across tabs
- [x] 40 seed entities (28 phone, 12 UPI), all approved
- [x] Rate limiting (Upstash Redis — 5 reports/user/hour)
- [x] Moderation queue with duplicate detection + source labels
- [x] Source attribution schema (source_type, source_url, source_confidence, captured_at)
- [x] Security fixes (input validation, rate limiting on all APIs, JSON-LD XSS)
- [x] SEO: FAQPage JSON-LD, prominent report counts, report count in page titles
- [x] DESIGN-BRIEF.md created for designer review
- [x] scamdb.in domain live
- [ ] Cloudflare Turnstile re-enable (was removed pending domain — domain now live)
- [ ] Google Search Console — submit sitemap at https://scamdb.in/sitemap.xml

### Phase 2 — Sprints 1–3, 5–6 Complete (see PHASE2.md)
- [x] Sprint 1: `raw_signals` table + `/api/cron/ingest` + GitHub Actions cron (every 6h)
- [x] Sprint 2: `/api/cron/process` deterministic extraction (phone regex, UPI regex, category/platform inference)
- [x] Sprint 3: LLM enrichment wired into process cron (OpenAI GPT-4o-mini, fallback to deterministic)
- [x] Sprint 5: `SourceBadge` in entity page + `source_url` in moderation queue
- [x] Sprint 6: Bulk approve/reject, smart queue ordering, `police_advisory` auto-approve
- [ ] Sprint 4: Screenshot OCR — deferred post-ITR

## Domain scamdb.in — Live (completed May 2026)

All domain config steps done. Remaining:
- Re-enable Cloudflare Turnstile in report form
- Submit sitemap to Google Search Console

---

## Next Priorities

### Remaining
- Re-enable Cloudflare Turnstile in report form
- Submit sitemap to Google Search Console
- Sprint 4 (post-ITR): Screenshot OCR on report evidence

### Quiet Launch
Reddit + LinkedIn + X posts to cyber awareness communities.

---

## Explicitly Not Building (MVP)

- Comments / discussions
- User profiles  
- Browser extension
- Public API
- Telegram bot
- Multilingual support
- AI confidence engine
- Social features
- Real-time anything
