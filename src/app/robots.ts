import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://scamdb.in";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/phone/", "/upi/", "/search"],
        disallow: ["/moderation", "/report", "/auth/", "/api/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
