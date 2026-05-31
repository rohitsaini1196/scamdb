import { CATEGORY_LABELS, PLATFORM_LABELS } from "@/lib/constants";
import { CautionBadge } from "@/components/shared/caution-badge";
import { SourceBadge } from "@/components/shared/source-badge";
import { SearchBar } from "@/components/shared/search-bar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Shield, Calendar, AlertTriangle, FileImage, Clock } from "lucide-react";
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
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

export function EntityPageContent({
  type,
  normalized,
  displayValue,
  entity,
  reports,
}: EntityPageContentProps) {
  const typeLabel = type === "phone" ? "Phone Number" : "UPI ID";
  const reportCount = entity?.report_count ?? 0;

  const confidenceScore =
    reportCount === 0 ? 0
    : reportCount === 1 ? 30
    : reportCount === 2 ? 50
    : reportCount <= 5 ? 65
    : reportCount <= 10 ? 80
    : 90;

  const categories = [
    ...new Set(reports.map((r) => r.category as ReportCategory)),
  ];
  const evidenceCount = reports.reduce(
    (sum, r) => sum + (r.evidence_urls?.length ?? 0),
    0
  );
  const totalLost = reports.reduce(
    (sum, r) => sum + (r.amount_lost ?? 0),
    0
  );

  const sanitize = (s: string) =>
    s.replace(/[<>"'&]/g, (c) =>
      ({ "<": "\\u003c", ">": "\\u003e", '"': "\\u0022", "'": "\\u0027", "&": "\\u0026" }[c] ?? c)
    );

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: sanitize(`${displayValue} — ${typeLabel} Reports`),
    description: sanitize(
      reportCount > 0
        ? `${reportCount} community report${reportCount > 1 ? "s" : ""} found for ${typeLabel.toLowerCase()} ${displayValue}. Categories: ${categories.map((c) => CATEGORY_LABELS[c]).join(", ")}.`
        : `No reports found for ${typeLabel.toLowerCase()} ${displayValue} on ScamDB India. Check before you pay or share.`
    ),
    url: `${process.env.NEXT_PUBLIC_APP_URL}/${type}/${encodeURIComponent(normalized)}`,
    ...(reportCount > 0 && {
      mainEntity: {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: `Is ${displayValue} a scam ${typeLabel.toLowerCase()}?`,
            acceptedAnswer: {
              "@type": "Answer",
              text: sanitize(
                `${reportCount} community report${reportCount > 1 ? "s" : ""} found for ${displayValue}. Categories reported: ${categories.map((c) => CATEGORY_LABELS[c]).join(", ")}. Last reported ${formatLastReported(entity?.last_reported_at ?? null)}. Always exercise caution.`
              ),
            },
          },
        ],
      },
    }),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-8">
          <SearchBar />
        </div>

        {/* Entity header */}
        <div className="mb-6">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">{typeLabel}</p>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 font-mono tracking-tight">
              {displayValue}
            </h1>
            <CautionBadge reportCount={reportCount} confidenceScore={confidenceScore} />
          </div>

          {/* Prominent report count + last reported */}
          {reportCount > 0 && (
            <div className="mt-3 flex items-center gap-4 text-sm">
              <span className="font-semibold text-red-700">
                {reportCount} report{reportCount > 1 ? "s" : ""} found
              </span>
              {entity?.last_reported_at && (
                <span className="flex items-center gap-1 text-gray-500">
                  <Clock className="w-3.5 h-3.5" />
                  Last reported {formatLastReported(entity.last_reported_at)}
                </span>
              )}
            </div>
          )}
        </div>

        {reportCount === 0 ? (
          <NoReportsFound type={type} normalized={normalized} typeLabel={typeLabel} />
        ) : (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <StatCard label="Reports" value={String(reportCount)} highlight />
              <StatCard label="Evidence" value={String(evidenceCount)} />
              <StatCard
                label="Last reported"
                value={formatLastReported(entity?.last_reported_at ?? null)}
              />
              {totalLost > 0 ? (
                <StatCard
                  label="Total reported loss"
                  value={`₹${totalLost.toLocaleString("en-IN")}`}
                  highlight
                />
              ) : (
                <StatCard
                  label="Caution level"
                  value={confidenceScore >= 80 ? "High" : confidenceScore >= 50 ? "Medium" : "Low"}
                />
              )}
            </div>

            {/* Categories */}
            {categories.length > 0 && (
              <div className="mb-6">
                <p className="text-sm font-medium text-gray-700 mb-2">Reported for</p>
                <div className="flex flex-wrap gap-2">
                  {categories.map((cat) => (
                    <Badge key={cat} variant="secondary" className="text-sm">
                      {CATEGORY_LABELS[cat]}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Separator className="mb-6" />

            {/* Reports */}
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
                Community reports ({reportCount})
              </h2>
              {reports.map((report) => (
                <ReportCard key={report.id} report={report} />
              ))}
            </div>
          </>
        )}

        {/* Report CTA */}
        <div className="mt-8 p-4 bg-gray-50 rounded-lg border text-center">
          <p className="text-sm text-gray-600 mb-3">
            Had a suspicious interaction with this {typeLabel.toLowerCase()}?
          </p>
          <Link
            href={`/report?type=${type}&value=${encodeURIComponent(normalized)}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700"
          >
            <AlertTriangle className="w-4 h-4" />
            Submit a report
          </Link>
        </div>
      </div>
    </>
  );
}

function StatCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-3 text-center ${highlight ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50"}`}>
      <p className={`text-lg font-bold ${highlight ? "text-red-800" : "text-gray-900"}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function ReportCard({ report }: { report: Report }) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">
              {CATEGORY_LABELS[report.category as ReportCategory]}
            </Badge>
            <Badge variant="outline" className="text-xs text-gray-500">
              via {PLATFORM_LABELS[report.platform as Platform]}
            </Badge>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Calendar className="w-3 h-3" />
            {new Date(report.created_at).toLocaleDateString("en-IN")}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <p className="text-sm text-gray-700">{report.description}</p>
        {report.amount_lost && (
          <p className="text-sm text-red-600 mt-2 font-medium">
            ₹{report.amount_lost.toLocaleString("en-IN")} involved
          </p>
        )}
        {report.evidence_urls.length > 0 && (
          <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
            <FileImage className="w-3 h-3" />
            {report.evidence_urls.length} screenshot{report.evidence_urls.length > 1 ? "s" : ""} attached
          </div>
        )}
        {report.source_type && report.source_confidence && (
          <div className="mt-2">
            <SourceBadge
              sourceType={report.source_type}
              sourceConfidence={report.source_confidence}
              sourceUrl={report.source_url}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NoReportsFound({
  type,
  normalized,
  typeLabel,
}: {
  type: EntityType;
  normalized: string;
  typeLabel: string;
}) {
  return (
    <Alert className="border-green-200 bg-green-50">
      <Shield className="h-4 w-4 text-green-600" />
      <AlertDescription className="text-green-800">
        No reports found for this {typeLabel.toLowerCase()}.
        This does not guarantee it is safe — always exercise caution.{" "}
        <Link
          href={`/report?type=${type}&value=${encodeURIComponent(normalized)}`}
          className="underline font-medium"
        >
          Submit a report
        </Link>{" "}
        if you have experienced suspicious activity.
      </AlertDescription>
    </Alert>
  );
}
