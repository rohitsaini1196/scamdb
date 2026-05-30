"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { detectEntityType, normalizeEntity } from "@/lib/normalize";

interface SearchBarProps {
  defaultValue?: string;
  size?: "default" | "large";
}

export function SearchBar({ defaultValue = "", size = "default" }: SearchBarProps) {
  const [value, setValue] = useState(defaultValue);
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
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

  return (
    <form onSubmit={handleSearch} className="flex gap-2 w-full">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search phone number or UPI ID (e.g. 9876543210 or fake@ybl)"
          className={`pl-9 ${size === "large" ? "h-12 text-base" : ""}`}
        />
      </div>
      <Button type="submit" className={size === "large" ? "h-12 px-6" : ""}>
        Search
      </Button>
    </form>
  );
}
