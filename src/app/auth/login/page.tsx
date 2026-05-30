import { AuthForm } from "@/components/shared/auth-form";
import { Shield } from "lucide-react";
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
    <div className="max-w-sm mx-auto px-4 py-20">
      <div className="flex flex-col items-center mb-8 gap-3">
        <Shield className="w-8 h-8 text-red-600" />
        <h1 className="text-xl font-bold text-gray-900">Sign in to ScamDB</h1>
        <p className="text-sm text-gray-500 text-center">
          Required to submit reports. No personal info stored beyond email.
        </p>
      </div>
      <AuthForm redirectTo={redirect ?? "/"} />
    </div>
  );
}
