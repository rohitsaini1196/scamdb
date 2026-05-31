export const dynamic = "force-dynamic";

import { AuthForm } from "@/components/shared/auth-form";
import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

interface Props {
  searchParams: Promise<{ redirect?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const { redirect } = await searchParams;
  return (
    <div className="min-h-[calc(100vh-66px)] flex items-center justify-center px-4 py-16" style={{ background: "var(--canvas)" }}>
      <div
        className="w-full max-w-[440px] rounded-[16px] border p-[34px] text-center"
        style={{ background: "var(--paper)", borderColor: "var(--line)", boxShadow: "0 4px 16px -6px rgba(20,30,50,.12), 0 1px 3px rgba(20,30,50,.06)" }}
      >
        {/* Logo */}
        <Image src="/logo.png" alt="ScamDB" width={54} height={54} className="mx-auto" />

        <h2 className="text-[22px] font-bold mt-4 tracking-[-0.01em]" style={{ color: "var(--ink)" }}>
          Sign in to ScamDB
        </h2>
        <p className="text-[14.5px] mt-[9px] leading-[1.5] max-w-[32ch] mx-auto" style={{ color: "var(--ink-2)" }}>
          Required to submit reports. Your reports are reviewed before they appear publicly.
        </p>

        <AuthForm redirectTo={redirect ?? "/"} />

        {/* Trust note */}
        <div
          className="flex items-start gap-[9px] mt-5 text-left rounded-[11px] p-[13px] border"
          style={{ background: "var(--clear-soft)", borderColor: "color-mix(in srgb, var(--clear-line) 24%, transparent)" }}
        >
          <CheckIcon />
          <p className="text-[12.5px] leading-[1.5] m-0" style={{ color: "var(--ink-2)" }}>
            <strong style={{ color: "var(--ink)", fontWeight: 600 }}>Only your email is stored.</strong>{" "}
            No personal data is published. Reports are anonymous to other users.
          </p>
        </div>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={16} height={16} style={{ color: "var(--clear-fg)", flexShrink: 0, marginTop: 1 }}>
      <path d="m5 12.5 4.5 4.5L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
