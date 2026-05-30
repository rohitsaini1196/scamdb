import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchRateLimit } from "@/lib/ratelimit";

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const { success } = await searchRateLimit.limit(ip);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 3) return NextResponse.json({ entities: [] });
  if (q.length > 100) return NextResponse.json({ entities: [] });

  const supabase = await createClient();
  const digits = q.replace(/\D/g, "");

  const { data } = await supabase
    .from("entities")
    .select("id, type, normalized_value, display_value, report_count, last_reported_at")
    .or(
      digits.length >= 3
        ? `normalized_value.ilike.%${digits}%,display_value.ilike.%${q}%`
        : `display_value.ilike.%${q}%,normalized_value.ilike.%${q}%`
    )
    .order("report_count", { ascending: false })
    .limit(10);

  return NextResponse.json({ entities: data ?? [] });
}
