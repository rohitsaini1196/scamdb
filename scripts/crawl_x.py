"""
X/Twitter crawler for ScamDB India using crawl4ai + Nitter.

Sources:
  - @CyberDost (official Govt of India cyber awareness)
  - @PIB_India cybercrime posts
  - #UPIScam #CyberFraud #ScamAlert hashtags

Stores raw signals in Supabase raw_signals table.
Nothing auto-publishes — all goes to moderation queue.

Usage:
  pip install -r requirements-crawler.txt
  python scripts/crawl_x.py
  python scripts/crawl_x.py --dry-run
"""

import asyncio
import os
import re
import sys
import json
from datetime import datetime, timezone
from typing import Optional

from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode
from supabase import create_client, Client

# ── Config ────────────────────────────────────────────────────────────────────

DRY_RUN = "--dry-run" in sys.argv
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not DRY_RUN and (not SUPABASE_URL or not SUPABASE_KEY):
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for live run.")
    sys.exit(1)

# Nitter instances — try in order, use first that responds
NITTER_INSTANCES = [
    "https://nitter.net",
    "https://nitter.privacydev.net",
    "https://nitter.poast.org",
    "https://nitter.1d4.us",
]

# Accounts to crawl (official govt + high-signal community)
TARGET_ACCOUNTS = [
    "CyberDost",       # Govt of India cyber awareness — highest quality
    "Cyberdost_MHA",   # MHA cyber wing
    "PIBHindi",        # Press releases
]

# Hashtag search pages
TARGET_HASHTAGS = [
    "UPIScam",
    "CyberFraud",
    "ScamAlert",
    "OnlineFraudIndia",
    "CyberCrimeIndia",
]

# Keywords that confirm scam-relevance
SCAM_KEYWORDS = [
    "scam", "fraud", "cheated", "duped", "fake", "beware", "warning",
    "phishing", "otp", "upi fraud", "loan scam", "investment scam",
    "job scam", "lottery", "impersonation", "cybercrime", "lost money",
    "धोखा", "ठगी", "फर्जी", "सावधान",
]

# ── Regex ─────────────────────────────────────────────────────────────────────

PHONE_RE = re.compile(
    r'(?:\+91[\-\s]?|91[\-\s]?|0)?([6-9]\d{9})\b'
)
UPI_RE = re.compile(
    r'\b([a-zA-Z0-9._\-]{2,64}@(?:'
    r'ybl|okhdfcbank|okicici|oksbi|okaxis|paytm|apl|ibl|upi|'
    r'barodampay|hdfcbank|icici|sbi|kotak|pnb|boi|bob|airtel|'
    r'jio|phonepe|gpay|amazon|slice|navi|fi|jupiter|razorpay|'
    r'cashfree|freecharge|mobikwik))\b',
    re.IGNORECASE
)

def is_scam_related(text: str) -> bool:
    t = text.lower()
    return any(kw in t for kw in SCAM_KEYWORDS)

def has_entities(text: str) -> bool:
    return bool(PHONE_RE.search(text) or UPI_RE.search(text))

def normalize_phone(raw: str) -> str:
    digits = re.sub(r'\D', '', raw)
    if digits.startswith('91') and len(digits) == 12:
        digits = digits[2:]
    if digits.startswith('0') and len(digits) == 11:
        digits = digits[1:]
    return digits

# ── Nitter helpers ─────────────────────────────────────────────────────────────

async def find_working_nitter(crawler: AsyncWebCrawler) -> Optional[str]:
    """Find first responsive Nitter instance."""
    for instance in NITTER_INSTANCES:
        try:
            result = await crawler.arun(
                url=f"{instance}/CyberDost",
                config=CrawlerRunConfig(
                    cache_mode=CacheMode.BYPASS,
                    page_timeout=10000,
                    wait_for="css:.timeline-item",
                )
            )
            if result.success and "timeline" in (result.html or ""):
                print(f"  ✓ Nitter: {instance}")
                return instance
        except Exception:
            continue
    return None

def extract_tweets_from_html(html: str, source_url: str) -> list[dict]:
    """Parse Nitter HTML and extract tweet data."""
    tweets = []

    # Extract tweet containers via regex (crawl4ai also provides markdown)
    # Using markdown content which crawl4ai provides is cleaner
    return tweets

def parse_nitter_markdown(markdown: str, base_url: str, account: str) -> list[dict]:
    """Extract individual tweets from crawl4ai markdown output."""
    tweets = []
    # Nitter renders each tweet as a block separated by --- or ***
    blocks = re.split(r'\n---\n|\n\*\*\*\n', markdown)

    # Match Nitter status permalink: /account/status/ID
    STATUS_RE = re.compile(r'https?://[^/\s]+/[^/\s]+/status/(\d+)', re.IGNORECASE)

    seen_ids: set[str] = set()

    for block in blocks:
        block = block.strip()
        if len(block) < 30:
            continue
        if not is_scam_related(block):
            continue

        # Extract per-tweet permalink — use tweet ID as dedup key
        match = STATUS_RE.search(block)
        if match:
            tweet_id = match.group(1)
            if tweet_id in seen_ids:
                continue
            seen_ids.add(tweet_id)
            # Normalise to twitter.com URL so dedup survives Nitter instance changes
            tweet_url = f"https://twitter.com/{account}/status/{tweet_id}"
        else:
            # No permalink found — skip rather than store with wrong source_url
            continue

        tweets.append({
            "content": block[:3000],
            "source_url": tweet_url,
            "author": account,
        })

    return tweets

# ── Main crawl ────────────────────────────────────────────────────────────────

async def crawl_account(
    crawler: AsyncWebCrawler,
    nitter: str,
    account: str,
) -> list[dict]:
    url = f"{nitter}/{account}"
    print(f"  Crawling @{account}... ", end="", flush=True)

    try:
        result = await crawler.arun(
            url=url,
            config=CrawlerRunConfig(
                cache_mode=CacheMode.BYPASS,
                page_timeout=20000,
                wait_for="css:.timeline-item",
                js_code="window.scrollTo(0, document.body.scrollHeight);",
                delay_before_return_html=2.0,
            )
        )

        if not result.success:
            print(f"failed ({result.error_message})")
            return []

        md = result.markdown
        content = (md.raw_markdown if hasattr(md, "raw_markdown") else str(md)) or ""
        tweets = parse_nitter_markdown(content, url, account)
        print(f"{len(tweets)} scam-related tweets")
        return tweets

    except Exception as e:
        print(f"error: {e}")
        return []

async def crawl_hashtag(
    crawler: AsyncWebCrawler,
    nitter: str,
    hashtag: str,
) -> list[dict]:
    url = f"{nitter}/search?q=%23{hashtag}&f=tweets"
    print(f"  Crawling #{hashtag}... ", end="", flush=True)

    try:
        result = await crawler.arun(
            url=url,
            config=CrawlerRunConfig(
                cache_mode=CacheMode.BYPASS,
                page_timeout=20000,
                delay_before_return_html=2.0,
            )
        )

        if not result.success:
            print(f"failed")
            return []

        md = result.markdown
        content = (md.raw_markdown if hasattr(md, "raw_markdown") else str(md)) or ""
        tweets = parse_nitter_markdown(content, url, hashtag)
        print(f"{len(tweets)} results")
        return tweets

    except Exception as e:
        print(f"error: {e}")
        return []

# ── Supabase storage ───────────────────────────────────────────────────────────

def already_stored(db: Client, source_url: str) -> bool:
    result = db.table("raw_signals") \
        .select("id", count="exact", head=True) \
        .eq("source_url", source_url) \
        .execute()
    return (result.count or 0) > 0

def store_signal(db: Client, signal: dict) -> bool:
    try:
        db.table("raw_signals").insert({
            "source_type": "twitter",
            "source_url": signal["source_url"],
            "title": None,
            "content": signal["content"],
            "author": signal.get("author"),
            "author_score": signal.get("score", 0),
            "captured_at": datetime.now(timezone.utc).isoformat(),
            "status": "unprocessed",
        }).execute()
        return True
    except Exception as e:
        print(f"    ✗ Store failed: {e}")
        return False

# ── Entry point ────────────────────────────────────────────────────────────────

async def main():
    print(f"ScamDB X Crawler — {'DRY RUN' if DRY_RUN else 'LIVE'}\n")

    db = None if DRY_RUN else create_client(SUPABASE_URL, SUPABASE_KEY)

    async with AsyncWebCrawler(verbose=False) as crawler:
        # Find working Nitter instance
        print("Finding Nitter instance...")
        nitter = await find_working_nitter(crawler)

        if not nitter:
            print("✗ No Nitter instances available. Exiting.")
            sys.exit(1)

        all_signals: list[dict] = []

        # Crawl accounts
        print("\nCrawling accounts:")
        for account in TARGET_ACCOUNTS:
            tweets = await crawl_account(crawler, nitter, account)
            all_signals.extend(tweets)
            await asyncio.sleep(1)  # polite delay

        # Crawl hashtags
        print("\nCrawling hashtags:")
        for hashtag in TARGET_HASHTAGS:
            tweets = await crawl_hashtag(crawler, nitter, hashtag)
            all_signals.extend(tweets)
            await asyncio.sleep(1)

        # Deduplicate by source_url
        seen_urls: set[str] = set()
        unique = []
        for s in all_signals:
            if s["source_url"] not in seen_urls:
                seen_urls.add(s["source_url"])
                unique.append(s)

        print(f"\nTotal unique scam-related signals: {len(unique)}")

        if DRY_RUN:
            print("\n--- DRY RUN PREVIEW ---")
            for s in unique[:10]:
                print(f"  [{s['author']}] {s['content'][:100]}...")
            return

        # Store in Supabase
        inserted = 0
        skipped = 0

        for signal in unique:
            if db and already_stored(db, signal["source_url"]):
                skipped += 1
                continue
            if db and store_signal(db, signal):
                inserted += 1

        print(f"\nDone. {inserted} stored, {skipped} duplicate.")
        print("Run process:signals to extract entities and queue for moderation.")

if __name__ == "__main__":
    asyncio.run(main())
