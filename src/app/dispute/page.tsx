import { DisputeForm } from "@/components/shared/dispute-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dispute / Takedown Request",
  description: "Request removal or correction of a listing on ScamDB India.",
};

export default function DisputePage() {
  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <h1 className="text-xl font-bold text-gray-900 mb-2">Dispute a listing</h1>
      <p className="text-sm text-gray-500 mb-8">
        If you believe a phone number or UPI ID listed on ScamDB India has been reported incorrectly, submit a dispute. We review all requests within 7 business days.
      </p>
      <DisputeForm />
    </div>
  );
}
