import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Disclaimer",
  description: "Legal disclaimer for ScamDB India — community-submitted fraud reports.",
};

export default function DisclaimerPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 prose prose-gray">
      <h1>Disclaimer</h1>
      <p className="text-sm text-gray-500">Last updated: June 2025</p>

      <p>
        ScamDB India is a community-powered platform that allows users to submit and view reports of suspected fraudulent activity associated with phone numbers and UPI IDs in India.
      </p>

      <h2>Accuracy of Information</h2>
      <p>
        All reports on ScamDB India are submitted by members of the public and reviewed by moderators before publication. ScamDB India does not independently verify the accuracy of any report. The presence of a phone number or UPI ID on this platform does not constitute proof that the associated individual or business has engaged in fraud, illegal activity, or any wrongdoing.
      </p>

      <h2>Not Legal Advice</h2>
      <p>
        Nothing on this platform constitutes legal advice. If you have been the victim of financial fraud, we encourage you to file a complaint with the National Cybercrime Reporting Portal (cybercrime.gov.in) or your local police.
      </p>

      <h2>Limitation of Liability</h2>
      <p>
        ScamDB India and its operators accept no responsibility for actions taken based on information found on this platform. Use the information here as one data point, not a definitive determination of any individual&apos;s character or conduct.
      </p>

      <h2>Dispute and Takedown</h2>
      <p>
        If you believe a listing is incorrect, inaccurate, or harmful, you may submit a dispute request. We review all disputes and remove or modify listings where appropriate.
      </p>
    </div>
  );
}
