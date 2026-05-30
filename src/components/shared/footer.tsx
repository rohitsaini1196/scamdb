import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t bg-gray-50 mt-16">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row justify-between gap-4 text-sm text-gray-500">
          <div>
            <p className="font-medium text-gray-700 mb-1">ScamDB India</p>
            <p>Community-powered fraud awareness database.</p>
          </div>
          <div className="flex flex-col gap-1">
            <Link href="/disclaimer" className="hover:text-gray-900 transition-colors">Disclaimer</Link>
            <Link href="/privacy" className="hover:text-gray-900 transition-colors">Privacy Policy</Link>
            <Link href="/dispute" className="hover:text-gray-900 transition-colors">Dispute / Takedown</Link>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-6">
          ScamDB India does not confirm or guarantee the accuracy of reports. All information is community-submitted and reviewed. If you believe a listing is incorrect, submit a dispute.
        </p>
      </div>
    </footer>
  );
}
