import { useState, useMemo } from "react";
import { Link } from "wouter";
import Layout from "@/components/layout";
import { useDeviceMode } from "@/contexts/DeviceModeContext";
import { useStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  ChevronUp,
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
  ExternalLink,
  Triangle,
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
// SAMPLE DATA - Weather-impacted day scenario
// ==========================================

const SAMPLE_MY_DAY_DATA: MyDayData = {
  date: new Date().toISOString(),
  context: {
    adjusterName: "Marcus Chen",
    territory: "DFW Metro",
    catEvent: "CAT-2024-TX-001",
    inspectionCount: 5,
    riskCount: 2,
    slaDeadlineCount: 3,
    hasWeatherAlert: true,
    hasSafetyAlert: false,
    hasSlaBreach: false,
  },
  route: [
    {
      id: "stop-1",
      claimId: "claim-001",
      claimNumber: "TX-WH-240158",
      insuredName: "Patricia Morrison",
      address: "4521 Oakwood Lane",
      city: "Plano",
      state: "TX",
      zip: "75024",
      lat: 33.0198,
      lng: -96.6989,
      timeWindow: { start: "08:30", end: "09:30" },
      peril: Peril.WIND_HAIL,
      reason: "Initial roof inspection",
      badges: ["sla_today"],
      estimatedDuration: 60,
      travelTimeFromPrevious: 15,
    },
    {
      id: "stop-2",
      claimId: "claim-002",
      claimNumber: "TX-WA-240203",
      insuredName: "Robert Chen",
      address: "8742 Preston Road, Unit 12",
      city: "Dallas",
      state: "TX",
      zip: "75225",
      lat: 32.8668,
      lng: -96.8029,
      timeWindow: { start: "10:00", end: "11:30" },
      peril: Peril.WATER,
      reason: "Active water risk — appliance leak",
      badges: ["mitigation_likely", "evidence_at_risk"],
      estimatedDuration: 90,
      travelTimeFromPrevious: 25,
      notes: "Tenant at location. Document moisture levels before mitigation.",
    },
    {
      id: "stop-3",
      claimId: "claim-003",
      claimNumber: "TX-WH-240187",
      insuredName: "Angela Ramirez",
      address: "2201 Mockingbird Lane",
      city: "University Park",
      state: "TX",
      zip: "75205",
      lat: 32.8404,
      lng: -96.7975,
      timeWindow: { start: "12:30", end: "13:30" },
      peril: Peril.WIND_HAIL,
      reason: "Re-inspection — disputed coverage",
      badges: ["sla_today"],
      estimatedDuration: 60,
      travelTimeFromPrevious: 12,
    },
    {
      id: "stop-4",
      claimId: "claim-004",
      claimNumber: "TX-IM-240221",
      insuredName: "David & Karen Williams",
      address: "5678 Turtle Creek Blvd",
      city: "Dallas",
      state: "TX",
      zip: "75219",
      lat: 32.8092,
      lng: -96.8081,
      timeWindow: { start: "14:30", end: "15:30" },
      peril: Peril.IMPACT,
      reason: "Tree damage to roof — rain imminent",
      badges: ["evidence_at_risk", "mitigation_likely"],
      estimatedDuration: 60,
      travelTimeFromPrevious: 18,
      notes: "Prioritize before 2pm rain. Emergency tarp may be needed.",
    },
    {
      id: "stop-5",
      claimId: "claim-005",
      claimNumber: "TX-FI-240198",
      insuredName: "James Mitchell",
      address: "1100 Commerce Street",
      city: "Dallas",
      state: "TX",
      zip: "75202",
      lat: 32.7815,
      lng: -96.7990,
      timeWindow: { start: "16:00", end: "17:30" },
      peril: Peril.FIRE,
      reason: "Smoke damage assessment",
      badges: [],
      estimatedDuration: 90,
      travelTimeFromPrevious: 15,
    },
  ],
  onDeck: [
    {
      id: "deck-1",
      claimId: "claim-006",
      claimNumber: "TX-WA-240156",
      peril: Peril.WATER,
      reason: "Upload missing moisture readings",
      slaHoursRemaining: 4,
      priority: "high",
    },
    {
      id: "deck-2",
      claimId: "claim-007",
      claimNumber: "TX-WH-240142",
      peril: Peril.WIND_HAIL,
      reason: "Complete mitigation authorization",
      slaHoursRemaining: 8,
      priority: "medium",
    },
    {
      id: "deck-3",
      claimId: "claim-008",
      claimNumber: "TX-MO-240134",
      peril: Peril.MOLD,
      reason: "Respond to desk review questions",
      priority: "medium",
    },
    {
      id: "deck-4",
      claimId: "claim-009",
      claimNumber: "TX-WH-240189",
      peril: Peril.WIND_HAIL,
      reason: "Submit preliminary estimate",
      slaHoursRemaining: 6,
      priority: "high",
    },
  ],
  riskWatch: [
    {
      id: "risk-1",
      claimId: "claim-002",
      claimNumber: "TX-WA-240203",
      peril: Peril.WATER,
      riskDescription: "Mold window closing — 48hr mark approaching",
      hoursUntilCritical: 6,
      severity: "high",
      affectedInspectionId: "stop-2",
    },
    {
      id: "risk-2",
      claimId: "claim-004",
      claimNumber: "TX-IM-240221",
      peril: Peril.IMPACT,
      riskDescription: "Roof exposed before rain at 2pm",
      hoursUntilCritical: 4,
      severity: "critical",
      affectedInspectionId: "stop-4",
    },
  ],
  weather: [
    {
      id: "weather-1",
      type: "rain",
      description: "Rain starting at 2:00 PM",
      impact: "Roof inspections at risk",
      startTime: "14:00",
      affectedClaimIds: ["claim-001", "claim-003", "claim-004"],
      severity: "warning",
    },
    {
      id: "weather-2",
      type: "wind",
      description: "Gusts 25-35 mph through evening",
      impact: "Ladder safety concern",
      startTime: "15:00",
      affectedClaimIds: ["claim-004", "claim-005"],
      severity: "advisory",
    },
  ],
  slaHygiene: [
    {
      id: "hygiene-1",
      claimId: "claim-010",
      claimNumber: "TX-WH-240098",
      issueType: "missing_artifact",
      description: "Missing 4-point overview photo",
      priority: "medium",
    },
    {
      id: "hygiene-2",
      claimId: "claim-011",
      claimNumber: "TX-WA-240087",
      issueType: "stuck_claim",
      description: "No activity for 5 days",
      daysOverdue: 5,
      priority: "high",
    },
    {
      id: "hygiene-3",
      claimId: "claim-012",
      claimNumber: "TX-WH-240145",
      issueType: "upcoming_sla",
      description: "Initial contact due tomorrow",
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      priority: "medium",
    },
    {
      id: "hygiene-4",
      claimId: "claim-013",
      claimNumber: "TX-FL-240076",
      issueType: "missing_artifact",
      description: "Flood zone determination pending",
      priority: "low",
    },
  ],
};

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
      return "bg-amber-100 text-amber-800 border-amber-300";
    case "evidence_at_risk":
      return "bg-red-100 text-red-800 border-red-300";
    case "sla_today":
      return "bg-purple-100 text-purple-800 border-purple-300";
    case "contact_required":
      return "bg-blue-100 text-blue-800 border-blue-300";
    default:
      return "bg-slate-100 text-slate-800 border-slate-300";
  }
}

function formatTimeWindow(start: string, end: string): string {
  const formatTime = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour = h % 12 || 12;
    return `${hour}:${m.toString().padStart(2, "0")} ${period}`;
  };
  return `${formatTime(start)} – ${formatTime(end)}`;
}

// ==========================================
// SECTION COMPONENTS
// ==========================================

// Day Context Bar (Sticky Header)
function DayContextBar({ context, isMobile }: { context: MyDayData["context"]; isMobile: boolean }) {
  const today = format(new Date(), "EEEE, MMMM d");

  return (
    <div className={cn(
      "bg-slate-900 text-white sticky top-0 z-40",
      isMobile ? "px-4 py-3" : "px-6 py-4"
    )}>
      <div className={cn("max-w-5xl mx-auto", isMobile ? "" : "")}>
        {/* Top row: Name, Date, Territory */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className={cn(
              "font-display font-bold",
              isMobile ? "text-lg" : "text-xl"
            )}>
              {context.adjusterName}
            </h1>
            <p className="text-slate-400 text-sm flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5" />
              {today}
              {context.territory && (
                <>
                  <span className="text-slate-600">•</span>
                  <span>{context.territory}</span>
                </>
              )}
            </p>
          </div>
          {context.catEvent && (
            <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs">
              {context.catEvent}
            </Badge>
          )}
        </div>

        {/* Bottom row: Stats and Alerts */}
        <div className="flex items-center justify-between">
          {/* Left: Key counts */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="h-7 w-7 rounded-full bg-slate-800 flex items-center justify-center">
                <Navigation className="h-3.5 w-3.5 text-slate-300" />
              </div>
              <div>
                <span className="text-lg font-bold">{context.inspectionCount}</span>
                <span className="text-slate-400 text-xs ml-1">stops</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-7 w-7 rounded-full bg-slate-800 flex items-center justify-center">
                <AlertTriangle className="h-3.5 w-3.5 text-slate-300" />
              </div>
              <div>
                <span className="text-lg font-bold">{context.riskCount}</span>
                <span className="text-slate-400 text-xs ml-1">at risk</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-7 w-7 rounded-full bg-slate-800 flex items-center justify-center">
                <Timer className="h-3.5 w-3.5 text-slate-300" />
              </div>
              <div>
                <span className="text-lg font-bold">{context.slaDeadlineCount}</span>
                <span className="text-slate-400 text-xs ml-1">SLAs</span>
              </div>
            </div>
          </div>

          {/* Right: Alert icons */}
          <div className="flex items-center gap-2">
            {context.hasWeatherAlert && (
              <div className="h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center" title="Weather Alert">
                <CloudRain className="h-4 w-4 text-amber-400" />
              </div>
            )}
            {context.hasSafetyAlert && (
              <div className="h-8 w-8 rounded-full bg-red-500/20 flex items-center justify-center" title="Safety Alert">
                <Shield className="h-4 w-4 text-red-400" />
              </div>
            )}
            {context.hasSlaBreach && (
              <div className="h-8 w-8 rounded-full bg-red-500/20 flex items-center justify-center animate-pulse" title="SLA Breach">
                <AlertCircle className="h-4 w-4 text-red-400" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Individual Route Stop Card
function RouteStopCard({
  stop,
  index,
  isLast,
  isMobile,
  weatherAlert,
}: {
  stop: InspectionStop;
  index: number;
  isLast: boolean;
  isMobile: boolean;
  weatherAlert?: WeatherCondition;
}) {
  const PerilIcon = getPerilIcon(stop.peril);
  const perilColors = PERIL_COLORS[stop.peril] || PERIL_COLORS[Peril.OTHER];
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    `${stop.address}, ${stop.city}, ${stop.state} ${stop.zip}`
  )}`;

  return (
    <div className="relative">
      {/* Timeline connector */}
      {!isLast && (
        <div className="absolute left-6 top-16 bottom-0 w-0.5 bg-slate-200" />
      )}

      <Link href={`/claim/${stop.claimId}`}>
        <div className={cn(
          "relative bg-white border rounded-lg transition-all hover:shadow-md hover:border-slate-300 cursor-pointer",
          weatherAlert && "border-amber-300 bg-amber-50/30",
          isMobile ? "p-3" : "p-4"
        )}>
          {/* Weather warning banner */}
          {weatherAlert && (
            <div className="flex items-center gap-2 text-amber-700 text-xs mb-2 pb-2 border-b border-amber-200">
              <CloudRain className="h-3.5 w-3.5" />
              <span>{weatherAlert.description} — {weatherAlert.impact}</span>
            </div>
          )}

          <div className="flex gap-3">
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
                    <span className="font-mono text-sm font-semibold text-slate-900">
                      {formatTimeWindow(stop.timeWindow.start, stop.timeWindow.end)}
                    </span>
                    {stop.travelTimeFromPrevious && index > 0 && (
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Car className="h-3 w-3" />
                        {stop.travelTimeFromPrevious}m
                      </span>
                    )}
                  </div>
                  <p className="font-medium text-slate-900">{stop.insuredName}</p>
                  <p className="text-sm text-slate-500">{stop.claimNumber}</p>
                </div>
                <div className="flex items-center gap-2">
                  <PerilIcon className={cn("h-5 w-5", perilColors.text)} />
                  <ChevronRight className="h-5 w-5 text-slate-400" />
                </div>
              </div>

              {/* Address with map link */}
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-primary mb-2"
              >
                <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{stop.address}, {stop.city}</span>
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
              </a>

              {/* Reason for visit */}
              <p className="text-sm text-slate-700 mb-2">{stop.reason}</p>

              {/* Badges */}
              {stop.badges.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {stop.badges.map((badge) => (
                    <Badge
                      key={badge}
                      className={cn("text-xs border", getBadgeStyle(badge))}
                    >
                      {getBadgeLabel(badge)}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Notes */}
              {stop.notes && (
                <p className="text-xs text-slate-500 mt-2 italic border-l-2 border-slate-200 pl-2">
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
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-display font-semibold text-slate-900 flex items-center gap-2">
            <Navigation className="h-5 w-5 text-primary" />
            Today's Route
          </h2>
          <span className="text-sm text-slate-500">
            {route.length} inspection{route.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="space-y-3">
          {route.map((stop, index) => (
            <RouteStopCard
              key={stop.id}
              stop={stop}
              index={index}
              isLast={index === route.length - 1}
              isMobile={isMobile}
              weatherAlert={getWeatherAlertForStop(stop)}
            />
          ))}
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
        "bg-white border border-slate-200 rounded-lg hover:shadow-sm hover:border-slate-300 transition-all cursor-pointer",
        isMobile ? "p-3" : "p-4"
      )}>
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-10 w-10 rounded-lg flex items-center justify-center",
            perilColors.bg
          )}>
            <PerilIcon className={cn("h-5 w-5", perilColors.text)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-900">{claim.claimNumber}</span>
              {claim.slaHoursRemaining !== undefined && (
                <Badge
                  className={cn(
                    "text-xs",
                    claim.slaHoursRemaining <= 4
                      ? "bg-red-100 text-red-700"
                      : claim.slaHoursRemaining <= 8
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-700"
                  )}
                >
                  {claim.slaHoursRemaining}h
                </Badge>
              )}
            </div>
            <p className="text-sm text-slate-600 truncate">{claim.reason}</p>
          </div>
          <ChevronRight className="h-5 w-5 text-slate-400 flex-shrink-0" />
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
      "border-t border-slate-200 bg-slate-50/50",
      isMobile ? "px-4 py-4" : "px-6 py-6"
    )}>
      <div className="max-w-5xl mx-auto">
        <h2 className="text-lg font-display font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <FileWarning className="h-5 w-5 text-slate-600" />
          On Deck Today
          <span className="text-sm font-normal text-slate-500">({claims.length})</span>
        </h2>
        <p className="text-sm text-slate-500 mb-4">Non-field work requiring attention today</p>

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
  const severityColors = {
    low: "bg-slate-100 border-slate-300",
    medium: "bg-amber-50 border-amber-300",
    high: "bg-orange-50 border-orange-400",
    critical: "bg-red-50 border-red-400 animate-pulse",
  };

  return (
    <Link href={`/claim/${item.claimId}`}>
      <div className={cn(
        "border rounded-lg transition-all hover:shadow-md cursor-pointer",
        severityColors[item.severity],
        isMobile ? "p-3" : "p-4"
      )}>
        <div className="flex items-start gap-3">
          <div className={cn(
            "h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0",
            item.severity === "critical" ? "bg-red-100" : "bg-orange-100"
          )}>
            <AlertTriangle className={cn(
              "h-5 w-5",
              item.severity === "critical" ? "text-red-600" : "text-orange-600"
            )} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-medium text-slate-900">{item.claimNumber}</span>
              <Badge
                className={cn(
                  "text-xs font-mono",
                  item.hoursUntilCritical <= 4
                    ? "bg-red-100 text-red-700"
                    : "bg-amber-100 text-amber-700"
                )}
              >
                {item.hoursUntilCritical}h
              </Badge>
            </div>
            <p className="text-sm text-slate-800 font-medium">{item.riskDescription}</p>
            <div className="flex items-center gap-2 mt-1">
              <PerilIcon className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-xs text-slate-500">{PERIL_LABELS[item.peril]}</span>
            </div>
          </div>
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
      "border-t-4 border-orange-400 bg-gradient-to-b from-orange-50 to-white",
      isMobile ? "px-4 py-4" : "px-6 py-6"
    )}>
      <div className="max-w-5xl mx-auto">
        <h2 className="text-lg font-display font-semibold text-slate-900 mb-1 flex items-center gap-2">
          <Triangle className="h-5 w-5 text-orange-500 fill-orange-200" />
          Risk & Mitigation Watch
        </h2>
        <p className="text-sm text-slate-600 mb-4">
          Active damage or evidence at risk — time-sensitive decisions needed
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
function WeatherCard({ condition }: { condition: WeatherCondition }) {
  const WeatherIcon = getWeatherIcon(condition.type);
  const severityStyles = {
    advisory: "bg-blue-50 border-blue-200 text-blue-800",
    warning: "bg-amber-50 border-amber-300 text-amber-800",
    danger: "bg-red-50 border-red-400 text-red-800",
  };

  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-lg border",
      severityStyles[condition.severity]
    )}>
      <WeatherIcon className="h-6 w-6 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium">{condition.description}</p>
        <p className="text-sm opacity-80">{condition.impact}</p>
      </div>
      <div className="text-right text-sm">
        <span className="font-mono">{condition.startTime}</span>
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
      "border-t border-slate-200",
      isMobile ? "px-4 py-4" : "px-6 py-6"
    )}>
      <div className="max-w-5xl mx-auto">
        <h2 className="text-lg font-display font-semibold text-slate-900 mb-3 flex items-center gap-2">
          <CloudRain className="h-5 w-5 text-slate-600" />
          Weather & Conditions
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          Conditions affecting today's inspections
        </p>

        <div className="space-y-2">
          {weather.map((condition) => (
            <WeatherCard key={condition.id} condition={condition} />
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
      <div className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer">
        <IssueIcon className="h-4 w-4 text-slate-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-slate-700">{item.claimNumber}</span>
          <span className="text-slate-400 mx-2">·</span>
          <span className="text-sm text-slate-500">{item.description}</span>
        </div>
        {item.daysOverdue && (
          <Badge className="bg-red-100 text-red-700 text-xs">
            {item.daysOverdue}d overdue
          </Badge>
        )}
        <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
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
      "border-t border-slate-200 bg-slate-50",
      isMobile ? "px-4 py-4" : "px-6 py-6"
    )}>
      <div className="max-w-5xl mx-auto">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center justify-between w-full text-left group">
              <h2 className="text-base font-display font-semibold text-slate-700 flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-500" />
                SLA & Hygiene
                <span className="text-sm font-normal text-slate-500">({items.length})</span>
              </h2>
              <div className="flex items-center gap-2 text-sm text-slate-500 group-hover:text-slate-700">
                <span>{isOpen ? "Hide" : "Show"}</span>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
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

  // In production, this would come from an API
  const dayData = useMemo(() => {
    // Update adjuster name from auth if available
    return {
      ...SAMPLE_MY_DAY_DATA,
      context: {
        ...SAMPLE_MY_DAY_DATA.context,
        adjusterName: authUser?.username || SAMPLE_MY_DAY_DATA.context.adjusterName,
      },
    };
  }, [authUser]);

  return (
    <Layout>
      <div className="min-h-full bg-slate-100">
        {/* Sticky Day Context Bar */}
        <DayContextBar context={dayData.context} isMobile={isMobileLayout} />

        {/* Main Content */}
        <div className={cn(
          "pb-8",
          isMobileLayout && "pb-24" // Extra padding for mobile nav
        )}>
          {/* Weather alerts at top if present */}
          {dayData.weather.length > 0 && (
            <WeatherConditions weather={dayData.weather} isMobile={isMobileLayout} />
          )}

          {/* Risk Watch - high visibility if risks exist */}
          <RiskMitigationWatch risks={dayData.riskWatch} isMobile={isMobileLayout} />

          {/* Today's Route - Primary section */}
          <TodaysRoute
            route={dayData.route}
            weather={dayData.weather}
            isMobile={isMobileLayout}
          />

          {/* Claims On Deck - Secondary section */}
          <ClaimsOnDeck claims={dayData.onDeck} isMobile={isMobileLayout} />

          {/* SLA & Hygiene - Collapsible, low priority */}
          <SlaHygiene items={dayData.slaHygiene} isMobile={isMobileLayout} />
        </div>
      </div>
    </Layout>
  );
}
