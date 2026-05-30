"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import Image from "next/image";

export function Navbar() {
  const [user, setUser] = useState<User | null>(null);
  const supabase = createClient();
  const pathname = usePathname();

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
    <nav className="border-b bg-white sticky top-0 z-50">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold text-gray-900">
          <Shield className="w-5 h-5 text-red-600" />
          ScamDB India
        </Link>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Link href="/report">
                <Button size="sm">Report</Button>
              </Link>
              <div className="flex items-center gap-2">
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt={displayName}
                    width={28}
                    height={28}
                    className="rounded-full"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                    {displayName[0].toUpperCase()}
                  </div>
                )}
                <span className="text-sm text-gray-600 hidden sm:block max-w-32 truncate">
                  {displayName}
                </span>
                <Button size="sm" variant="ghost" onClick={handleSignOut} className="text-gray-500">
                  Sign out
                </Button>
              </div>
            </>
          ) : (
            <>
              <Link href={`/auth/login?redirect=${encodeURIComponent(pathname)}`}>
                <Button size="sm" variant="ghost">Sign in</Button>
              </Link>
              <Link href="/report">
                <Button size="sm">Report</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
