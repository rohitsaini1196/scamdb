import type { ReportCategory, Platform, SourceType, SourceConfidence } from "@/types/database";

export const CATEGORY_LABELS: Record<ReportCategory, string> = {
  financial_fraud: "Financial Fraud",
  impersonation: "Impersonation",
  lottery_scam: "Lottery / Prize Scam",
  job_scam: "Fake Job Offer",
  investment_fraud: "Investment Fraud",
  romance_scam: "Romance Scam",
  phishing: "Phishing",
  fake_customer_support: "Fake Customer Support",
  other: "Other",
};

export const PLATFORM_LABELS: Record<Platform, string> = {
  whatsapp: "WhatsApp",
  phone_call: "Phone Call",
  sms: "SMS",
  telegram: "Telegram",
  instagram: "Instagram",
  facebook: "Facebook",
  email: "Email",
  upi_app: "UPI App",
  other: "Other",
};

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  manual: "Manual report",
  reddit: "Reddit",
  twitter: "X / Twitter",
  facebook: "Facebook",
  police_advisory: "Police Advisory",
  news: "News article",
  telegram: "Telegram",
  other: "Other",
};

export const SOURCE_CONFIDENCE_LABELS: Record<SourceConfidence, string> = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
};

export const SOURCE_CONFIDENCE_COLORS: Record<SourceConfidence, string> = {
  low: "bg-gray-100 text-gray-600",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-green-100 text-green-700",
};

export const TRUSTED_REPORT_THRESHOLD = 5;

export const MAX_EVIDENCE_FILES = 3;
export const MAX_EVIDENCE_SIZE_MB = 5;

// Auto-approve reports from trusted users in these low-risk categories
export const AUTO_APPROVE_TRUSTED_CATEGORIES: ReportCategory[] = [
  "financial_fraud",
  "fake_customer_support",
  "lottery_scam",
  "job_scam",
];
