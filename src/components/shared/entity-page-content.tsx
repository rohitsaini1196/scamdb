import { CATEGORY_LABELS, PLATFORM_LABELS } from "@/lib/constants";
import { SourceBadge } from "@/components/shared/source-badge";
import { SearchBar } from "@/components/shared/search-bar";
import Link from "next/link";
import type { EntityType, ReportCategory, Platform } from "@/types/database";

interface Report {
  id: string;
  category: string;
  platform: string;
  description: string;
  amount_lost: number | null;
  evidence_urls: string[];
  source_type: string | null;
  source_confidence: string | null;
  source_url: string | null;
  created_at: string;
}

interface Entity {
  report_count: number;
  last_reported_at: string | null;
}

interface EntityPageContentProps {
  type: EntityType;
  normalized: string;
  displayValue: string;
  entity: Entity | null;
  reports: Report[];
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function formatLastReported(dateStr: string | null): string {
  if (!dateStr) return "—";
  const days = daysSince(dateStr);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

function getLevel(reportCount: number): "clear" | "low" | "med" | "high" {
  if (reportCount === 0) return "clear";
  if (reportCount === 1) return "low";
  if (reportCount <= 3) return "med";
  return "high";
}

const LEVEL_CONFIG = {
  clear: {
    label: "No reports found",
    short: "No reports",
    levelLabel: "None",
    line: "This number is not currently in our register. That does not guarantee it is safe — stay alert.",
    fg: "var(--clear-fg)", bg: "var(--clear-bg)", line_: "var(--clear-line)", soft: "var(--clear-soft)",
  },
  low: {
    label: "Low caution",
    short: "Low caution",
    levelLabel: "Low",
    line: "A small number of reports exist. Worth a closer look before you proceed.",
    fg: "var(--low-fg)", bg: "var(--low-bg)", line_: "var(--low-line)", soft: "var(--low-soft)",
  },
  med: {
    label: "Caution advised",
    short: "Caution",
    levelLabel: "Medium",
    line: "Suspicious activity has been reported by the community. Verify identity before paying or sharing details.",
    fg: "var(--med-fg)", bg: "var(--med-bg)", line_: "var(--med-line)", soft: "var(--med-soft)",
  },
  high: {
    label: "High caution",
    short: "High caution",
    levelLabel: "High",
    line: "Many recent reports across multiple channels. Strongly verify before any payment or information sharing.",
    fg: "var(--high-fg)", bg: "var(--high-bg)", line_: "var(--high-line)", soft: "var(--high-soft)",
  },
};

const CHIP_COLORS: Record<string, { color: string; border: string; bg: string }> = {
  financial_fraud:       { color: "#9c1d16", border: "#eccac6", bg: "#fdf2f0" },
  impersonation:         { color: "#5b3ba8", border: "#dccff0", bg: "#f7f3fd" },
  job_scam:              { color: "#1f6a52", border: "#c5e2d6", bg: "#f0f8f3" },
  investment_fraud:      { color: "#1f6a52", border: "#c5e2d6", bg: "#f0f8f3" },
  lottery_scam:          { color: "#9c1d16", border: "#eccac6", bg: "#fdf2f0" },
  romance_scam:          { color: "#9c1d16", border: "#eccac6", bg: "#fdf2f0" },
  phishing:              { color: "#9c1d16", border: "#eccac6", bg: "#fdf2f0" },
  fake_customer_support: { color: "#5b3ba8", border: "#dccff0", bg: "#f7f3fd" },
  other:                 { color: "var(--ink-2)", border: "var(--line)", bg: "var(--paper)" },
};

const sanitize = (s: string) =>
  s.replace(/[<>"'&]/g, (c) =>
    ({ "<": "\\u003c", ">": "\\u003e", '"': "\\u0022", "'": "\\u0027", "&": "\\u0026" }[c] ?? c)
  );

export function EntityPageContent({ type, normalized, displayValue, entity, reports }: EntityPageContentProps) {
  const typeLabel = type === "phone" ? "Phone number" : "UPI ID";
  const reportCount = entity?.report_count ?? 0;
  const level = getLevel(reportCount);
  const m = LEVEL_CONFIG[level];
  const isClear = level === "clear";

  const categories = [...new Set(reports.map((r) => r.category as ReportCategory))];
  const evidenceCount = reports.reduce((sum, r) => sum + (r.evidence_urls?.length ?? 0), 0);
  const totalLost = reports.reduce((sum, r) => sum + (r.amount_lost ?? 0), 0);
  const sourceChannels = new Set(reports.map((r) => r.platform)).size;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: sanitize(`${displayValue} — ${typeLabel} Reports`),
    description: sanitize(
      reportCount > 0
        ? `${reportCount} community report${reportCount > 1 ? "s" : ""} found for ${typeLabel.toLowerCase()} ${displayValue}.`
        : `No reports found for ${typeLabel.toLowerCase()} ${displayValue} on ScamDB India.`
    ),
    url: `${process.env.NEXT_PUBLIC_APP_URL}/${type}/${encodeURIComponent(normalized)}`,
    ...(reportCount > 0 && {
      mainEntity: {
        "@type": "FAQPage",
        mainEntity: [{
          "@type": "Question",
          name: `Is ${displayValue} a scam ${typeLabel.toLowerCase()}?`,
          acceptedAnswer: {
            "@type": "Answer",
            text: sanitize(
              `${reportCount} community report${reportCount > 1 ? "s" : ""} found for ${displayValue}. Last reported ${formatLastReported(entity?.last_reported_at ?? null)}. Always exercise caution.`
            ),
          },
        }],
      },
    }),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* ── Sticky subbar ──────────────────────────────────── */}
      <div
        className="sticky z-30 border-b"
        style={{ top: 66, background: "var(--surface)", borderColor: "var(--line)" }}
      >
        <div className="max-w-[840px] mx-auto px-6 py-[13px] flex gap-[10px] items-center">
          <SearchBar />
        </div>
      </div>

      {/* ── Entity page ──────────────────────────────────── */}
      <div style={{ background: "var(--paper)", paddingBottom: 56 }}>
        <div className="max-w-[840px] mx-auto px-6">

          {/* ── Entity header ── */}
          <div className="pt-[30px] pb-[18px]">
            <p className="text-[11px] font-semibold tracking-[0.1em] uppercase mb-2" style={{ color: "var(--ink-3)" }}>
              {typeLabel} · India
            </p>

            <div className="flex justify-between items-start gap-5 flex-wrap">
              <div>
                {/* The number */}
                <div
                  className="font-bold break-all leading-[1.05] tracking-[-0.012em]"
                  style={{
                    fontSize: "clamp(27px,4.6vw,40px)",
                    fontFamily: "var(--font-mono,'Geist Mono',ui-monospace,monospace)",
                    fontFeatureSettings: '"tnum" 1',
                    color: "var(--ink)",
                  }}
                >
                  {type === "phone" && displayValue.startsWith("+") ? (
                    <a href={`tel:${displayValue.replace(/\s/g, "")}`} style={{ color: "inherit", textDecoration: "none" }}>
                      {displayValue}
                    </a>
                  ) : displayValue}
                </div>

                {/* Status line */}
                {!isClear && (
                  <div className="flex items-start gap-[9px] mt-[14px]">
                    <span
                      className="w-[9px] h-[9px] rounded-full flex-none mt-[7px]"
                      style={{
                        background: m.line_,
                        boxShadow: `0 0 0 4px color-mix(in srgb, ${m.line_} 16%, transparent)`,
                      }}
                    />
                    <span className="font-semibold text-[15px]" style={{ color: m.fg }}>
                      {reportCount} community report{reportCount !== 1 ? "s" : ""} · most recent {formatLastReported(entity?.last_reported_at ?? null).toLowerCase()}
                    </span>
                  </div>
                )}

                {/* Description line */}
                <p className="text-[14.5px] mt-2 leading-[1.5] max-w-[58ch]" style={{ color: "var(--ink-2)" }}>
                  {m.line}
                </p>
              </div>

              {/* Caution badge */}
              <CautionBadge level={level} large />
            </div>

            {/* Color rule */}
            {!isClear && (
              <div className="mt-5 h-[2px] opacity-50" style={{ background: m.line_ }} />
            )}
          </div>

          {/* ── Clear state ── */}
          {isClear ? (
            <div
              className="rounded-[16px] p-[26px] text-center flex flex-col items-center mt-2 border"
              style={{
                background: "var(--clear-soft)",
                borderColor: `color-mix(in srgb, ${m.line_} 30%, transparent)`,
              }}
            >
              <div
                className="w-[50px] h-[50px] rounded-[14px] flex items-center justify-center mb-4 border"
                style={{
                  background: "#fff",
                  borderColor: `color-mix(in srgb, var(--clear-line) 30%, transparent)`,
                  color: "var(--clear-fg)",
                }}
              >
                <CheckIcon />
              </div>
              <h3 className="text-[21px] font-bold mt-0 mb-0" style={{ color: "var(--ink)" }}>No reports found</h3>
              <p className="text-[14.5px] leading-[1.5] mt-[9px] max-w-[48ch]" style={{ color: "var(--ink-2)" }}>
                This {type === "phone" ? "number" : "UPI ID"} is not currently in our register. This does not guarantee it is safe — scammers change numbers often. Stay alert and verify identity independently.
              </p>
              <Link href={`/report?type=${type}&value=${encodeURIComponent(normalized)}`}>
                <button
                  className="inline-flex items-center gap-[7px] h-11 px-[18px] rounded-full font-semibold text-[14px] mt-[18px] transition-opacity hover:opacity-90"
                  style={{ background: "var(--navy)", color: "#fff", border: "none", cursor: "pointer" }}
                >
                  <FlagIcon />
                  Report this {type === "phone" ? "number" : "UPI ID"}
                </button>
              </Link>
            </div>
          ) : (
            <>
              {/* ── Summary stats ── */}
              <div
                className="grid"
                style={{ gridTemplateColumns: "repeat(4,1fr)", padding: "20px 0", borderBottom: "1px solid var(--line)" }}
              >
                <StatBlock v={String(reportCount)} l="Community reports" accent m={m} />
                <StatBlock v={formatLastReported(entity?.last_reported_at ?? null)} l="Last reported" accent m={m} />
                <StatBlock v={m.levelLabel} l="Caution level" accent m={m} />
                <StatBlock v={totalLost > 0 ? `₹${totalLost.toLocaleString("en-IN")}` : String(sourceChannels)} l={totalLost > 0 ? "Total reported loss" : "Source channels"} m={m} />
              </div>

              {/* ── Categories ── */}
              {categories.length > 0 && (
                <div className="py-[18px] border-b" style={{ borderColor: "var(--line)" }}>
                  <p className="text-[11px] font-semibold tracking-[0.13em] uppercase mb-3" style={{ color: "var(--ink-3)" }}>Reported for</p>
                  <div className="flex gap-2 flex-wrap">
                    {categories.map((cat) => {
                      const c = CHIP_COLORS[cat] ?? CHIP_COLORS.other;
                      return (
                        <span
                          key={cat}
                          className="inline-flex items-center gap-[6px] px-[10px] py-1 rounded-full text-[12.5px] font-medium border"
                          style={{ color: c.color, borderColor: c.border, background: c.bg }}
                        >
                          {CATEGORY_LABELS[cat]}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Report rows ── */}
              <div className="py-[18px]">
                <p className="text-[11px] font-semibold tracking-[0.13em] uppercase mb-1" style={{ color: "var(--ink-3)" }}>
                  Community reports ({reportCount})
                </p>
                <div>
                  {reports.map((report) => (
                    <ReportRow key={report.id} report={report} />
                  ))}
                </div>
              </div>

              {/* ── CTA ── */}
              <div
                className="flex items-center justify-between gap-4 flex-wrap rounded-[11px] p-[16px] border"
                style={{ background: "var(--surface)", borderColor: "var(--line)" }}
              >
                <div>
                  <div className="font-semibold text-[15px]" style={{ color: "var(--ink)" }}>
                    Had a suspicious interaction with this {type === "phone" ? "number" : "UPI ID"}?
                  </div>
                  <div className="text-[13px] mt-0.5" style={{ color: "var(--ink-2)" }}>
                    Your report is reviewed by a moderator before it appears publicly. Takes about 60 seconds.
                  </div>
                </div>
                <Link href={`/report?type=${type}&value=${encodeURIComponent(normalized)}`}>
                  <button
                    className="inline-flex items-center gap-[7px] h-11 px-[18px] rounded-full font-semibold text-[14px] transition-opacity hover:opacity-90 flex-none"
                    style={{ background: "var(--navy)", color: "#fff", border: "none", cursor: "pointer" }}
                  >
                    <FlagIcon />
                    Report this {type === "phone" ? "number" : "UPI ID"}
                  </button>
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function CautionBadge({ level, large }: { level: keyof typeof LEVEL_CONFIG; large?: boolean }) {
  const m = LEVEL_CONFIG[level];
  return (
    <span
      className="inline-flex items-center gap-[7px] rounded-full font-semibold border whitespace-nowrap"
      style={{
        padding: large ? "7px 15px 7px 12px" : "5px 11px 5px 9px",
        fontSize: large ? 14 : 12.5,
        color: m.fg,
        background: m.bg,
        borderColor: `color-mix(in srgb, ${m.line_} 34%, transparent)`,
      }}
    >
      <ShieldIcon size={large ? 15 : 14} />
      {large ? m.label : m.short}
    </span>
  );
}

function StatBlock({ v, l, accent, m }: { v: string; l: string; accent?: boolean; m: typeof LEVEL_CONFIG.clear }) {
  return (
    <div className="px-[18px] border-l first:border-l-0 first:pl-0" style={{ borderColor: "var(--line)" }}>
      <div
        className="text-[23px] font-bold leading-[1.15] tracking-[-0.01em]"
        style={{ color: accent ? m.fg : "var(--ink)" }}
      >
        {v}
      </div>
      <div className="text-[12px] mt-0.5" style={{ color: "var(--ink-2)" }}>{l}</div>
    </div>
  );
}

function ReportRow({ report }: { report: Report }) {
  const cat = report.category as ReportCategory;
  const chip = CHIP_COLORS[cat] ?? CHIP_COLORS.other;

  return (
    <div className="py-[17px] border-t first:border-t-0" style={{ borderColor: "var(--line)" }}>
      {/* Row head */}
      <div className="flex items-center gap-[9px] flex-wrap">
        <span
          className="inline-flex items-center px-[10px] py-1 rounded-full text-[12.5px] font-medium border"
          style={{ color: chip.color, borderColor: chip.border, background: chip.bg }}
        >
          {CATEGORY_LABELS[cat]}
        </span>
        <span className="text-[12.5px] whitespace-nowrap" style={{ color: "var(--ink-3)" }}>
          via {PLATFORM_LABELS[report.platform as Platform]}
        </span>
        <time className="ml-auto text-[12.5px] whitespace-nowrap" style={{ color: "var(--ink-3)" }}>
          {new Date(report.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
        </time>
      </div>

      {/* Description */}
      <p className="text-[14.5px] leading-[1.5] my-[9px] max-w-[62ch]" style={{ color: "#33404f" }}>
        {report.description}
      </p>

      {/* Footer: source + loss */}
      <div className="flex items-center gap-3 flex-wrap">
        {report.source_type && report.source_confidence && (
          <SourceBadge
            sourceType={report.source_type}
            sourceConfidence={report.source_confidence}
            sourceUrl={report.source_url}
          />
        )}
        {report.amount_lost && report.amount_lost > 0 && (
          <span className="text-[12.5px] flex items-baseline gap-[5px]" style={{ color: "var(--ink-2)" }}>
            Reported loss{" "}
            <strong
              className="font-semibold"
              style={{ fontFamily: "var(--font-mono,'Geist Mono',monospace)", color: "var(--ink)" }}
            >
              ₹{report.amount_lost.toLocaleString("en-IN")}
            </strong>
          </span>
        )}
        {report.evidence_urls.length > 0 && (
          <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
            {report.evidence_urls.length} screenshot{report.evidence_urls.length > 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

function ShieldIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size}>
      <path d="M12 2.6 5 5.1v6c0 4.4 3 7.7 7 9.6 4-1.9 7-5.2 7-9.6v-6L12 2.6Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}
function CheckIcon() {
  return <svg viewBox="0 0 24 24" fill="none" width={26} height={26}><path d="m5 12.5 4.5 4.5L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function FlagIcon() {
  return <svg viewBox="0 0 24 24" fill="none" width={15} height={15}><path d="M5 21V4m0 1h11l-2 4 2 4H5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
