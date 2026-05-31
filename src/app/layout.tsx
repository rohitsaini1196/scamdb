import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "ScamDB India — Search Suspicious Numbers & UPI IDs",
    template: "%s | ScamDB India",
  },
  description:
    "Search suspicious phone numbers and UPI IDs reported by the Indian community. Check before you pay or share information.",
  keywords: [
    "scam number India",
    "UPI fraud",
    "fake UPI ID",
    "suspicious phone number",
    "scam check India",
    "fraud number database",
    "cybercrime India",
  ],
  openGraph: {
    title: "ScamDB India — Search Suspicious Numbers & UPI IDs",
    description:
      "Community-powered database of suspicious phone numbers and UPI IDs reported in India.",
    url: process.env.NEXT_PUBLIC_APP_URL,
    siteName: "ScamDB India",
    locale: "en_IN",
    type: "website",
    images: [{ url: "/logo.png", width: 1024, height: 1024, alt: "ScamDB India" }],
  },
  twitter: {
    card: "summary",
    title: "ScamDB India",
    description: "Community-powered database of suspicious phone numbers and UPI IDs reported in India.",
    images: ["/logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://scamdb.in"
  ),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen flex flex-col bg-background`}>
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
