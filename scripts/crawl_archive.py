"""
Arctic-Shift historical archive crawler for ScamDB India — the bulk engine.

Live Reddit blocks automated access (403 anonymous JSON, datacenter-IP rate
limits, RSS only serves new/hot). Arctic-Shift (Pushshift successor) archives
the FULL Reddit history and serves it with no auth, no rate limits, and direct
i.redd.it full-res image URLs. One paginated sweep of r/indianscammers etc.
pulls thousands of historical scam-screenshot posts → OCR → entities.

Flow:
  1. Page through arctic-shift /api/posts/search by descending created_utc.
  2. Keep posts that carry an image (direct i.redd.it, gallery, or preview).
  3. OCR each image (shared _ocr.ocr_image), store raw_signal with the
     extracted IDs embedded in content + screenshot_urls recorded.
  4. /api/cron/process re-extracts the IDs → reports → moderation queue.

Usage:
  OPENAI_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
    python scripts/crawl_archive.py --max=800
  python scripts/crawl_archive.py --dry-run --max=30 --sub=indianscammers
"""

import json
import os
import re
import sys
import time
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timezone

from supabase import create_client, Client

from _ocr import (
    VISION_PROVIDER, ANTHROPIC_MODEL, OPENAI_MODEL, UA, IMG_HOSTS,
    preview_to_fullres, ocr_image, already_ocrd, store_signal, mark_ocr_attempted,
)

# ── Config ─────────────────────────────────────────────────────────────────────

DRY_RUN = "--dry-run" in sys.argv
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

max_arg   = next((a for a in sys.argv if a.startswith("--max=")), None)
sub_arg   = next((a for a in sys.argv if a.startswith("--sub=")), None)
since_arg = next((a for a in sys.argv if a.startswith("--since=")), None)

MAX_POSTS = int(max_arg.split("=")[1]) if max_arg else 800   # image-candidate posts per sub
SUBREDDITS = [sub_arg.split("=")[1]] if sub_arg else [
    "indianscammers",        # pure scam sub (small archive ~67) — no filter
    "Scams", "scambait",     # huge global subs — India + scam filter
    "india", "personalfinanceindia", "legaladviceindia",  # Indian general — scam filter
    "IndiaInvestments", "bangalore", "mumbai",             # Indian general — scam filter
]

# Seconds between vision calls. gpt-4o-mini TPM=200K; screenshots are token-heavy,
# so pace ~1 call/1.2s. Anthropic Haiku has higher limits — speed up if using it.
pace_arg = next((a for a in sys.argv if a.startswith("--pace=")), None)
PACE = float(pace_arg.split("=")[1]) if pace_arg else (0.5 if os.environ.get("ANTHROPIC_API_KEY") else 1.2)

SINCE_EPOCH = 0
if since_arg:
    SINCE_EPOCH = int(datetime.strptime(since_arg.split("=")[1], "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp())

if not VISION_PROVIDER:
    print("Skipping archive OCR — no ANTHROPIC_API_KEY / OPENAI_API_KEY set.")
    sys.exit(0)
if not DRY_RUN and (not SUPABASE_URL or not SUPABASE_KEY):
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for live run.")
    sys.exit(1)

ARCTIC = "https://arctic-shift.photon-reddit.com/api/posts/search"
PAGE = 100  # arctic-shift max page size

# Pure scam subs need no filter (every image is a scam report).
PURE_SUBS = {"indianscammers", "indianscambusters"}
# Global subs need an India filter — they're not India-specific.
GLOBAL_SUBS = {"scams", "scambait"}
INDIA_RE = re.compile(r'(india|indian|\+91|\b91\d{10}\b|₹|rupee|\brs\.?\b|upi|paytm|phonepe|gpay|aadhaar|kyc)', re.IGNORECASE)
# General Indian subs need a scam filter — only OCR likely-scam image posts.
SCAM_RE = re.compile(r'(scam|fraud|cheat|cheated|duped|fake|phishing|otp|upi fraud|loan app|'
                     r'lottery|impersonat|spam|suspicious|scammer|blackmail|sextortion|'
                     r'fake call|customs|courier|digital arrest|kyc fraud)', re.IGNORECASE)

# ── Arctic-Shift fetch ──────────────────────────────────────────────────────────

def fetch_page(subreddit: str, before: int | None) -> list[dict]:
    params = {"subreddit": subreddit, "limit": str(PAGE), "sort": "desc"}
    if before:
        params["before"] = str(before)
    url = f"{ARCTIC}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.loads(r.read().decode("utf-8", errors="replace"))
            return data.get("data", []) if isinstance(data, dict) else (data or [])
        except urllib.error.HTTPError as e:
            if e.code == 429:
                print("  rate limited, sleeping 20s"); time.sleep(20); continue
            print(f"  arctic-shift {e.code}"); return []
        except Exception as e:
            print(f"  fetch error: {e}"); time.sleep(3)
    return []

def post_image_url(post: dict) -> str | None:
    """Extract a full-res image URL from an arctic-shift post record, or None."""
    url = post.get("url") or post.get("url_overridden_by_dest") or ""

    # Direct image link
    if any(h in url for h in IMG_HOSTS) and re.search(r'\.(jpg|jpeg|png|webp)(\?|$)', url, re.I):
        return preview_to_fullres(url)

    # Gallery → first image from media_metadata
    if "/gallery/" in url or post.get("is_gallery"):
        media = post.get("media_metadata") or {}
        for _, meta in media.items():
            s = (meta or {}).get("s", {})
            src = s.get("u") or s.get("gif")
            if src:
                return preview_to_fullres(src.replace("&amp;", "&"))

    # Reddit preview source (image posts that aren't direct links)
    prev = (post.get("preview") or {}).get("images", [])
    for p in prev:
        src = (p.get("source") or {}).get("url", "")
        if src:
            return preview_to_fullres(src.replace("&amp;", "&"))

    return None

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    model = ANTHROPIC_MODEL if VISION_PROVIDER == "anthropic" else OPENAI_MODEL
    print(f"ScamDB Archive Crawler (arctic-shift) — {'DRY RUN' if DRY_RUN else 'LIVE'}")
    print(f"Vision: {VISION_PROVIDER}/{model} | Max: {MAX_POSTS} img-posts/sub | Subs: {', '.join(SUBREDDITS)}\n")

    db = None if DRY_RUN else create_client(SUPABASE_URL, SUPABASE_KEY)
    g_inserted = g_skipped = g_ocrd = g_hits = 0

    def crawl_sub(sub: str):
        """Crawl one subreddit. Returns (candidates, hits, inserted). Never raises on a bad post/page."""
        nonlocal g_inserted, g_skipped, g_ocrd, g_hits
        low = sub.lower()
        is_pure = low in PURE_SUBS        # no filter — every image is a scam report
        is_global = low in GLOBAL_SUBS    # needs India filter
        before: int | None = None
        candidates = sub_inserted = sub_hits = 0

        while candidates < MAX_POSTS:
            try:
                posts = fetch_page(sub, before)
            except Exception as e:
                print(f"  fetch_page error (stopping sub): {e}")
                break
            if not posts:
                break

            # Advance pagination cursor (guard against missing/garbage created_utc)
            cu = [int(p.get("created_utc", 0)) for p in posts if str(p.get("created_utc", "")).strip().isdigit()]
            if not cu:
                break
            before = min(cu) - 1

            for post in posts:
                try:
                    created = int(post.get("created_utc", 0)) if str(post.get("created_utc", "")).strip().isdigit() else 0
                    if SINCE_EPOCH and created and created < SINCE_EPOCH:
                        candidates = MAX_POSTS  # past the window; stop this sub
                        break

                    img = post_image_url(post)
                    if not img:
                        continue

                    # Relevance filters (title+selftext)
                    blob = f"{post.get('title','')} {post.get('selftext','')}"
                    if is_global and not (INDIA_RE.search(blob) and SCAM_RE.search(blob)):
                        continue
                    if not is_pure and not is_global and not SCAM_RE.search(blob):
                        continue  # general Indian sub → require scam keyword

                    candidates += 1
                    if candidates > MAX_POSTS:
                        break

                    permalink = "https://reddit.com" + post.get("permalink", "")
                    # Skip only if ALREADY OCR'd — a text-only signal for this post must still be OCR'd.
                    if not DRY_RUN and already_ocrd(db, permalink):
                        g_skipped += 1
                        continue

                    ocr = ocr_image(img)
                    g_ocrd += 1
                    time.sleep(PACE)  # pace vision calls (avoid TPM 429 on large images)
                    if not ocr or not ocr["is_scam"]:
                        # Record the attempt so future cron runs skip this dead image.
                        if not DRY_RUN:
                            mark_ocr_attempted(db, permalink, img)
                        continue

                    g_hits += 1; sub_hits += 1
                    found = []
                    if ocr["phones"]: found.append("📞 " + ", ".join(ocr["phones"]))
                    if ocr["upis"]:   found.append("💳 " + ", ".join(ocr["upis"]))
                    print(f"  [{candidates}] {post.get('title','')[:45]} → {' | '.join(found)}")

                    if DRY_RUN:
                        continue
                    rec = {"title": post.get("title", ""), "selftext": post.get("selftext", ""),
                           "permalink": permalink, "created_utc": created}
                    if store_signal(db, rec, ocr, img):
                        g_inserted += 1; sub_inserted += 1
                except Exception as e:
                    # One bad post must never kill the run — log and continue.
                    print(f"    post error (skipped): {e}")
                    continue

            if SINCE_EPOCH and before and before < SINCE_EPOCH:
                break

        return candidates, sub_hits, sub_inserted

    for sub in SUBREDDITS:
        print(f"[r/{sub}]")
        try:
            candidates, sub_hits, sub_inserted = crawl_sub(sub)
            print(f"  → {candidates} image posts scanned, {sub_hits} with entities, {sub_inserted} stored\n")
        except Exception as e:
            print(f"  [r/{sub}] sub-level error (skipped): {e}\n")
            continue

    print(f"Total: OCR'd {g_ocrd} | entities {g_hits} | stored {g_inserted} | dup {g_skipped}")
    if not DRY_RUN:
        print("Trigger /api/cron/process to extract entities → moderation queue.")

if __name__ == "__main__":
    main()
