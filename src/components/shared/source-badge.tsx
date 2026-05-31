interface SourceBadgeProps {
  sourceType:       string;
  sourceConfidence: string;
  sourceUrl?:       string | null;
}

const SOURCE_LABELS: Record<string, string> = {
  police_advisory: "Police Advisory",
  news:            "News Report",
  reddit:          "Reddit",
  twitter:         "X / Twitter",
  facebook:        "Facebook",
  telegram:        "Telegram",
  manual:          "Community report",
  other:           "Community report",
};

const SOURCE_DOT: Record<string, string> = {
  reddit:          "#ff4500",
  twitter:         "#1d9bf0",
  police_advisory: "var(--clear-line)",
  news:            "var(--clear-line)",
};

export function SourceBadge({ sourceType, sourceConfidence, sourceUrl }: SourceBadgeProps) {
  if (sourceType === "manual" && sourceConfidence === "low") return null;

  const label = SOURCE_LABELS[sourceType] ?? "Community report";
  const dotColor = SOURCE_DOT[sourceType] ?? "var(--ink-3)";
  const isMod = sourceType === "police_advisory" || sourceType === "news";

  const badge = (
    <span
      className="inline-flex items-center gap-[6px] rounded-full font-medium text-[11.5px] border"
      style={{
        padding: "3px 9px 3px 7px",
        color: "var(--ink-2)",
        background: "var(--surface)",
        borderColor: "var(--line)",
      }}
    >
      <span
        className="w-[6px] h-[6px] rounded-full flex-none"
        style={{ background: isMod ? "var(--clear-line)" : dotColor }}
      />
      {label}
      {sourceUrl && <span style={{ opacity: 0.5, fontSize: 10 }}>↗</span>}
    </span>
  );

  if (sourceUrl) {
    return (
      <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex hover:opacity-80 transition-opacity">
        {badge}
      </a>
    );
  }

  return badge;
}
