import { Badge } from "@/components/ui/badge";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";

interface CautionBadgeProps {
  reportCount: number;
  confidenceScore: number;
}

export function CautionBadge({ reportCount, confidenceScore }: CautionBadgeProps) {
  if (reportCount === 0) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Info className="w-3 h-3" />
        No reports
      </Badge>
    );
  }

  if (confidenceScore >= 80) {
    return (
      <Badge className="gap-1 bg-red-100 text-red-800 hover:bg-red-100 border border-red-200">
        <AlertTriangle className="w-3 h-3" />
        High caution advised
      </Badge>
    );
  }

  if (confidenceScore >= 50) {
    return (
      <Badge className="gap-1 bg-orange-100 text-orange-800 hover:bg-orange-100 border border-orange-200">
        <AlertCircle className="w-3 h-3" />
        Caution advised
      </Badge>
    );
  }

  return (
    <Badge className="gap-1 bg-yellow-100 text-yellow-800 hover:bg-yellow-100 border border-yellow-200">
      <AlertCircle className="w-3 h-3" />
      Suspicious activity reported
    </Badge>
  );
}
