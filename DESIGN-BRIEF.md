# ScamDB India — UI/UX Design Brief

**For:** Designer Review  
**Live URL:** https://scamdb-beta.vercel.app  
**Stack:** Next.js, Tailwind CSS, shadcn/ui components  

---

## 1. Product Vision

ScamDB India is a **public utility** — not a social platform, not a startup product.

Think: a community-powered version of the national cybercrime database that ordinary Indians can actually use before sending money or sharing personal information.

**Primary user:** Someone who just received a call/message from an unknown number or UPI ID and wants to quickly check if others have reported it as suspicious.

**Core emotion to design for:** Trust and calm reassurance. The user is already anxious. The UI should feel authoritative, neutral, and clean — like a government public record, not like a consumer app.

---

## 2. Product Positioning

| Dimension | Direction |
|---|---|
| Tone | Neutral, legal-safe, factual |
| Personality | Public utility, not a product |
| Primary channel | Google search → entity page |
| Primary action | Search a number/UPI ID |
| Secondary action | Submit a report |
| NOT | Social, gamified, opinionated |

**Language rules (non-negotiable):**
- ❌ "Scammer", "Criminal", "Fraudster", "Confirmed fraud"
- ✅ "Suspicious activity reported", "Community caution advised", "Reports found"

---

## 3. Current UI State

Built with shadcn/ui defaults — functional, clean, but generic. Needs a design identity.

**Current color palette:**
- Background: `#ffffff` (white)
- Primary: `oklch(0.205 0 0)` (near black)
- Danger/caution: Tailwind `red-600`, `orange-100`, `yellow-100`
- Text: Tailwind gray scale
- No custom brand color yet

**Current typography:**
- Font: Inter (Google Fonts)
- Mono font: Geist Mono (for phone numbers/UPI IDs)
- No custom heading treatment

---

## 4. Page-by-Page Breakdown

### 4.1 Homepage (`/`)

**Purpose:** Search entry point. Needs to answer "what is this?" in 2 seconds and get users searching.

**Current layout:**
```
┌─────────────────────────────────┐
│ [Shield icon] ScamDB India  [Nav]│
├─────────────────────────────────┤
│        Red gradient hero        │
│   [Icon] community badge        │
│   "Check before you pay or share"│
│   [Description text]            │
│   [Search bar — large]          │
│   Try: 9876543210 • fake@ybl    │
├─────────────────────────────────┤
│     "How it works" — 3 columns  │
│  [Search] [See reports] [Stay safe]│
├─────────────────────────────────┤
│     Legal disclaimer strip      │
├─────────────────────────────────┤
│          Footer                 │
└─────────────────────────────────┘
```

**Designer notes:**
- Hero gradient (red-50 → white) feels generic — needs more intent
- "Check before you pay or share" — headline could be stronger and more Indian-specific
- Search bar is the only CTA — should be unmissable on mobile
- "How it works" section is functional but visually flat
- No trust signals (report count, entity count) — worth adding below search?

---

### 4.2 Entity Page (`/entity/phone/[number]` or `/entity/upi/[id]`)

**This is the most important page — primary SEO landing page.**

Users arrive from Google searching "is 9876543210 a scam" and land here.

**Current layout (reports found):**
```
┌─────────────────────────────────┐
│ [Search bar]                    │
├─────────────────────────────────┤
│ Phone Number                    │
│ +91 98765 43210  [CAUTION BADGE]│
│                                 │
│ ┌── Summary card (orange) ───┐  │
│ │ 3 Reports  2 Evidence      │  │
│ │ Last: Jan 2025  High caution│ │
│ └───────────────────────────┘  │
│                                 │
│ [Category badges]               │
│ ─────────────────────────────── │
│ Community reports (3)           │
│ ┌── Report card ─────────────┐ │
│ │ [Category] [Platform] [Date]│ │
│ │ Description text...         │ │
│ │ ₹5,000 involved             │ │
│ └─────────────────────────────┘│
│ [+ more report cards]          │
│                                 │
│ ┌── Report CTA ──────────────┐ │
│ │ Had a suspicious interaction?││
│ │ Submit a report             │ │
│ └─────────────────────────────┘│
└─────────────────────────────────┘
```

**Current layout (no reports):**
```
│ [Green alert] No reports found  │
│ This does not guarantee safety  │
│ Submit a report if suspicious   │
```

**Designer notes:**
- **Caution badge** is the most critical UI element — needs to be the first thing eyes go to
- Three caution levels: High (red), Medium (orange), Low (yellow) — current implementation uses badge chips; could be stronger
- Summary card with stats is functional but could be more visually impactful
- "Last reported X days ago" should be very prominent — freshness signals trust
- Report cards are clean but text-heavy — consider a more scannable layout
- The phone number should display in a large, monospace, readable format (+91 prefix, spaced)
- Mobile: summary stats should be a 2x2 grid, not a row

---

### 4.3 Search Results (`/search?q=...`)

**Purpose:** Fallback when search term is ambiguous (not a clean phone/UPI format).

**Current layout:**
```
│ [Search bar]                    │
│ "2 results for '9876'"          │
│ ┌── Result card ──────────────┐│
│ │ Phone Number                 ││
│ │ +91 98765 43210 [CAUTION]    ││
│ │ 3 reports · Last: Jan 2025   ││
│ └──────────────────────────────┘│
```

**Designer notes:**
- Simple list, works fine
- Empty state ("no results") needs better copy — should not feel like a dead end
- Cards could show category chips to help scanability

---

### 4.4 Report Submission (`/report`)

**Purpose:** Authenticated form to submit a suspicious number/UPI ID.

**Current layout:**
```
│ "Submit a report"               │
│ Subtitle text                   │
│                                 │
│ [Phone] [UPI] toggle buttons    │
│ [Phone number input]            │
│ [Category grid — 8 options]     │
│ [Platform grid — 9 options]     │
│ [Description textarea]          │
│ [Amount lost input]             │
│ [Upload screenshots]            │
│ [Legal note text]               │
│ [Turnstile CAPTCHA]             │
│ [Submit report button]          │
```

**Designer notes:**
- Form is long — consider a step-by-step multi-step flow (Step 1: What, Step 2: Details, Step 3: Evidence)
- Category grid (8 buttons) and Platform grid (9 buttons) are dense — could use icons for each option
- No progress indicator
- "Amount lost" field feels tucked away — could be more prominent as it's important signal data
- Mobile: grid buttons become very cramped below 375px
- Success state (post-submit) is clean — just needs better visual celebration

---

### 4.5 Auth Page (`/auth/login`)

**Current layout:**
```
│ [Shield icon]                   │
│ "Sign in to ScamDB"             │
│ Subtitle                        │
│ [G] Continue with Google        │
│ Privacy note                    │
```

**Designer notes:**
- Simple and clean — works well
- Could reinforce trust: "Only your email is stored. Nothing posted without your approval."
- Consider adding context: why sign-in is required (prevents fake reports, protects the database)

---

### 4.6 Moderation Dashboard (`/moderation`)

**Internal tool — not public.**

```
│ Moderation Queue (N pending)    │
│                                 │
│ ┌── Entity header ────────────┐│
│ │ Phone · +91 XXXXX  [badge]  ││
│ └──────────────────────────────┘│
│ ┌── Report card ──────────────┐│
│ │ [Category] [Platform]        ││
│ │ [Source type] [Confidence]   ││
│ │ Description...               ││
│ │ [Notes textarea]             ││
│ │ [Approve] [Reject] [Hide]    ││
│ └──────────────────────────────┘│
```

**Designer notes:**
- Functional but dense — not a priority for polish
- Approve/Reject/Hide buttons need clear visual hierarchy (green/red/gray)
- Confidence badges (low/medium/high) need distinct color treatment

---

### 4.7 Static Pages (Disclaimer, Privacy, Dispute)

- Prose layout, readable
- Could use a consistent page header component
- Dispute form is functional — minimal polish needed

---

## 5. Component Inventory

| Component | Location | Status |
|---|---|---|
| Navbar | `src/components/shared/navbar.tsx` | Functional |
| Footer | `src/components/shared/footer.tsx` | Functional |
| SearchBar | `src/components/shared/search-bar.tsx` | Functional |
| CautionBadge | `src/components/shared/caution-badge.tsx` | Needs visual weight |
| AuthForm | `src/components/shared/auth-form.tsx` | Clean |
| DisputeForm | `src/components/shared/dispute-form.tsx` | Functional |
| ReportForm | `src/components/report/report-form.tsx` | Long, could be stepped |
| ModerationQueue | `src/components/moderation/moderation-queue.tsx` | Internal |

---

## 6. Mobile-First Priorities

**~75% of Indian users will access via mobile.**

Critical mobile considerations:
- Search bar must be thumb-reachable on first scroll
- Entity page: stats grid must work at 320px width
- Report form: category/platform button grids are the tightest spots
- Phone numbers must be tappable (tel: link) for easy dialing verification
- Font sizes: min 16px on inputs to prevent iOS zoom

---

## 7. Trust Design Principles

Trust is the entire product. Every UI decision should reinforce it.

**Trust signals to design:**
1. Report counts — "3 community reports" feels more credible than a score
2. Date freshness — "Last reported 12 days ago" vs "Last reported 3 years ago" matters
3. Evidence count — "2 screenshots attached" vs none
4. Source attribution — "From Reddit r/IndianScammers" adds credibility
5. Moderation note — "Reviewed by moderator" label on approved reports

**Anti-patterns to avoid:**
- Overly alarming design (we're not tabloid, we're utility)
- Vague confidence meters / progress bars
- Social proof that could be gamed (likes, upvotes)
- Any UI that implies certainty ("CONFIRMED SCAM ✓")

---

## 8. Key Design Asks

Priority order for designer attention:

1. **Brand identity** — Logo mark, color system, typography scale. Currently using Inter + shadcn defaults.
2. **Caution badge system** — This is the most critical UI element. High / Medium / Low caution needs clear visual language that's instantly scannable.
3. **Entity page hero** — The phone number + caution badge + summary stats section needs stronger visual hierarchy. This is what 90% of users see.
4. **Homepage hero** — Needs to work harder. Search bar must be unmissable. Trust needs to be established in 2 seconds.
5. **Report form UX** — Consider multi-step vs single scroll. Category + platform selectors need icon treatment.
6. **Empty states** — "No reports found" state needs careful copy + design (it's good news, but don't over-celebrate — unknown isn't safe).
7. **Mobile** — Full audit of the report form at 375px.

---

## 9. What NOT to Redesign

- Moderation dashboard — internal tool, function over form
- Static pages (disclaimer, privacy) — readable, fine as-is
- Auth page — minimal by design, keep it
- URL structure — `/entity/phone/9876543210` is SEO-critical, don't change

---

## 10. Reference Tone

Not these:
- Alarming / tabloid (not a scandal site)
- Gamified / social (not Twitter)
- Corporate / government-heavy (not TRAI website)

Closer to:
- A well-designed public utility
- The factual clarity of a Wikipedia page
- The trust-first approach of a financial institution
- The mobile-native UX of a Zepto or PhonePe (for Indian mobile users)
