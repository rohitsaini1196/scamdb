"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import Image from "next/image";

export function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const displayName = (user?.user_metadata?.full_name as string | undefined)
    ?? user?.email?.split("@")[0]
    ?? "Account";

  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{ background: "rgba(255,255,255,.86)", backdropFilter: "saturate(1.4) blur(10px)", borderColor: "var(--line)" }}
    >
      <div className="max-w-[1080px] mx-auto px-6">
        <div className="h-[66px] flex items-center justify-between">

          {/* Brand */}
          <Link href="/" className="flex items-center gap-1.5 hover:opacity-90 transition-opacity">
            <Image src="/logo.png" alt="ScamDB" width={44} height={44} priority />
            <span className="font-bold text-[22px] tracking-[-0.02em] leading-none" style={{ color: "var(--ink)" }}>
              ScamDB
            </span>
          </Link>

          {/* Nav actions */}
          <div className="flex items-center gap-[18px]">
            {user ? (
              <>
                <div className="flex items-center gap-2">
                  {avatarUrl ? (
                    <Image src={avatarUrl} alt={displayName} width={28} height={28} className="rounded-full" />
                  ) : (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
                      style={{ background: "var(--navy-50)", color: "var(--navy)" }}
                    >
                      {displayName[0].toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm hidden sm:block max-w-[120px] truncate" style={{ color: "var(--ink-2)" }}>
                    {displayName}
                  </span>
                  <button
                    onClick={handleSignOut}
                    className="text-sm transition-colors"
                    style={{ color: "var(--ink-3)" }}
                    onMouseOver={e => (e.currentTarget.style.color = "var(--ink)")}
                    onMouseOut={e => (e.currentTarget.style.color = "var(--ink-3)")}
                  >
                    Sign out
                  </button>
                </div>
                <Link href="/report">
                  <button
                    className="inline-flex items-center gap-1.5 h-[34px] px-[15px] rounded-full font-semibold text-[13px] border transition-colors"
                    style={{ background: "var(--navy)", color: "#fff", borderColor: "transparent" }}
                  >
                    <FlagIcon />
                    Report a number
                  </button>
                </Link>
              </>
            ) : (
              <Link href="/report">
                <button
                  className="inline-flex items-center gap-1.5 h-[34px] px-[15px] rounded-full font-semibold text-[13px] border transition-colors"
                  style={{ background: "var(--paper)", color: "var(--ink)", borderColor: "var(--line-strong)" }}
                  onMouseOver={e => ((e.currentTarget as HTMLElement).style.background = "var(--surface)")}
                  onMouseOut={e => ((e.currentTarget as HTMLElement).style.background = "var(--paper)")}
                >
                  <FlagIcon />
                  Report a number
                </button>
              </Link>
            )}
          </div>

        </div>
      </div>
    </header>
  );
}

function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={15} height={15}>
      <path d="M5 21V4m0 1h11l-2 4 2 4H5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
