/**
 * Status Badge Component
 * 
 * Displays flow status with consistent styling
 */

import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Circle, SkipForward, AlertCircle } from "lucide-react";
import { getStatusColor, getStatusLabel, statusBadgeConfig } from "@/styles/flowStyles";
import { cn } from "@/lib/utils";

type StatusType = 'complete' | 'in_progress' | 'pending' | 'skipped' | 'error';

interface StatusBadgeProps {
  status: StatusType;
  showIcon?: boolean;
  className?: string;
}

const statusIcons = {
  complete: CheckCircle2,
  in_progress: Clock,
  pending: Circle,
  skipped: SkipForward,
  error: AlertCircle,
};

export function StatusBadge({ status, showIcon = true, className }: StatusBadgeProps) {
  const config = statusBadgeConfig[status] || statusBadgeConfig.pending;
  const Icon = statusIcons[status];

  return (
    <Badge
      variant="outline"
      className={cn(config.className, className)}
    >
      {showIcon && Icon && <Icon className="h-3 w-3 mr-1" />}
      {config.label}
    </Badge>
  );
}
