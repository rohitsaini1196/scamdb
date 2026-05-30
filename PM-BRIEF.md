# ScamDB India — Project Manager Onboarding Brief

**Live:** https://scamdb.in  
**Preview:** https://scamdb-beta.vercel.app  
**Last updated:** May 2026

---

## What This Is

ScamDB India is a **public fraud awareness database** for India.

The core use case: someone receives a call from an unknown number or a UPI ID requests money — they search it on ScamDB and see whether others have reported it as suspicious.

Think of it as a community-powered version of the national cybercrime database — one that ordinary Indians can actually use before sending money or sharing personal information.

**Not** a social platform. Not a discussion forum. Not a vigilante site. A public utility.

---

## The Problem

India reported ₹1,750 crore in cyber fraud losses in 2023. The national cybercrime portal (cybercrime.gov.in) accepts complaints after the fact but offers no lookup tool. Truecaller identifies spam callers but not UPI fraud. There is no single place to check a suspicious phone number or UPI ID before acting.

ScamDB fills that gap.

---

## Who Uses It

**Primary:** Someone who just received a suspicious call or payment request — usually anxious, on mobile, needs a quick answer.

**Secondary:** Journalists, cyber police, consumer protection orgs researching fraud patterns.

**Not:** Law enforcement (they have their own systems), financial institutions (different data requirements).

---

## How It Works — End to End

```
Data In                          Data Processing                  Public
────────────────────────────────────────────────────────────────────────
Community reports (form)   ──►  Moderation queue  ──────────────►  Entity page
Reddit ingestion (cron)    ──►  Extract entities  ──► Pending  ──►  /phone/XXXXXXXXXX
X/Twitter crawler (cron)   ──►  LLM enrichment    ──► Approved ──►  /upi/name@ybl
Govt advisories (cron)     ──►  Auto-approve*
                                      │
                                      ▼
                                 raw_signals table
                                 (everything stored raw
                                  before processing)

* Police advisories auto-approve without human moderation
```

### The moderation layer

Every report — whether submitted by a user or ingested from Reddit — goes through a moderation queue before becoming public. Moderators see the source, confidence score, description, and evidence screenshots, then approve/reject/hide.

Exception: signals tagged as `police_advisory` (e.g. government cyber advisories) are automatically approved — no human review needed.

---

## What's Been Built

### Phase 1 — Core Platform ✅

| Feature | Status |
|---|---|
| Search by phone number or UPI ID | Live |
| Public entity pages (SEO-optimised) | Live |
| Community report submission (auth required) | Live |
| Google OAuth sign-in | Live |
| Moderation queue (approve/reject/hide) | Live |
| User trust system (5 approved reports → trusted user) | Live |
| Rate limiting (5 reports/hour, 30 searches/minute) | Live |
| Evidence screenshot uploads | Live |
| Dispute/flag a listing | Live |
| 40 seed entities in database | Live |

### Phase 2 — Signal Ingestion Pipeline ✅

| Feature | Status |
|---|---|
| `raw_signals` table — stores everything raw before processing | Live |
| Reddit ingestion (automated, every 6 hours via GitHub Actions) | Live |
| X/Twitter crawl via Nitter (accounts: @CyberDost, @PIBHindi + hashtags) | Live |
| Government advisory crawler (cybercrime.gov.in, i4c.mha.gov.in) | Live |
| Deterministic entity extraction (phone regex + UPI regex) | Live |
| LLM enrichment (OpenAI GPT-4o-mini) — improves category/platform/summary | Live |
| Source attribution on all reports (source type + confidence badge) | Live |
| Bulk approve/reject in moderation queue | Live |
| Smart queue ordering (police advisories first, high confidence first) | Live |

### What's Not Built (intentionally)

- Comments or discussions
- User profiles
- Public API
- Browser extension
- Telegram bot
- AI confidence scores (uses a simple step function, not ML)
- Multilingual support
- Real-time features

---

## Tech Stack (Non-Technical Summary)

| Layer | Tool | Why |
|---|---|---|
| Website | Next.js (React framework) | Fast, SEO-friendly, handles both frontend and backend |
| Database | Supabase (PostgreSQL) | Managed database with built-in auth and row-level security |
| Auth | Google OAuth only | No email/password — frictionless, no spam accounts |
| Hosting | Vercel | Auto-deploys on every code push, global CDN |
| Automation | GitHub Actions | Runs ingestion crawlers every 6 hours |
| Rate limiting | Upstash Redis | Prevents abuse of report submission and search |
| CAPTCHA | Cloudflare Turnstile | Spam prevention on report form |
| LLM | OpenAI GPT-4o-mini | Classifies and summarises ingested signals |

---

## Data Model (Simplified)

```
entities          — the thing being reported (phone number or UPI ID)
  └── reports     — individual reports against an entity (pending → approved)
        └── moderation_actions — audit log of every moderator decision

raw_signals       — unprocessed data from crawlers (Reddit posts, X tweets, advisories)
                    → processed into reports by the pipeline

user_trust        — tracks how many reports each user has had approved
                    → 5 approved = "trusted user" → can auto-approve certain categories
```

---

## Entity Types

Currently supported:
- **Phone numbers** — Indian mobile numbers, 10 digits, normalised (strips +91, 0 prefix)
- **UPI IDs** — any `name@handle` format, stored lowercase

Not in scope yet: Telegram handles, Instagram profiles, domains, crypto wallets, email addresses.

---

## Language Rules (Non-Negotiable)

The platform is a public utility with legal liability exposure. Language must stay neutral.

| ❌ Never use | ✅ Always use instead |
|---|---|
| Scammer | Community reports found |
| Criminal | Suspicious activity reported |
| Fraudster | Reports found for this number |
| Confirmed fraud | Community caution advised |
| Guilty | Flagged by community |

---

## Current Metrics (May 2026)

- **42 entities** in database (30 phone, 12 UPI)
- **50 approved reports**
- **36 raw signals** ingested (all from Reddit so far)
- **Pipeline extraction rate:** ~6% (most Reddit posts don't contain phone/UPI in text — they're in comments or screenshots)

The DB is thin. Growing it is the current top priority. See "Next Priorities" below.

---

## Next Priorities

### Immediate (unblocked)
1. **Reddit OAuth** — Register app at reddit.com/prefs/apps, add `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` to GitHub secrets and Vercel env. This unblocks bulk historical ingestion from r/indianscammers.
2. **Push to GitHub** — Repo not yet remote. Once pushed, GitHub Actions runs crawlers every 6h automatically.
3. **Bulk seed run** — After OAuth is live: `npm run ingest:reddit:bulk` pulls top posts of all time across 14 subreddits + comments. Should yield 200–500 entities.
4. **Cloudflare Turnstile** — Re-enable on report form (was disabled pending domain; domain is now live at scamdb.in).
5. **Google Search Console** — Submit sitemap at https://scamdb.in/sitemap.xml.

### Sprint 4 — Screenshot OCR (deferred post-ITR, ~1.5 days)
Extract phone/UPI numbers from user-uploaded screenshots using vision AI. Cross-reference with manually reported value and flag discrepancies to moderator.

### Quiet Launch (after seed DB is healthy)
Post to r/india, r/LegalAdviceIndia, LinkedIn, and cyber awareness communities. No paid marketing — organic only.

---

## Key Product Decisions

**No auto-publish.** Every report requires human moderation before going public. Trust over speed.

**No account creation friction.** Google OAuth only. The goal is zero barrier to reporting.

**SEO-first URLs.** `/phone/9876543210` and `/upi/name@ybl` are designed to rank on Google for queries like "is 9876543210 a scammer". This is the primary acquisition channel.

**Confidence is a step function.** 1 report = 30% confidence, 2 = 50%, 5 = 65%, 10 = 80%, 10+ = 90%. Simple, explainable, no ML.

**Moderator access is env-based.** The `MODERATOR_EMAILS` environment variable controls who can access the moderation queue. No hardcoded logic.

**Trusted user tier.** After 5 approved reports, a user becomes "trusted" and certain categories (financial fraud, job scam, lottery scam, fake customer support) get auto-approved. This reduces moderation load over time.

---

## Access & Credentials

| Resource | Where |
|---|---|
| Live site | https://scamdb.in |
| Vercel dashboard | vercel.com (rohit's account) |
| Supabase project | `hjarvlresxzgdzvwqaas` · ap-south-1 (Mumbai) |
| Moderation queue | https://scamdb.in/moderation (requires moderator email) |
| GitHub Actions | github.com/rohitsaini1196/scamdb/actions (pending push) |

---

## What Success Looks Like (6-Month Horizon)

1. **Database:** 5,000+ entities, growing passively via automated ingestion
2. **SEO:** Ranking on page 1 for "[number] scam India" queries
3. **Community:** 100+ user-submitted reports per month
4. **Trust:** Referenced by at least one Indian news outlet or cyber police advisory
5. **Operations:** Ingestion pipeline runs fully automated, moderation takes <30 min/day

---

## What to Read Next

- `CONTEXT.md` — Full architectural decisions log (source of truth)
- `PHASE2.md` — Current sprint status and what's left
- `DESIGN-BRIEF.md` — UI/UX brief for designer collaboration
- Live site: https://scamdb.in
