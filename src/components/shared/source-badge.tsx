import type { SourceType, SourceConfidence } from "@/types/database";

const SOURCE_LABELS: Record<string, string> = {
  police_advisory: "Police Advisory",
  news:            "News Report",
  reddit:          "Reddit",
  twitter:         "X / Twitter",
  facebook:        "Facebook",
  telegram:        "Telegram",
  manual:          "Community Report",
  other:           "Community Report",
};

const SOURCE_ICONS: Record<string, string> = {
  reddit:   "r/",
  twitter:  "𝕏",
  facebook: "f",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high:   "bg-blue-50 text-blue-700 border-blue-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low:    "bg-gray-50 text-gray-500 border-gray-200",
};

const CONFIDENCE_DOT: Record<string, string> = {
  high:   "bg-blue-500",
  medium: "bg-amber-400",
  low:    "bg-gray-400",
};

interface SourceBadgeProps {
  sourceType:       string;
  sourceConfidence: string;
  sourceUrl?:       string | null;
}

export function SourceBadge({ sourceType, sourceConfidence, sourceUrl }: SourceBadgeProps) {
  if (sourceType === "manual" && sourceConfidence === "low") return null;

  const label      = SOURCE_LABELS[sourceType] ?? "Community Report";
  const colorClass = CONFIDENCE_COLORS[sourceConfidence] ?? CONFIDENCE_COLORS.low;
  const dotClass   = CONFIDENCE_DOT[sourceConfidence] ?? CONFIDENCE_DOT.low;
  const icon       = SOURCE_ICONS[sourceType];

  const badge = (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border ${colorClass}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
      {icon && <span className="font-mono text-[10px] opacity-60">{icon}</span>}
      {label}
      {sourceUrl && (
        <span className="opacity-50 text-[10px]">↗</span>
      )}
    </span>
  );

  if (sourceUrl) {
    return (
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex hover:opacity-80 transition-opacity"
        title={`View original post on ${label}`}
      >
        {badge}
      </a>
    );
  }

  return badge;
}
