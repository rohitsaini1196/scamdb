import Link from "next/link";
import Image from "next/image";

export function Footer() {
  return (
    <footer className="mt-auto border-t" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
      <div className="max-w-[1080px] mx-auto px-6">
        <div className="flex justify-between gap-8 py-[34px] flex-wrap">
          <div>
            <div className="flex items-center gap-1.5 mb-2.5">
              <Image src="/logo.png" alt="ScamDB" width={30} height={30} />
              <span className="font-bold text-[17px] tracking-[-0.02em]" style={{ color: "var(--ink)" }}>ScamDB</span>
            </div>
            <p className="text-[13.5px] max-w-[30ch] leading-[1.5]" style={{ color: "var(--ink-2)" }}>
              A community-powered fraud awareness register. Check before you pay or share.
            </p>
          </div>
          <div className="flex flex-col gap-[9px] text-[14px]" style={{ color: "var(--ink-2)" }}>
            <Link href="/disclaimer" className="hover:opacity-80 transition-opacity">Disclaimer</Link>
            <Link href="/privacy" className="hover:opacity-80 transition-opacity">Privacy Policy</Link>
            <Link href="/dispute" className="hover:opacity-80 transition-opacity">Dispute / Takedown</Link>
          </div>
        </div>
        <div className="border-t py-[18px] text-[12.5px] leading-[1.5]" style={{ borderColor: "var(--line)", color: "var(--ink-3)" }}>
          ScamDB India does not confirm or guarantee the accuracy of reports. All information is community-submitted and reviewed before publishing. If you believe a listing is incorrect, submit a dispute.
        </div>
      </div>
    </footer>
  );
}
