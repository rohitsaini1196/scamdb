"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2 } from "lucide-react";

export function DisputeForm() {
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/dispute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value, reason, contact }),
      });
      if (!res.ok) throw new Error("Submission failed");
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="text-center py-8">
        <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
        <p className="font-medium text-gray-900">Dispute submitted.</p>
        <p className="text-sm text-gray-500 mt-1">We will review within 7 business days.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1.5">
          Phone number or UPI ID in dispute *
        </label>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 9876543210 or name@ybl"
          required
        />
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1.5">
          Reason for dispute *
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder="Explain why you believe this listing is incorrect..."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
          required
          minLength={20}
        />
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1.5">
          Contact email *
        </label>
        <Input
          type="email"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="your@email.com"
          required
        />
      </div>
      <p className="text-xs text-gray-400">
        We may reach out for additional information. Your contact details are not published.
      </p>
      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Submitting..." : "Submit dispute"}
      </Button>
    </form>
  );
}
