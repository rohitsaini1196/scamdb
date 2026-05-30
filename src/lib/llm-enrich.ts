/**
 * LLM enrichment via GPT-4o-mini.
 * Only called AFTER deterministic extraction confirms ≥1 entity.
 * Improves: category, platform, summary. Does NOT do primary extraction.
 */

export interface LLMEnrichment {
  category: string;
  platform: string;
  summary: string;
  confidence: "low" | "medium" | "high";
  is_scam_related: boolean;
}

const SYSTEM_PROMPT = `You are a fraud signal analyst for ScamDB India, a public fraud awareness database for Indian users.

Your job: extract structured information from community posts about suspected fraud.

Rules:
- Use ONLY neutral language. Never write "scammer", "criminal", "fraudster".
- Write "suspicious activity reported", "community caution advised".
- Summary must be ≤150 chars, factual, neutral.
- If post is not clearly fraud-related, set is_scam_related: false.

Return ONLY valid JSON, no markdown, no explanation.`;

const USER_PROMPT = (content: string) => `Analyze this community post about suspected fraud in India:

---
${content.slice(0, 2000)}
---

Return JSON:
{
  "category": "financial_fraud"|"impersonation"|"lottery_scam"|"job_scam"|"investment_fraud"|"romance_scam"|"phishing"|"fake_customer_support"|"other",
  "platform": "whatsapp"|"phone_call"|"sms"|"telegram"|"instagram"|"facebook"|"email"|"upi_app"|"other",
  "summary": "<150 chars, neutral language>",
  "confidence": "low"|"medium"|"high",
  "is_scam_related": true|false
}`;

export async function enrichSignal(
  content: string,
  apiKey: string
): Promise<LLMEnrichment | null> {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 200,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: USER_PROMPT(content) },
        ],
      }),
    });

    if (!res.ok) return null;

    const data = await res.json() as {
      choices: { message: { content: string } }[];
    };

    const raw = data.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;

    // Strip markdown code blocks if model wraps in them
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(cleaned) as LLMEnrichment;

    // Validate required fields
    if (typeof parsed.is_scam_related !== "boolean") return null;
    if (!parsed.category || !parsed.platform || !parsed.summary) return null;

    return parsed;
  } catch {
    return null;
  }
}
