import { useState, useMemo, useEffect } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { useDeviceMode } from "@/contexts/DeviceModeContext";
import { useStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Loader2, Route } from "lucide-react";
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
  CloudSun,
  Cloud,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Info,
  Lightbulb,
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
// ROUTE OPTIMIZATION TYPES
// ==========================================

interface RouteOptimizationResult {
  orderedStops: string[];
  legs: {
    fromStopId: string;
    toStopId: string;
    duration: number;
    distance: number;
    durationText: string;
    distanceText: string;
  }[];
  totalDuration: number;
  totalDistance: number;
  optimized: boolean;
}

// ==========================================
// WEATHER & AI ANALYSIS TYPES
// ==========================================

interface StopWeatherData {
  stopId: string;
  location: { lat: number; lng: number };
  current: {
    temp: number;
    feelsLike: number;
    humidity: number;
    windSpeed: number;
    windGust?: number;
    conditions: { id: string; main: string; description: string; icon: string }[];
    visibility: number;
    uvIndex?: number;
  };
  alerts: { event: string; severity: string; headline: string }[];
  inspectionImpact?: {
    score: 'good' | 'caution' | 'warning' | 'severe';
    reasons: string[];
    recommendations: string[];
  };
  forecast?: {
    time: string;
    temp: number;
    pop: number;
    conditions: { id: string; main: string; description: string; icon: string }[];
    windSpeed: number;
  }[];
}

interface MyDayInsight {
  type: 'priority' | 'efficiency' | 'risk' | 'opportunity' | 'weather' | 'sla';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  affectedClaims?: string[];
  actionable: boolean;
  suggestedAction?: string;
}

interface MyDayAnalysisResult {
  insights: MyDayInsight[];
  priorityOrder: string[];
  riskScore: number;
  efficiencyScore: number;
  summary: string;
  weatherImpact: {
    affectedStops: number;
    recommendation: string;
  };
  slaStatus: {
    atRisk: number;
    breaching: number;
    safe: number;
  };
  weatherData?: StopWeatherData[];
}

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

interface AppointmentFromAPI {
  id: string;
  claimId: string;
  title: string;
  description: string | null;
  location: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  durationMinutes: number;
  status: string;
  appointmentType: string;
  ms365EventId: string | null;
}

function transformClaimsToMyDayData(claims: ClaimFromAPI[], adjusterName: string, appointments?: AppointmentFromAPI[]): MyDayData {
  if (!claims || claims.length === 0) {
    return buildEmptyDayData(adjusterName);
  }

  const openClaims = claims.filter(c => c.status !== "closed" && c.status !== "draft");
  const activeClaims = openClaims.filter(c => 
    ["open", "in_progress", "fnol"].includes(c.status)
  );
  const reviewClaims = openClaims.filter(c => c.status === "review");

  // Build a map of claims for quick lookup
  const claimMap = new Map(claims.map(c => [c.id, c]));

  // If we have scheduled appointments, use those for today's route
  let route: InspectionStop[] = [];

  if (appointments && appointments.length > 0) {
    // Use actual scheduled appointments - sorted by start time
    const sortedAppointments = [...appointments].sort((a, b) => 
      new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime()
    );

    route = sortedAppointments.map((apt, index) => {
      const claim = claimMap.get(apt.claimId);
      const startTime = new Date(apt.scheduledStart);
      const endTime = new Date(apt.scheduledEnd);
      
      // Parse location from appointment or claim
      let address = apt.location || claim?.propertyAddress || "Address pending";
      let city = claim?.propertyCity || "";
      let state = claim?.propertyState || "";
      let zip = claim?.propertyZip || "";

      return {
        id: `stop-${apt.id}`,
        claimId: apt.claimId,
        claimNumber: claim?.claimNumber || `CLM-${apt.claimId.slice(0, 8)}`,
        insuredName: claim?.insuredName || "Unknown Insured",
        address,
        city,
        state,
        zip,
        lat: claim?.metadata?.lat || 0,
        lng: claim?.metadata?.lng || 0,
        timeWindow: { 
          start: startTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }), 
          end: endTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) 
        },
        peril: mapLossTypeToPeril(claim?.lossType || ""),
        reason: apt.description || claim?.lossDescription || `${claim?.lossType || "Property"} inspection`,
        badges: apt.ms365EventId ? ["calendar_synced" as InspectionBadge] : [],
        estimatedDuration: apt.durationMinutes,
        travelTimeFromPrevious: index === 0 ? 0 : 15,
        notes: apt.appointmentType === 're_inspection' ? 'Re-inspection' : undefined,
      };
    });
  } else {
    // Fallback: create route from active claims with placeholder times
    route = activeClaims.slice(0, 8).map((claim, index) => {
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
  }

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
    case "calendar_synced":
      return "Calendar";
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
    case "calendar_synced":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
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

function getWeatherConditionIcon(main: string) {
  const m = main.toLowerCase();
  if (m.includes('thunder')) return CloudLightning;
  if (m.includes('rain') || m.includes('drizzle')) return CloudRain;
  if (m.includes('snow') || m.includes('sleet') || m.includes('ice')) return Snowflake;
  if (m.includes('cloud')) return Cloud;
  if (m.includes('clear') || m.includes('sun')) return Sun;
  if (m.includes('wind')) return Wind;
  return CloudSun;
}

function getImpactScoreStyles(score?: 'good' | 'caution' | 'warning' | 'severe') {
  switch (score) {
    case 'good':
      return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: CheckCircle2 };
    case 'caution':
      return { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', icon: AlertCircle };
    case 'warning':
      return { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', icon: AlertTriangle };
    case 'severe':
      return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: XCircle };
    default:
      return { bg: 'bg-muted', border: 'border-border', text: 'text-muted-foreground', icon: Info };
  }
}

// ==========================================
// AI INSIGHTS PANEL
// ==========================================

function AiInsightsPanel({
  analysis,
  isLoading,
  isMobile,
  weather,
}: {
  analysis?: MyDayAnalysisResult;
  isLoading: boolean;
  isMobile: boolean;
  weather?: StopWeatherData;
}) {
  const [isOpen, setIsOpen] = useState(true);

  if (isLoading) {
    return (
      <section className={cn("border-b border-border bg-gradient-to-r from-primary/5 to-accent/5", isMobile ? "px-4 py-4" : "px-6 py-6")}>
        <div className={cn(!isMobile && "max-w-5xl mx-auto")}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
            </div>
            <div>
              <h2 className="text-lg font-display font-semibold text-foreground flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Analyzing Your Day...
              </h2>
              <p className="text-sm text-muted-foreground">Checking weather, SLA deadlines, and optimizing priorities</p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!analysis) return null;

  const criticalInsights = analysis.insights.filter(i => i.severity === 'critical');
  const warningInsights = analysis.insights.filter(i => i.severity === 'warning');
  const infoInsights = analysis.insights.filter(i => i.severity === 'info');

  return (
    <section className={cn("border-b border-border bg-gradient-to-r from-primary/5 to-accent/5", isMobile ? "px-4 py-4" : "px-6 py-6")}>
      <div className={cn(!isMobile && "max-w-5xl mx-auto")}>
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <button className="w-full" data-testid="button-toggle-ai-insights">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div className="text-left">
                    <h2 className="text-lg font-display font-semibold text-foreground flex items-center gap-2">
                      AI Day Insights
                      {criticalInsights.length > 0 && (
                        <Badge variant="destructive" className="text-xs">{criticalInsights.length} Critical</Badge>
                      )}
                      {warningInsights.length > 0 && (
                        <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">{warningInsights.length} Warning</Badge>
                      )}
                    </h2>
                    <p className="text-sm text-muted-foreground">{analysis.summary}</p>
                  </div>
                </div>
                <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
              </div>
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-4">
            <div className="grid gap-4 md:grid-cols-3 mb-4">
              <div className="bg-white rounded-lg border border-border p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Risk Score</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("text-2xl font-bold", 
                    analysis.riskScore > 60 ? "text-red-600" : 
                    analysis.riskScore > 30 ? "text-orange-600" : "text-green-600"
                  )}>{analysis.riskScore}</span>
                  <span className="text-sm text-muted-foreground">/100</span>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-border p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CloudSun className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Weather Forecast</span>
                </div>
                <div className="text-sm text-foreground">
                  {weather?.current ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {(() => {
                          const WeatherIcon = getWeatherConditionIcon(weather.current.conditions[0]?.main || 'Clear');
                          return <WeatherIcon className="h-4 w-4 text-sky-600" />;
                        })()}
                        <span className="font-medium">{weather.current.temp}°F</span>
                        <span className="text-muted-foreground">{weather.current.conditions[0]?.description || 'Clear'}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>Wind: {weather.current.windSpeed} mph</span>
                        <span>Humidity: {weather.current.humidity}%</span>
                      </div>
                      {weather.forecast && weather.forecast.length > 0 && (
                        <div className="flex gap-2 mt-2 pt-2 border-t border-border">
                          {weather.forecast.slice(0, 3).map((f, i) => (
                            <div key={i} className="text-center text-xs">
                              <div className="text-muted-foreground">{new Date(f.time).toLocaleTimeString([], { hour: 'numeric' })}</div>
                              <div className="font-medium">{f.temp}°</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : analysis.weatherImpact.affectedStops > 0 ? (
                    <span className="text-orange-600 font-medium">{analysis.weatherImpact.affectedStops} stop(s) affected</span>
                  ) : (
                    <span className="text-green-600 font-medium">Good conditions</span>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-lg border border-border p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">SLA Status</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  {analysis.slaStatus.breaching > 0 && (
                    <span className="text-red-600 font-medium">{analysis.slaStatus.breaching} breaching</span>
                  )}
                  {analysis.slaStatus.atRisk > 0 && (
                    <span className="text-orange-600 font-medium">{analysis.slaStatus.atRisk} at risk</span>
                  )}
                  {analysis.slaStatus.safe > 0 && (
                    <span className="text-green-600 font-medium">{analysis.slaStatus.safe} safe</span>
                  )}
                </div>
              </div>
            </div>

            {analysis.insights.length > 0 && (
              <div className="space-y-2">
                {criticalInsights.map((insight, idx) => (
                  <InsightCard key={`critical-${idx}`} insight={insight} />
                ))}
                {warningInsights.map((insight, idx) => (
                  <InsightCard key={`warning-${idx}`} insight={insight} />
                ))}
                {infoInsights.slice(0, 3).map((insight, idx) => (
                  <InsightCard key={`info-${idx}`} insight={insight} />
                ))}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </section>
  );
}

function InsightCard({ insight }: { insight: MyDayInsight }) {
  const severityStyles = {
    critical: { bg: 'bg-red-50', border: 'border-red-200', icon: XCircle, iconColor: 'text-red-600' },
    warning: { bg: 'bg-orange-50', border: 'border-orange-200', icon: AlertTriangle, iconColor: 'text-orange-600' },
    info: { bg: 'bg-blue-50', border: 'border-blue-200', icon: Info, iconColor: 'text-blue-600' },
  };

  const styles = severityStyles[insight.severity];
  const Icon = styles.icon;

  return (
    <div className={cn("rounded-lg border p-3", styles.bg, styles.border)} data-testid={`insight-${insight.type}`}>
      <div className="flex items-start gap-3">
        <Icon className={cn("h-5 w-5 mt-0.5 shrink-0", styles.iconColor)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-foreground">{insight.title}</span>
            <Badge variant="outline" className="text-xs capitalize">{insight.type}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{insight.description}</p>
          {insight.suggestedAction && (
            <div className="flex items-center gap-1.5 mt-2 text-sm text-primary">
              <Lightbulb className="h-3.5 w-3.5" />
              <span>{insight.suggestedAction}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// STOP WEATHER BADGE
// ==========================================

function StopWeatherBadge({ weather }: { weather?: StopWeatherData }) {
  if (!weather) return null;

  const { current, inspectionImpact } = weather;
  const mainCondition = current.conditions[0]?.main || 'Clear';
  const WeatherIcon = getWeatherConditionIcon(mainCondition);
  const impactStyles = getImpactScoreStyles(inspectionImpact?.score);

  return (
    <div className={cn("flex items-center gap-2 rounded-md px-2 py-1 text-xs", impactStyles.bg, impactStyles.border, "border")} data-testid="weather-badge">
      <WeatherIcon className={cn("h-3.5 w-3.5", impactStyles.text)} />
      <span className={impactStyles.text}>{current.temp}°F</span>
      {inspectionImpact?.score && inspectionImpact.score !== 'good' && (
        <span className={cn("font-medium", impactStyles.text)}>{inspectionImpact.score}</span>
      )}
    </div>
  );
}

// ==========================================
// MOBILE COMPONENTS
// ==========================================

// Mobile Day Context Bar
function MobileDayContextBar({ context, weather, locationName }: { context: MyDayData["context"]; weather?: StopWeatherData; locationName?: string }) {
  const today = format(new Date(), "EEE, MMM d");

  // Get weather icon based on conditions
  const mainCondition = weather?.current.conditions[0]?.main || '';
  const WeatherIcon = mainCondition ? getWeatherConditionIcon(mainCondition) : Sun;

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
        <div className="flex items-center gap-2">
          {weather?.current?.temp != null && (
            <div className="flex flex-col items-end gap-0.5">
              <div className="flex items-center gap-1.5 bg-sky-50 border border-sky-200 rounded-lg px-2 py-1.5">
                <WeatherIcon className="h-4 w-4 text-sky-600" />
                <span className="text-sm font-medium text-sky-700">{weather.current.temp}°F</span>
              </div>
              {locationName && (
                <span className="text-xs text-muted-foreground">{locationName}</span>
              )}
            </div>
          )}
          {context.catEvent && (
            <Badge className="bg-accent/20 text-accent-foreground border-accent/30 text-xs">
              {context.catEvent}
            </Badge>
          )}
        </div>
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
function DesktopDayContextBar({ context, weather, locationName }: { context: MyDayData["context"]; weather?: StopWeatherData; locationName?: string }) {
  const today = format(new Date(), "EEEE, MMMM d, yyyy");

  // Get weather icon based on conditions
  const mainCondition = weather?.current.conditions[0]?.main || '';
  const WeatherIcon = mainCondition ? getWeatherConditionIcon(mainCondition) : Sun;

  return (
    <div className="bg-white border-b border-border px-6 py-4">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        {/* Left: Title and Info */}
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display font-bold text-foreground">
              My Day
            </h1>
            {weather?.current?.temp != null && mainCondition && (
              <div className="flex items-center gap-2 bg-sky-50 border border-sky-200 rounded-lg px-3 py-1.5">
                <WeatherIcon className="h-5 w-5 text-sky-600" />
                <span className="text-base font-medium text-sky-700">{weather.current.temp}°F</span>
                <span className="text-sm text-sky-600">{mainCondition}</span>
                {locationName && (
                  <span className="text-sm text-sky-500 border-l border-sky-200 pl-2">{locationName}</span>
                )}
              </div>
            )}
          </div>
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
  stopWeather,
}: {
  stop: InspectionStop;
  index: number;
  weatherAlert?: WeatherCondition;
  stopWeather?: StopWeatherData;
}) {
  const PerilIcon = getPerilIcon(stop.peril);
  const perilColors = PERIL_COLORS[stop.peril] || PERIL_COLORS[Peril.OTHER];
  const hasWeatherConcern = stopWeather?.inspectionImpact?.score !== 'good' && stopWeather?.inspectionImpact?.score !== undefined;

  return (
    <Link href={`/claim/${stop.claimId}`}>
      <div className={cn(
        "bg-white border rounded-xl active:bg-muted transition-colors min-tap-target",
        hasWeatherConcern ? "border-amber-300 bg-amber-50/50" : 
        weatherAlert ? "border-amber-300 bg-amber-50/50" : "border-border"
      )}>
        {/* Weather Alert Banner */}
        {(weatherAlert || hasWeatherConcern) && (
          <div className="flex items-center gap-2 text-amber-700 text-xs px-3 py-2 border-b border-amber-200 bg-amber-50">
            <CloudRain className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {weatherAlert?.description || stopWeather?.inspectionImpact?.reasons?.[0] || 'Weather concern'}
            </span>
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
              {/* Time + Weather */}
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="font-mono text-sm font-semibold text-foreground">
                  {formatTimeWindow(stop.timeWindow.start, stop.timeWindow.end)}
                </span>
                {stop.travelTimeFromPrevious && index > 0 && (
                  <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                    <Car className="h-3 w-3" />
                    {stop.travelTimeFromPrevious}m
                  </span>
                )}
                <StopWeatherBadge weather={stopWeather} />
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
  stopWeather,
}: {
  stop: InspectionStop;
  index: number;
  isLast: boolean;
  weatherAlert?: WeatherCondition;
  stopWeather?: StopWeatherData;
}) {
  const PerilIcon = getPerilIcon(stop.peril);
  const perilColors = PERIL_COLORS[stop.peril] || PERIL_COLORS[Peril.OTHER];
  const hasWeatherConcern = stopWeather?.inspectionImpact?.score !== 'good' && stopWeather?.inspectionImpact?.score !== undefined;

  return (
    <div className="relative">
      {/* Timeline connector */}
      {!isLast && (
        <div className="absolute left-6 top-16 bottom-0 w-0.5 bg-border" />
      )}

      <Link href={`/claim/${stop.claimId}`}>
        <div className={cn(
          "relative bg-white border rounded-xl transition-all hover:shadow-md hover:border-primary/30 cursor-pointer p-4",
          hasWeatherConcern ? "border-amber-300 bg-amber-50/30" :
          weatherAlert && "border-amber-300 bg-amber-50/30"
        )}>
          {/* Weather warning banner */}
          {(weatherAlert || hasWeatherConcern) && (
            <div className="flex items-center gap-2 text-amber-700 text-sm mb-3 pb-3 border-b border-amber-200">
              <CloudRain className="h-4 w-4" />
              <span>
                {weatherAlert?.description || stopWeather?.inspectionImpact?.reasons?.[0] || 'Weather concern'}
                {weatherAlert?.impact && ` — ${weatherAlert.impact}`}
              </span>
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold text-foreground">
                      {formatTimeWindow(stop.timeWindow.start, stop.timeWindow.end)}
                    </span>
                    {stop.travelTimeFromPrevious && index > 0 && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Car className="h-3 w-3" />
                        {stop.travelTimeFromPrevious} min drive
                      </span>
                    )}
                    <StopWeatherBadge weather={stopWeather} />
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
  routeOptimization,
  isOptimizing,
  stopWeatherData,
}: {
  route: InspectionStop[];
  weather: WeatherCondition[];
  isMobile: boolean;
  routeOptimization?: RouteOptimizationResult;
  isOptimizing?: boolean;
  stopWeatherData?: StopWeatherData[];
}) {
  const getWeatherAlertForStop = (stop: InspectionStop) => {
    return weather.find((w) => w.affectedClaimIds.includes(stop.claimId));
  };

  const getStopWeather = (claimId: string): StopWeatherData | undefined => {
    return stopWeatherData?.find(w => w.stopId === claimId);
  };

  // Get drive time for a stop from optimization data
  const getDriveTime = (stopId: string): { duration: number; durationText: string } | undefined => {
    if (!routeOptimization?.legs) return undefined;
    const leg = routeOptimization.legs.find(l => l.toStopId === stopId);
    return leg ? { duration: leg.duration, durationText: leg.durationText } : undefined;
  };

  // Calculate total drive time in a human-readable format
  const formatTotalTime = (minutes: number): string => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  return (
    <section className={cn(isMobile ? "px-4 py-4" : "px-6 py-6")}>
      <div className={cn(!isMobile && "max-w-5xl mx-auto")}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-display font-semibold text-foreground flex items-center gap-2">
            <Navigation className="h-5 w-5 text-primary" />
            Today's Route
            {isOptimizing && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </h2>
          <div className="flex items-center gap-3">
            {routeOptimization?.optimized && routeOptimization.totalDuration > 0 && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 flex items-center gap-1">
                <Car className="h-3 w-3" />
                {formatTotalTime(routeOptimization.totalDuration)} drive
              </Badge>
            )}
            <span className="text-sm text-muted-foreground">
              {route.length} stop{route.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          {route.map((stop, index) =>
            isMobile ? (
              <MobileRouteStopCard
                key={stop.id}
                stop={stop}
                index={index}
                weatherAlert={getWeatherAlertForStop(stop)}
                stopWeather={getStopWeather(stop.claimId)}
              />
            ) : (
              <DesktopRouteStopCard
                key={stop.id}
                stop={stop}
                index={index}
                isLast={index === route.length - 1}
                weatherAlert={getWeatherAlertForStop(stop)}
                stopWeather={getStopWeather(stop.claimId)}
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
  const [routeOptimization, setRouteOptimization] = useState<RouteOptimizationResult | undefined>();
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<MyDayAnalysisResult | undefined>();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [localWeather, setLocalWeather] = useState<StopWeatherData | undefined>();
  const [weatherLocation, setWeatherLocation] = useState<string>("Loading...");

  // Fetch current location weather using IP-based geolocation
  useEffect(() => {
    async function fetchLocationAndWeather() {
      try {
        // Use IP-based geolocation - works automatically without permission
        // Getting location from IP
        const geoResponse = await fetch('https://ipapi.co/json/');
        
        if (geoResponse.ok) {
          const geoData = await geoResponse.json();
          const lat = geoData.latitude;
          const lng = geoData.longitude;
          const city = geoData.city;
          const region = geoData.region;
          const country = geoData.country_name;
          
          // IP location retrieved
          
          // Set location name
          if (city && region) {
            setWeatherLocation(`${city}, ${region}`);
          } else if (city) {
            setWeatherLocation(city);
          } else {
            setWeatherLocation(country || "Unknown Location");
          }
          
          // Fetch weather for this location
          const weatherResponse = await fetch('/api/weather/locations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              locations: [{ lat, lng, stopId: 'current-location' }],
            }),
          });
          
          if (weatherResponse.ok) {
            const weatherData = await weatherResponse.json();
            // Weather response received
            if (weatherData.weather && weatherData.weather.length > 0) {
              setLocalWeather(weatherData.weather[0]);
            }
          }
        } else {
          throw new Error('IP geolocation failed');
        }
      } catch (err) {
        // Location/weather fetch failed - will use fallback
        // Fallback to Austin, TX
        setWeatherLocation("Austin, TX (fallback)");
        try {
          const response = await fetch('/api/weather/locations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              locations: [{ lat: 30.2672, lng: -97.7431, stopId: 'current-location' }],
            }),
          });
          if (response.ok) {
            const data = await response.json();
            if (data.weather && data.weather.length > 0) {
              setLocalWeather(data.weather[0]);
            }
          }
        } catch (fallbackErr) {
          // Fallback weather also failed - user will see error state
        }
      }
    }

    fetchLocationAndWeather();
  }, []);

  const userDisplayName = useMemo(() => {
    if (authUser?.firstName && authUser?.lastName) {
      return `${authUser.firstName} ${authUser.lastName}`.trim();
    }
    if (authUser?.firstName) {
      return authUser.firstName;
    }
    return authUser?.username || "Adjuster";
  }, [authUser?.firstName, authUser?.lastName, authUser?.username]);

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

  // Fetch today's scheduled appointments
  const { data: appointmentsData } = useQuery<{ appointments: Array<{
    id: string;
    claimId: string;
    title: string;
    description: string | null;
    location: string | null;
    scheduledStart: string;
    scheduledEnd: string;
    durationMinutes: number;
    status: string;
    appointmentType: string;
    ms365EventId: string | null;
  }> }>({
    queryKey: ["/api/calendar/today"],
    queryFn: async () => {
      const response = await fetch("/api/calendar/today", {
        credentials: "include",
      });
      if (!response.ok) {
        return { appointments: [] };
      }
      return response.json();
    },
    staleTime: 60000,
  });

  // Construct proper display name from firstName/lastName, falling back to username
  const displayName = useMemo(() => {
    if (!authUser) return "Adjuster";
    const fullName = [authUser.firstName, authUser.lastName].filter(Boolean).join(' ');
    return fullName || authUser.username || "Adjuster";
  }, [authUser]);

  const dayData = useMemo(() => {
    if (!claimsData?.claims) {
      return buildEmptyDayData(displayName);
    }
    return transformClaimsToMyDayData(claimsData.claims, displayName, appointmentsData?.appointments);
  }, [claimsData, displayName, appointmentsData]);

  // Fetch AI analysis when route changes
  useEffect(() => {
    if (dayData.route.length === 0 || !claimsData?.claims) {
      setAiAnalysis(undefined);
      return;
    }

    const fetchAiAnalysis = async () => {
      setIsAnalyzing(true);
      try {
        const inspectionRoute = dayData.route.map(stop => ({
          id: stop.id,
          claimId: stop.claimId,
          claimNumber: stop.claimNumber,
          insuredName: stop.insuredName,
          address: stop.address,
          city: stop.city,
          state: stop.state,
          lat: stop.lat,
          lng: stop.lng,
          estimatedDuration: stop.estimatedDuration,
          travelTimeFromPrevious: stop.travelTimeFromPrevious,
        }));

        const response = await fetch('/api/my-day/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            claims: claimsData.claims,
            inspectionRoute,
            userName: displayName,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          setAiAnalysis(result);
        }
      } catch (err) {
        // AI analysis failed - user will see error toast
      } finally {
        setIsAnalyzing(false);
      }
    };

    fetchAiAnalysis();
  }, [dayData.route, claimsData?.claims, displayName]);

  // Fetch route optimization when route changes
  useEffect(() => {
    if (dayData.route.length < 2) {
      setRouteOptimization(undefined);
      return;
    }

    const fetchRouteOptimization = async () => {
      setIsOptimizing(true);
      try {
        const stops = dayData.route
          .filter(stop => stop.lat && stop.lng && stop.lat !== 0 && stop.lng !== 0)
          .map(stop => ({
            id: stop.claimId,
            lat: stop.lat!,
            lng: stop.lng!,
            address: `${stop.address}, ${stop.city}, ${stop.state}`,
          }));

        if (stops.length < 2) {
          setIsOptimizing(false);
          return;
        }

        const response = await fetch('/api/route/optimize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ stops }),
        });

        if (response.ok) {
          const result = await response.json();
          setRouteOptimization(result);
        }
      } catch (err) {
        console.error('Route optimization failed:', err);
      } finally {
        setIsOptimizing(false);
      }
    };

    fetchRouteOptimization();
  }, [dayData.route]);

  // Apply optimized ordering to route
  const optimizedRoute = useMemo(() => {
    if (!routeOptimization?.orderedStops || routeOptimization.orderedStops.length === 0) {
      return dayData.route;
    }

    // Create a map for quick lookup
    const routeMap = new Map(dayData.route.map(stop => [stop.claimId, stop]));
    
    // Reorder based on orderedStops
    const reordered: InspectionStop[] = [];
    for (const claimId of routeOptimization.orderedStops) {
      const stop = routeMap.get(claimId);
      if (stop) {
        // Find travel time from legs
        const leg = routeOptimization.legs.find(l => l.toStopId === claimId);
        reordered.push({
          ...stop,
          travelTimeFromPrevious: leg?.duration,
        });
      }
    }

    // Add any stops not in the optimized list (no coordinates)
    for (const stop of dayData.route) {
      if (!reordered.find(s => s.claimId === stop.claimId)) {
        reordered.push(stop);
      }
    }

    return reordered;
  }, [dayData.route, routeOptimization]);

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
          <MobileDayContextBar context={dayData.context} weather={aiAnalysis?.weatherData?.[0] || localWeather} locationName={weatherLocation} />
        ) : (
          <DesktopDayContextBar context={dayData.context} weather={aiAnalysis?.weatherData?.[0] || localWeather} locationName={weatherLocation} />
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
              <Link href="/claims" className="mt-4 text-primary hover:underline text-sm font-medium">
                Upload Documents
              </Link>
            </div>
          )}

          {/* AI Insights Panel - Top priority when claims exist */}
          {(dayData.route.length > 0 || isAnalyzing) && (
            <AiInsightsPanel
              analysis={aiAnalysis}
              isLoading={isAnalyzing}
              isMobile={isMobileLayout}
              weather={aiAnalysis?.weatherData?.[0] || localWeather}
            />
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
          {optimizedRoute.length > 0 && (
            <TodaysRoute
              route={optimizedRoute}
              weather={dayData.weather}
              isMobile={isMobileLayout}
              routeOptimization={routeOptimization}
              isOptimizing={isOptimizing}
              stopWeatherData={aiAnalysis?.weatherData}
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
