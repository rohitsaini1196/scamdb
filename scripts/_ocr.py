"""
Shared OCR + storage helpers for ScamDB screenshot crawlers.

Used by crawl_screenshots.py (live Reddit) and crawl_archive.py (arctic-shift
historical archive). Vision provider auto-selected from env: Claude Haiku if
ANTHROPIC_API_KEY is set, else OpenAI gpt-4o-mini. Model output is regex-
validated to kill hallucinated numbers.
"""

import base64
import json
import os
import re
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone

from supabase import Client

# ── Vision config ───────────────────────────────────────────────────────────────

ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
OPENAI_KEY = os.environ.get("OPENAI_API_KEY", "")
VISION_PROVIDER = "anthropic" if ANTHROPIC_KEY else ("openai" if OPENAI_KEY else None)

ANTHROPIC_MODEL = "claude-haiku-4-5"
OPENAI_MODEL = "gpt-4o-mini"
UA = "ScamDB-India/1.0 (scamdb.in)"

IMG_HOSTS = ("i.redd.it", "preview.redd.it", "i.imgur.com", "imgur.com")

# ── Regex (validate model output) ──────────────────────────────────────────────

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


PLACEHOLDER_UPI_NAMES = {"upi", "name", "test", "example", "abc", "xxx", "xyz",
                         "yourname", "username", "john", "scammer", "mobilenumber"}


def normalize_phone(raw: str) -> str:
    d = re.sub(r'\D', '', raw)
    if d.startswith('91') and len(d) == 12: d = d[2:]
    if d.startswith('0') and len(d) == 11:  d = d[1:]
    return d


def preview_to_fullres(url: str) -> str:
    """preview.redd.it/<id>.jpg?width=640&... → i.redd.it/<id>.jpg (full resolution)."""
    m = re.search(r'preview\.redd\.it/([A-Za-z0-9]+\.(?:jpg|jpeg|png|webp))', url, re.IGNORECASE)
    if m:
        return f"https://i.redd.it/{m.group(1)}"
    return url.split("?")[0] if "i.redd.it" in url else url


# ── Vision OCR ──────────────────────────────────────────────────────────────────

VISION_PROMPT = (
    "This is a screenshot from an Indian scam-awareness forum. Extract any Indian "
    "phone numbers (10 digits starting 6-9, optionally with +91) and UPI IDs "
    "(format name@bank, e.g. john@okicici) that are VISIBLE IN THE IMAGE. "
    "These belong to the suspected scammer being reported. "
    "Return ONLY valid JSON, no markdown:\n"
    '{"phones": ["..."], "upis": ["..."], "is_scam_screenshot": true|false}\n'
    "If the image is not a scam-related screenshot (meme, unrelated photo), set "
    "is_scam_screenshot false and return empty arrays."
)


def fetch_image_b64(url: str) -> tuple[str, str] | None:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            data = r.read()
            ctype = r.headers.get("Content-Type", "image/jpeg").split(";")[0]
    except Exception:
        return None
    if len(data) > 4_500_000:  # ~4.5MB cap (API limit 5MB)
        return None
    if ctype not in ("image/jpeg", "image/png", "image/webp", "image/gif"):
        ctype = "image/jpeg"
    return base64.standard_b64encode(data).decode(), ctype


def _call_anthropic(b64: str, media_type: str) -> str | None:
    body = json.dumps({
        "model": ANTHROPIC_MODEL,
        "max_tokens": 300,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": b64}},
                {"type": "text", "text": VISION_PROMPT},
            ],
        }],
    }).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages", data=body,
        headers={"x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=40) as r:
        resp = json.loads(r.read().decode())
    return "".join(b.get("text", "") for b in resp.get("content", []))


def _call_openai(b64: str, media_type: str) -> str | None:
    body = json.dumps({
        "model": OPENAI_MODEL,
        "max_tokens": 300,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": VISION_PROMPT},
                {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{b64}"}},
            ],
        }],
    }).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions", data=body,
        headers={"Authorization": f"Bearer {OPENAI_KEY}", "content-type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=40) as r:
        resp = json.loads(r.read().decode())
    return resp["choices"][0]["message"]["content"]


def ocr_image(url: str) -> dict | None:
    """OCR an image URL → {phones, upis, is_scam} or None. Regex-validated.
    Retries on 429 (rate limit) with Retry-After backoff so images aren't lost."""
    img = fetch_image_b64(url)
    if not img:
        return None
    b64, media_type = img

    text = None
    for attempt in range(4):
        try:
            text = _call_anthropic(b64, media_type) if VISION_PROVIDER == "anthropic" else _call_openai(b64, media_type)
            break
        except urllib.error.HTTPError as e:
            if e.code == 429:
                retry_after = e.headers.get("Retry-After") if hasattr(e, "headers") else None
                wait = int(retry_after) if (retry_after and retry_after.isdigit()) else min(20 * (attempt + 1), 60)
                print(f"    429 rate limit — waiting {wait}s (attempt {attempt + 1}/4)")
                time.sleep(wait)
                continue
            bd = e.read().decode() if hasattr(e, "read") else ""
            print(f"    vision API {e.code}: {bd[:160]}")
            return None
        except Exception as e:
            print(f"    vision error: {e}")
            return None
    if text is None:
        return None

    if not text:
        return None
    text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        parsed = json.loads(text)
    except Exception:
        return None

    phones = [normalize_phone(p) for p in parsed.get("phones", [])]
    phones = [p for p in phones if len(p) == 10 and p[0] in "6789"]
    upis = [u.lower().strip() for u in parsed.get("upis", []) if UPI_RE.search(u or "")]
    # Drop obvious placeholders the model echoes from the prompt / generic examples.
    upis = [u for u in upis if u.split("@")[0] not in PLACEHOLDER_UPI_NAMES]

    if not phones and not upis:
        return None
    return {"phones": list(dict.fromkeys(phones)), "upis": list(dict.fromkeys(upis)),
            "is_scam": parsed.get("is_scam_screenshot", True)}


# ── Storage ─────────────────────────────────────────────────────────────────────

def already_stored(db: Client, source_url: str) -> bool:
    try:
        r = db.table("raw_signals").select("id", count="exact", head=True).eq("source_url", source_url).execute()
        return (r.count or 0) > 0
    except Exception as e:
        print(f"    already_stored check failed: {e}")
        return False  # safer to re-process than to crash the run


def already_ocrd(db: Client, source_url: str) -> bool:
    """True only if an OCR'd signal (screenshot_urls populated) already exists for this URL.
    A text-only signal for the same post does NOT count — we still want to OCR its image."""
    try:
        r = (db.table("raw_signals").select("id", count="exact", head=True)
             .eq("source_url", source_url).not_.is_("screenshot_urls", "null")
             .neq("screenshot_urls", "{}").execute())
        return (r.count or 0) > 0
    except Exception as e:
        print(f"    already_ocrd check failed: {e}")
        return False


def mark_ocr_attempted(db: Client, permalink: str, image_url: str) -> None:
    """Record an OCR'd-but-no-entity image so cron runs don't re-OCR it forever.
    Stored as a skipped signal with screenshot_urls set → already_ocrd() skips it next run."""
    try:
        db.table("raw_signals").insert({
            "source_type": "reddit",
            "source_url": permalink,
            "title": None,
            "content": "[screenshot OCR — no entity]",
            "author": None,
            "author_score": 0,
            "screenshot_urls": [image_url],
            "captured_at": datetime.now(timezone.utc).isoformat(),
            "status": "skipped",
            "processed_at": datetime.now(timezone.utc).isoformat(),
            "error": "ocr_no_entities",
        }).execute()
    except Exception:
        pass


def store_signal(db: Client, post: dict, ocr: dict, image_url: str) -> bool:
    """Insert a raw_signal. Embeds extracted IDs in content so /api/cron/process re-extracts them."""
    ids = " ".join(ocr["phones"] + ocr["upis"])
    content = f"{post.get('title','')}\n{post.get('selftext','')}\n[from screenshot] {ids}"[:5000]
    created = post.get("created_utc", 0)
    captured = datetime.fromtimestamp(created, tz=timezone.utc).isoformat() if created else datetime.now(timezone.utc).isoformat()
    try:
        db.table("raw_signals").insert({
            "source_type": "reddit",
            "source_url": post["permalink"],
            "title": (post.get("title") or "")[:500],
            "content": content,
            "author": None,
            "author_score": 5,
            "screenshot_urls": [image_url],
            "captured_at": captured,
            "status": "unprocessed",
        }).execute()
        return True
    except Exception as e:
        print(f"    store failed: {e}")
        return False
