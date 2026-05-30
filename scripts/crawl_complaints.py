"""
Consumer complaint crawler for ScamDB India.

Targets sites where Indians report scam/spam phone numbers.
Unlike news articles, these sites have the ACTUAL scam numbers.

Sources:
  - whocalledindia.com — crowd-sourced Indian number reports
  - spamcalls.net (India section) — spam call reports
  - receivesmsonline.net — shared Indian numbers (often used by scammers)

Usage:
  python scripts/crawl_complaints.py
  python scripts/crawl_complaints.py --dry-run
  python scripts/crawl_complaints.py --limit=100
"""

import asyncio
import os
import re
import sys
from datetime import datetime, timezone

from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode
from supabase import create_client, Client

# ── Config ─────────────────────────────────────────────────────────────────────

DRY_RUN = "--dry-run" in sys.argv
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not DRY_RUN and (not SUPABASE_URL or not SUPABASE_KEY):
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.")
    sys.exit(1)

limit_arg = next((a for a in sys.argv if a.startswith("--limit=")), None)
LIMIT = int(limit_arg.split("=")[1]) if limit_arg else 50

# ── Regex ──────────────────────────────────────────────────────────────────────

PHONE_RE = re.compile(r'(?:\+91[\-\s]?|91[\-\s]?|0)?([6-9]\d{9})\b')
UPI_RE = re.compile(
    r'\b([a-zA-Z0-9._\-]{2,64}@(?:'
    r'ybl|okhdfcbank|okicici|oksbi|okaxis|paytm|apl|ibl|upi|'
    r'barodampay|hdfcbank|icici|sbi|kotak|pnb|boi|bob|airtel|'
    r'jio|phonepe|gpay|amazon|slice|navi|fi|jupiter|razorpay|'
    r'cashfree|freecharge|mobikwik))\b',
    re.IGNORECASE
)

SCAM_KEYWORDS = [
    "scam", "fraud", "fake", "cheated", "duped", "otp", "loan",
    "investment", "lottery", "job", "impersonation", "phishing",
    "beware", "warning", "suspicious", "unknown", "spam",
]

def is_scam_related(text: str) -> bool:
    t = text.lower()
    return any(kw in t for kw in SCAM_KEYWORDS)

def normalize_phone(raw: str) -> str:
    digits = re.sub(r'\D', '', raw)
    if digits.startswith('91') and len(digits) == 12:
        digits = digits[2:]
    if digits.startswith('0') and len(digits) == 11:
        digits = digits[1:]
    return digits

def get_markdown(result) -> str:
    if not result.success:
        return ""
    md = result.markdown
    return (md.raw_markdown if hasattr(md, "raw_markdown") else str(md)) or ""

# ── Who Called India ───────────────────────────────────────────────────────────
# URL pattern: /phone-number/XXXXXXXXXX — each page has user comments about that number

WHOCALLEDINDIA_LISTING = "https://www.whocalledindia.com/reported-spam-calls"
WHOCALLEDINDIA_NUMBER_RE = re.compile(r'href="https://www\.whocalledindia\.com/([6-9]\d{9})"')

async def crawl_whocalledindia(crawler: AsyncWebCrawler) -> list[dict]:
    print("[Who Called India]")
    signals = []

    # Get listing of reported numbers
    try:
        result = await crawler.arun(
            url=WHOCALLEDINDIA_LISTING,
            config=CrawlerRunConfig(
                cache_mode=CacheMode.BYPASS,
                page_timeout=20000,
                delay_before_return_html=2.0,
            )
        )
        html = result.html or ""
    except Exception as e:
        print(f"  ✗ Listing failed: {e}")
        return []

    numbers = list(dict.fromkeys(WHOCALLEDINDIA_NUMBER_RE.findall(html)))[:LIMIT]
    print(f"  {len(numbers)} reported numbers found")

    for i, number in enumerate(numbers, 1):
        url = f"https://www.whocalledindia.com/{number}"
        try:
            result = await crawler.arun(
                url=url,
                config=CrawlerRunConfig(
                    cache_mode=CacheMode.BYPASS,
                    page_timeout=15000,
                    delay_before_return_html=1.0,
                )
            )
            content = get_markdown(result)
            if not content or len(content) < 50:
                continue
            if not is_scam_related(content):
                continue

            signals.append({
                "source_url": url,
                "content": content[:3000],
                "phone": number,
            })
            if DRY_RUN and i <= 5:
                print(f"  [{i}] {number} — {content[:80].replace(chr(10),' ')}")

        except Exception:
            continue
        await asyncio.sleep(0.3)

    print(f"  → {len(signals)} scam-related numbers\n")
    return signals

# ── Spamcalls.net India ────────────────────────────────────────────────────────

SPAMCALLS_LISTING = "https://www.spamcalls.net/en/search?q=india&type=scam"
SPAMCALLS_NUMBER_RE = re.compile(r'href="/en/number/(\+91[0-9]{10}|91[0-9]{10}|0?[6-9][0-9]{9})"')

async def crawl_spamcalls(crawler: AsyncWebCrawler) -> list[dict]:
    print("[Spamcalls.net India]")
    signals = []

    try:
        result = await crawler.arun(
            url=SPAMCALLS_LISTING,
            config=CrawlerRunConfig(
                cache_mode=CacheMode.BYPASS,
                page_timeout=20000,
                delay_before_return_html=2.0,
            )
        )
        html = result.html or ""
    except Exception as e:
        print(f"  ✗ Listing failed: {e}")
        return []

    raw_numbers = list(dict.fromkeys(SPAMCALLS_NUMBER_RE.findall(html)))
    numbers = []
    for n in raw_numbers:
        norm = normalize_phone(n)
        if len(norm) == 10 and norm[0] in '6789':
            numbers.append((norm, n))

    numbers = numbers[:LIMIT]
    print(f"  {len(numbers)} numbers found")

    for i, (norm, raw) in enumerate(numbers, 1):
        encoded = raw.replace("+", "%2B")
        url = f"https://www.spamcalls.net/en/number/{encoded}"
        try:
            result = await crawler.arun(
                url=url,
                config=CrawlerRunConfig(
                    cache_mode=CacheMode.BYPASS,
                    page_timeout=15000,
                    delay_before_return_html=1.0,
                )
            )
            content = get_markdown(result)
            if not content or len(content) < 50:
                continue

            signals.append({
                "source_url": url,
                "content": f"Reported spam/scam number: {raw}\n\n{content[:3000]}",
                "phone": norm,
            })
            if DRY_RUN and i <= 5:
                print(f"  [{i}] {norm} — {content[:80].replace(chr(10),' ')}")

        except Exception:
            continue
        await asyncio.sleep(0.3)

    print(f"  → {len(signals)} numbers crawled\n")
    return signals

# ── Storage ────────────────────────────────────────────────────────────────────

def already_stored(db: Client, source_url: str) -> bool:
    result = (
        db.table("raw_signals")
        .select("id", count="exact", head=True)
        .eq("source_url", source_url)
        .execute()
    )
    return (result.count or 0) > 0

def store_signal(db: Client, signal: dict) -> bool:
    try:
        db.table("raw_signals").insert({
            "source_type": "other",
            "source_url": signal["source_url"],
            "title": f"Reported number: {signal['phone']}",
            "content": signal["content"],
            "author": None,
            "author_score": 5,
            "captured_at": datetime.now(timezone.utc).isoformat(),
            "status": "unprocessed",
        }).execute()
        return True
    except Exception as e:
        print(f"    store failed: {e}")
        return False

# ── Entry point ────────────────────────────────────────────────────────────────

async def main():
    print(f"ScamDB Complaints Crawler — {'DRY RUN' if DRY_RUN else 'LIVE'}")
    print(f"Limit: {LIMIT} numbers/source\n")

    db = None if DRY_RUN else create_client(SUPABASE_URL, SUPABASE_KEY)

    total_inserted = 0
    total_skipped  = 0

    async with AsyncWebCrawler(verbose=False) as crawler:
        all_signals: list[dict] = []

        wci = await crawl_whocalledindia(crawler)
        all_signals.extend(wci)

        spam = await crawl_spamcalls(crawler)
        all_signals.extend(spam)

    print(f"Total signals: {len(all_signals)}")

    if DRY_RUN:
        print("Dry run complete. No DB writes.")
        return

    for signal in all_signals:
        if already_stored(db, signal["source_url"]):
            total_skipped += 1
            continue
        if store_signal(db, signal):
            total_inserted += 1

    print(f"Stored: {total_inserted}, Skipped (duplicate): {total_skipped}")
    print("Trigger /api/cron/process to extract entities.")

if __name__ == "__main__":
    asyncio.run(main())
