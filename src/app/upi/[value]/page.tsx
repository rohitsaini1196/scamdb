import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { normalizeEntity } from "@/lib/normalize";
import { EntityPageContent } from "@/components/shared/entity-page-content";

interface Props {
  params: Promise<{ value: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { value } = await params;
  const normalized = normalizeEntity("upi", decodeURIComponent(value));

  const supabase = await createClient();
  const { data: entity } = await supabase
    .from("entities")
    .select("report_count")
    .eq("type", "upi")
    .eq("normalized_value", normalized)
    .single();

  const count = entity?.report_count ?? 0;
  const title =
    count > 0
      ? `${normalized} — ${count} Report${count > 1 ? "s" : ""} | ScamDB India`
      : `${normalized} — UPI ID Check | ScamDB India`;

  return {
    title,
    description:
      count > 0
        ? `${count} community report${count > 1 ? "s" : ""} found for UPI ID ${normalized}. Check suspicious activity on ScamDB India before sending money.`
        : `No reports found for UPI ID ${normalized} on ScamDB India. Search Indian UPI IDs and phone numbers for fraud warnings.`,
    openGraph: {
      title,
      description: `Community reports for ${normalized} — ScamDB India`,
    },
  };
}

export default async function UpiPage({ params }: Props) {
  const { value } = await params;
  const decoded = decodeURIComponent(value);
  const normalized = normalizeEntity("upi", decoded);

  if (!normalized.includes("@")) notFound();

  const supabase = await createClient();

  const { data: entity } = await supabase
    .from("entities")
    .select("*")
    .eq("type", "upi")
    .eq("normalized_value", normalized)
    .single();

  const { data: reports } = entity
    ? await supabase
        .from("reports")
        .select("id, category, platform, description, amount_lost, evidence_urls, source_type, source_confidence, source_url, created_at")
        .eq("entity_id", entity.id)
        .eq("status", "approved")
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <EntityPageContent
      type="upi"
      normalized={normalized}
      displayValue={normalized}
      entity={entity ?? null}
      reports={reports ?? []}
    />
  );
}
