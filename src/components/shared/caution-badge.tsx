interface CautionBadgeProps {
  reportCount: number;
  confidenceScore: number;
  size?: "sm" | "md" | "lg";
}

function getLevel(score: number, count: number) {
  if (count === 0) return "clear";
  if (score >= 80)  return "high";
  if (score >= 50)  return "med";
  return "low";
}

const LEVELS = {
  clear: { label: "No reports",    fg: "var(--ink-3)",   bg: "var(--surface)", line_: "var(--line)"      },
  low:   { label: "Low caution",   fg: "var(--low-fg)",  bg: "var(--low-bg)",  line_: "var(--low-line)"  },
  med:   { label: "Caution",       fg: "var(--med-fg)",  bg: "var(--med-bg)",  line_: "var(--med-line)"  },
  high:  { label: "High caution",  fg: "var(--high-fg)", bg: "var(--high-bg)", line_: "var(--high-line)" },
};

export function CautionBadge({ reportCount, confidenceScore, size = "md" }: CautionBadgeProps) {
  const level = getLevel(confidenceScore, reportCount);
  const m = LEVELS[level];
  const pad = size === "lg" ? "7px 15px 7px 12px" : size === "sm" ? "3px 9px 3px 7px" : "5px 11px 5px 9px";
  const fs  = size === "lg" ? 14 : size === "sm" ? 11.5 : 12.5;
  const is  = size === "lg" ? 15 : 14;

  return (
    <span
      className="inline-flex items-center gap-[7px] rounded-full font-semibold border whitespace-nowrap"
      style={{
        padding: pad, fontSize: fs,
        color: m.fg, background: m.bg,
        borderColor: `color-mix(in srgb, ${m.line_} 34%, transparent)`,
      }}
    >
      <ShieldIcon size={is} />
      {m.label}
    </span>
  );
}

function ShieldIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size}>
      <path d="M12 2.6 5 5.1v6c0 4.4 3 7.7 7 9.6 4-1.9 7-5.2 7-9.6v-6L12 2.6Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}
