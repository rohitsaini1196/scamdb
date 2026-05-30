import { ReportForm } from "@/components/report/report-form";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Submit a Report",
  description: "Report a suspicious phone number or UPI ID to warn the Indian community.",
  robots: { index: false, follow: false },
};

interface Props {
  searchParams: Promise<{ type?: string; value?: string }>;
}

export default async function ReportPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?redirect=/report");
  }

  const { type, value } = await searchParams;

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Submit a report</h1>
        <p className="text-sm text-gray-500">
          Reports are reviewed by moderators before becoming public. Provide accurate information only.
        </p>
      </div>
      <ReportForm
        userId={user.id}
        defaultType={type as "phone" | "upi" | undefined}
        defaultValue={value}
      />
    </div>
  );
}
