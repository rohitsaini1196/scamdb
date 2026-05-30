import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ModerationQueue } from "@/components/moderation/moderation-queue";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Moderation",
  robots: { index: false, follow: false },
};

const MODERATOR_EMAILS = (process.env.MODERATOR_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim())
  .filter(Boolean);

export default async function ModerationPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login?redirect=/moderation");

  const isMod = MODERATOR_EMAILS.includes(user.email ?? "");
  if (!isMod) {
    const service = await createServiceClient();
    const { data: trust } = await service
      .from("user_trust")
      .select("is_moderator")
      .eq("user_id", user.id)
      .single();
    if (!trust?.is_moderator) redirect("/");
  }

  const service = await createServiceClient();

  // Pending reports with entity info — smart ordering done in JS after fetch
  const { data: rawReports } = await service
    .from("reports")
    .select("*, entities(type, normalized_value, display_value, report_count)")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);

  const CONFIDENCE_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const SOURCE_RANK: Record<string, number> = { police_advisory: 0, news: 1 };

  const pendingReports = (rawReports ?? []).sort((a, b) => {
    const srcA = SOURCE_RANK[a.source_type] ?? 2;
    const srcB = SOURCE_RANK[b.source_type] ?? 2;
    if (srcA !== srcB) return srcA - srcB;
    const confA = CONFIDENCE_RANK[a.source_confidence] ?? 2;
    const confB = CONFIDENCE_RANK[b.source_confidence] ?? 2;
    return confA - confB;
  });

  const stats = {
    pending: pendingReports?.length ?? 0,
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Moderation Queue</h1>
          <p className="text-sm text-gray-500 mt-0.5">{stats.pending} reports pending review</p>
        </div>
      </div>
      <ModerationQueue reports={pendingReports ?? []} />
    </div>
  );
}
