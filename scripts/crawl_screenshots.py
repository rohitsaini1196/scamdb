"""
Screenshot OCR crawler for ScamDB India.

The single highest-yield source. Most r/indianscammers and IndianScamBusters
posts are SCREENSHOTS of WhatsApp/SMS/UPI scam conversations — the scammer's
phone number and UPI ID live in the image, not the post text. Text-only
crawling skips ~83% of these posts as 'no_entities'.

This crawler:
  1. Lists scam-subreddit posts. Two paths, auto-selected:
       - Reddit OAuth JSON API when REDDIT_CLIENT_ID/SECRET are set (fast, gets
         every gallery image from media_metadata/preview).
       - RSS + crawl4ai fallback when no creds (RSS enumerates posts, crawl4ai
         reads each post page's og:image). Needs no Reddit credentials.
  2. For each post, collects attached image URLs (i.redd.it, preview.redd.it, imgur)
  3. Sends each image to a vision model (Haiku / gpt-4o-mini) to extract
     phone numbers + UPI IDs.
  4. Stores a raw_signal whose content embeds the extracted identifiers
     (so the existing /api/cron/process regex picks them up) and records the
     image URL in screenshot_urls for moderator review.

Usage:
  ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
    python scripts/crawl_screenshots.py
  python scripts/crawl_screenshots.py --dry-run --limit=10
"""

import asyncio
import base64
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from datetime import datetime, timezone

from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode
from supabase import create_client, Client

# Shared OCR + storage helpers (single source of truth, also used by crawl_archive.py)
from _ocr import (
    VISION_PROVIDER, ANTHROPIC_MODEL, OPENAI_MODEL, UA, IMG_HOSTS,
    PHONE_RE, UPI_RE, normalize_phone, preview_to_fullres,
    ocr_image, already_stored, store_signal,
)

# ── Config ─────────────────────────────────────────────────────────────────────

DRY_RUN = "--dry-run" in sys.argv
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

limit_arg = next((a for a in sys.argv if a.startswith("--limit=")), None)
POST_LIMIT = int(limit_arg.split("=")[1]) if limit_arg else 30
sub_arg = next((a for a in sys.argv if a.startswith("--sub=")), None)
SORT = next((a.split("=")[1] for a in sys.argv if a.startswith("--sort=")), "new")
TIME = next((a.split("=")[1] for a in sys.argv if a.startswith("--time=")), "month")

if not VISION_PROVIDER:
    print("Skipping screenshot OCR — no ANTHROPIC_API_KEY / OPENAI_API_KEY set.")
    sys.exit(0)
# Reddit creds are OPTIONAL — without them the crawler uses the RSS + crawl4ai path.
if not DRY_RUN and (not SUPABASE_URL or not SUPABASE_KEY):
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for live run.")
    sys.exit(1)

SUBREDDITS = [sub_arg.split("=")[1]] if sub_arg else ["indianscammers", "IndianScamBusters"]

_REDDIT_TOKEN: str | None = None

def reddit_token() -> str | None:
    """App-only OAuth token. Required — Reddit 403s anonymous JSON + serves HTML to browsers."""
    global _REDDIT_TOKEN
    if _REDDIT_TOKEN:
        return _REDDIT_TOKEN
    cid = os.environ.get("REDDIT_CLIENT_ID")
    csec = os.environ.get("REDDIT_CLIENT_SECRET")
    if not cid or not csec:
        return None
    creds = base64.standard_b64encode(f"{cid}:{csec}".encode()).decode()
    req = urllib.request.Request(
        "https://www.reddit.com/api/v1/access_token",
        data=b"grant_type=client_credentials",
        headers={"Authorization": f"Basic {creds}", "User-Agent": UA,
                 "Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            _REDDIT_TOKEN = json.loads(r.read().decode())["access_token"]
        return _REDDIT_TOKEN
    except Exception as e:
        print(f"  reddit oauth failed: {e}")
        return None

def fetch_json(url: str):
    token = reddit_token()
    if token:
        api = url.replace("https://www.reddit.com", "https://oauth.reddit.com")
        req = urllib.request.Request(api, headers={"Authorization": f"bearer {token}", "User-Agent": UA})
    else:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as e:
        print(f"  fetch {e.code} (Reddit OAuth needed — set REDDIT_CLIENT_ID/SECRET)")
        return None
    except Exception as e:
        print(f"  fetch error: {e}")
        return None

async def list_posts(crawler: AsyncWebCrawler, subreddit: str) -> list[dict]:
    """Posts with image URLs. OAuth JSON path if creds present, else RSS+crawl4ai."""
    if reddit_token():
        return list_posts_oauth(subreddit)
    return await list_posts_rss(crawler, subreddit)


def list_posts_oauth(subreddit: str) -> list[dict]:
    """OAuth path — JSON listing carries every image URL (gallery/preview)."""
    url = f"https://www.reddit.com/r/{subreddit}/{SORT}.json?limit={min(POST_LIMIT,100)}&t={TIME}"
    data = fetch_json(url)
    if not data:
        return []

    posts = []
    for child in data.get("data", {}).get("children", []):
        d = child.get("data", {})
        images = collect_images(d)
        if not images:
            continue
        posts.append({
            "id": d.get("id"),
            "title": d.get("title", ""),
            "selftext": d.get("selftext", ""),
            "permalink": "https://reddit.com" + d.get("permalink", ""),
            "created_utc": d.get("created_utc", 0),
            "images": images,
        })
    return posts[:POST_LIMIT]


# RSS enumeration (no auth) + per-post og:image extraction via crawl4ai.
RSS_ENTRY_RE  = re.compile(r'<entry>([\s\S]*?)</entry>')
RSS_TITLE_RE  = re.compile(r'<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>', re.DOTALL)
RSS_LINK_RE   = re.compile(r'<link[^>]+href="([^"]+)"')
RSS_UPD_RE    = re.compile(r'<updated>(.*?)</updated>')
OG_IMAGE_RE   = re.compile(r'<meta[^>]+property="og:image"[^>]+content="([^"]+)"', re.IGNORECASE)
OG_IMAGE_RE2  = re.compile(r'<meta[^>]+content="([^"]+)"[^>]+property="og:image"', re.IGNORECASE)
# Reddit default / non-content og:images to ignore
DEFAULT_IMG_RE = re.compile(r'(redditstatic|redditmedia\.com/.+/award|/avatar|snoo|default)', re.IGNORECASE)


def fetch_rss(subreddit: str) -> str:
    # Reddit RSS only serves new/hot/rising — top.rss returns an empty feed.
    rss_sort = SORT if SORT in ("new", "hot", "rising") else "new"
    url = f"https://www.reddit.com/r/{subreddit}/{rss_sort}.rss?limit={min(POST_LIMIT,100)}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"  RSS fetch error: {e}")
        return ""


FULLRES_RE = re.compile(r'https://i\.redd\.it/[A-Za-z0-9]+\.(?:jpg|jpeg|png|webp)', re.IGNORECASE)

async def post_image(crawler: AsyncWebCrawler, permalink: str) -> str | None:
    """Read a post page and return the FULL-RES screenshot URL (not og:image preview)."""
    old_url = permalink.replace("www.reddit.com", "old.reddit.com").replace("https://reddit.com", "https://old.reddit.com")
    try:
        result = await crawler.arun(
            url=old_url,
            config=CrawlerRunConfig(cache_mode=CacheMode.BYPASS, page_timeout=20000, delay_before_return_html=0.8),
        )
        html = result.html or ""
    except Exception:
        return None

    # Prefer a direct full-res i.redd.it link (the post's actual image, OCR-readable).
    full = FULLRES_RE.search(html)
    if full:
        url = full.group(0)
    else:
        # Fall back to og:image, upgraded from preview → full res.
        m = OG_IMAGE_RE.search(html) or OG_IMAGE_RE2.search(html)
        if not m:
            return None
        url = preview_to_fullres(m.group(1).replace("&amp;", "&"))

    if DEFAULT_IMG_RE.search(url):
        return None
    if not any(h in url for h in IMG_HOSTS):
        return None
    return url


async def list_posts_rss(crawler: AsyncWebCrawler, subreddit: str) -> list[dict]:
    xml = fetch_rss(subreddit)
    if not xml:
        return []

    posts = []
    for entry in RSS_ENTRY_RE.findall(xml)[:POST_LIMIT]:
        title_m = RSS_TITLE_RE.search(entry)
        link_m  = RSS_LINK_RE.search(entry)
        if not title_m or not link_m:
            continue
        permalink = link_m.group(1)
        upd_m = RSS_UPD_RE.search(entry)
        created = 0
        if upd_m:
            try:
                created = int(datetime.fromisoformat(upd_m.group(1).replace("Z", "+00:00")).timestamp())
            except Exception:
                created = 0

        image = await post_image(crawler, permalink)
        await asyncio.sleep(0.4)  # polite pacing between post-page fetches
        if not image:
            continue
        posts.append({
            "id": permalink.rstrip("/").split("/")[-1],
            "title": title_m.group(1).strip(),
            "selftext": "",
            "permalink": permalink.replace("old.reddit.com", "www.reddit.com"),
            "created_utc": created,
            "images": [image],
        })
    return posts

def collect_images(post_data: dict) -> list[str]:
    """Extract image URLs from a Reddit post's JSON (direct + gallery + preview)."""
    urls = []

    # Direct link post to an image host
    u = post_data.get("url_overridden_by_dest") or post_data.get("url", "")
    if any(h in u for h in IMG_HOSTS) and re.search(r'\.(jpg|jpeg|png|webp)(\?|$)', u, re.I):
        urls.append(u)

    # Reddit-hosted preview
    prev = post_data.get("preview", {}).get("images", [])
    for p in prev:
        src = p.get("source", {}).get("url", "")
        if src:
            urls.append(src.replace("&amp;", "&"))

    # Gallery
    media = post_data.get("media_metadata", {})
    for _, meta in (media or {}).items():
        s = meta.get("s", {})
        src = s.get("u") or s.get("gif")
        if src:
            urls.append(src.replace("&amp;", "&"))

    # Dedup, cap at 4 images/post (cost control)
    seen, out = set(), []
    for x in urls:
        if x not in seen:
            seen.add(x); out.append(x)
    return out[:4]

# ── Main ───────────────────────────────────────────────────────────────────────

async def main():
    model = ANTHROPIC_MODEL if VISION_PROVIDER == "anthropic" else OPENAI_MODEL
    auth = "OAuth" if reddit_token() else "RSS + crawl4ai"
    print(f"ScamDB Screenshot OCR Crawler — {'DRY RUN' if DRY_RUN else 'LIVE'}")
    print(f"Vision: {VISION_PROVIDER}/{model} | Sort: {SORT}/{TIME} | Limit: {POST_LIMIT}/sub")
    print(f"Reddit access: {auth}\n")

    db = None if DRY_RUN else create_client(SUPABASE_URL, SUPABASE_KEY)
    total_inserted = total_skipped = images_ocrd = entities_found = 0

    async with AsyncWebCrawler(verbose=False) as crawler:
        for sub in SUBREDDITS:
            print(f"[r/{sub}]")
            posts = await list_posts(crawler, sub)
            print(f"  {len(posts)} posts with images")

            for i, post in enumerate(posts, 1):
                if not DRY_RUN and already_stored(db, post["permalink"]):
                    total_skipped += 1
                    continue

                for image_url in post["images"]:
                    ocr = ocr_image(image_url)
                    images_ocrd += 1
                    time.sleep(0.5)  # pace vision calls
                    if not ocr or not ocr["is_scam"]:
                        continue
                    entities_found += 1
                    found = []
                    if ocr["phones"]: found.append("📞 " + ", ".join(ocr["phones"]))
                    if ocr["upis"]:   found.append("💳 " + ", ".join(ocr["upis"]))
                    print(f"  [{i}/{len(posts)}] {post['title'][:45]} → {' | '.join(found)}")

                    if DRY_RUN:
                        break  # one image per post in dry-run preview
                    if store_signal(db, post, ocr, image_url):
                        total_inserted += 1
                    break  # first image with entities is enough per post
            print()

    print(f"Images OCR'd: {images_ocrd} | with entities: {entities_found}")
    if not DRY_RUN:
        print(f"Stored: {total_inserted} | duplicate: {total_skipped}")
        print("Trigger /api/cron/process to extract entities → moderation queue.")

if __name__ == "__main__":
    asyncio.run(main())
