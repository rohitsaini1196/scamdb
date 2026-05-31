import { SearchBar } from "@/components/shared/search-bar";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const revalidate = 300;

async function getStats() {
  try {
    const supabase = await createClient();
    const [{ count: entities }, { count: reports }] = await Promise.all([
      supabase.from("entities").select("*", { count: "exact", head: true }),
      supabase.from("reports").select("*", { count: "exact", head: true }).eq("status", "approved"),
    ]);
    return { entities: entities ?? 0, reports: reports ?? 0 };
  } catch {
    return { entities: 0, reports: 0 };
  }
}

export default async function Home() {
  const stats = await getStats();

  return (
    <div className="flex flex-col">

      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="max-w-[1080px] mx-auto px-6 w-full">
        <section className="flex flex-col items-center text-center pt-[60px] pb-[50px]">

          {/* Kicker */}
          <span
            className="inline-flex items-center gap-2 px-[13px] py-[6px] rounded-full text-[13px] font-semibold border"
            style={{ color: "var(--navy)", background: "var(--navy-50)", borderColor: "var(--navy-100)" }}
          >
            <ShieldIcon size={14} />
            India&rsquo;s community fraud register
          </span>

          {/* Headline */}
          <h1
            className="font-bold mt-5 mb-0 leading-[1.04] tracking-[-0.022em] text-balance"
            style={{ fontSize: "clamp(31px,5.4vw,48px)", color: "var(--ink)", maxWidth: "16ch" }}
          >
            Know the number before you pay.
          </h1>

          {/* Lede */}
          <p
            className="mt-4 leading-[1.5]"
            style={{ fontSize: "clamp(15px,2vw,18px)", color: "var(--ink-2)", maxWidth: "56ch" }}
          >
            Search any Indian phone number or UPI ID against reports submitted by the community — before you send money or share personal details.
          </p>

          {/* Search */}
          <div className="w-full max-w-[580px] mt-[30px]">
            <SearchBar variant="hero" />
          </div>

          {/* Try examples */}
          <div className="flex gap-[9px] justify-center items-center mt-[15px] flex-wrap">
            <span className="text-[13px]" style={{ color: "var(--ink-3)" }}>Try</span>
            <Link href="/phone/9876543210">
              <span
                className="inline-flex items-center gap-[7px] px-3 py-[6px] rounded-full text-[13px] font-medium border cursor-pointer transition-colors hover:border-[var(--navy)] hover:text-[var(--navy)]"
                style={{ fontFamily: "var(--font-mono,'Geist Mono',monospace)", border: "1px solid var(--line)", color: "var(--ink-2)" }}
              >
                9876543210
              </span>
            </Link>
            <Link href="/upi/fake@ybl">
              <span
                className="inline-flex items-center gap-[7px] px-3 py-[6px] rounded-full text-[13px] font-medium border cursor-pointer transition-colors hover:border-[var(--navy)] hover:text-[var(--navy)]"
                style={{ fontFamily: "var(--font-mono,'Geist Mono',monospace)", border: "1px solid var(--line)", color: "var(--ink-2)" }}
              >
                fake@ybl
              </span>
            </Link>
          </div>

          {/* Trust stats */}
          <div className="flex gap-[clamp(26px,5vw,52px)] mt-[46px] flex-wrap justify-center">
            <div className="text-center">
              <div className="text-[26px] font-bold tracking-[-0.01em]" style={{ color: "var(--ink)" }}>
                {stats.entities > 0 ? `${stats.entities}+` : "—"}
              </div>
              <div className="text-[12.5px] mt-0.5" style={{ color: "var(--ink-2)" }}>Numbers flagged</div>
            </div>
            <div className="text-center">
              <div className="text-[26px] font-bold tracking-[-0.01em]" style={{ color: "var(--ink)" }}>
                {stats.reports > 0 ? `${stats.reports}+` : "—"}
              </div>
              <div className="text-[12.5px] mt-0.5" style={{ color: "var(--ink-2)" }}>Community reports</div>
            </div>
            <div className="text-center">
              <div className="text-[26px] font-bold tracking-[-0.01em]" style={{ color: "var(--ink)" }}>Free</div>
              <div className="text-[12.5px] mt-0.5" style={{ color: "var(--ink-2)" }}>Always public</div>
            </div>
          </div>
        </section>
      </div>

      {/* ── How it works ─────────────────────────────────────── */}
      <section
        className="border-t border-b py-[54px]"
        style={{ background: "var(--surface)", borderColor: "var(--line)" }}
      >
        <div className="max-w-[1080px] mx-auto px-6">
          <p className="text-center text-[11px] font-semibold tracking-[0.13em] uppercase mb-[34px]" style={{ color: "var(--ink-3)" }}>
            How it works
          </p>
          <div className="grid sm:grid-cols-3 gap-[30px]">
            {[
              {
                icon: <SearchIcon />,
                n: "01",
                title: "Search a number or UPI",
                desc: "Enter any Indian phone number or UPI ID. We check it against the community register instantly.",
              },
              {
                icon: <ListIcon />,
                n: "02",
                title: "See community reports",
                desc: "Read what others reported — what was attempted, how much was lost, and through which channel.",
              },
              {
                icon: <FlagIcon />,
                n: "03",
                title: "Report suspicious activity",
                desc: "Encountered something suspicious? Add a report to protect the next person. Reviewed before publishing.",
              },
            ].map((item) => (
              <div key={item.n} className="flex flex-col gap-3">
                <div
                  className="w-[42px] h-[42px] rounded-[11px] flex items-center justify-center border"
                  style={{ background: "var(--navy-50)", color: "var(--navy)", borderColor: "var(--navy-100)" }}
                >
                  {item.icon}
                </div>
                <div>
                  <p className="text-[12px] font-semibold" style={{ fontFamily: "var(--font-mono,'Geist Mono',monospace)", color: "var(--ink-3)" }}>{item.n}</p>
                  <h4 className="font-semibold mt-[9px] mb-[6px] text-[16px]" style={{ color: "var(--ink)" }}>{item.title}</h4>
                  <p className="text-[13.5px] leading-[1.5] m-0" style={{ color: "var(--ink-2)" }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Big CTA ──────────────────────────────────────────── */}
      <div className="max-w-[1080px] mx-auto px-6 w-full">
        <section className="text-center py-[50px]">
          <h3
            className="font-bold tracking-[-0.01em] m-0"
            style={{ fontSize: "clamp(22px,3.4vw,28px)", color: "var(--ink)" }}
          >
            Had a suspicious call, message or payment request?
          </h3>
          <p className="text-[15px] mt-3 mb-[22px]" style={{ color: "var(--ink-2)" }}>
            Your report is reviewed by a moderator before it appears. It protects the next person.
          </p>
          <Link href="/report">
            <button
              className="inline-flex items-center gap-[7px] h-12 px-[22px] rounded-full font-semibold text-[15px] transition-colors"
              style={{ background: "var(--navy)", color: "#fff" }}
            >
              <FlagIcon />
              Submit a report
              <ArrowIcon />
            </button>
          </Link>
        </section>

        <div className="text-center text-[13px] leading-[1.5] pb-[22px]" style={{ color: "var(--ink-3)" }}>
          Community-submitted reports, reviewed before publishing. ScamDB India is not a confirmation of fraud —{" "}
          <Link href="/disclaimer" className="underline underline-offset-[2px] hover:opacity-80 transition-opacity">
            read our disclaimer
          </Link>.
        </div>
      </div>

    </div>
  );
}

function ShieldIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size}>
      <path d="M12 2.6 5 5.1v6c0 4.4 3 7.7 7 9.6 4-1.9 7-5.2 7-9.6v-6L12 2.6Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}
function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" width={20} height={20}><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" /><path d="m20 20-3.4-3.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}
function ListIcon() {
  return <svg viewBox="0 0 24 24" fill="none" width={20} height={20}><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>;
}
function FlagIcon() {
  return <svg viewBox="0 0 24 24" fill="none" width={15} height={15}><path d="M5 21V4m0 1h11l-2 4 2 4H5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
function ArrowIcon() {
  return <svg viewBox="0 0 24 24" fill="none" width={16} height={16}><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
