"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { detectEntityType, normalizeEntity } from "@/lib/normalize";

interface SearchBarProps {
  defaultValue?: string;
  variant?: "default" | "hero";
  placeholder?: string;
}

export function SearchBar({ defaultValue = "", variant = "default", placeholder }: SearchBarProps) {
  const [value, setValue] = useState(defaultValue);
  const router = useRouter();

  const handleSearch = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const type = detectEntityType(trimmed);
    if (type) {
      const normalized = normalizeEntity(type, trimmed);
      router.push(`/${type}/${encodeURIComponent(normalized)}`);
    } else {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  };

  const ph = placeholder ?? "Enter phone number or UPI ID…";

  if (variant === "hero") {
    return (
      <div
        className="flex items-center gap-[8px] rounded-[14px] border transition-all"
        style={{
          height: 58,
          padding: "0 6px 0 18px",
          background: "var(--paper)",
          borderColor: "var(--line)",
          boxShadow: "0 4px 16px -6px rgba(20,30,50,.12), 0 1px 3px rgba(20,30,50,.06)",
        }}
        onFocus={e => ((e.currentTarget as HTMLElement).style.borderColor = "var(--navy)")}
        onBlur={e => ((e.currentTarget as HTMLElement).style.borderColor = "var(--line)")}
      >
        <SearchIcon />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder={ph}
          autoFocus
          className="flex-1 border-0 outline-none bg-transparent min-w-0"
          style={{ font: "500 16px var(--font-sans,system-ui)", color: "var(--ink)" }}
        />
        <button
          onClick={handleSearch}
          className="rounded-full font-semibold text-[13px] transition-opacity hover:opacity-90"
          style={{
            height: 40,
            padding: "0 18px",
            background: "var(--navy)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Search
        </button>
      </div>
    );
  }

  // Default (subbar / compact)
  return (
    <div
      className="flex items-center gap-[10px] border transition-all"
      style={{
        height: 46,
        padding: "0 6px 0 16px",
        borderRadius: 12,
        background: "var(--paper)",
        borderColor: "var(--line)",
        boxShadow: "0 1px 2px rgba(20,30,50,.05)",
        flex: 1,
      }}
      onFocus={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = "var(--navy)";
        el.style.boxShadow = "0 0 0 3px var(--navy-50)";
      }}
      onBlur={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = "var(--line)";
        el.style.boxShadow = "0 1px 2px rgba(20,30,50,.05)";
      }}
    >
      <span style={{ color: "var(--ink-3)", display: "flex", flex: "none" }}><SearchIcon /></span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
        placeholder={placeholder ?? "Search a phone number or UPI ID…"}
        className="flex-1 border-0 outline-none bg-transparent min-w-0"
        style={{ font: "500 16px var(--font-sans,system-ui)", color: "var(--ink)" }}
      />
      <button
        onClick={handleSearch}
        className="font-semibold text-[13px] rounded-full transition-opacity hover:opacity-90"
        style={{
          height: 34,
          padding: "0 15px",
          background: "var(--navy)",
          color: "#fff",
          border: "none",
          cursor: "pointer",
          whiteSpace: "nowrap",
          flex: "none",
        }}
      >
        Search
      </button>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={18} height={18}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="m20 20-3.4-3.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
