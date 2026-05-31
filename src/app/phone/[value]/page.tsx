import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { normalizeEntity, formatPhone } from "@/lib/normalize";
import { EntityPageContent } from "@/components/shared/entity-page-content";

interface Props {
  params: Promise<{ value: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { value } = await params;
  const normalized = normalizeEntity("phone", decodeURIComponent(value));
  const displayValue = formatPhone(normalized);

  const supabase = await createClient();
  const { data: entity } = await supabase
    .from("entities")
    .select("report_count")
    .eq("type", "phone")
    .eq("normalized_value", normalized)
    .single();

  const count = entity?.report_count ?? 0;
  const title =
    count > 0
      ? `${displayValue} — ${count} Report${count > 1 ? "s" : ""} | ScamDB India`
      : `${displayValue} — Phone Number Check | ScamDB India`;

  return {
    title,
    description:
      count > 0
        ? `${count} community report${count > 1 ? "s" : ""} found for phone number ${displayValue}. Check suspicious activity on ScamDB India before paying or sharing information.`
        : `No reports found for phone number ${displayValue} on ScamDB India. Search Indian phone numbers and UPI IDs for fraud warnings.`,
    openGraph: {
      title,
      description: `Community reports for ${displayValue} — ScamDB India`,
    },
  };
}

export default async function PhonePage({ params }: Props) {
  const { value } = await params;
  const decoded = decodeURIComponent(value);
  const normalized = normalizeEntity("phone", decoded);

  if (!/^\d{10}$/.test(normalized)) notFound();

  const supabase = await createClient();
  const displayValue = formatPhone(normalized);

  const { data: entity } = await supabase
    .from("entities")
    .select("*")
    .eq("type", "phone")
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
      type="phone"
      normalized={normalized}
      displayValue={displayValue}
      entity={entity ?? null}
      reports={reports ?? []}
    />
  );
}
