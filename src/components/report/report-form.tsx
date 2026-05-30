"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CATEGORY_LABELS, PLATFORM_LABELS, MAX_EVIDENCE_FILES, MAX_EVIDENCE_SIZE_MB } from "@/lib/constants";
import { normalizeEntity, detectEntityType } from "@/lib/normalize";
import { createClient } from "@/lib/supabase/client";
import { Upload, X, CheckCircle2 } from "lucide-react";
import type { ReportCategory, Platform } from "@/types/database";

const reportSchema = z.object({
  entityType: z.enum(["phone", "upi"]),
  entityValue: z.string().min(5, "Enter a valid phone number or UPI ID"),
  category: z.enum([
    "financial_fraud", "impersonation", "lottery_scam", "job_scam",
    "investment_fraud", "romance_scam", "phishing", "fake_customer_support", "other"
  ] as const),
  platform: z.enum([
    "whatsapp", "phone_call", "sms", "telegram", "instagram",
    "facebook", "email", "upi_app", "other"
  ] as const),
  description: z.string().min(20, "Description must be at least 20 characters").max(1000),
  amountLost: z.string().optional(),
});

type ReportFormData = z.infer<typeof reportSchema>;

interface ReportFormProps {
  userId: string;
  defaultType?: "phone" | "upi";
  defaultValue?: string;
}

export function ReportForm({ userId, defaultType, defaultValue }: ReportFormProps) {
  const router = useRouter();
  const supabase = createClient();
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<ReportFormData>({
    resolver: zodResolver(reportSchema),
    defaultValues: {
      entityType: defaultType ?? (defaultValue ? detectEntityType(defaultValue) ?? "phone" : "phone"),
      entityValue: defaultValue ?? "",
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    const valid = selected.filter((f) => {
      if (f.size > MAX_EVIDENCE_SIZE_MB * 1024 * 1024) return false;
      if (!f.type.startsWith("image/")) return false;
      return true;
    });
    setFiles((prev) => [...prev, ...valid].slice(0, MAX_EVIDENCE_FILES));
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const onSubmit = async (data: ReportFormData) => {
    setSubmitting(true);
    setError(null);

    try {
      const normalized = normalizeEntity(data.entityType, data.entityValue);

      // Upload evidence files
      const evidenceUrls: string[] = [];
      for (const file of files) {
        const ext = file.name.split(".").pop();
        const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("evidence")
          .upload(path, file);
        if (uploadError) throw new Error("Failed to upload evidence");
        evidenceUrls.push(path);
      }

      // Submit via API route (uses service role for entity upsert)
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: data.entityType,
          entityValue: normalized,
          displayValue: data.entityValue.trim(),
          category: data.category,
          platform: data.platform,
          description: data.description,
          amountLost: data.amountLost ? parseFloat(data.amountLost) : null,
          evidenceUrls,
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Submission failed");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="text-center py-12">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Report submitted</h2>
        <p className="text-sm text-gray-500 mb-6">
          Your report is in the moderation queue and will be reviewed shortly.
          Thank you for helping the community.
        </p>
        <Button variant="outline" onClick={() => router.push("/")}>
          Back to home
        </Button>
      </div>
    );
  }

  const entityType = watch("entityType");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Entity type */}
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-2">
          What are you reporting? *
        </label>
        <div className="flex gap-3">
          {(["phone", "upi"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setValue("entityType", t)}
              className={`flex-1 py-2 px-4 rounded-lg border text-sm font-medium transition-colors ${
                entityType === t
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              {t === "phone" ? "Phone Number" : "UPI ID"}
            </button>
          ))}
        </div>
        {errors.entityType && (
          <p className="text-xs text-red-500 mt-1">{errors.entityType.message}</p>
        )}
      </div>

      {/* Entity value */}
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1.5">
          {entityType === "phone" ? "Phone Number" : "UPI ID"} *
        </label>
        <Input
          {...register("entityValue")}
          placeholder={entityType === "phone" ? "e.g. 9876543210" : "e.g. name@ybl"}
        />
        {errors.entityValue && (
          <p className="text-xs text-red-500 mt-1">{errors.entityValue.message}</p>
        )}
      </div>

      {/* Category */}
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-2">
          Category *
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(CATEGORY_LABELS) as [ReportCategory, string][]).map(([val, label]) => {
            const selected = watch("category") === val;
            return (
              <button
                key={val}
                type="button"
                onClick={() => setValue("category", val)}
                className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                  selected
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {errors.category && (
          <p className="text-xs text-red-500 mt-1">{errors.category.message}</p>
        )}
      </div>

      {/* Platform */}
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-2">
          How did they contact you? *
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(PLATFORM_LABELS) as [Platform, string][]).map(([val, label]) => {
            const selected = watch("platform") === val;
            return (
              <button
                key={val}
                type="button"
                onClick={() => setValue("platform", val)}
                className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                  selected
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {errors.platform && (
          <p className="text-xs text-red-500 mt-1">{errors.platform.message}</p>
        )}
      </div>

      {/* Description */}
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1.5">
          Brief description *
        </label>
        <textarea
          {...register("description")}
          rows={4}
          placeholder="Describe the suspicious activity (min. 20 characters). Do not include your personal details."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
        />
        {errors.description && (
          <p className="text-xs text-red-500 mt-1">{errors.description.message}</p>
        )}
      </div>

      {/* Amount lost */}
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1.5">
          Amount involved (₹) — optional
        </label>
        <Input
          {...register("amountLost")}
          type="number"
          min="0"
          placeholder="e.g. 5000"
        />
      </div>

      {/* Evidence upload */}
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1.5">
          Screenshot evidence (optional, max {MAX_EVIDENCE_FILES})
        </label>
        <label className="flex items-center gap-2 cursor-pointer w-fit px-4 py-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 hover:border-gray-400 transition-colors">
          <Upload className="w-4 h-4" />
          Upload screenshots
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
        </label>
        <p className="text-xs text-gray-400 mt-1">
          Max {MAX_EVIDENCE_SIZE_MB}MB per file. JPEG, PNG, WebP only.
        </p>
        {files.length > 0 && (
          <div className="mt-2 space-y-1">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                <span className="truncate max-w-xs">{f.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legal note */}
      <p className="text-xs text-gray-400">
        By submitting, you confirm this information is accurate to the best of your knowledge.
        False reports may result in account suspension.
      </p>

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Submitting..." : "Submit report"}
      </Button>
    </form>
  );
}
