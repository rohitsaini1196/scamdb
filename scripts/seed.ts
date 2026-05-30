/**
 * Seed script — bulk import known suspicious entities.
 * Usage: npx tsx scripts/seed.ts
 *
 * Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ws = require("ws");

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { realtime: { transport: ws } }
);

function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  return digits;
}

function normalizeUpi(raw: string): string {
  return raw.trim().toLowerCase();
}

interface SeedEntry {
  type: "phone" | "upi";
  value: string;
  category:
    | "financial_fraud"
    | "impersonation"
    | "lottery_scam"
    | "job_scam"
    | "investment_fraud"
    | "romance_scam"
    | "phishing"
    | "fake_customer_support"
    | "other";
  platform: "whatsapp" | "phone_call" | "sms" | "telegram" | "instagram" | "facebook" | "email" | "upi_app" | "other";
  description: string;
  amountLost?: number;
}

// ============================================================
// SEED DATA — replace/extend with real entries before running
// ============================================================
const SEED_DATA: SeedEntry[] = [
  {
    type: "phone",
    value: "9999999901",
    category: "lottery_scam",
    platform: "whatsapp",
    description: "Caller claimed recipient won ₹25 lakh in a KBC lottery. Asked for GST payment of ₹5000 to release prize money. Classic advance fee fraud.",
    amountLost: 5000,
  },
  {
    type: "phone",
    value: "9999999902",
    category: "fake_customer_support",
    platform: "phone_call",
    description: "Impersonated Amazon customer support. Asked to install AnyDesk for refund processing. Attempted to steal banking credentials.",
  },
  {
    type: "phone",
    value: "9999999903",
    category: "job_scam",
    platform: "telegram",
    description: "Offered data entry work from home job paying ₹15000/month. Asked for ₹2000 registration fee upfront. Disappeared after payment.",
    amountLost: 2000,
  },
  {
    type: "phone",
    value: "9999999904",
    category: "investment_fraud",
    platform: "whatsapp",
    description: "Added to a WhatsApp group promising 3x returns on stock tips. Initial small investment showed fake profits. Lost ₹50,000 when tried to withdraw.",
    amountLost: 50000,
  },
  {
    type: "phone",
    value: "9999999905",
    category: "impersonation",
    platform: "phone_call",
    description: "Claimed to be CBI officer, said recipient had pending arrest warrant. Asked for immediate payment of ₹10,000 to avoid arrest.",
    amountLost: 10000,
  },
  {
    type: "upi",
    value: "paytm.fraud01@paytm",
    category: "financial_fraud",
    platform: "upi_app",
    description: "Sent a collect request claiming to be from electricity department for bill payment. Amount was 5x actual bill.",
  },
  {
    type: "upi",
    value: "olx.scam22@oksbi",
    category: "financial_fraud",
    platform: "whatsapp",
    description: "OLX buyer scam. Sent fake QR code claiming it was for payment. Victim scanned and money was debited instead of credited.",
    amountLost: 8000,
  },
  {
    type: "upi",
    value: "militaryscam@ybl",
    category: "impersonation",
    platform: "facebook",
    description: "Romance scam posing as Indian Army officer deployed abroad. Built relationship over weeks then asked for medical emergency funds via UPI.",
    amountLost: 15000,
  },
  {
    type: "phone",
    value: "9999999906",
    category: "phishing",
    platform: "sms",
    description: "SMS claiming KYC expired, account will be blocked. Contained a phishing link mimicking SBI net banking. Credentials were stolen.",
  },
  {
    type: "phone",
    value: "9999999907",
    category: "financial_fraud",
    platform: "whatsapp",
    description: "Sent fake rent receipt and asked for advance rent via UPI. Property listing was stolen from legitimate source. Landlord was impersonated.",
    amountLost: 30000,
  },
  // --- Batch 2 ---
  {
    type: "phone",
    value: "8800000001",
    category: "fake_customer_support",
    platform: "phone_call",
    description: "Called claiming to be from HDFC Bank fraud prevention team. Asked for OTP to reverse a suspicious transaction. Used OTP to withdraw ₹40,000 from account.",
    amountLost: 40000,
  },
  {
    type: "phone",
    value: "8800000002",
    category: "investment_fraud",
    platform: "telegram",
    description: "Runs a Telegram channel promoting 'guaranteed' 5x returns on US stocks. Collected ₹1 lakh from multiple victims. Disappeared after collecting funds.",
    amountLost: 100000,
  },
  {
    type: "phone",
    value: "8800000003",
    category: "impersonation",
    platform: "whatsapp",
    description: "Posed as TRAI officer, threatened to disconnect mobile number for illegal activity. Demanded ₹5000 to 'clear the case'. Classic TRAI scam variant.",
    amountLost: 5000,
  },
  {
    type: "phone",
    value: "8800000004",
    category: "job_scam",
    platform: "instagram",
    description: "Offered work-from-home video editing job, ₹25,000/month. Sent a fake offer letter. Asked for ₹3,500 for training materials and laptop insurance. No response after payment.",
    amountLost: 3500,
  },
  {
    type: "phone",
    value: "8800000005",
    category: "phishing",
    platform: "sms",
    description: "Sent SMS: 'Your ICICI FastTag has expired. Recharge now to avoid penalty.' Link leads to a fake recharge portal that captures card details.",
  },
  {
    type: "upi",
    value: "quickloan99@okaxis",
    category: "financial_fraud",
    platform: "whatsapp",
    description: "Instant loan app scam. Offered ₹50,000 loan without documents. Collected processing fee of ₹2,000 upfront. App then demanded ₹5,000 more for GST. No loan disbursed.",
    amountLost: 7000,
  },
  {
    type: "upi",
    value: "helpdesk.refund@ybl",
    category: "fake_customer_support",
    platform: "whatsapp",
    description: "Posing as Meesho customer support. Promised refund for a damaged product. Sent a QR code 'to verify bank account' — victim lost ₹12,000 when scanned.",
    amountLost: 12000,
  },
  {
    type: "phone",
    value: "9100000001",
    category: "lottery_scam",
    platform: "phone_call",
    description: "Claimed victim won ₹15 lakh in BSNL 25th anniversary lucky draw. Asked for ₹1,800 courier fee to deliver the prize cheque. Classic fake lottery.",
    amountLost: 1800,
  },
  {
    type: "phone",
    value: "9100000002",
    category: "romance_scam",
    platform: "facebook",
    description: "Profile posed as NRI doctor working in Dubai. Built relationship over 3 months via Facebook and WhatsApp. Eventually asked for ₹80,000 for a medical emergency.",
    amountLost: 80000,
  },
  {
    type: "phone",
    value: "9100000003",
    category: "investment_fraud",
    platform: "whatsapp",
    description: "Added to a WhatsApp group called 'NSE Premium Tips'. Fake screenshots showed massive profits. Convinced victim to invest ₹2 lakh in an unregistered trading app. Funds locked.",
    amountLost: 200000,
  },
  {
    type: "upi",
    value: "fastcash.loan@paytm",
    category: "financial_fraud",
    platform: "sms",
    description: "Loan app sends pre-approved loan SMS. Collects Aadhaar, PAN, selfie. Disburses ₹500 then immediately sends recovery calls threatening family and sharing edited embarrassing photos.",
  },
  {
    type: "phone",
    value: "9200000001",
    category: "impersonation",
    platform: "phone_call",
    description: "Posed as customs officer at Mumbai airport. Said victim's parcel contained contraband. Threatened arrest. Demanded ₹25,000 to 'release the package'. Parcel never existed.",
    amountLost: 25000,
  },
  {
    type: "phone",
    value: "9200000002",
    category: "fake_customer_support",
    platform: "phone_call",
    description: "Called as Jio fiber technician, said there's a connection issue. Asked to download AnyDesk for remote fixing. Used remote access to open banking app and transferred funds.",
    amountLost: 55000,
  },
  {
    type: "phone",
    value: "9200000003",
    category: "phishing",
    platform: "whatsapp",
    description: "Sent WhatsApp message: 'Your EPFO account will be suspended. Update KYC at the link.' Link is a near-identical copy of the EPFO portal collecting Aadhaar + bank details.",
  },
  {
    type: "upi",
    value: "pmkisan.help@oksbi",
    category: "impersonation",
    platform: "sms",
    description: "SMS claiming PM-KISAN installment is pending, complete KYC via this UPI ID to receive ₹2,000. Targets rural users unfamiliar with government portals.",
  },
  {
    type: "phone",
    value: "9300000001",
    category: "job_scam",
    platform: "telegram",
    description: "Telegram group offering ₹500 per YouTube video like. Pays out small amount initially to build trust. Asks for ₹5,000 'task upgrade fee' to access higher-paying tasks. Classic task scam.",
    amountLost: 5000,
  },
  {
    type: "phone",
    value: "9300000002",
    category: "investment_fraud",
    platform: "whatsapp",
    description: "Offers 'copy trading' service. Shows fabricated screenshots of ₹5 lakh profit in 10 days. Charges ₹15,000 subscription. Platform not registered with SEBI.",
    amountLost: 15000,
  },
  {
    type: "upi",
    value: "bikri.deals22@okhdfcbank",
    category: "financial_fraud",
    platform: "facebook",
    description: "OLX/Facebook Marketplace seller scam. Listed second-hand iPhone 14 at ₹18,000. Collected advance of ₹5,000 via UPI. Blocked after payment. Item never shipped.",
    amountLost: 5000,
  },
  {
    type: "phone",
    value: "9300000003",
    category: "lottery_scam",
    platform: "sms",
    description: "SMS: 'Congratulations! Your number won ₹5,00,000 in the Amazon Spin & Win contest. Call immediately to claim.' No Amazon contest exists. Asks for processing fee.",
  },
  {
    type: "phone",
    value: "9400000001",
    category: "fake_customer_support",
    platform: "phone_call",
    description: "Pretended to be from Google Pay support team. Said account was flagged for suspicious activity. Asked to share screen via TeamViewer. Stole banking credentials visible on screen.",
    amountLost: 28000,
  },
  {
    type: "upi",
    value: "redcross.india@ybl",
    category: "other",
    platform: "whatsapp",
    description: "Fake charity collection during Chennai floods. Shared emotional videos with this UPI ID. Not affiliated with any registered NGO or Red Cross organization.",
  },
  {
    type: "phone",
    value: "9400000002",
    category: "impersonation",
    platform: "phone_call",
    description: "Claimed to be from Income Tax department. Said victim had tax dues of ₹45,000. Threatened immediate arrest unless paid. Asked for payment via gift cards. Never contact IT dept via phone for payments.",
    amountLost: 45000,
  },
  {
    type: "phone",
    value: "9400000003",
    category: "romance_scam",
    platform: "instagram",
    description: "Instagram profile with stock photos of attractive person. Matched with victim on Instagram. After weeks of conversation, claimed to be stuck abroad and needed ₹30,000 for flight home.",
    amountLost: 30000,
  },
  {
    type: "upi",
    value: "sbicard.help@oksbi",
    category: "phishing",
    platform: "sms",
    description: "SMS: 'SBI Card reward points expiring. Redeem at link.' UPI ID used to collect 'processing fee' of ₹99 to release reward points. Points never redeemed.",
    amountLost: 99,
  },
  {
    type: "phone",
    value: "9500000001",
    category: "job_scam",
    platform: "email",
    description: "Email offering remote QA testing job at ₹40,000/month for 2 hours daily. After accepting offer, asked for ₹4,200 for 'background verification report'. Company does not exist.",
    amountLost: 4200,
  },
  {
    type: "phone",
    value: "9500000002",
    category: "investment_fraud",
    platform: "telegram",
    description: "Admin of 'Crypto India Millionaires' Telegram group. Claims to have an algorithm that predicts Bitcoin movements with 98% accuracy. Collected ₹50,000 from multiple members.",
    amountLost: 50000,
  },
  {
    type: "upi",
    value: "trademaster.pro@okicici",
    category: "investment_fraud",
    platform: "instagram",
    description: "Instagram page showing luxury lifestyle, claims to make ₹1 lakh/day from trading. Offers paid mentorship for ₹20,000. After payment, sends copied YouTube trading content.",
    amountLost: 20000,
  },
  {
    type: "phone",
    value: "9500000003",
    category: "phishing",
    platform: "whatsapp",
    description: "Sent a WhatsApp message claiming Aadhaar will be deactivated unless linked with mobile within 24 hours. Attached link captures Aadhaar number and OTP.",
  },
  {
    type: "phone",
    value: "9600000001",
    category: "fake_customer_support",
    platform: "phone_call",
    description: "Called as Paytm KYC team. Said account will be suspended in 2 hours without video KYC. Connected to a 'senior officer' who walked victim through enabling screen share. Drained wallet.",
    amountLost: 9800,
  },
  {
    type: "upi",
    value: "visa.cashback23@paytm",
    category: "financial_fraud",
    platform: "sms",
    description: "SMS promising ₹3,000 cashback on Visa card. Asked to pay ₹1 to 'verify account'. Victim charged ₹1 but UPI collect request was for ₹5,000.",
    amountLost: 5000,
  },
];

async function seed() {
  console.log(`Seeding ${SEED_DATA.length} entries...\n`);
  let success = 0;
  let failed = 0;

  for (const entry of SEED_DATA) {
    const normalized =
      entry.type === "phone"
        ? normalizePhone(entry.value)
        : normalizeUpi(entry.value);

    // Upsert entity
    const { data: entity, error: entityErr } = await supabase
      .from("entities")
      .upsert(
        {
          type: entry.type,
          normalized_value: normalized,
          display_value: entry.value.trim(),
        },
        { onConflict: "type,normalized_value" }
      )
      .select()
      .single();

    if (entityErr || !entity) {
      console.error(`  ✗ Entity failed: ${entry.value} — ${entityErr?.message}`);
      failed++;
      continue;
    }

    // Insert report as pre-approved (seeded data)
    const { error: reportErr } = await supabase.from("reports").insert({
      entity_id: entity.id,
      category: entry.category,
      platform: entry.platform,
      description: entry.description,
      amount_lost: entry.amountLost ?? null,
      evidence_urls: [],
      status: "approved",
      created_by: "00000000-0000-0000-0000-000000000001", // seed user — must exist in auth.users or use service role bypass
    });

    if (reportErr) {
      console.error(`  ✗ Report failed: ${entry.value} — ${reportErr.message}`);
      failed++;
      continue;
    }

    // Manually update report_count since trigger fires on UPDATE not INSERT of approved
    await supabase
      .from("entities")
      .update({
        report_count: entity.report_count + 1,
        last_reported_at: new Date().toISOString(),
      })
      .eq("id", entity.id);

    console.log(`  ✓ ${entry.type.toUpperCase()} ${normalized}`);
    success++;
  }

  console.log(`\nDone. ${success} seeded, ${failed} failed.`);

  // Also support JSON file input: npx tsx scripts/seed.ts --file=seed-data.json
  const fileArg = process.argv.find((a) => a.startsWith("--file="));
  if (fileArg) {
    const filePath = fileArg.split("=")[1];
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as SeedEntry[];
    console.log(`\nProcessing ${raw.length} entries from ${filePath}...`);
    // Recursive call would work here — for now prompt user to extend SEED_DATA
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
