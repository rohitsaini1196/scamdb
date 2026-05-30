"""
Government advisory crawler for ScamDB India.

Sources:
  - pib.gov.in        — PIB press releases (cybercrime ministry)
  - cybercrime.gov.in — MHA cyber crime portal
  - i4c.mha.gov.in    — I4C alerts

Two-phase for PIB: fetch listing → crawl individual article pages.
Single-phase for portal sites: targeted CSS selector extraction.

Signals stored as source_type='police_advisory', confidence='high'.
These auto-approve in /api/cron/process — no moderation needed.

Usage:
  python scripts/crawl_advisories.py
  python scripts/crawl_advisories.py --dry-run
"""

import asyncio
import hashlib
import os
import re
import sys
from datetime import datetime, timezone
from typing import Optional

from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode
from supabase import create_client, Client

# ── Config ─────────────────────────────────────────────────────────────────────

DRY_RUN = "--dry-run" in sys.argv
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not DRY_RUN and (not SUPABASE_URL or not SUPABASE_KEY):
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for live run.")
    sys.exit(1)

# PIB listing page — cybercrime / MHA press releases
PIB_LISTING_URL = "https://pib.gov.in/allRel.aspx?menuid=4&reg=3&lang=1"
PIB_BASE = "https://www.pib.gov.in"

# Portal single-page sources with CSS selectors for content areas
PORTAL_SOURCES = [
    {
        "name": "Cybercrime.gov.in",
        "url": "https://cybercrime.gov.in",
        "css": ".news-section, .alert-section, .content-area, main, #main-content, .news-alerts",
    },
    {
        "name": "I4C MHA Alerts",
        "url": "https://i4c.mha.gov.in/cyber-alerts.aspx",
        "fallback": "https://i4c.mha.gov.in",
        "css": ".alert-box, .content, main, #content, .news-item",
    },
]

# Max individual PIB articles to crawl per run
MAX_PIB_ARTICLES = 20

MIN_BLOCK_LEN = 100

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
    "cyber fraud", "cyber crime", "cybercrime", "upi fraud", "online fraud",
    "phishing", "impersonation", "financial fraud", "digital arrest",
    "job fraud", "investment fraud", "lottery fraud", "otp fraud",
    "fake call", "vishing", "smishing", "sextortion", "pig butchering",
    "scam", "cheated", "duped", "beware", "advisory", "alert", "caution",
    "धोखा", "ठगी", "सावधान", "फर्जी", "साइबर",
]

NOISE_PATTERNS = re.compile(
    r'(cookie|privacy policy|terms of use|copyright|all rights reserved|'
    r'skip to content|sign in|register|subscribe|newsletter|follow us|'
    r'share this|print this|back to top|breadcrumb|navigation|menu)',
    re.IGNORECASE
)

def is_relevant(text: str) -> bool:
    t = text.lower()
    return any(kw in t for kw in SCAM_KEYWORDS)

def is_noise(text: str) -> bool:
    # Short blocks with navigation-like content
    if len(text) < MIN_BLOCK_LEN:
        return True
    noise_count = len(NOISE_PATTERNS.findall(text))
    return noise_count >= 3

def has_entities(text: str) -> bool:
    return bool(PHONE_RE.search(text) or UPI_RE.search(text))

def content_hash(text: str) -> str:
    return hashlib.sha256(text.strip()[:500].encode()).hexdigest()[:16]

def get_markdown(result) -> Optional[str]:
    if not result.success:
        return None
    md = result.markdown
    return md.raw_markdown if hasattr(md, "raw_markdown") else str(md)

# ── PIB two-phase crawl ────────────────────────────────────────────────────────

PIB_ARTICLE_RE = re.compile(r'href=["\']?(https?://pib\.gov\.in/PressRelease[^"\'>\s]+)', re.IGNORECASE)
PIB_ARTICLE_RELATIVE_RE = re.compile(r'href=["\']?(/PressRelease[^"\'>\s]+)', re.IGNORECASE)

async def get_pib_article_urls(crawler: AsyncWebCrawler) -> list[str]:
    """Fetch PIB listing and extract individual press release URLs."""
    print(f"  Fetching PIB listing...")
    try:
        result = await crawler.arun(
            url=PIB_LISTING_URL,
            config=CrawlerRunConfig(
                cache_mode=CacheMode.BYPASS,
                page_timeout=20000,
                delay_before_return_html=1.5,
            )
        )
        if not result.success:
            print(f"  ✗ PIB listing failed")
            return []

        html = result.html or ""

        # Extract absolute URLs
        urls = set(PIB_ARTICLE_RE.findall(html))
        # Extract relative URLs and make absolute
        for path in PIB_ARTICLE_RELATIVE_RE.findall(html):
            urls.add(f"{PIB_BASE}{path}")

        # Filter to only cybercrime / MHA category (menuid=4)
        # PIB URLs contain detid= for article ID — take first N unique
        unique = list(urls)[:MAX_PIB_ARTICLES]
        print(f"  Found {len(urls)} article links, crawling {len(unique)}")
        return unique

    except Exception as e:
        print(f"  ✗ PIB listing error: {e}")
        return []

async def crawl_pib_article(crawler: AsyncWebCrawler, url: str) -> Optional[dict]:
    """Crawl one PIB press release and return signal dict if relevant."""
    try:
        result = await crawler.arun(
            url=url,
            config=CrawlerRunConfig(
                cache_mode=CacheMode.BYPASS,
                page_timeout=15000,
                delay_before_return_html=1.0,
                css_selector=".innner-page-content, .release-content, article, main, #content",
            )
        )
        content = get_markdown(result)
        if not content:
            return None
        if not is_relevant(content) or is_noise(content):
            return None

        return {
            "content": content[:5000],
            "source_url": url,
            "has_entities": has_entities(content),
        }
    except Exception:
        return None

async def run_pib(crawler: AsyncWebCrawler) -> list[dict]:
    print("\n[PIB — Cybercrime Press Releases]")
    article_urls = await get_pib_article_urls(crawler)
    if not article_urls:
        return []

    signals = []
    for url in article_urls:
        sig = await crawl_pib_article(crawler, url)
        if sig:
            signals.append(sig)
        await asyncio.sleep(0.5)

    entity_count = sum(1 for s in signals if s["has_entities"])
    print(f"  {len(signals)} relevant articles ({entity_count} with phone/UPI)")
    return signals

# ── Portal single-phase crawl ──────────────────────────────────────────────────

async def run_portal(crawler: AsyncWebCrawler, source: dict) -> list[dict]:
    print(f"\n[{source['name']}]")
    url = source["url"]

    try:
        config_kwargs: dict = {
            "cache_mode": CacheMode.BYPASS,
            "page_timeout": 25000,
            "delay_before_return_html": 2.5,
            "js_code": "window.scrollTo(0, document.body.scrollHeight);",
        }
        if source.get("css"):
            config_kwargs["css_selector"] = source["css"]

        result = await crawler.arun(url=url, config=CrawlerRunConfig(**config_kwargs))
        content = get_markdown(result)

        if not content and source.get("fallback"):
            print(f"  Primary failed, trying fallback...")
            result = await crawler.arun(
                url=source["fallback"],
                config=CrawlerRunConfig(
                    cache_mode=CacheMode.BYPASS,
                    page_timeout=20000,
                    delay_before_return_html=2.0,
                    js_code="window.scrollTo(0, document.body.scrollHeight);",
                )
            )
            content = get_markdown(result)
            url = source["fallback"]

        if not content:
            print(f"  ✗ Could not fetch")
            return []

    except Exception as e:
        print(f"  ✗ Error: {e}")
        return []

    # Split and filter blocks
    signals = []
    seen: set[str] = set()
    blocks = re.split(r'\n#{1,4} |\n---\n|\n\*\*\*\n', content)

    for block in blocks:
        block = block.strip()
        if is_noise(block) or not is_relevant(block):
            continue
        h = content_hash(block)
        if h in seen:
            continue
        seen.add(h)
        signals.append({
            "content": block[:5000],
            "source_url": url,
            "has_entities": has_entities(block),
        })

    entity_count = sum(1 for s in signals if s["has_entities"])
    print(f"  {len(signals)} relevant blocks ({entity_count} with phone/UPI)")
    return signals

# ── Storage ────────────────────────────────────────────────────────────────────

def already_stored(db: Client, source_url: str, content: str) -> bool:
    result = (
        db.table("raw_signals")
        .select("id", count="exact", head=True)
        .eq("source_url", source_url)
        .like("content", content[:100].replace("%", "%%") + "%")
        .execute()
    )
    return (result.count or 0) > 0

def store_signal(db: Client, signal: dict) -> bool:
    try:
        db.table("raw_signals").insert({
            "source_type": "police_advisory",
            "source_url": signal["source_url"],
            "title": None,
            "content": signal["content"],
            "author": None,
            "author_score": 100,
            "captured_at": datetime.now(timezone.utc).isoformat(),
            "status": "unprocessed",
        }).execute()
        return True
    except Exception as e:
        print(f"    store failed: {e}")
        return False

# ── Entry point ────────────────────────────────────────────────────────────────

async def main():
    print(f"ScamDB Advisory Crawler — {'DRY RUN' if DRY_RUN else 'LIVE'}\n")

    db = None if DRY_RUN else create_client(SUPABASE_URL, SUPABASE_KEY)

    total_inserted = 0
    total_skipped = 0
    all_signals: list[dict] = []

    async with AsyncWebCrawler(verbose=False) as crawler:
        # Phase 1: PIB individual article crawl
        pib_signals = await run_pib(crawler)
        all_signals.extend(pib_signals)

        # Phase 2: Portal sites
        for source in PORTAL_SOURCES:
            portal_signals = await run_portal(crawler, source)
            all_signals.extend(portal_signals)
            await asyncio.sleep(2)

    entity_total = sum(1 for s in all_signals if s["has_entities"])
    print(f"\nTotal: {len(all_signals)} signals ({entity_total} with phone/UPI entities)")

    if DRY_RUN:
        print("\n--- DRY RUN PREVIEW (first 5) ---")
        for s in all_signals[:5]:
            preview = s["content"][:150].replace('\n', ' ')
            tag = "📞" if s["has_entities"] else "📋"
            print(f"  {tag} [{s['source_url'][-40:]}] {preview}...")
        return

    for signal in all_signals:
        if already_stored(db, signal["source_url"], signal["content"]):
            total_skipped += 1
            continue
        if store_signal(db, signal):
            total_inserted += 1

    print(f"Stored: {total_inserted}, Skipped (duplicate): {total_skipped}")
    print("Trigger /api/cron/process to extract entities → police_advisory auto-approves.")

if __name__ == "__main__":
    asyncio.run(main())
