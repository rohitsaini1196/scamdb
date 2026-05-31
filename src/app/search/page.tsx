export const dynamic = "force-dynamic";

import { SearchBar } from "@/components/shared/search-bar";
import { createClient } from "@/lib/supabase/server";
import { detectEntityType, normalizeEntity, formatPhone } from "@/lib/normalize";
import { CATEGORY_LABELS } from "@/lib/constants";
import Link from "next/link";
import type { ReportCategory } from "@/types/database";

interface Props {
  searchParams: Promise<{ q?: string }>;
}

const LEVEL_SHORT: Record<string, { label: string; fg: string; bg: string; border: string }> = {
  high: { label: "High caution",  fg: "var(--high-fg)", bg: "var(--high-bg)", border: "var(--high-line)" },
  med:  { label: "Caution",       fg: "var(--med-fg)",  bg: "var(--med-bg)",  border: "var(--med-line)"  },
  low:  { label: "Low caution",   fg: "var(--low-fg)",  bg: "var(--low-bg)",  border: "var(--low-line)"  },
  clear:{ label: "No reports",    fg: "var(--ink-3)",   bg: "var(--surface)", border: "var(--line)"      },
};

function getLevel(count: number) {
  if (count === 0) return "clear";
  if (count === 1) return "low";
  if (count <= 3)  return "med";
  return "high";
}

export default async function SearchPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  if (!query) {
    return (
      <div className="max-w-[840px] mx-auto px-6 py-10">
        <SearchBar />
        <p className="text-center text-sm mt-12" style={{ color: "var(--ink-3)" }}>
          Enter a phone number or UPI ID to search.
        </p>
      </div>
    );
  }

  const type = detectEntityType(query);
  const supabase = await createClient();
  const digits = query.replace(/\D/g, "");
  const { data: entities } = await supabase
    .from("entities")
    .select("*")
    .or(
      digits.length >= 3
        ? `normalized_value.ilike.%${digits}%,display_value.ilike.%${query}%`
        : `display_value.ilike.%${query}%,normalized_value.ilike.%${query}%`
    )
    .order("report_count", { ascending: false })
    .limit(20);

  return (
    <div>
      {/* Subbar */}
      <div
        className="sticky z-30 border-b"
        style={{ top: 66, background: "var(--surface)", borderColor: "var(--line)" }}
      >
        <div className="max-w-[840px] mx-auto px-6 py-[13px] flex gap-[10px]">
          <SearchBar defaultValue={query} />
        </div>
      </div>

      <div className="max-w-[840px] mx-auto px-6 py-[30px]">
        {!entities?.length ? (
          <>
            <h2 className="text-[21px] font-bold mb-1" style={{ color: "var(--ink)" }}>
              No results for &ldquo;{query}&rdquo;
            </h2>
            <p className="text-[14px] mb-[22px]" style={{ color: "var(--ink-2)" }}>
              Nothing matches that yet. That is not a guarantee of safety — if something felt off, you can add the first report to warn others.
            </p>
            <div className="flex gap-[10px] flex-wrap">
              <Link href="/">
                <button
                  className="inline-flex items-center gap-[7px] h-[34px] px-[15px] rounded-full font-semibold text-[13px] border transition-colors"
                  style={{ background: "var(--paper)", color: "var(--ink)", borderColor: "var(--line-strong)", cursor: "pointer" }}
                >
                  Back to search
                </button>
              </Link>
              <Link href={`/report${type ? `?type=${type}&value=${encodeURIComponent(normalizeEntity(type, query))}` : ""}`}>
                <button
                  className="inline-flex items-center gap-[7px] h-[34px] px-[15px] rounded-full font-semibold text-[13px] transition-opacity hover:opacity-90"
                  style={{ background: "var(--navy)", color: "#fff", border: "none", cursor: "pointer" }}
                >
                  <FlagIcon />
                  Report this
                </button>
              </Link>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-[21px] font-bold mb-1" style={{ color: "var(--ink)" }}>
              {entities.length} result{entities.length > 1 ? "s" : ""} for &ldquo;{query}&rdquo;
            </h2>
            <p className="text-[14px] mb-[22px]" style={{ color: "var(--ink-2)" }}>
              Select an entry to view its full community report.
            </p>

            <div className="flex flex-col gap-3">
              {entities.map((entity) => {
                const displayValue = entity.type === "phone"
                  ? formatPhone(entity.normalized_value)
                  : entity.normalized_value;
                const level = getLevel(entity.report_count);
                const lv = LEVEL_SHORT[level];
                const topCat = entity.report_count > 0 ? null : null; // fetched via reports join - skip for now

                return (
                  <Link
                    key={entity.id}
                    href={`/${entity.type}/${encodeURIComponent(entity.normalized_value)}`}
                    className="block"
                  >
                    <div
                      className="flex items-center justify-between gap-4 rounded-[11px] border p-[16px] transition-all cursor-pointer"
                      style={{
                        background: "var(--paper)",
                        borderColor: "var(--line)",
                        boxShadow: "0 1px 2px rgba(20,30,50,.05)",
                      }}
                      onMouseOver={e => {
                        (e.currentTarget as HTMLElement).style.borderColor = "var(--line-strong)";
                        (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px -6px rgba(20,30,50,.12), 0 1px 3px rgba(20,30,50,.06)";
                      }}
                      onMouseOut={e => {
                        (e.currentTarget as HTMLElement).style.borderColor = "var(--line)";
                        (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 2px rgba(20,30,50,.05)";
                      }}
                    >
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold tracking-[0.1em] uppercase mb-[5px]" style={{ color: "var(--ink-3)" }}>
                          {entity.type === "phone" ? "Phone number" : "UPI ID"}
                        </p>
                        <p
                          className="font-semibold text-[19px] tracking-[-0.01em] whitespace-nowrap"
                          style={{ fontFamily: "var(--font-mono,'Geist Mono',monospace)", color: "var(--ink)" }}
                        >
                          {displayValue}
                        </p>
                        <div className="flex gap-[7px] items-center flex-wrap mt-[6px] text-[13px]" style={{ color: "var(--ink-2)" }}>
                          <span>{entity.report_count} report{entity.report_count !== 1 ? "s" : ""}</span>
                          {entity.last_reported_at && (
                            <>
                              <span>·</span>
                              <span>Last {new Date(entity.last_reported_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-none">
                        <span
                          className="inline-flex items-center gap-[7px] rounded-full font-semibold text-[12.5px] border whitespace-nowrap"
                          style={{
                            padding: "5px 11px 5px 9px",
                            color: lv.fg,
                            background: lv.bg,
                            borderColor: `color-mix(in srgb, ${lv.border} 34%, transparent)`,
                          }}
                        >
                          <ShieldIcon size={14} color={lv.fg} />
                          {lv.label}
                        </span>
                        <ChevronIcon />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ShieldIcon({ size = 14, color }: { size?: number; color?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" width={size} height={size} style={color ? { color } : {}}><path d="M12 2.6 5 5.1v6c0 4.4 3 7.7 7 9.6 4-1.9 7-5.2 7-9.6v-6L12 2.6Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>;
}
function FlagIcon() {
  return <svg viewBox="0 0 24 24" fill="none" width={15} height={15}><path d="M5 21V4m0 1h11l-2 4 2 4H5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function ChevronIcon() {
  return <svg viewBox="0 0 24 24" fill="none" width={18} height={18} style={{ color: "var(--ink-3)" }}><path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
