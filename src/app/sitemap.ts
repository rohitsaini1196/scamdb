import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 3600; // regenerate every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://scamdb.in";

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "daily", priority: 1.0 },
    { url: `${base}/disclaimer`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/privacy`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/dispute`, changeFrequency: "monthly", priority: 0.4 },
  ];

  try {
    const supabase = await createClient();
    const { data: entities } = await supabase
      .from("entities")
      .select("type, normalized_value, last_reported_at")
      .gt("report_count", 0)
      .order("report_count", { ascending: false })
      .limit(50000);

    const entityRoutes: MetadataRoute.Sitemap = (entities ?? []).map((e) => ({
      url: `${base}/${e.type}/${encodeURIComponent(e.normalized_value)}`,
      lastModified: e.last_reported_at ? new Date(e.last_reported_at) : undefined,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));

    return [...staticRoutes, ...entityRoutes];
  } catch {
    return staticRoutes;
  }
}
