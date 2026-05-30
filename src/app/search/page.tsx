export const dynamic = "force-dynamic";

import { SearchBar } from "@/components/shared/search-bar";
import { createClient } from "@/lib/supabase/server";
import { detectEntityType, normalizeEntity, formatPhone } from "@/lib/normalize";
import { CautionBadge } from "@/components/shared/caution-badge";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABELS } from "@/lib/constants";
import Link from "next/link";
import type { ReportCategory } from "@/types/database";

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  if (!query) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <SearchBar />
        <p className="text-center text-gray-500 mt-12">Enter a phone number or UPI ID to search.</p>
      </div>
    );
  }

  const type = detectEntityType(query);
  const supabase = await createClient();

  // If detected, redirect would happen client-side via SearchBar
  // Here we handle partial/ambiguous searches
  const { data: entities } = await supabase
    .from("entities")
    .select("*")
    .or(
      `normalized_value.ilike.%${query.replace(/\D/g, "") || query}%,display_value.ilike.%${query}%`
    )
    .order("report_count", { ascending: false })
    .limit(20);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-8">
        <SearchBar defaultValue={query} />
      </div>

      <p className="text-sm text-gray-500 mb-4">
        {entities?.length
          ? `${entities.length} result${entities.length > 1 ? "s" : ""} for "${query}"`
          : `No results for "${query}"`}
      </p>

      {!entities?.length ? (
        <div className="text-center py-12">
          <p className="text-gray-600 mb-2">No reports found.</p>
          <p className="text-sm text-gray-400">
            This does not mean the number is safe. Always verify before transacting.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {entities.map((entity) => {
            const displayValue =
              entity.type === "phone"
                ? formatPhone(entity.normalized_value)
                : entity.normalized_value;
            const confidenceScore =
              entity.report_count === 0 ? 0
              : entity.report_count === 1 ? 30
              : entity.report_count === 2 ? 50
              : entity.report_count <= 5 ? 65
              : entity.report_count <= 10 ? 80
              : 90;

            return (
              <Link
                key={entity.id}
                href={`/${entity.type}/${encodeURIComponent(entity.normalized_value)}`}
                className="block p-4 border rounded-lg hover:border-gray-300 hover:shadow-sm transition-all bg-white"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">
                      {entity.type === "phone" ? "Phone Number" : "UPI ID"}
                    </p>
                    <p className="font-mono font-semibold text-gray-900">{displayValue}</p>
                  </div>
                  <CautionBadge
                    reportCount={entity.report_count}
                    confidenceScore={confidenceScore}
                  />
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                  <span>{entity.report_count} report{entity.report_count !== 1 ? "s" : ""}</span>
                  {entity.last_reported_at && (
                    <span>
                      Last:{" "}
                      {new Date(entity.last_reported_at).toLocaleDateString("en-IN", {
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
