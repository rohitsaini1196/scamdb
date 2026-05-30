import type { EntityType } from "@/types/database";

export function normalizePhone(raw: string): string {
  // Strip everything non-digit
  let digits = raw.replace(/\D/g, "");
  // Remove country code +91 if present
  if (digits.startsWith("91") && digits.length === 12) {
    digits = digits.slice(2);
  }
  return digits;
}

export function normalizeUpi(raw: string): string {
  return raw.trim().toLowerCase();
}

export function normalizeEntity(type: EntityType, value: string): string {
  if (type === "phone") return normalizePhone(value);
  if (type === "upi") return normalizeUpi(value);
  return value.trim().toLowerCase();
}

export function detectEntityType(value: string): EntityType | null {
  const cleaned = value.trim();
  // UPI IDs contain @
  if (cleaned.includes("@")) return "upi";
  // Phone: 10 digits, optionally prefixed with +91 or 0
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length === 10 || (digits.length === 12 && digits.startsWith("91"))) {
    return "phone";
  }
  return null;
}

export function formatPhone(normalized: string): string {
  if (normalized.length === 10) {
    return `+91 ${normalized.slice(0, 5)} ${normalized.slice(5)}`;
  }
  return normalized;
}
