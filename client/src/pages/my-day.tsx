import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { useDeviceMode } from "@/contexts/DeviceModeContext";
import { useStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  MapPin,
  Clock,
  AlertTriangle,
  CloudRain,
  Wind,
  Snowflake,
  Sun,
  CloudLightning,
  Thermometer,
  ChevronRight,
  ChevronDown,
  Navigation,
  Calendar,
  Shield,
  AlertCircle,
  Timer,
  FileWarning,
  Droplets,
  Flame,
  Zap,
  CircleDot,
  Car,
} from "lucide-react";
import {
  Peril,
  PERIL_LABELS,
  PERIL_COLORS,
  type MyDayData,
  type InspectionStop,
  type OnDeckClaim,
  type RiskWatchItem,
  type WeatherCondition,
  type SlaHygieneItem,
  type InspectionBadge,
  type WeatherConditionType,
} from "@/lib/types";
import { format } from "date-fns";

// ==========================================
// DATA TRANSFORMATION UTILITIES
// ==========================================

function mapLossTypeToPeril(lossType: string | null | undefined): Peril {
  if (!lossType) return Peril.OTHER;
  const lt = lossType.toLowerCase();
  if (lt.includes("wind") || lt.includes("hail")) return Peril.WIND_HAIL;
  if (lt.includes("water") || lt.includes("plumbing") || lt.includes("leak")) return Peril.WATER;
  if (lt.includes("fire")) return Peril.FIRE;
  if (lt.includes("flood")) return Peril.FLOOD;
  if (lt.includes("smoke")) return Peril.SMOKE;
  if (lt.includes("mold")) return Peril.MOLD;
  if (lt.includes("impact") || lt.includes("tree") || lt.includes("vehicle")) return Peril.IMPACT;
  return Peril.OTHER;
}

function buildEmptyDayData(adjusterName: string): MyDayData {
  return {
    date: new Date().toISOString(),
    context: {
      adjusterName,
      territory: "",
      catEvent: undefined,
      inspectionCount: 0,
      riskCount: 0,
      slaDeadlineCount: 0,
      hasWeatherAlert: false,
      hasSafetyAlert: false,
      hasSlaBreach: false,
    },
    route: [],
    onDeck: [],
    riskWatch: [],
    weather: [],
    slaHygiene: [],
  };
}

interface ClaimFromAPI {
  id: string;
  claimNumber: string;
  insuredName: string;
  propertyAddress: string;
  propertyCity: string;
  propertyState: string;
  propertyZip: string;
  lossType: string;
  lossDescription: string;
  status: string;
  dateOfLoss: string;
  createdAt: string;
  metadata?: {
    lat?: number;
    lng?: number;
    geocoded?: boolean;
  };
}

function transformClaimsToMyDayData(claims: ClaimFromAPI[], adjusterName: string): MyDayData {
  if (!claims || claims.length === 0) {
    return buildEmptyDayData(adjusterName);
  }

  const openClaims = claims.filter(c => c.status !== "closed" && c.status !== "draft");
  const activeClaims = openClaims.filter(c => 
    ["open", "in_progress", "fnol"].includes(c.status)
  );
  const reviewClaims = openClaims.filter(c => c.status === "review");

  const route: InspectionStop[] = activeClaims.slice(0, 8).map((claim, index) => {
    const hour = 8 + index;
    return {
      id: `stop-${claim.id}`,
      claimId: claim.id,
      claimNumber: claim.claimNumber || `CLM-${claim.id.slice(0, 8)}`,
      insuredName: claim.insuredName || "Unknown Insured",
      address: claim.propertyAddress || "Address pending",
      city: claim.propertyCity || "",
      state: claim.propertyState || "",
      zip: claim.propertyZip || "",
      lat: claim.metadata?.lat || 0,
      lng: claim.metadata?.lng || 0,
      timeWindow: { 
        start: `${hour.toString().padStart(2, "0")}:00`, 
        end: `${(hour + 1).toString().padStart(2, "0")}:00` 
      },
      peril: mapLossTypeToPeril(claim.lossType),
      reason: claim.lossDescription || `${claim.lossType || "Property"} inspection`,
      badges: claim.status === "fnol" ? ["sla_today" as InspectionBadge] : [],
      estimatedDuration: 60,
      travelTimeFromPrevious: index === 0 ? 0 : 15,
    };
  });

  const onDeck: OnDeckClaim[] = reviewClaims.slice(0, 5).map((claim) => ({
    id: `deck-${claim.id}`,
    claimId: claim.id,
    claimNumber: claim.claimNumber || `CLM-${claim.id.slice(0, 8)}`,
    peril: mapLossTypeToPeril(claim.lossType),
    reason: claim.status === "review" ? "Pending review" : "Follow-up required",
    priority: "medium" as const,
  }));

  return {
    date: new Date().toISOString(),
    context: {
      adjusterName,
      territory: "",
      catEvent: undefined,
      inspectionCount: route.length,
      riskCount: 0,
      slaDeadlineCount: route.filter(r => r.badges.includes("sla_today")).length,
      hasWeatherAlert: false,
      hasSafetyAlert: false,
      hasSlaBreach: false,
    },
    route,
    onDeck,
    riskWatch: [],
    weather: [
      // No weather data - would come from weather API in production
    ],
    slaHygiene: [],
  };
}


// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function getPerilIcon(peril: Peril) {
  switch (peril) {
    case Peril.WIND_HAIL:
      return Wind;
    case Peril.WATER:
      return Droplets;
    case Peril.FIRE:
      return Flame;
    case Peril.FLOOD:
      return CloudRain;
    case Peril.SMOKE:
      return CircleDot;
    case Peril.MOLD:
      return CircleDot;
    case Peril.IMPACT:
      return Zap;
    default:
      return CircleDot;
  }
}

function getWeatherIcon(type: WeatherConditionType) {
  switch (type) {
    case "rain":
      return CloudRain;
    case "freeze":
      return Snowflake;
    case "wind":
      return Wind;
    case "heat":
      return Thermometer;
    case "storm":
      return CloudLightning;
    default:
      return Sun;
  }
}

function getBadgeLabel(badge: InspectionBadge): string {
  switch (badge) {
    case "mitigation_likely":
      return "Mitigation";
    case "evidence_at_risk":
      return "Evidence Risk";
    case "sla_today":
      return "SLA Today";
    case "contact_required":
      return "Contact Req";
    default:
      return badge;
  }
}

function getBadgeStyle(badge: InspectionBadge) {
  switch (badge) {
    case "mitigation_likely":
      return "bg-accent/20 text-accent-foreground border-accent/30";
    case "evidence_at_risk":
      return "bg-destructive/10 text-destructive border-destructive/20";
    case "sla_today":
      return "bg-primary/10 text-primary border-primary/20";
    case "contact_required":
      return "bg-secondary/20 text-secondary-foreground border-secondary/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function formatTimeWindow(start: string, end: string): string {
  const formatTime = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour = h % 12 || 12;
    return `${hour}:${m.toString().padStart(2, "0")}${period}`;
  };
  return `${formatTime(start)} – ${formatTime(end)}`;
}

// ==========================================
// MOBILE COMPONENTS
// ==========================================

// Mobile Day Context Bar
function MobileDayContextBar({ context }: { context: MyDayData["context"] }) {
  const today = format(new Date(), "EEE, MMM d");

  return (
    <div className="bg-white border-b border-border px-4 py-3">
      {/* Name and Date Row */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-display font-bold text-foreground">
            My Day
          </h1>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {today}
            {context.territory && (
              <>
                <span className="text-border">•</span>
                <span>{context.territory}</span>
              </>
            )}
          </p>
        </div>
        {context.catEvent && (
          <Badge className="bg-accent/20 text-accent-foreground border-accent/30 text-xs">
            {context.catEvent}
          </Badge>
        )}
      </div>

      {/* Stats Row - Horizontal Scroll */}
      <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-hide">
        <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 shrink-0">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Navigation className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-lg font-bold text-foreground">{context.inspectionCount}</p>
            <p className="text-xs text-muted-foreground">stops</p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2 shrink-0">
          <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </div>
          <div>
            <p className="text-lg font-bold text-foreground">{context.riskCount}</p>
            <p className="text-xs text-muted-foreground">at risk</p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-accent/10 border border-accent/20 rounded-lg px-3 py-2 shrink-0">
          <div className="h-8 w-8 rounded-full bg-accent/20 flex items-center justify-center">
            <Timer className="h-4 w-4 text-accent-foreground" />
          </div>
          <div>
            <p className="text-lg font-bold text-foreground">{context.slaDeadlineCount}</p>
            <p className="text-xs text-muted-foreground">SLAs</p>
          </div>
        </div>

        {/* Alert Icons */}
        {(context.hasWeatherAlert || context.hasSafetyAlert || context.hasSlaBreach) && (
          <div className="flex items-center gap-1.5 pl-2 shrink-0">
            {context.hasWeatherAlert && (
              <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center">
                <CloudRain className="h-4 w-4 text-amber-600" />
              </div>
            )}
            {context.hasSafetyAlert && (
              <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center">
                <Shield className="h-4 w-4 text-destructive" />
              </div>
            )}
            {context.hasSlaBreach && (
              <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center animate-pulse">
                <AlertCircle className="h-4 w-4 text-destructive" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Desktop Day Context Bar
function DesktopDayContextBar({ context }: { context: MyDayData["context"] }) {
  const today = format(new Date(), "EEEE, MMMM d, yyyy");

  return (
    <div className="bg-white border-b border-border px-6 py-4">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        {/* Left: Title and Info */}
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">
            My Day
          </h1>
          <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
            <Calendar className="h-4 w-4" />
            {today}
            {context.territory && (
              <>
                <span className="text-border">•</span>
                <span>{context.territory}</span>
              </>
            )}
            {context.catEvent && (
              <>
                <span className="text-border">•</span>
                <Badge className="bg-accent/20 text-accent-foreground border-accent/30 text-xs">
                  {context.catEvent}
                </Badge>
              </>
            )}
          </p>
        </div>

        {/* Right: Stats */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Navigation className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{context.inspectionCount}</p>
              <p className="text-xs text-muted-foreground">inspections</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{context.riskCount}</p>
              <p className="text-xs text-muted-foreground">at risk</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-accent/20 flex items-center justify-center">
              <Timer className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{context.slaDeadlineCount}</p>
              <p className="text-xs text-muted-foreground">SLA deadlines</p>
            </div>
          </div>

          {/* Alert Icons */}
          {(context.hasWeatherAlert || context.hasSafetyAlert || context.hasSlaBreach) && (
            <div className="flex items-center gap-2 pl-4 border-l border-border">
              {context.hasWeatherAlert && (
                <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center" title="Weather Alert">
                  <CloudRain className="h-5 w-5 text-amber-600" />
                </div>
              )}
              {context.hasSafetyAlert && (
                <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center" title="Safety Alert">
                  <Shield className="h-5 w-5 text-destructive" />
                </div>
              )}
              {context.hasSlaBreach && (
                <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center animate-pulse" title="SLA Breach">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Mobile Route Stop Card
function MobileRouteStopCard({
  stop,
  index,
  weatherAlert,
}: {
  stop: InspectionStop;
  index: number;
  weatherAlert?: WeatherCondition;
}) {
  const PerilIcon = getPerilIcon(stop.peril);
  const perilColors = PERIL_COLORS[stop.peril] || PERIL_COLORS[Peril.OTHER];

  return (
    <Link href={`/claim/${stop.claimId}`}>
      <div className={cn(
        "bg-white border rounded-xl active:bg-muted transition-colors min-tap-target",
        weatherAlert ? "border-amber-300 bg-amber-50/50" : "border-border"
      )}>
        {/* Weather Alert Banner */}
        {weatherAlert && (
          <div className="flex items-center gap-2 text-amber-700 text-xs px-3 py-2 border-b border-amber-200 bg-amber-50">
            <CloudRain className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{weatherAlert.description}</span>
          </div>
        )}

        <div className="p-3">
          <div className="flex gap-3">
            {/* Stop Number */}
            <div className={cn(
              "h-11 w-11 rounded-full flex items-center justify-center font-bold text-lg shrink-0",
              perilColors.bg, perilColors.text
            )}>
              {index + 1}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Time */}
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-sm font-semibold text-foreground">
                  {formatTimeWindow(stop.timeWindow.start, stop.timeWindow.end)}
                </span>
                {stop.travelTimeFromPrevious && index > 0 && (
                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                    <Car className="h-3 w-3" />
                    {stop.travelTimeFromPrevious}m
                  </span>
                )}
              </div>

              {/* Name and Claim */}
              <p className="font-medium text-foreground truncate">{stop.insuredName}</p>
              <p className="text-sm text-muted-foreground">{stop.claimNumber}</p>

              {/* Reason */}
              <p className="text-sm text-foreground mt-1">{stop.reason}</p>

              {/* Badges */}
              {stop.badges.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {stop.badges.map((badge) => (
                    <Badge
                      key={badge}
                      variant="outline"
                      className={cn("text-xs", getBadgeStyle(badge))}
                    >
                      {getBadgeLabel(badge)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Peril Icon & Chevron */}
            <div className="flex flex-col items-center justify-between shrink-0">
              <PerilIcon className={cn("h-5 w-5", perilColors.text)} />
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </div>

          {/* Address */}
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-2 pt-2 border-t border-border">
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="truncate">{stop.address}, {stop.city}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 ml-auto" />
          </div>

          {/* Notes */}
          {stop.notes && (
            <p className="text-xs text-muted-foreground mt-2 italic bg-muted/50 rounded px-2 py-1.5">
              {stop.notes}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

// Desktop Route Stop Card
function DesktopRouteStopCard({
  stop,
  index,
  isLast,
  weatherAlert,
}: {
  stop: InspectionStop;
  index: number;
  isLast: boolean;
  weatherAlert?: WeatherCondition;
}) {
  const PerilIcon = getPerilIcon(stop.peril);
  const perilColors = PERIL_COLORS[stop.peril] || PERIL_COLORS[Peril.OTHER];

  return (
    <div className="relative">
      {/* Timeline connector */}
      {!isLast && (
        <div className="absolute left-6 top-16 bottom-0 w-0.5 bg-border" />
      )}

      <Link href={`/claim/${stop.claimId}`}>
        <div className={cn(
          "relative bg-white border rounded-xl transition-all hover:shadow-md hover:border-primary/30 cursor-pointer p-4",
          weatherAlert && "border-amber-300 bg-amber-50/30"
        )}>
          {/* Weather warning banner */}
          {weatherAlert && (
            <div className="flex items-center gap-2 text-amber-700 text-sm mb-3 pb-3 border-b border-amber-200">
              <CloudRain className="h-4 w-4" />
              <span>{weatherAlert.description} — {weatherAlert.impact}</span>
            </div>
          )}

          <div className="flex gap-4">
            {/* Stop number indicator */}
            <div className="flex-shrink-0">
              <div className={cn(
                "h-12 w-12 rounded-full flex items-center justify-center font-bold text-lg",
                perilColors.bg, perilColors.text
              )}>
                {index + 1}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Time and claim info */}
              <div className="flex items-start justify-between gap-2 mb-1">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-foreground">
                      {formatTimeWindow(stop.timeWindow.start, stop.timeWindow.end)}
                    </span>
                    {stop.travelTimeFromPrevious && index > 0 && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Car className="h-3 w-3" />
                        {stop.travelTimeFromPrevious} min drive
                      </span>
                    )}
                  </div>
                  <p className="font-medium text-foreground">{stop.insuredName}</p>
                  <p className="text-sm text-muted-foreground">{stop.claimNumber}</p>
                </div>
                <div className="flex items-center gap-2">
                  <PerilIcon className={cn("h-5 w-5", perilColors.text)} />
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </div>

              {/* Address */}
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
                <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{stop.address}, {stop.city}, {stop.state}</span>
              </div>

              {/* Reason for visit */}
              <p className="text-sm text-foreground mb-2">{stop.reason}</p>

              {/* Badges */}
              {stop.badges.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {stop.badges.map((badge) => (
                    <Badge
                      key={badge}
                      variant="outline"
                      className={cn("text-xs", getBadgeStyle(badge))}
                    >
                      {getBadgeLabel(badge)}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Notes */}
              {stop.notes && (
                <p className="text-xs text-muted-foreground mt-2 italic bg-muted/50 rounded px-2 py-1.5">
                  {stop.notes}
                </p>
              )}
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}

// Today's Route Section
function TodaysRoute({
  route,
  weather,
  isMobile,
}: {
  route: InspectionStop[];
  weather: WeatherCondition[];
  isMobile: boolean;
}) {
  const getWeatherAlertForStop = (stop: InspectionStop) => {
    return weather.find((w) => w.affectedClaimIds.includes(stop.claimId));
  };

  return (
    <section className={cn(isMobile ? "px-4 py-4" : "px-6 py-6")}>
      <div className={cn(!isMobile && "max-w-5xl mx-auto")}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-display font-semibold text-foreground flex items-center gap-2">
            <Navigation className="h-5 w-5 text-primary" />
            Today's Route
          </h2>
          <span className="text-sm text-muted-foreground">
            {route.length} stop{route.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="space-y-3">
          {route.map((stop, index) =>
            isMobile ? (
              <MobileRouteStopCard
                key={stop.id}
                stop={stop}
                index={index}
                weatherAlert={getWeatherAlertForStop(stop)}
              />
            ) : (
              <DesktopRouteStopCard
                key={stop.id}
                stop={stop}
                index={index}
                isLast={index === route.length - 1}
                weatherAlert={getWeatherAlertForStop(stop)}
              />
            )
          )}
        </div>
      </div>
    </section>
  );
}

// On Deck Claim Card
function OnDeckCard({ claim, isMobile }: { claim: OnDeckClaim; isMobile: boolean }) {
  const PerilIcon = getPerilIcon(claim.peril);
  const perilColors = PERIL_COLORS[claim.peril] || PERIL_COLORS[Peril.OTHER];

  return (
    <Link href={`/claim/${claim.claimId}`}>
      <div className={cn(
        "bg-white border border-border rounded-xl active:bg-muted hover:border-primary/30 transition-all cursor-pointer min-tap-target",
        isMobile ? "p-3" : "p-4"
      )}>
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
            perilColors.bg
          )}>
            <PerilIcon className={cn("h-5 w-5", perilColors.text)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">{claim.claimNumber}</span>
              {claim.slaHoursRemaining !== undefined && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    claim.slaHoursRemaining <= 4
                      ? "bg-destructive/10 text-destructive border-destructive/20"
                      : claim.slaHoursRemaining <= 8
                      ? "bg-accent/20 text-accent-foreground border-accent/30"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {claim.slaHoursRemaining}h
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate">{claim.reason}</p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
        </div>
      </div>
    </Link>
  );
}

// Claims On Deck Section
function ClaimsOnDeck({ claims, isMobile }: { claims: OnDeckClaim[]; isMobile: boolean }) {
  if (claims.length === 0) return null;

  return (
    <section className={cn(
      "border-t border-border bg-muted/30",
      isMobile ? "px-4 py-4" : "px-6 py-6"
    )}>
      <div className={cn(!isMobile && "max-w-5xl mx-auto")}>
        <h2 className="text-lg font-display font-semibold text-foreground mb-1 flex items-center gap-2">
          <FileWarning className="h-5 w-5 text-muted-foreground" />
          On Deck Today
          <span className="text-sm font-normal text-muted-foreground">({claims.length})</span>
        </h2>
        <p className="text-sm text-muted-foreground mb-4">Non-field work requiring attention</p>

        <div className={cn(
          "grid gap-2",
          isMobile ? "grid-cols-1" : "grid-cols-2"
        )}>
          {claims.map((claim) => (
            <OnDeckCard key={claim.id} claim={claim} isMobile={isMobile} />
          ))}
        </div>
      </div>
    </section>
  );
}

// Risk Watch Card
function RiskWatchCard({ item, isMobile }: { item: RiskWatchItem; isMobile: boolean }) {
  const PerilIcon = getPerilIcon(item.peril);

  return (
    <Link href={`/claim/${item.claimId}`}>
      <div className={cn(
        "border rounded-xl transition-all active:opacity-90 hover:shadow-md cursor-pointer min-tap-target",
        item.severity === "critical"
          ? "bg-destructive/5 border-destructive/30"
          : "bg-amber-50 border-amber-300",
        isMobile ? "p-3" : "p-4"
      )}>
        <div className="flex items-start gap-3">
          <div className={cn(
            "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
            item.severity === "critical" ? "bg-destructive/10" : "bg-amber-100"
          )}>
            <AlertTriangle className={cn(
              "h-5 w-5",
              item.severity === "critical" ? "text-destructive" : "text-amber-600"
            )} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-medium text-foreground">{item.claimNumber}</span>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs font-mono shrink-0",
                  item.hoursUntilCritical <= 4
                    ? "bg-destructive/10 text-destructive border-destructive/20"
                    : "bg-amber-100 text-amber-700 border-amber-300"
                )}
              >
                {item.hoursUntilCritical}h
              </Badge>
            </div>
            <p className="text-sm text-foreground font-medium">{item.riskDescription}</p>
            <div className="flex items-center gap-2 mt-1">
              <PerilIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{PERIL_LABELS[item.peril]}</span>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 self-center" />
        </div>
      </div>
    </Link>
  );
}

// Risk & Mitigation Watch Section
function RiskMitigationWatch({
  risks,
  isMobile,
}: {
  risks: RiskWatchItem[];
  isMobile: boolean;
}) {
  if (risks.length === 0) return null;

  return (
    <section className={cn(
      "border-t-4 border-amber-400 bg-gradient-to-b from-amber-50 to-background",
      isMobile ? "px-4 py-4" : "px-6 py-6"
    )}>
      <div className={cn(!isMobile && "max-w-5xl mx-auto")}>
        <h2 className="text-lg font-display font-semibold text-foreground mb-1 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          Risk Watch
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Active damage or evidence at risk — time-sensitive
        </p>

        <div className="space-y-2">
          {risks.map((item) => (
            <RiskWatchCard key={item.id} item={item} isMobile={isMobile} />
          ))}
        </div>
      </div>
    </section>
  );
}

// Weather Condition Card
function WeatherCard({ condition, isMobile }: { condition: WeatherCondition; isMobile: boolean }) {
  const WeatherIcon = getWeatherIcon(condition.type);
  const severityStyles = {
    advisory: "bg-sky-50 border-sky-300 text-sky-800",
    warning: "bg-amber-50 border-amber-300 text-amber-800",
    danger: "bg-destructive/10 border-destructive/30 text-destructive",
  };

  return (
    <div className={cn(
      "flex items-center gap-3 rounded-xl border",
      severityStyles[condition.severity],
      isMobile ? "p-3" : "p-4"
    )}>
      <WeatherIcon className="h-6 w-6 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium">{condition.description}</p>
        <p className="text-sm opacity-80">{condition.impact}</p>
      </div>
      <div className="text-right shrink-0">
        <span className="font-mono text-sm">{condition.startTime}</span>
        <p className="text-xs opacity-70">{condition.affectedClaimIds.length} claims</p>
      </div>
    </div>
  );
}

// Weather & Conditions Section
function WeatherConditions({
  weather,
  isMobile,
}: {
  weather: WeatherCondition[];
  isMobile: boolean;
}) {
  if (weather.length === 0) return null;

  return (
    <section className={cn(
      "border-t border-border",
      isMobile ? "px-4 py-4" : "px-6 py-6"
    )}>
      <div className={cn(!isMobile && "max-w-5xl mx-auto")}>
        <h2 className="text-lg font-display font-semibold text-foreground mb-3 flex items-center gap-2">
          <CloudRain className="h-5 w-5 text-muted-foreground" />
          Weather & Conditions
        </h2>

        <div className="space-y-2">
          {weather.map((condition) => (
            <WeatherCard key={condition.id} condition={condition} isMobile={isMobile} />
          ))}
        </div>
      </div>
    </section>
  );
}

// SLA Hygiene Item
function SlaHygieneCard({ item }: { item: SlaHygieneItem }) {
  const issueIcons = {
    missing_artifact: FileWarning,
    stuck_claim: Clock,
    upcoming_sla: Timer,
  };
  const IssueIcon = issueIcons[item.issueType];

  return (
    <Link href={`/claim/${item.claimId}`}>
      <div className="flex items-center gap-3 p-3 bg-white border border-border rounded-xl active:bg-muted hover:border-primary/30 transition-all cursor-pointer min-tap-target">
        <IssueIcon className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-foreground">{item.claimNumber}</span>
          <span className="text-muted-foreground mx-2">·</span>
          <span className="text-sm text-muted-foreground">{item.description}</span>
        </div>
        {item.daysOverdue && (
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-xs shrink-0">
            {item.daysOverdue}d overdue
          </Badge>
        )}
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>
    </Link>
  );
}

// SLA & Hygiene Section (Collapsible)
function SlaHygiene({
  items,
  isMobile,
}: {
  items: SlaHygieneItem[];
  isMobile: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (items.length === 0) return null;

  return (
    <section className={cn(
      "border-t border-border bg-muted/30",
      isMobile ? "px-4 py-4" : "px-6 py-6"
    )}>
      <div className={cn(!isMobile && "max-w-5xl mx-auto")}>
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center justify-between w-full text-left group min-tap-target">
              <h2 className="text-base font-display font-semibold text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                SLA & Hygiene
                <span className="text-sm font-normal">({items.length})</span>
              </h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground group-hover:text-foreground">
                <span>{isOpen ? "Hide" : "Show"}</span>
                <ChevronDown className={cn(
                  "h-4 w-4 transition-transform",
                  isOpen && "rotate-180"
                )} />
              </div>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4">
            <div className="space-y-2">
              {items.map((item) => (
                <SlaHygieneCard key={item.id} item={item} />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </section>
  );
}

// ==========================================
// MAIN PAGE COMPONENT
// ==========================================

export default function MyDay() {
  const { layoutMode } = useDeviceMode();
  const isMobileLayout = layoutMode === "mobile";
  const authUser = useStore((state) => state.authUser);

  const { data: claimsData, isLoading, error } = useQuery<{ claims: ClaimFromAPI[]; total: number }>({
    queryKey: ["/api/claims"],
    queryFn: async () => {
      const response = await fetch("/api/claims?includeClosed=false", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch claims");
      }
      return response.json();
    },
    staleTime: 30000,
  });

  const dayData = useMemo(() => {
    const adjusterName = authUser?.username || "Adjuster";
    if (!claimsData?.claims) {
      return buildEmptyDayData(adjusterName);
    }
    return transformClaimsToMyDayData(claimsData.claims, adjusterName);
  }, [claimsData, authUser]);

  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-full bg-background flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading your claims...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="min-h-full bg-background flex items-center justify-center">
          <div className="text-center">
            <p className="text-destructive">Unable to load claims</p>
            <p className="text-sm text-muted-foreground mt-2">Please try refreshing the page</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-full bg-background">
        {/* Day Context Bar */}
        {isMobileLayout ? (
          <MobileDayContextBar context={dayData.context} />
        ) : (
          <DesktopDayContextBar context={dayData.context} />
        )}

        {/* Main Content */}
        <div className={cn(isMobileLayout && "pb-20")}>
          {/* Empty State */}
          {dayData.route.length === 0 && dayData.onDeck.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Calendar className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">No claims scheduled</h2>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                Upload FNOL documents to create new claims, then they'll appear here for inspection.
              </p>
              <Link href="/claims/new" className="mt-4 text-primary hover:underline text-sm font-medium">
                Create New Claim
              </Link>
            </div>
          )}

          {/* Weather alerts at top if present */}
          {dayData.weather.length > 0 && (
            <WeatherConditions weather={dayData.weather} isMobile={isMobileLayout} />
          )}

          {/* Risk Watch - high visibility if risks exist */}
          {dayData.riskWatch.length > 0 && (
            <RiskMitigationWatch risks={dayData.riskWatch} isMobile={isMobileLayout} />
          )}

          {/* Today's Route - Primary section */}
          {dayData.route.length > 0 && (
            <TodaysRoute
              route={dayData.route}
              weather={dayData.weather}
              isMobile={isMobileLayout}
            />
          )}

          {/* Claims On Deck - Secondary section */}
          {dayData.onDeck.length > 0 && (
            <ClaimsOnDeck claims={dayData.onDeck} isMobile={isMobileLayout} />
          )}

          {/* SLA & Hygiene - Collapsible, low priority */}
          {dayData.slaHygiene.length > 0 && (
            <SlaHygiene items={dayData.slaHygiene} isMobile={isMobileLayout} />
          )}
        </div>
      </div>
    </Layout>
  );
}
