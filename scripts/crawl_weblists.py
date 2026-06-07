"""
Web fraud-list crawler for ScamDB India.

Pulls reported Indian scam phone numbers from public aggregator pages
(cyberdecode-style lists, etc.). These give volume + a non-Reddit source, but
carry NO per-number context — so they're stored at LOW confidence and flow
through moderation like everything else. Pure HTTP (no browser, no API key).

Each number gets a unique source_url (page#number) so dedup works per-number.

Usage:
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python scripts/crawl_weblists.py
  python scripts/crawl_weblists.py --dry-run --max=50
"""

import os
import re
import sys
import time
import urllib.request
from datetime import datetime, timezone

from supabase import create_client, Client

from _ocr import UA, PHONE_RE, UPI_RE, normalize_phone, already_stored

# ── Config ─────────────────────────────────────────────────────────────────────

DRY_RUN = "--dry-run" in sys.argv
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

max_arg = next((a for a in sys.argv if a.startswith("--max=")), None)
MAX_TOTAL = int(max_arg.split("=")[1]) if max_arg else 150

if not DRY_RUN and (not SUPABASE_URL or not SUPABASE_KEY):
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for live run.")
    sys.exit(1)

# Aggregator pages. Add more here (one dict per page).
SOURCES = [
    {
        "name": "CyberDecode fraud list",
        "url": "https://www.cyberdecode.in/list-of-fraud-scammers-mobile-numbers-in-india/",
    },
]

DESCRIPTION = ("Listed on a public fraud-number aggregator as a reported scam "
               "number originating in India. No individual case details available — "
               "treat as an unverified community signal.")

# ── Quality filter ──────────────────────────────────────────────────────────────

def is_junk(num: str) -> bool:
    """Reject obviously fake/placeholder 10-digit numbers."""
    if len(set(num)) <= 2:               # 9999999999, 9898989898
        return True
    if num in ("1234567890", "0123456789", "9876543210", "1111111111"):
        return True
    # 6+ identical consecutive digits
    if re.search(r'(\d)\1{5,}', num):
        return True
    return False

# ── Fetch + extract ─────────────────────────────────────────────────────────────

def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=25) as r:
                return r.read().decode("utf-8", errors="replace")
        except Exception as e:
            print(f"  fetch error ({attempt+1}/3): {e}")
            time.sleep(3)
    return ""

def extract_numbers(html: str) -> list[str]:
    # Strip tags so we match the visible text, not href/asset digits
    text = re.sub(r'<(script|style)[\s\S]*?</\1>', ' ', html, flags=re.IGNORECASE)
    text = re.sub(r'<[^>]+>', ' ', text)
    out, seen = [], set()
    for m in PHONE_RE.finditer(text):
        n = normalize_phone(m.group(1) or m.group(0))
        if len(n) == 10 and n[0] in "6789" and not is_junk(n) and n not in seen:
            seen.add(n)
            out.append(n)
    return out

# ── Storage ─────────────────────────────────────────────────────────────────────

def store(db: Client, number: str, page_url: str) -> bool:
    try:
        db.table("raw_signals").insert({
            "source_type": "other",
            "source_url": f"{page_url}#{number}",   # unique per number → dedup works
            "title": None,
            "content": f"{number} {DESCRIPTION}",
            "author": None,
            "author_score": 3,                      # → low confidence in process route
            "captured_at": datetime.now(timezone.utc).isoformat(),
            "status": "unprocessed",
        }).execute()
        return True
    except Exception as e:
        print(f"    store failed: {e}")
        return False

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print(f"ScamDB Web-List Crawler — {'DRY RUN' if DRY_RUN else 'LIVE'} | cap {MAX_TOTAL}\n")
    db = None if DRY_RUN else create_client(SUPABASE_URL, SUPABASE_KEY)
    inserted = skipped = 0

    for src in SOURCES:
        print(f"[{src['name']}]")
        html = fetch(src["url"])
        if not html:
            print("  ✗ could not fetch\n")
            continue
        numbers = extract_numbers(html)
        print(f"  {len(numbers)} valid numbers found")

        for n in numbers:
            if inserted >= MAX_TOTAL:
                break
            src_url = f"{src['url']}#{n}"
            if DRY_RUN:
                print(f"  📞 {n}")
                inserted += 1
                continue
            if already_stored(db, src_url):
                skipped += 1
                continue
            if store(db, n, src["url"]):
                inserted += 1
        print()
        if inserted >= MAX_TOTAL:
            break

    print(f"Total: {inserted} stored, {skipped} duplicate")
    if not DRY_RUN:
        print("Trigger /api/cron/process to extract entities → moderation queue (low confidence).")

if __name__ == "__main__":
    main()
