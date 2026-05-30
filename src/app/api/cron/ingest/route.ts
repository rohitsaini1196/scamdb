import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const SUBREDDITS = [
  "indianscammers",
  "India",
  "LegalAdviceIndia",
  "personalfinanceindia",
  "bangalore",
  "mumbai",
  "delhi",
  "Chennai",
];

const SCAM_KEYWORDS = [
  "scam", "fraud", "cheated", "duped", "fake", "beware", "warning",
  "phishing", "otp", "upi fraud", "loan scam", "investment scam",
  "job scam", "lottery", "impersonation", "cybercrime",
  "lost money", "धोखा", "ठगी", "फर्जी",
];

interface RedditPost {
  title: string;
  selftext: string;
  permalink: string;
  created_utc: number;
  score: number;
  author: string;
}

function isScamRelated(text: string): boolean {
  const t = text.toLowerCase();
  return SCAM_KEYWORDS.some((kw) => t.includes(kw));
}

async function fetchPosts(subreddit: string): Promise<RedditPost[]> {
  try {
    const res = await fetch(
      `https://www.reddit.com/r/${subreddit}/new.json?limit=25&t=day`,
      { headers: { "User-Agent": "ScamDB-India-Bot/1.0 (scamdb.in)" } }
    );
    if (!res.ok) return [];
    const data = await res.json() as { data: { children: { data: RedditPost }[] } };
    return data.data.children.map((c) => c.data);
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  // Verify cron secret
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();
  let inserted = 0;
  let skipped = 0;

  for (const sub of SUBREDDITS) {
    const posts = await fetchPosts(sub);

    for (const post of posts) {
      const fullText = `${post.title}\n${post.selftext}`;
      if (!isScamRelated(fullText)) continue;

      const sourceUrl = `https://reddit.com${post.permalink}`;
      const content = fullText.replace(/\s+/g, " ").trim().slice(0, 5000);
      if (content.length < 30) continue;

      // Skip duplicates
      const { count } = await service
        .from("raw_signals")
        .select("id", { count: "exact", head: true })
        .eq("source_url", sourceUrl);

      if ((count ?? 0) > 0) { skipped++; continue; }

      const { error } = await service.from("raw_signals").insert({
        source_type: "reddit",
        source_url: sourceUrl,
        title: post.title.slice(0, 500),
        content,
        author: post.author,
        author_score: post.score,
        captured_at: new Date(post.created_utc * 1000).toISOString(),
        status: "unprocessed",
      });

      if (!error) inserted++;
    }

    // Polite delay between subreddits
    await new Promise((r) => setTimeout(r, 300));
  }

  return NextResponse.json({ inserted, skipped, timestamp: new Date().toISOString() });
}
