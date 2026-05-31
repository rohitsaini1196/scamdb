"""
Twitter / X API v2 crawler for ScamDB India.

Replaces the fragile Nitter-based crawl_x.py. Uses the official X API v2
recent-search endpoint with a Bearer Token (free tier: ~500K tweets/month read).

Highest-trust source: official government cyber-safety accounts (@CyberDost,
@Cyberdost_MHA) publish fraud alerts that include the actual scammer phone
numbers and UPI IDs. Those are auto-approved downstream (author_score >= 50,
source_type='twitter' → trusted in /api/cron/process).

Usage:
  TWITTER_BEARER_TOKEN=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
    python scripts/crawl_twitter.py
  python scripts/crawl_twitter.py --dry-run
  python scripts/crawl_twitter.py --max=100
"""

import os
import re
import sys
import time
import json
import urllib.request
import urllib.parse
from datetime import datetime, timezone

from supabase import create_client, Client

# ── Config ─────────────────────────────────────────────────────────────────────

DRY_RUN = "--dry-run" in sys.argv
BEARER = os.environ.get("TWITTER_BEARER_TOKEN", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

max_arg = next((a for a in sys.argv if a.startswith("--max=")), None)
MAX_PER_QUERY = int(max_arg.split("=")[1]) if max_arg else 50  # tweets per query

if not BEARER:
    print("Skipping Twitter crawl — TWITTER_BEARER_TOKEN not set.")
    sys.exit(0)
if not DRY_RUN and (not SUPABASE_URL or not SUPABASE_KEY):
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for live run.")
    sys.exit(1)

# Official government / high-trust accounts → author_score=80 (auto-approve)
# Their advisories carry actual scammer numbers and are authoritative.
GOVT_ACCOUNTS = ["CyberDost", "Cyberdost_MHA", "IndianCERT", "DelhiPolice", "MumbaiPolice"]

# Search queries. X recent-search operators: https://developer.x.com/en/docs/twitter-api/tweets/search
# Each entry: (query, author_score). score>=50 = trusted (auto-approve path).
QUERIES = [
    ("from:CyberDost (fraud OR scam OR UPI OR fake)", 80),
    ("from:Cyberdost_MHA (fraud OR scam OR UPI)", 80),
    ("(scam OR fraud) (UPI OR phone OR number) india -is:retweet lang:en", 20),
    ("upi fraud india (9 OR 8 OR 7) -is:retweet", 20),
    ("\"cyber fraud\" india number -is:retweet lang:en", 20),
]

# ── Regex ──────────────────────────────────────────────────────────────────────

PHONE_RE = re.compile(r'(?:\+91[\-\s]?|91[\-\s]?|0)?([6-9]\d{9})\b')
UPI_RE = re.compile(
    r'\b([a-zA-Z0-9._\-]{2,64}@(?:'
    r'ybl|okhdfcbank|okicici|oksbi|okaxis|paytm|apl|ibl|upi|'
    r'barodampay|hdfcbank|icici|sbi|kotak|pnb|boi|bob|airtel|'
    r'jio|phonepe|gpay|amazon|slice|navi|fi|jupiter|razorpay|'
    r'cashfree|freecharge|mobikwik|rapl|yapl|abfspay|axisb|axl|'
    r'dlb|federal|fbl|idfcbank|idfcfirst|rbl|indus|kbl|tjsb|uco|'
    r'unionbank|ubi|yesbank|yesg|citi|hsbc|sc|scb|dbs|equitas|'
    r'jkb|karb|aubank|finobank|paytmqr|waaxis|wahdfcbank|waicici|wasbi))\b',
    re.IGNORECASE
)

def has_entities(text: str) -> bool:
    return bool(PHONE_RE.search(text) or UPI_RE.search(text))

# ── X API ──────────────────────────────────────────────────────────────────────

API_URL = "https://api.x.com/2/tweets/search/recent"

def search_tweets(query: str, max_results: int) -> list[dict]:
    """Call X API v2 recent search. Returns list of {id, text, author, created_at}."""
    params = {
        "query": query,
        "max_results": str(min(max_results, 100)),  # API max 100/page
        "tweet.fields": "created_at,author_id,public_metrics",
        "expansions": "author_id",
        "user.fields": "username",
    }
    url = f"{API_URL}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {BEARER}",
        "User-Agent": "ScamDB-India/1.0",
    })

    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode() if hasattr(e, "read") else ""
        print(f"  API error {e.code}: {body[:200]}")
        if e.code == 429:
            print("  Rate limited — sleeping 60s")
            time.sleep(60)
        return []
    except Exception as e:
        print(f"  Request failed: {e}")
        return []

    tweets = data.get("data", [])
    users = {u["id"]: u["username"] for u in data.get("includes", {}).get("users", [])}

    results = []
    for t in tweets:
        results.append({
            "id": t["id"],
            "text": t.get("text", ""),
            "author": users.get(t.get("author_id"), "unknown"),
            "created_at": t.get("created_at"),
        })
    return results

# ── Storage ────────────────────────────────────────────────────────────────────

def already_stored(db: Client, source_url: str) -> bool:
    r = db.table("raw_signals").select("id", count="exact", head=True).eq("source_url", source_url).execute()
    return (r.count or 0) > 0

def store_signal(db: Client, tweet: dict, score: int) -> bool:
    # Govt account → boost score to auto-approve threshold
    if tweet["author"].lower() in {a.lower() for a in GOVT_ACCOUNTS}:
        score = 80
    captured = tweet.get("created_at") or datetime.now(timezone.utc).isoformat()
    try:
        db.table("raw_signals").insert({
            "source_type": "twitter",
            "source_url": f"https://x.com/{tweet['author']}/status/{tweet['id']}",
            "title": None,
            "content": tweet["text"][:5000],
            "author": tweet["author"],
            "author_score": score,
            "captured_at": captured,
            "status": "unprocessed",
        }).execute()
        return True
    except Exception as e:
        print(f"    store failed: {e}")
        return False

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print(f"ScamDB Twitter Crawler — {'DRY RUN' if DRY_RUN else 'LIVE'}\n")
    db = None if DRY_RUN else create_client(SUPABASE_URL, SUPABASE_KEY)

    total_inserted = 0
    total_skipped = 0
    seen_ids: set[str] = set()

    for query, score in QUERIES:
        print(f"[query] {query!r}  (score={score})")
        tweets = search_tweets(query, MAX_PER_QUERY)
        print(f"  {len(tweets)} tweets returned")

        with_entities = 0
        for tweet in tweets:
            if tweet["id"] in seen_ids:
                continue
            seen_ids.add(tweet["id"])

            if not has_entities(tweet["text"]):
                continue
            with_entities += 1

            phones = PHONE_RE.findall(tweet["text"])
            upis = UPI_RE.findall(tweet["text"])

            if DRY_RUN:
                found = []
                if phones: found.append("📞 " + ", ".join(phones))
                if upis:   found.append("💳 " + ", ".join(upis))
                print(f"  @{tweet['author']}: {' | '.join(found)}")
                continue

            url = f"https://x.com/{tweet['author']}/status/{tweet['id']}"
            if already_stored(db, url):
                total_skipped += 1
                continue
            if store_signal(db, tweet, score):
                total_inserted += 1

        print(f"  → {with_entities} tweets with phone/UPI\n")
        time.sleep(2)  # polite pacing between queries

    if not DRY_RUN:
        print(f"Total: {total_inserted} stored, {total_skipped} duplicate")
        print("Trigger /api/cron/process to extract entities.")

if __name__ == "__main__":
    main()
