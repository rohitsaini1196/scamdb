/**
 * Reddit ingestion — fetches posts and stores raw in raw_signals table.
 * Does NOT create reports directly. Processing happens separately.
 *
 * Usage:
 *   npm run ingest:reddit           — insert into raw_signals
 *   npm run ingest:reddit:dry       — preview only, no DB writes
 *   npm run ingest:reddit -- --limit=50
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const isDryRun = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const sortArg = process.argv.find((a) => a.startsWith("--sort="));
const timeArg = process.argv.find((a) => a.startsWith("--time="));
const POSTS_PER_SUB = limitArg ? parseInt(limitArg.split("=")[1]) : 25;
const SORT = sortArg ? sortArg.split("=")[1] : "new";   // new | hot | top
const TIME = timeArg ? timeArg.split("=")[1] : "week";  // hour | day | week | month | year | all

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ws = require("ws");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { realtime: { transport: ws } }
);

const SUBREDDITS = [
  "indianscammers",       // primary — dedicated Indian scam reporting, actual numbers in posts
  "IndianScamBusters",    // secondary — complementary scam reporting
  "india",                // large general sub, occasional high-signal scam posts
  "LegalAdviceIndia",     // sometimes has fraud case details with numbers
  "personalfinanceindia", // UPI/financial fraud reports
];

const SCAM_KEYWORDS = [
  "scam", "fraud", "cheated", "duped", "fake", "beware", "warning",
  "phishing", "otp", "upi fraud", "loan scam", "investment scam",
  "job scam", "lottery", "impersonation", "cybercrime", "cyber crime",
  "lost money", "blocked", "arrested", "धोखा", "ठगी", "फर्जी",
];

interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  url: string;
  permalink: string;
  created_utc: number;
  score: number;
  author: string;
}

interface RedditComment {
  body: string;
  author: string;
  score: number;
  permalink: string;
}

function isScamRelated(text: string): boolean {
  const t = text.toLowerCase();
  return SCAM_KEYWORDS.some((kw) => t.includes(kw));
}

let _redditToken: string | null = null;

async function getRedditToken(): Promise<string | null> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  if (_redditToken) return _redditToken;

  try {
    const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${creds}`,
        "User-Agent": "ScamDB-India-Bot/1.0 (fraud awareness database; scamdb.in)",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) return null;
    const data = await res.json() as { access_token: string };
    _redditToken = data.access_token;
    return _redditToken;
  } catch {
    return null;
  }
}

async function fetchSubredditPosts(subreddit: string, limit: number): Promise<RedditPost[]> {
  const token = await getRedditToken();

  // OAuth path — most reliable
  if (token) {
    const url = `https://oauth.reddit.com/r/${subreddit}/${SORT}.json?limit=${limit}&t=${TIME}`;
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "ScamDB-India-Bot/1.0 (fraud awareness database; scamdb.in)",
          Authorization: `bearer ${token}`,
        },
      });
      if (!res.ok) { console.warn(`  ⚠ r/${subreddit}: HTTP ${res.status}`); return []; }
      const data = await res.json() as { data: { children: { data: RedditPost }[] } };
      return data.data.children.map((c) => c.data);
    } catch (err) {
      console.warn(`  ⚠ r/${subreddit}: ${err}`); return [];
    }
  }

  // RSS fallback — no auth needed, Reddit hasn't blocked this yet
  // Only supports "new" sort; limit ignored (RSS returns 25 fixed)
  try {
    const rssUrl = `https://www.reddit.com/r/${subreddit}/new.rss`;
    const res = await fetch(rssUrl, {
      headers: { "User-Agent": "ScamDB-India-Bot/1.0 (fraud awareness database; scamdb.in)" },
    });
    if (!res.ok) { console.warn(`  ⚠ r/${subreddit}: RSS HTTP ${res.status}`); return []; }

    const xml = await res.text();
    const posts: RedditPost[] = [];

    // Parse RSS <entry> blocks
    const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/g) ?? [];
    for (const entry of entries) {
      const title = entry.match(/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1]?.trim() ?? "";
      const link  = entry.match(/<link[^>]+href="([^"]+)"/)?.[1] ?? "";
      const content = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1]
        ?.replace(/<!--[\s\S]*?-->/g, "")          // strip HTML comments
        ?.replace(/<[^>]+>/g, " ")                  // strip HTML tags
        ?.replace(/&amp;/g, "&")
        ?.replace(/&lt;/g, "<")
        ?.replace(/&gt;/g, ">")
        ?.replace(/&quot;/g, '"')
        ?.replace(/&#x200B;/g, "")                  // zero-width space
        ?.replace(/\s{2,}/g, " ")
        ?.trim() ?? "";
      const author = entry.match(/<name>(.*?)<\/name>/)?.[1] ?? "unknown";
      const dateStr = entry.match(/<updated>(.*?)<\/updated>/)?.[1] ?? "";
      const permalink = link.replace("https://www.reddit.com", "");

      if (!title && !content) continue;
      posts.push({
        id: permalink,
        title,
        selftext: content.slice(0, 2000),
        url: link,
        permalink,
        created_utc: dateStr ? Math.floor(new Date(dateStr).getTime() / 1000) : Date.now() / 1000,
        score: 0,
        author,
      });
    }
    return posts;
  } catch (err) {
    console.warn(`  ⚠ r/${subreddit}: RSS error ${err}`); return [];
  }
}

// Only fetch comments for posts from high-signal subreddits
const COMMENT_SUBREDDITS = new Set(["indianscammers", "IndianScamBusters"]);
// Regex to detect entity presence before fetching comments (avoids API calls on posts with no hope)
const ENTITY_HINT_RE = /[6-9]\d{5}|@(?:ybl|paytm|okicici|oksbi|okaxis|phonepe|gpay|okhdfcbank)/i;

async function fetchPostComments(permalink: string): Promise<RedditComment[]> {
  const token = await getRedditToken();

  // OAuth path
  if (token) {
    const url = `https://oauth.reddit.com${permalink}.json?limit=20&depth=1`;
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "ScamDB-India-Bot/1.0 (fraud awareness database; scamdb.in)",
          Authorization: `bearer ${token}`,
        },
      });
      if (!res.ok) return [];
      const data = await res.json() as [unknown, { data: { children: { data: RedditComment; kind: string }[] } }];
      return data[1].data.children
        .filter((c) => c.kind === "t1" && c.data.body && c.data.body !== "[deleted]")
        .map((c) => c.data)
        .slice(0, 20);
    } catch { return []; }
  }

  // RSS fallback for comments — parse comment RSS feed
  try {
    const rssUrl = `https://www.reddit.com${permalink}.rss`;
    const res = await fetch(rssUrl, {
      headers: { "User-Agent": "ScamDB-India-Bot/1.0 (fraud awareness database; scamdb.in)" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const entries = xml.match(/<entry>([\s\S]*?)<\/entry>/g) ?? [];

    return entries.slice(1).map((entry) => { // slice(1) skips the post itself
      const body = entry.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1]
        ?.replace(/<!--[\s\S]*?-->/g, "")
        ?.replace(/<[^>]+>/g, " ")
        ?.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
        ?.replace(/\s{2,}/g, " ").trim() ?? "";
      const author = entry.match(/<name>(.*?)<\/name>/)?.[1] ?? "unknown";
      return { body, author, score: 0, permalink };
    }).filter((c) => c.body.length > 10);
  } catch { return []; }
}

async function alreadyStored(sourceUrl: string): Promise<boolean> {
  const { count } = await supabase
    .from("raw_signals")
    .select("id", { count: "exact", head: true })
    .eq("source_url", sourceUrl);
  return (count ?? 0) > 0;
}

async function ingest() {
  const token = await getRedditToken();
  const authMode = token ? "OAuth" : "JSON API (no creds)";
  console.log(`Reddit ingestion — ${isDryRun ? "DRY RUN" : "LIVE"} [${authMode}]`);
  console.log(`Sort: ${SORT}/${TIME} | Posts/subreddit: ${POSTS_PER_SUB}\n`);

  let inserted = 0;
  let skipped = 0;
  let irrelevant = 0;

  for (const sub of SUBREDDITS) {
    process.stdout.write(`r/${sub}... `);
    const posts = await fetchSubredditPosts(sub, POSTS_PER_SUB);
    let subInserted = 0;

    for (const post of posts) {
      const postText = `${post.title}\n${post.selftext}`;

      if (!isScamRelated(postText)) {
        irrelevant++;
        continue;
      }

      const sourceUrl = `https://reddit.com${post.permalink}`;

      if (!isDryRun && await alreadyStored(sourceUrl)) {
        skipped++;
        continue;
      }

      // For high-signal subreddits, fetch comments — that's where the numbers live
      let commentText = "";
      if (COMMENT_SUBREDDITS.has(sub)) {
        const comments = await fetchPostComments(post.permalink);
        const relevantComments = comments
          .filter((c) => isScamRelated(c.body) || ENTITY_HINT_RE.test(c.body))
          .map((c) => c.body)
          .join("\n---\n");
        if (relevantComments) commentText = `\n\nComments:\n${relevantComments}`;
        await new Promise((r) => setTimeout(r, 300)); // polite delay
      }

      const fullText = `${postText}${commentText}`;
      const content = fullText.replace(/\s+/g, " ").trim().slice(0, 5000);
      if (content.length < 30) { irrelevant++; continue; }

      if (isDryRun) {
        console.log(`\n  [DRY] r/${sub} | score:${post.score} | ${post.title.slice(0, 60)}`);
        subInserted++;
        continue;
      }

      const { error } = await supabase.from("raw_signals").insert({
        source_type: "reddit",
        source_url: sourceUrl,
        title: post.title.slice(0, 500),
        content,
        author: post.author,
        author_score: post.score,
        captured_at: new Date(post.created_utc * 1000).toISOString(),
        status: "unprocessed",
      });

      if (error) {
        console.error(`\n  ✗ Insert failed: ${error.message}`);
      } else {
        subInserted++;
        inserted++;
      }
    }

    console.log(`${posts.length} posts → ${subInserted} stored`);
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\nDone. ${inserted} stored, ${skipped} duplicate, ${irrelevant} irrelevant.`);
  if (!isDryRun) console.log("Run `npm run process:signals` to extract entities and queue for moderation.");
}

ingest().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});
