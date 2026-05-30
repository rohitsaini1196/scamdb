"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  CATEGORY_LABELS,
  PLATFORM_LABELS,
  SOURCE_TYPE_LABELS,
  SOURCE_CONFIDENCE_COLORS,
  SOURCE_CONFIDENCE_LABELS,
} from "@/lib/constants";
import { formatPhone } from "@/lib/normalize";
import { Check, X, EyeOff, FileImage, Link, Copy } from "lucide-react";
import type { ReportCategory, Platform, SourceType, SourceConfidence } from "@/types/database";

interface Report {
  id: string;
  category: string;
  platform: string;
  description: string;
  amount_lost: number | null;
  evidence_urls: string[];
  source_type: string;
  source_url: string | null;
  source_confidence: string;
  captured_at: string | null;
  created_at: string;
  entities: {
    type: string;
    normalized_value: string;
    display_value: string;
    report_count: number;
  } | null;
}

interface ModerationQueueProps {
  reports: Report[];
}

type ActionType = "approved" | "rejected" | "hidden";

export function ModerationQueue({ reports: initial }: ModerationQueueProps) {
  const [reports, setReports] = useState(initial);
  const [processing, setProcessing] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const act = async (reportId: string, action: ActionType) => {
    setProcessing(reportId);
    try {
      await fetch("/api/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, action, notes: notes[reportId] }),
      });
      setReports((prev) => prev.filter((r) => r.id !== reportId));
    } finally {
      setProcessing(null);
    }
  };

  const actBulk = async (reportIds: string[], action: ActionType) => {
    setProcessing(reportIds[0]);
    try {
      await fetch("/api/moderation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportIds, action }),
      });
      setReports((prev) => prev.filter((r) => !reportIds.includes(r.id)));
    } finally {
      setProcessing(null);
    }
  };

  // Group by entity to surface duplicates
  const byEntity = reports.reduce<Record<string, Report[]>>((acc, r) => {
    const key = r.entities
      ? `${r.entities.type}:${r.entities.normalized_value}`
      : "unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  if (reports.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="font-medium">Queue empty.</p>
        <p className="text-sm mt-1">All reports reviewed.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Object.entries(byEntity).map(([entityKey, entityReports]) => {
        const entity = entityReports[0].entities;
        const isDuplicate = entityReports.length > 1;
        const existingCount = entity?.report_count ?? 0;
        const displayValue = entity
          ? entity.type === "phone"
            ? formatPhone(entity.normalized_value)
            : entity.normalized_value
          : "—";
        const typeLabel = entity?.type === "phone" ? "Phone" : "UPI";

        return (
          <div key={entityKey}>
            {/* Entity header */}
            <div className="flex items-center gap-3 mb-2 px-1 flex-wrap">
              <div>
                <span className="text-xs text-gray-400">{typeLabel} — </span>
                <span className="font-mono text-sm font-semibold text-gray-900">{displayValue}</span>
              </div>
              {existingCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {existingCount} existing approved report{existingCount > 1 ? "s" : ""}
                </Badge>
              )}
              {isDuplicate && (
                <Badge className="text-xs bg-orange-100 text-orange-700 border border-orange-200">
                  {entityReports.length} pending — possible duplicates
                </Badge>
              )}
              {isDuplicate && (
                <div className="flex gap-1 ml-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs px-2 gap-1 text-green-700 border-green-300 hover:bg-green-50"
                    disabled={processing !== null}
                    onClick={() => actBulk(entityReports.map((r) => r.id), "approved")}
                  >
                    <Check className="w-3 h-3" /> Approve all
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs px-2 gap-1 text-red-700 border-red-300 hover:bg-red-50"
                    disabled={processing !== null}
                    onClick={() => actBulk(entityReports.map((r) => r.id), "rejected")}
                  >
                    <X className="w-3 h-3" /> Reject all
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-3 pl-0">
              {entityReports.map((report) => {
                const busy = processing === report.id;
                const confidence = report.source_confidence as SourceConfidence;

                return (
                  <Card key={report.id} className="overflow-hidden">
                    <CardHeader className="pb-3 pt-4 px-4 bg-gray-50">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex gap-2 flex-wrap">
                          <Badge variant="secondary" className="text-xs">
                            {CATEGORY_LABELS[report.category as ReportCategory]}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {PLATFORM_LABELS[report.platform as Platform]}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Source type */}
                          <Badge variant="outline" className="text-xs gap-1">
                            {SOURCE_TYPE_LABELS[report.source_type as SourceType]}
                          </Badge>
                          {/* Confidence */}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${SOURCE_CONFIDENCE_COLORS[confidence]}`}>
                            {SOURCE_CONFIDENCE_LABELS[confidence]}
                          </span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 pt-3 space-y-3">
                      <p className="text-sm text-gray-700">{report.description}</p>

                      {report.amount_lost && (
                        <p className="text-sm text-red-600 font-medium">
                          ₹{report.amount_lost.toLocaleString("en-IN")} involved
                        </p>
                      )}

                      {report.source_url && (
                        <a
                          href={report.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
                          <Link className="w-3 h-3" />
                          View source
                        </a>
                      )}

                      {report.evidence_urls.length > 0 && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <FileImage className="w-3 h-3" />
                          {report.evidence_urls.length} screenshot(s) attached
                        </div>
                      )}

                      <div className="text-xs text-gray-400">
                        {report.captured_at
                          ? `Captured ${new Date(report.captured_at).toLocaleDateString("en-IN")}`
                          : `Submitted ${new Date(report.created_at).toLocaleString("en-IN")}`}
                      </div>

                      <Separator />

                      <textarea
                        placeholder="Moderation notes (optional)"
                        value={notes[report.id] ?? ""}
                        onChange={(e) =>
                          setNotes((prev) => ({ ...prev, [report.id]: e.target.value }))
                        }
                        rows={2}
                        className="w-full text-sm rounded-md border border-input px-3 py-2 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                      />

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 gap-1"
                          disabled={busy}
                          onClick={() => act(report.id, "approved")}
                        >
                          <Check className="w-3.5 h-3.5" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busy}
                          className="gap-1"
                          onClick={() => act(report.id, "rejected")}
                        >
                          <X className="w-3.5 h-3.5" /> Reject
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          className="gap-1"
                          onClick={() => act(report.id, "hidden")}
                        >
                          <EyeOff className="w-3.5 h-3.5" /> Hide
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
