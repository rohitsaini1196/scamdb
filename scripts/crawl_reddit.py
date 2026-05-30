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
TARGET_SUBREDDITS = [
    "indianscammers",       # primary — Indian scam numbers
    "IndianScamBusters",    # secondary
    "Scams",                # large (2M+), filter for Indian posts
    "scambait",             # scambaiters often post Indian numbers
]

# Reddit search queries — finds Indian scam number posts across ALL subreddits
# Use old.reddit.com/search for unauthenticated access
SEARCH_QUERIES = [
    "india scam number +91",
    "indian scammer phone number",
    "upi fraud india number",
    "india cyber fraud phone",
    "scam call india 9",
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

# ── Fetch post listing via old.reddit.com — paginated ─────────────────────────

# Link pattern for old.reddit post links in listing pages
POST_LINK_RE = re.compile(
    r'href="(https://old\.reddit\.com/r/[^/]+/comments/[^"]+)"',
    re.IGNORECASE
)
TITLE_RE = re.compile(r'<a[^>]+class="[^"]*title[^"]*"[^>]*>([^<]+)</a>')
AFTER_RE  = re.compile(r'<span[^>]*>\[<a[^>]+href="[^?]+\?(?:[^"]*&)?after=([^&"]+)[^"]*"[^>]*>next</a>\]</span>')

async def get_post_urls(crawler: AsyncWebCrawler, subreddit: str) -> list[dict]:
    """
    Paginate through old.reddit.com listing to collect up to POST_LIMIT posts.
    Falls back to RSS if listing fetch fails.
    """
    posts: list[dict] = []
    seen_urls: set[str] = set()
    after: str | None = None
    pages_fetched = 0
    max_pages = max(1, POST_LIMIT // 25)  # 25 posts/page

    while len(posts) < POST_LIMIT and pages_fetched < max_pages:
        url = f"https://old.reddit.com/r/{subreddit}/{SORT}/?t={TIME}"
        if after:
            url += f"&after={after}"

        try:
            result = await crawler.arun(
                url=url,
                config=CrawlerRunConfig(
                    cache_mode=CacheMode.BYPASS,
                    page_timeout=20000,
                    delay_before_return_html=1.0,
                )
            )
            html = result.html or ""
        except Exception as e:
            print(f"  ✗ Listing page error: {e}")
            break

        if not html or "blocked" in html.lower()[:500]:
            break

        # Extract post links + titles from listing HTML
        links  = POST_LINK_RE.findall(html)
        titles = TITLE_RE.findall(html)

        for i, link in enumerate(links):
            if link in seen_urls or len(posts) >= POST_LIMIT:
                continue
            # Canonical reddit.com URL for storage dedup
            canon = link.replace("old.reddit.com", "www.reddit.com")
            title = titles[i] if i < len(titles) else ""
            seen_urls.add(link)
            posts.append({"url": canon, "old_url": link, "title": title.strip()})

        # Check for next page
        after_match = AFTER_RE.search(html)
        after = after_match.group(1) if after_match else None
        pages_fetched += 1

        if not after:
            break

        await asyncio.sleep(1)

    # Fallback to RSS if listing returned nothing (rate limited etc.)
    if not posts:
        posts = await _get_post_urls_rss(subreddit)

    print(f"  {len(posts)} posts from listing ({pages_fetched} page(s))")
    return posts

async def _get_post_urls_rss(subreddit: str) -> list[dict]:
    """RSS fallback — max 25 posts, no pagination."""
    import urllib.request
    rss_url = f"https://www.reddit.com/r/{subreddit}/{SORT}.rss?limit=25&t={TIME}"
    try:
        req = urllib.request.Request(rss_url, headers={"User-Agent": "ScamDB-India-Bot/1.0"})
        xml = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", errors="replace")
    except Exception:
        return []
    posts = []
    for entry in re.findall(r'<entry>([\s\S]*?)</entry>', xml):
        title = re.search(r'<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>', entry)
        link  = re.search(r'<link[^>]+href="([^"]+)"', entry)
        if title and link:
            posts.append({"url": link.group(1), "old_url": link.group(1).replace("www.", "old."), "title": title.group(1).strip()})
    return posts

# ── Crawl individual post page (post + all comments) ──────────────────────────

async def crawl_post(crawler: AsyncWebCrawler, post: dict) -> dict | None:
    """
    Crawl a full Reddit post page including comments.
    Returns signal dict or None if no entities found.
    """
    url = post["url"]
    old_url = post.get("old_url") or url.replace("www.reddit.com", "old.reddit.com")

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

async def search_reddit(crawler: AsyncWebCrawler, query: str) -> list[dict]:
    """Search Reddit across all subreddits for posts with Indian scam numbers."""
    import urllib.parse
    url = f"https://old.reddit.com/search?q={urllib.parse.quote(query)}&sort=new&t=year&type=link"

    try:
        result = await crawler.arun(
            url=url,
            config=CrawlerRunConfig(
                cache_mode=CacheMode.BYPASS,
                page_timeout=20000,
                delay_before_return_html=1.5,
            )
        )
        html = result.html or ""
    except Exception:
        return []

    links  = POST_LINK_RE.findall(html)
    titles = TITLE_RE.findall(html)

    posts = []
    seen: set[str] = set()
    for i, link in enumerate(links):
        if link in seen:
            continue
        seen.add(link)
        canon = link.replace("old.reddit.com", "www.reddit.com")
        title = titles[i] if i < len(titles) else ""
        posts.append({"url": canon, "old_url": link, "title": title.strip()})

    return posts[:25]  # max 25 per query


async def main():
    print(f"ScamDB Reddit Deep Crawler — {'DRY RUN' if DRY_RUN else 'LIVE'}")
    print(f"Sort: {SORT}/{TIME} | Limit: {POST_LIMIT}/subreddit\n")

    db = None if DRY_RUN else create_client(SUPABASE_URL, SUPABASE_KEY)

    total_inserted = 0
    total_skipped  = 0

    all_posts: list[dict] = []
    seen_post_urls: set[str] = set()

    async with AsyncWebCrawler(verbose=False) as crawler:
        # Phase 1: subreddit listings
        for subreddit in TARGET_SUBREDDITS:
            print(f"[r/{subreddit}]")
            posts = await get_post_urls(crawler, subreddit)
            for p in posts:
                if p["url"] not in seen_post_urls:
                    seen_post_urls.add(p["url"])
                    all_posts.append(p)
            await asyncio.sleep(1)

        # Phase 2: Reddit-wide search for Indian scam numbers
        print("[Reddit Search — cross-subreddit]")
        for query in SEARCH_QUERIES:
            print(f"  Searching: {query!r}")
            posts = await search_reddit(crawler, query)
            new_count = 0
            for p in posts:
                if p["url"] not in seen_post_urls:
                    seen_post_urls.add(p["url"])
                    all_posts.append(p)
                    new_count += 1
            print(f"  → {new_count} new posts")
            await asyncio.sleep(1)

        print(f"\nTotal unique posts to crawl: {len(all_posts)}\n")

        # Phase 3: deep crawl each post
        with_entities = 0
        for i, post in enumerate(all_posts, 1):
            print(f"  [{i}/{len(all_posts)}] {post['title'][:55]}", end=" ... ", flush=True)

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

            await asyncio.sleep(0.4)

        print(f"\n→ {with_entities}/{len(all_posts)} posts had phone/UPI entities")

    if not DRY_RUN:
        print(f"Total: {total_inserted} stored, {total_skipped} duplicate")
        print("Trigger /api/cron/process to extract entities.")

if __name__ == "__main__":
    asyncio.run(main())
