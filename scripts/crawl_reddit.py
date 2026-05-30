"""
Reddit deep crawler for ScamDB India using crawl4ai.

Targets r/indianscammers — crawls full post pages including comment threads.
This is where actual phone numbers and UPI IDs live (not in post bodies).

RSS-based ingest misses comments. This script fetches the full page.

Usage:
  python scripts/crawl_reddit.py
  python scripts/crawl_reddit.py --dry-run
  python scripts/crawl_reddit.py --limit=20 --sort=top --time=month
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
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for live run.")
    sys.exit(1)

limit_arg = next((a for a in sys.argv if a.startswith("--limit=")), None)
sort_arg  = next((a for a in sys.argv if a.startswith("--sort=")), None)
time_arg  = next((a for a in sys.argv if a.startswith("--time=")), None)

POST_LIMIT  = int(limit_arg.split("=")[1]) if limit_arg else 25
SORT        = sort_arg.split("=")[1] if sort_arg else "new"   # new | hot | top
TIME        = time_arg.split("=")[1] if time_arg else "week"  # day | week | month | year | all

# Subreddits to deep-crawl (full page + comments)
# Keep this list short — each post = one browser request
TARGET_SUBREDDITS = [
    "indianscammers",
    "IndianScamBusters",
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
    "scam", "fraud", "cheated", "duped", "fake", "beware", "warning",
    "phishing", "otp", "upi fraud", "loan scam", "investment scam",
    "job scam", "lottery", "impersonation", "cybercrime", "cyber crime",
    "lost money", "scammer", "scammers", "धोखा", "ठगी", "फर्जी",
]

def is_scam_related(text: str) -> bool:
    t = text.lower()
    return any(kw in t for kw in SCAM_KEYWORDS)

def extract_phones(text: str) -> list[str]:
    results = []
    seen = set()
    for m in PHONE_RE.finditer(text):
        digits = re.sub(r'\D', '', m.group(1) or m.group(0))
        if digits.startswith('91') and len(digits) == 12:
            digits = digits[2:]
        if digits.startswith('0') and len(digits) == 11:
            digits = digits[1:]
        if len(digits) == 10 and digits[0] in '6789' and digits not in seen:
            seen.add(digits)
            results.append(digits)
    return results

def extract_upis(text: str) -> list[str]:
    results = []
    seen = set()
    for m in UPI_RE.finditer(text):
        upi = m.group(0).lower().strip()
        if upi not in seen:
            seen.add(upi)
            results.append(upi)
    return results

def get_markdown(result) -> str:
    md = result.markdown
    return (md.raw_markdown if hasattr(md, "raw_markdown") else str(md)) or ""

# ── Fetch post listing via RSS (no auth needed) ────────────────────────────────

async def get_post_urls(subreddit: str) -> list[dict]:
    """Fetch post listing via RSS and return list of {url, title, permalink}."""
    rss_url = f"https://www.reddit.com/r/{subreddit}/{SORT}.rss?limit={POST_LIMIT}&t={TIME}"
    try:
        import urllib.request
        req = urllib.request.Request(
            rss_url,
            headers={"User-Agent": "ScamDB-India-Bot/1.0 (scamdb.in)"}
        )
        xml = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"  ✗ RSS fetch failed: {e}")
        return []

    posts = []
    entries = re.findall(r'<entry>([\s\S]*?)<\/entry>', xml)
    for entry in entries:
        title = re.search(r'<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>', entry)
        link  = re.search(r'<link[^>]+href="([^"]+)"', entry)
        if not title or not link:
            continue
        url = link.group(1)
        # Only scam-relevant titles
        if not is_scam_related(title.group(1)):
            continue
        posts.append({"url": url, "title": title.group(1).strip()})

    return posts[:POST_LIMIT]

# ── Crawl individual post page (post + all comments) ──────────────────────────

async def crawl_post(crawler: AsyncWebCrawler, post: dict) -> dict | None:
    """
    Crawl a full Reddit post page including comments.
    Returns signal dict or None if no entities found.
    """
    url = post["url"]
    # Use old.reddit.com — cleaner HTML, less JS, easier to parse
    old_url = url.replace("www.reddit.com", "old.reddit.com")

    try:
        result = await crawler.arun(
            url=old_url,
            config=CrawlerRunConfig(
                cache_mode=CacheMode.BYPASS,
                page_timeout=20000,
                delay_before_return_html=1.5,
                # Target comment area specifically
                css_selector=".thing, .comment, .entry, .usertext-body, .title",
            )
        )
        if not result.success:
            return None

        content = get_markdown(result)
        if not content or len(content) < 50:
            return None

        phones = extract_phones(content)
        upis   = extract_upis(content)

        if not phones and not upis:
            return None

        return {
            "title": post["title"],
            "content": content[:5000],
            "source_url": url,  # canonical reddit.com URL
            "phones": phones,
            "upis": upis,
        }

    except Exception as e:
        print(f"    crawl error: {e}")
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
            "source_type": "reddit",
            "source_url": signal["source_url"],
            "title": signal["title"][:500],
            "content": signal["content"],
            "author": None,
            "author_score": 0,
            "captured_at": datetime.now(timezone.utc).isoformat(),
            "status": "unprocessed",
        }).execute()
        return True
    except Exception as e:
        print(f"    store failed: {e}")
        return False

# ── Entry point ────────────────────────────────────────────────────────────────

async def main():
    print(f"ScamDB Reddit Deep Crawler — {'DRY RUN' if DRY_RUN else 'LIVE'}")
    print(f"Sort: {SORT}/{TIME} | Limit: {POST_LIMIT}/subreddit\n")

    db = None if DRY_RUN else create_client(SUPABASE_URL, SUPABASE_KEY)

    total_inserted = 0
    total_skipped  = 0

    async with AsyncWebCrawler(verbose=False) as crawler:
        for subreddit in TARGET_SUBREDDITS:
            print(f"[r/{subreddit}]")

            posts = await get_post_urls(subreddit)
            print(f"  {len(posts)} scam-related posts from RSS")

            if not posts:
                continue

            with_entities = 0

            for i, post in enumerate(posts, 1):
                print(f"  [{i}/{len(posts)}] {post['title'][:60]}", end=" ... ", flush=True)

                signal = await crawl_post(crawler, post)

                if not signal:
                    print("no entities")
                    continue

                phones_str = ", ".join(signal["phones"]) if signal["phones"] else ""
                upis_str   = ", ".join(signal["upis"]) if signal["upis"] else ""
                found = []
                if phones_str: found.append(f"📞 {phones_str}")
                if upis_str:   found.append(f"💳 {upis_str}")
                print(" | ".join(found))
                with_entities += 1

                if DRY_RUN:
                    continue

                if already_stored(db, signal["source_url"]):
                    total_skipped += 1
                    continue

                if store_signal(db, signal):
                    total_inserted += 1

                await asyncio.sleep(0.5)  # polite delay

            print(f"  → {with_entities}/{len(posts)} posts had phone/UPI entities\n")
            await asyncio.sleep(2)

    if not DRY_RUN:
        print(f"Total: {total_inserted} stored, {total_skipped} duplicate")
        print("Trigger /api/cron/process to extract entities and queue for moderation.")

if __name__ == "__main__":
    asyncio.run(main())
