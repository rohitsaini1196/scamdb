import { SearchBar } from "@/components/shared/search-bar";
import { Shield, Search, FileWarning } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center">
      {/* Hero */}
      <section className="w-full bg-gradient-to-b from-red-50 to-white px-4 py-16 sm:py-24 flex flex-col items-center text-center">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-8 h-8 text-red-600" />
          <span className="text-sm font-medium text-red-700 bg-red-100 px-3 py-1 rounded-full">
            Community-powered fraud awareness
          </span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 max-w-xl mb-4 leading-tight">
          Check before you pay or share
        </h1>
        <p className="text-gray-500 mb-8 max-w-md">
          Search phone numbers and UPI IDs reported by the Indian community. Free, public, and community-verified.
        </p>
        <div className="w-full max-w-xl">
          <SearchBar size="large" />
        </div>
        <div className="mt-4 flex gap-4 text-xs text-gray-400">
          <span>Try: 9876543210</span>
          <span>•</span>
          <span>Try: fraudster@ybl</span>
        </div>
      </section>

      {/* How it works */}
      <section className="w-full max-w-4xl px-4 py-16">
        <h2 className="text-xl font-semibold text-gray-900 text-center mb-10">How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <Search className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="font-medium text-gray-900">Search</h3>
            <p className="text-sm text-gray-500">Enter a phone number or UPI ID you want to check before sending money or sharing information.</p>
          </div>
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
              <FileWarning className="w-5 h-5 text-orange-600" />
            </div>
            <h3 className="font-medium text-gray-900">See reports</h3>
            <p className="text-sm text-gray-500">View community-submitted reports with categories, platforms, and evidence. Reviewed before going public.</p>
          </div>
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <Shield className="w-5 h-5 text-green-600" />
            </div>
            <h3 className="font-medium text-gray-900">Stay safe</h3>
            <p className="text-sm text-gray-500">If you've been targeted, submit a report to warn others. Sign in with email — no personal info required.</p>
          </div>
        </div>
      </section>

      {/* Disclaimer strip */}
      <section className="w-full bg-gray-50 border-t border-b px-4 py-5">
        <p className="text-xs text-gray-500 text-center max-w-2xl mx-auto">
          ScamDB India does not confirm or guarantee the accuracy of any report. All listings represent community-submitted information reviewed by moderators. If you believe a listing is incorrect, you can{" "}
          <Link href="/dispute" className="underline hover:text-gray-800">request a dispute</Link>.
        </p>
      </section>
    </div>
  );
}
