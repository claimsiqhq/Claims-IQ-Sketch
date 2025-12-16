/**
 * Peril Badge Component
 *
 * Displays canonical peril badges with appropriate colors and labels.
 * Supports both primary and secondary peril display.
 *
 * Part of the Peril Parity initiative - ensures ALL perils are displayed
 * consistently without bias toward wind/hail.
 */

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Peril, PERIL_LABELS, PERIL_COLORS, PERIL_HINTS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AlertCircle, Wind, Flame, Droplets, CloudRain, CloudFog, Bug, Car, HelpCircle } from "lucide-react";

// Map peril to icon
const PERIL_ICONS: Record<Peril, React.ComponentType<{ className?: string }>> = {
  [Peril.WIND_HAIL]: Wind,
  [Peril.FIRE]: Flame,
  [Peril.WATER]: Droplets,
  [Peril.FLOOD]: CloudRain,
  [Peril.SMOKE]: CloudFog,
  [Peril.MOLD]: Bug, // Using Bug as closest icon for mold/fungi
  [Peril.IMPACT]: Car,
  [Peril.OTHER]: HelpCircle,
};

interface PerilBadgeProps {
  peril: Peril | string;
  variant?: "primary" | "secondary";
  showIcon?: boolean;
  showTooltip?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Normalize string peril value to Peril enum
 */
function normalizePeril(value: Peril | string): Peril {
  if (Object.values(Peril).includes(value as Peril)) {
    return value as Peril;
  }
  // Try to match by string value
  const normalized = value.toLowerCase().replace(/[\s\/]+/g, '_');
  for (const p of Object.values(Peril)) {
    if (p === normalized || p.replace('_', '') === normalized.replace('_', '')) {
      return p;
    }
  }
  return Peril.OTHER;
}

export function PerilBadge({
  peril,
  variant = "primary",
  showIcon = true,
  showTooltip = true,
  size = "md",
  className,
}: PerilBadgeProps) {
  const normalizedPeril = normalizePeril(peril);
  const colors = PERIL_COLORS[normalizedPeril];
  const label = PERIL_LABELS[normalizedPeril];
  const hint = PERIL_HINTS[normalizedPeril];
  const Icon = PERIL_ICONS[normalizedPeril];

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5",
    md: "text-sm px-2 py-0.5",
    lg: "text-base px-3 py-1",
  };

  const iconSizeClasses = {
    sm: "h-3 w-3",
    md: "h-3.5 w-3.5",
    lg: "h-4 w-4",
  };

  const badge = (
    <Badge
      variant="outline"
      className={cn(
        "font-medium border",
        colors.bg,
        colors.text,
        colors.border,
        sizeClasses[size],
        variant === "secondary" && "opacity-80",
        className
      )}
    >
      {showIcon && Icon && (
        <Icon className={cn("mr-1", iconSizeClasses[size])} />
      )}
      {label}
    </Badge>
  );

  if (!showTooltip || !hint) {
    return badge;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <p>{hint}</p>
      </TooltipContent>
    </Tooltip>
  );
}

interface PerilBadgeGroupProps {
  primaryPeril?: Peril | string;
  secondaryPerils?: (Peril | string)[];
  showIcons?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Displays primary peril with optional secondary perils
 * Example: Fire · Smoke · Water
 */
export function PerilBadgeGroup({
  primaryPeril,
  secondaryPerils = [],
  showIcons = true,
  size = "md",
  className,
}: PerilBadgeGroupProps) {
  if (!primaryPeril && secondaryPerils.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {primaryPeril && (
        <PerilBadge
          peril={primaryPeril}
          variant="primary"
          showIcon={showIcons}
          size={size}
        />
      )}
      {secondaryPerils.map((peril, index) => (
        <PerilBadge
          key={`${peril}-${index}`}
          peril={peril}
          variant="secondary"
          showIcon={showIcons}
          size={size}
        />
      ))}
    </div>
  );
}

interface PerilAdvisoryBannerProps {
  peril: Peril | string;
  className?: string;
}

/**
 * Displays a peril-specific advisory banner
 * Used for important notices like flood coverage warnings
 */
export function PerilAdvisoryBanner({
  peril,
  className,
}: PerilAdvisoryBannerProps) {
  const normalizedPeril = normalizePeril(peril);
  const hint = PERIL_HINTS[normalizedPeril];
  const colors = PERIL_COLORS[normalizedPeril];

  if (!hint) {
    return null;
  }

  // Only show banner for certain perils with important advisories
  const showBanner = [Peril.FLOOD, Peril.MOLD].includes(normalizedPeril);

  if (!showBanner) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-start gap-2 p-3 rounded-md border",
        colors.bg,
        colors.border,
        className
      )}
    >
      <AlertCircle className={cn("h-4 w-4 mt-0.5 flex-shrink-0", colors.text)} />
      <p className={cn("text-sm", colors.text)}>{hint}</p>
    </div>
  );
}

/**
 * Displays a subtle peril hint (not a full banner)
 * For prompting user to confirm details
 */
export function PerilHint({
  peril,
  className,
}: PerilAdvisoryBannerProps) {
  const normalizedPeril = normalizePeril(peril);
  const hint = PERIL_HINTS[normalizedPeril];

  if (!hint) {
    return null;
  }

  // Don't show hint for perils that already have banners
  const hasBanner = [Peril.FLOOD, Peril.MOLD].includes(normalizedPeril);
  if (hasBanner) {
    return null;
  }

  return (
    <p className={cn("text-xs text-muted-foreground italic", className)}>
      {hint}
    </p>
  );
}

export default PerilBadge;
