import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy policy for ScamDB India.",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 prose prose-gray">
      <h1>Privacy Policy</h1>
      <p className="text-sm text-gray-500">Last updated: June 2025</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Email address</strong> — required for account creation. Used only for authentication.</li>
        <li><strong>Report content</strong> — descriptions, categories, and evidence you submit.</li>
        <li><strong>Usage data</strong> — anonymous analytics (page views, searches). No personally identifiable information.</li>
      </ul>

      <h2>What we do not collect</h2>
      <ul>
        <li>Your name, address, or phone number</li>
        <li>Payment information</li>
        <li>Device fingerprints or cross-site tracking</li>
      </ul>

      <h2>How we use your data</h2>
      <p>
        Your email is used solely for authentication. Report content is used to populate the public database after moderation. We do not sell, rent, or share your data with third parties for marketing purposes.
      </p>

      <h2>Data retention</h2>
      <p>
        Approved reports are retained indefinitely as part of the public database. Rejected reports are deleted after 90 days. You may request deletion of your account and associated data by emailing us.
      </p>

      <h2>Third-party services</h2>
      <ul>
        <li><strong>Supabase</strong> — database and authentication</li>
        <li><strong>Vercel</strong> — hosting</li>
        <li><strong>Cloudflare Turnstile</strong> — CAPTCHA (no cookies, privacy-preserving)</li>
      </ul>

      <h2>Contact</h2>
      <p>
        For data requests or privacy concerns, contact: privacy@scamdb.in
      </p>
    </div>
  );
}
