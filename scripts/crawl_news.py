"""
Indian news crawler for ScamDB India.

Crawls cyber crime news articles from major Indian outlets.
News articles about fraud arrests often include the actual phone/UPI used.

Sources:
  - NDTV — cyber crime, UPI fraud, online scam articles
  - Times of India — cyber fraud section
  - Hindustan Times — cyber crime
  - The Hindu — tech crime
  - India Today — cyber scam

Signals stored as source_type='news', source_confidence based on outlet.

Usage:
  python scripts/crawl_news.py
  python scripts/crawl_news.py --dry-run
  python scripts/crawl_news.py --limit=50
"""

import asyncio
import hashlib
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
ARTICLE_LIMIT = int(limit_arg.split("=")[1]) if limit_arg else 30

# News sources — listing pages + article link patterns
NEWS_SOURCES = [
    {
        "name": "NDTV Tech",
        "listing_url": "https://www.ndtv.com/topic/cyber-crime",
        "article_pattern": re.compile(r'href="(https://www\.ndtv\.com/[^"]*(?:cyber|fraud|scam|upi|online-fraud)[^"]*)"', re.I),
        "confidence": "high",
    },
    {
        "name": "NDTV India Cybercrime",
        "listing_url": "https://www.ndtv.com/india-news/cybercrime",
        "article_pattern": re.compile(r'href="(https://www\.ndtv\.com/india-news/[^"]+)"', re.I),
        "confidence": "high",
    },
    {
        "name": "Times of India Cyber Fraud",
        "listing_url": "https://timesofindia.indiatimes.com/topic/cyber-fraud",
        "article_pattern": re.compile(r'href="(https://timesofindia\.indiatimes\.com/[^"]*(?:cyber|fraud|scam)[^"]*\.cms)"', re.I),
        "confidence": "high",
    },
    {
        "name": "Hindustan Times Cyber Crime",
        "listing_url": "https://www.hindustantimes.com/topic/cyber-crime",
        "article_pattern": re.compile(r'href="(https://www\.hindustantimes\.com/[^"]*(?:cyber|fraud|scam)[^"]*)"', re.I),
        "confidence": "medium",
    },
    {
        "name": "India Today Cyber",
        "listing_url": "https://www.indiatoday.in/technology/cybersecurity",
        "article_pattern": re.compile(r'href="(https://www\.indiatoday\.in/[^"]*(?:cyber|fraud|scam)[^"]*)"', re.I),
        "confidence": "high",
    },
]

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
    "phishing", "digital arrest", "job fraud", "investment fraud", "lottery",
    "otp fraud", "fake call", "scam", "cheated", "arrested", "crore",
    "lakh", "duped", "impersonation", "sextortion",
]

def is_relevant(text: str) -> bool:
    t = text.lower()
    return sum(1 for kw in SCAM_KEYWORDS if kw in t) >= 2

def has_entities(text: str) -> bool:
    return bool(PHONE_RE.search(text) or UPI_RE.search(text))

def content_hash(text: str) -> str:
    return hashlib.sha256(text.strip()[:500].encode()).hexdigest()[:16]

def get_markdown(result) -> str:
    if not result.success:
        return ""
    md = result.markdown
    return (md.raw_markdown if hasattr(md, "raw_markdown") else str(md)) or ""

# ── Fetch article list from listing page ───────────────────────────────────────

async def get_article_urls(crawler: AsyncWebCrawler, source: dict) -> list[str]:
    try:
        result = await crawler.arun(
            url=source["listing_url"],
            config=CrawlerRunConfig(
                cache_mode=CacheMode.BYPASS,
                page_timeout=20000,
                delay_before_return_html=2.0,
                js_code="window.scrollTo(0, document.body.scrollHeight);",
            )
        )
        html = result.html or ""
    except Exception as e:
        print(f"  ✗ Listing fetch failed: {e}")
        return []

    urls = list(dict.fromkeys(source["article_pattern"].findall(html)))  # unique, order-preserving
    return urls[:ARTICLE_LIMIT]

# ── Crawl individual article ───────────────────────────────────────────────────

async def crawl_article(crawler: AsyncWebCrawler, url: str, source: dict) -> dict | None:
    try:
        result = await crawler.arun(
            url=url,
            config=CrawlerRunConfig(
                cache_mode=CacheMode.BYPASS,
                page_timeout=15000,
                delay_before_return_html=1.0,
                css_selector="article, .story-details, .article-body, .content-area, main, #content",
            )
        )
        content = get_markdown(result)
        if not content or len(content) < 100:
            return None
        if not is_relevant(content):
            return None

        return {
            "content": content[:5000],
            "source_url": url,
            "confidence": source["confidence"],
            "has_entities": has_entities(content),
        }
    except Exception:
        return None

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
            "source_type": "news",
            "source_url": signal["source_url"],
            "title": None,
            "content": signal["content"],
            "author": None,
            "author_score": 50 if signal["confidence"] == "high" else 10,
            "captured_at": datetime.now(timezone.utc).isoformat(),
            "status": "unprocessed",
        }).execute()
        return True
    except Exception as e:
        print(f"    store failed: {e}")
        return False

# ── Entry point ────────────────────────────────────────────────────────────────

async def main():
    print(f"ScamDB News Crawler — {'DRY RUN' if DRY_RUN else 'LIVE'}")
    print(f"Limit: {ARTICLE_LIMIT} articles/source\n")

    db = None if DRY_RUN else create_client(SUPABASE_URL, SUPABASE_KEY)

    total_inserted = 0
    total_skipped  = 0

    async with AsyncWebCrawler(verbose=False) as crawler:
        for source in NEWS_SOURCES:
            print(f"[{source['name']}]")

            urls = await get_article_urls(crawler, source)
            print(f"  {len(urls)} article URLs found")

            if not urls:
                print()
                continue

            with_entities = 0

            for i, url in enumerate(urls, 1):
                signal = await crawl_article(crawler, url, source)
                if not signal:
                    continue

                tag = "📞/💳" if signal["has_entities"] else "📰"
                if signal["has_entities"]:
                    with_entities += 1
                    if DRY_RUN:
                        print(f"  {tag} {url[-60:]}")

                if DRY_RUN:
                    continue

                if already_stored(db, signal["source_url"]):
                    total_skipped += 1
                    continue

                if store_signal(db, signal):
                    total_inserted += 1
                    if signal["has_entities"]:
                        print(f"  ✓ {tag} {url[-60:]}")

                await asyncio.sleep(0.5)

            print(f"  → {with_entities}/{len(urls)} articles had phone/UPI entities\n")
            await asyncio.sleep(2)

    if not DRY_RUN:
        print(f"Total: {total_inserted} stored, {total_skipped} duplicate")
        print("Trigger /api/cron/process to extract entities.")

if __name__ == "__main__":
    asyncio.run(main())
