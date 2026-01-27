import { useEffect, useState, useRef } from "react";
import { useStore } from "@/lib/store";
import Layout from "@/components/layout";
import { useDeviceMode } from "@/contexts/DeviceModeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  BarChart3,
  Clock,
  CheckCircle2,
  Search,
  FileText,
  MapPin,
  Calendar,
  DollarSign,
  Camera,
  Loader2,
  AlertCircle,
  Building2,
  Shield,
  Mic,
  ChevronRight,
  Archive,
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudLightning,
  Wind,
  Thermometer,
  Droplets,
  AlertTriangle,
} from "lucide-react";
import { Link } from "wouter";
import { getClaims, getClaimStats, type Claim, type ClaimStats } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { ClaimUploadWizard } from "@/components/ClaimUploadWizard";

function ClaimCard({ claim }: { claim: Claim }) {
  // Use colors that contrast with the purple site theme
  const statusStyles: Record<string, { bg: string; text: string; border: string; icon: string }> = {
    fnol: { bg: "bg-amber-400", text: "text-amber-900", border: "border-amber-500", icon: "📥" },
    open: { bg: "bg-cyan-400", text: "text-cyan-900", border: "border-cyan-500", icon: "📂" },
    in_progress: { bg: "bg-orange-400", text: "text-orange-900", border: "border-orange-500", icon: "⚡" },
    review: { bg: "bg-rose-400", text: "text-rose-900", border: "border-rose-500", icon: "👁️" },
    approved: { bg: "bg-emerald-400", text: "text-emerald-900", border: "border-emerald-500", icon: "✅" },
    closed: { bg: "bg-slate-300", text: "text-slate-700", border: "border-slate-400", icon: "📦" },
  };
  const defaultStatus = { bg: "bg-slate-200", text: "text-slate-700", border: "border-slate-300", icon: "📋" };
  const statusStyle = statusStyles[claim.status] || defaultStatus;

  // Peril-based border and accent colors - vibrant colorful gradient backgrounds
  const perilStyles: Record<string, { border: string; bgStyle: React.CSSProperties; icon: string }> = {
    wind_hail: { border: "border-l-cyan-500", bgStyle: { background: "linear-gradient(135deg, #a5f3fc 0%, #67e8f9 30%, #22d3ee 100%)" }, icon: "💨" },
    fire: { border: "border-l-orange-500", bgStyle: { background: "linear-gradient(135deg, #fed7aa 0%, #fdba74 30%, #fb923c 100%)" }, icon: "🔥" },
    water: { border: "border-l-blue-500", bgStyle: { background: "linear-gradient(135deg, #bfdbfe 0%, #93c5fd 30%, #60a5fa 100%)" }, icon: "💧" },
    flood: { border: "border-l-indigo-500", bgStyle: { background: "linear-gradient(135deg, #c7d2fe 0%, #a5b4fc 30%, #818cf8 100%)" }, icon: "🌊" },
    smoke: { border: "border-l-gray-500", bgStyle: { background: "linear-gradient(135deg, #e5e7eb 0%, #d1d5db 30%, #9ca3af 100%)" }, icon: "💨" },
    mold: { border: "border-l-emerald-500", bgStyle: { background: "linear-gradient(135deg, #a7f3d0 0%, #6ee7b7 30%, #34d399 100%)" }, icon: "🍄" },
    impact: { border: "border-l-red-500", bgStyle: { background: "linear-gradient(135deg, #fecaca 0%, #fca5a5 30%, #f87171 100%)" }, icon: "💥" },
    other: { border: "border-l-violet-500", bgStyle: { background: "linear-gradient(135deg, #ddd6fe 0%, #c4b5fd 30%, #a78bfa 100%)" }, icon: "📋" },
  };

  // Legacy lossType to peril mapping
  const legacyToPeril: Record<string, string> = {
    "Wind/Hail": "wind_hail",
    "Hail": "wind_hail",
    "Wind": "wind_hail",
    "Fire": "fire",
    "Water": "water",
    "Flood": "flood",
  };

  const perilKey = claim.primaryPeril || legacyToPeril[claim.lossType || ""] || "other";
  const perilStyle = perilStyles[perilKey] || perilStyles.other;

  return (
    <Link href={`/claim/${claim.id}`}>
      <Card className={`hover:shadow-lg transition-all cursor-pointer border-l-4 ${perilStyle.border} shadow-md hover:scale-[1.01]`} style={perilStyle.bgStyle}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{perilStyle.icon}</span>
                <span className="font-semibold text-slate-900">{claim.claimNumber}</span>
              </div>
              <p className="text-sm text-slate-600 font-medium">{claim.insuredName || "Unknown Insured"}</p>
            </div>
            <Badge className={`${statusStyle.bg} ${statusStyle.text} ${statusStyle.border} border shadow-md font-semibold px-2.5 py-0.5`}>
              <span className="mr-1">{statusStyle.icon}</span>
              {claim.status.replace("_", " ").toUpperCase()}
            </Badge>
          </div>

          <div className="space-y-2 text-sm text-slate-500">
            {claim.propertyAddress && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                <span className="truncate">
                  {claim.propertyAddress}
                  {claim.propertyCity && `, ${claim.propertyCity}`}
                  {claim.propertyState && `, ${claim.propertyState}`}
                </span>
              </div>
            )}
            {claim.dateOfLoss && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>Loss: {new Date(claim.dateOfLoss).toLocaleDateString()}</span>
              </div>
            )}
            {claim.totalRcv && parseFloat(claim.totalRcv) > 0 && (
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                <span>RCV: ${parseFloat(claim.totalRcv).toLocaleString()}</span>
              </div>
            )}
            {claim.coverageA && Number(claim.coverageA) > 0 && (
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                <span>
                  Coverage A: ${Number(claim.coverageA).toLocaleString()}
                </span>
              </div>
            )}
          </div>

          <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              {(claim.documentCount && claim.documentCount > 0) && (
                <span className="flex items-center gap-1 text-blue-600">
                  <FileText className="w-3 h-3" />
                  {claim.documentCount} docs
                </span>
              )}
              {(claim.estimateCount && claim.estimateCount > 0) && (
                <span className="flex items-center gap-1 text-green-600">
                  <DollarSign className="w-3 h-3" />
                  {claim.estimateCount} estimates
                </span>
              )}
              {(!claim.documentCount && !claim.estimateCount) && (
                <span className="text-slate-400">New claim</span>
              )}
            </div>
            <span className="text-slate-400">
              {claim.createdAt && !isNaN(new Date(claim.createdAt).getTime())
                ? formatDistanceToNow(new Date(claim.createdAt), { addSuffix: true })
                : "—"}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// Mobile-optimized claim card for compact display
function MobileClaimCard({ claim }: { claim: Claim }) {
  // Use colors that contrast with the purple site theme
  const statusStyles: Record<string, { bg: string; text: string; icon: string }> = {
    fnol: { bg: "bg-amber-400", text: "text-amber-900", icon: "📥" },
    open: { bg: "bg-cyan-400", text: "text-cyan-900", icon: "📂" },
    in_progress: { bg: "bg-orange-400", text: "text-orange-900", icon: "⚡" },
    review: { bg: "bg-rose-400", text: "text-rose-900", icon: "👁️" },
    approved: { bg: "bg-emerald-400", text: "text-emerald-900", icon: "✅" },
    closed: { bg: "bg-slate-300", text: "text-slate-700", icon: "📦" },
  };
  const defaultStatus = { bg: "bg-slate-200", text: "text-slate-700", icon: "📋" };
  const statusStyle = statusStyles[claim.status] || defaultStatus;

  const lossTypeIcons: Record<string, string> = {
    Water: "💧",
    Fire: "🔥",
    "Wind/Hail": "💨",
    Impact: "💥",
    Other: "📋",
  };

  return (
    <Link href={`/claim/${claim.id}`}>
      <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-border active:bg-muted transition-colors min-tap-target">
        <div className="text-2xl shrink-0">
          {lossTypeIcons[claim.lossType || "Other"] || "📋"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900 truncate">{claim.claimNumber}</span>
            <Badge className={`${statusStyle.bg} ${statusStyle.text} text-xs shrink-0 shadow-sm font-medium px-2 py-0.5`}>
              <span className="mr-0.5">{statusStyle.icon}</span>
              {claim.status.replace("_", " ").toUpperCase()}
            </Badge>
          </div>
          <p className="text-sm text-slate-500 truncate">
            {claim.insuredName || "Unknown Insured"}
            {claim.propertyCity && ` • ${claim.propertyCity}`}
          </p>
        </div>
        <ChevronRight className="h-5 w-5 text-slate-400 shrink-0" />
      </div>
    </Link>
  );
}

// Weather data interface for current location
interface CurrentWeather {
  temp: number;
  feelsLike?: number;
  humidity?: number;
  windSpeed?: number;
  conditions: string;
  icon: string;
  forecast?: HourlyForecast[];
  alerts?: WeatherAlert[];
}

interface HourlyForecast {
  time: string;
  temp: number;
  pop: number;
  conditions: { main: string }[];
  windSpeed: number;
}

interface WeatherAlert {
  event: string;
  severity: string;
  headline: string;
}

interface CurrentLocation {
  city: string;
  state: string;
  lat: number;
  lng: number;
}

// Get weather icon component based on condition
function getWeatherIconComponent(conditions: string) {
  const c = conditions.toLowerCase();
  if (c.includes('thunder') || c.includes('lightning')) return CloudLightning;
  if (c.includes('rain') || c.includes('drizzle') || c.includes('shower')) return CloudRain;
  if (c.includes('snow') || c.includes('sleet') || c.includes('ice')) return CloudSnow;
  if (c.includes('wind')) return Wind;
  if (c.includes('cloud') || c.includes('overcast')) return Cloud;
  return Sun;
}

export default function Home() {
  const user = useStore((state) => state.user);
  const authUser = useStore((state) => state.authUser);
  const { layoutMode, isMobile, isTablet } = useDeviceMode();
  const isMobileLayout = layoutMode === "mobile";

  const [claims, setClaims] = useState<Claim[]>([]);
  const [stats, setStats] = useState<ClaimStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [currentLocation, setCurrentLocation] = useState<CurrentLocation | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showClosed, setShowClosed] = useState(false);
  
  // Ref for bulk upload zone scroll-to
  const bulkUploadRef = useRef<HTMLDivElement>(null);
  
  const scrollToBulkUpload = () => {
    bulkUploadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // Fetch weather for current location
  useEffect(() => {
    async function fetchWeatherAndLocation(lat: number, lng: number) {
      try {
        // Fetch weather
        const response = await fetch('/api/weather/locations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            locations: [{ lat, lng, stopId: 'current' }],
          }),
        });
        if (response.ok) {
          const data = await response.json();
          if (data.weather && data.weather.length > 0) {
            const w = data.weather[0];
            setWeather({
              temp: w.current?.temp || 0,
              feelsLike: w.current?.feelsLike,
              humidity: w.current?.humidity,
              windSpeed: w.current?.windSpeed,
              conditions: w.current?.conditions?.[0]?.main || 'Clear',
              icon: w.current?.conditions?.[0]?.icon || '01d',
              forecast: w.forecast || [],
              alerts: w.alerts || [],
            });
          }
        }

        // Reverse geocode to get city/state using our backend
        try {
          const geoResponse = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`, {
            credentials: 'include',
          });
          if (geoResponse.ok) {
            const geoData = await geoResponse.json();
            if (geoData.city || geoData.state) {
              setCurrentLocation({
                city: geoData.city || '',
                state: geoData.state || '',
                lat,
                lng,
              });
            }
          }
        } catch {
          // Fallback - just use coordinates
          setCurrentLocation({ city: 'Your Location', state: '', lat, lng });
        }
      } catch (err) {
        // Weather fetch failed - continue without weather data
      } finally {
        setWeatherLoading(false);
      }
    }

    // Default to Austin, TX if geolocation unavailable
    const defaultLat = 30.2672;
    const defaultLng = -97.7431;

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => fetchWeatherAndLocation(position.coords.latitude, position.coords.longitude),
        () => fetchWeatherAndLocation(defaultLat, defaultLng),
        { timeout: 5000, maximumAge: 300000 }
      );
    } else {
      fetchWeatherAndLocation(defaultLat, defaultLng);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [statusFilter, showClosed]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [claimsResult, statsResult] = await Promise.allSettled([
        getClaims({
          status: statusFilter !== "all" ? statusFilter : undefined,
          search: searchQuery || undefined,
          limit: 20,
          includeClosed: showClosed || statusFilter === 'closed',
        }),
        getClaimStats(),
      ]);

      // Handle claims result
      if (claimsResult.status === 'fulfilled') {
        setClaims(claimsResult.value.claims);
      } else {
        const errorMsg = claimsResult.reason instanceof Error 
          ? claimsResult.reason.message 
          : String(claimsResult.reason || 'Failed to fetch claims');
        setError(errorMsg);
        setClaims([]);
      }

      // Handle stats result - don't block page if stats fail
      if (statsResult.status === 'fulfilled') {
        setStats(statsResult.value);
      } else {
        // Stats failed but don't show error - just log it
        const errorMsg = statsResult.reason instanceof Error 
          ? statsResult.reason.message 
          : String(statsResult.reason || 'Failed to fetch claim stats');
        console.warn('Failed to fetch claim stats:', errorMsg);
        // Set default stats to prevent UI errors
        setStats({
          total: 0,
          byStatus: {},
          byLossType: {},
          totalRcv: 0,
          totalAcv: 0,
          totalDocuments: 0,
          pendingDocuments: 0,
          totalPhotos: 0,
        });
      }
    } catch (err) {
      // Fallback error handling
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const displayName = authUser?.username || user?.name || 'User';

  // Mobile Layout
  if (isMobileLayout) {
    return (
      <Layout>
        <div className="p-4">
          {/* Mobile Welcome with Weather */}
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h1 className="text-xl font-display font-bold text-slate-900">
                Hi, {displayName.split(' ')[0]}
              </h1>
              <p className="text-sm text-slate-500">
                {stats ? `${(stats.byStatus.fnol || 0) + (stats.byStatus.open || 0) + (stats.byStatus.in_progress || 0)} active claims` : 'Loading...'}
              </p>
            </div>
            {weatherLoading ? (
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
                <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />
              </div>
            ) : weather && (
              <div className="bg-gradient-to-br from-sky-50 to-white border border-sky-200 rounded-xl px-3 py-2" data-testid="weather-badge-home">
                <div className="flex items-center gap-2">
                  {(() => {
                    const WeatherIcon = getWeatherIconComponent(weather.conditions);
                    return <WeatherIcon className="h-8 w-8 text-sky-500" />;
                  })()}
                  <div>
                    <div className="text-lg font-bold text-foreground">{Math.round(weather.temp)}°F</div>
                    <div className="text-xs text-muted-foreground">{weather.conditions}</div>
                  </div>
                  <div className="border-l border-sky-200 pl-2 ml-1 space-y-0.5">
                    {weather.feelsLike !== undefined && (
                      <div className="flex items-center gap-1 text-xs">
                        <Thermometer className="h-3 w-3 text-sky-500" />
                        <span>{Math.round(weather.feelsLike)}°</span>
                      </div>
                    )}
                    {weather.humidity !== undefined && (
                      <div className="flex items-center gap-1 text-xs">
                        <Droplets className="h-3 w-3 text-sky-500" />
                        <span>{weather.humidity}%</span>
                      </div>
                    )}
                  </div>
                </div>
                {currentLocation && (currentLocation.city || currentLocation.state) && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-sky-600">
                    <MapPin className="h-3 w-3" />
                    <span>{currentLocation.city}{currentLocation.city && currentLocation.state ? ', ' : ''}{currentLocation.state}</span>
                  </div>
                )}
                {weather.alerts && weather.alerts.length > 0 && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-amber-600">
                    <AlertTriangle className="h-3 w-3" />
                    <span className="truncate">{weather.alerts[0].event}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mobile Quick Actions */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <button
              onClick={scrollToBulkUpload}
              className="bg-primary text-primary-foreground p-4 rounded-xl flex flex-col items-center justify-center gap-2 active:opacity-90 transition-opacity min-tap-target"
            >
              <Plus className="h-6 w-6" />
              <span className="text-sm font-medium">New Claim</span>
            </button>
            <Link href="/voice-sketch" className="block h-full">
              <div 
                className="p-4 rounded-xl flex flex-col items-center justify-center gap-2 active:opacity-90 transition-opacity min-tap-target shadow-md h-full"
                style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)', color: 'white' }}
              >
                <Mic className="h-6 w-6" style={{ color: 'white' }} />
                <span className="text-sm font-medium" style={{ color: 'white' }}>Voice Sketch</span>
              </div>
            </Link>
          </div>

          {/* Mobile Stats - Compact horizontal scroll */}
          <div className="flex gap-3 overflow-x-auto pb-2 mb-4 -mx-4 px-4 scrollbar-hide">
            <div className="bg-amber-100 p-3 rounded-lg border-2 border-amber-300 flex items-center gap-2 shrink-0 min-w-[100px]">
              <div className="h-8 w-8 rounded-full bg-amber-500 flex items-center justify-center text-white shadow-sm">
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-amber-700 font-medium">Claims</p>
                <p className="text-lg font-bold text-amber-900">{stats?.total || 0}</p>
              </div>
            </div>
            <div className="bg-purple-100 p-3 rounded-lg border-2 border-purple-300 flex items-center gap-2 shrink-0 min-w-[100px]">
              <div className="h-8 w-8 rounded-full bg-purple-500 flex items-center justify-center text-white shadow-sm">
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-purple-700 font-medium">Documents</p>
                <p className="text-lg font-bold text-purple-900">{stats?.totalDocuments || 0}</p>
              </div>
            </div>
            <div className="bg-orange-100 p-3 rounded-lg border-2 border-orange-300 flex items-center gap-2 shrink-0 min-w-[100px]">
              <div className="h-8 w-8 rounded-full bg-orange-500 flex items-center justify-center text-white shadow-sm">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-orange-700 font-medium">Processing</p>
                <p className="text-lg font-bold text-orange-900">{stats?.pendingDocuments || 0}</p>
              </div>
            </div>
            <div className="bg-emerald-100 p-3 rounded-lg border-2 border-emerald-300 flex items-center gap-2 shrink-0 min-w-[100px]">
              <div className="h-8 w-8 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-sm">
                <Camera className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-emerald-700 font-medium">Photos</p>
                <p className="text-lg font-bold text-emerald-900">{stats?.totalPhotos || 0}</p>
              </div>
            </div>
          </div>

          {/* Mobile Search */}
          <form onSubmit={handleSearch} className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search claims..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-20"
            />
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              className="absolute right-1 top-1/2 -translate-y-1/2"
            >
              Search
            </Button>
          </form>

          {/* Status Filter - Horizontal pills */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-2 -mx-4 px-4 scrollbar-hide">
            {[
              { value: "all", label: "All" },
              { value: "fnol", label: "FNOL" },
              { value: "open", label: "Open" },
              { value: "in_progress", label: "In Progress" },
              { value: "review", label: "Review" },
              { value: "closed", label: "Closed" },
            ].map((status) => (
              <button
                key={status.value}
                onClick={() => setStatusFilter(status.value)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors min-tap-target ${
                  statusFilter === status.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {status.label}
              </button>
            ))}
          </div>

          {/* Show Closed Toggle */}
          <div className="flex items-center gap-2 mb-4">
            <Checkbox
              id="show-closed-mobile"
              checked={showClosed}
              onCheckedChange={(checked) => setShowClosed(checked === true)}
              data-testid="checkbox-show-closed-mobile"
            />
            <Label htmlFor="show-closed-mobile" className="text-sm text-muted-foreground cursor-pointer flex items-center gap-1">
              <Archive className="h-4 w-4" />
              Include closed claims
            </Label>
          </div>

          {/* Mobile Claims List */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
              Recent Claims
            </h2>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <AlertCircle className="h-10 w-10 text-red-400 mb-3" />
                <p className="text-sm text-slate-500 mb-3">{error}</p>
                <Button size="sm" onClick={loadData}>Retry</Button>
              </div>
            ) : claims.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Building2 className="h-10 w-10 text-slate-300 mb-3" />
                <p className="text-sm text-slate-500 mb-3">No claims yet — drop files below to get started</p>
              </div>
            ) : (
              <div className="space-y-2">
                {claims.map((claim) => (
                  <MobileClaimCard key={claim.id} claim={claim} />
                ))}
              </div>
            )}
          </div>

          {/* Claim Upload Wizard - Below claims list */}
          <div ref={bulkUploadRef} className="mt-6">
            <ClaimUploadWizard className="mb-4" onUploadComplete={loadData} />
          </div>
        </div>
      </Layout>
    );
  }

  // Desktop Layout (original)
  return (
    <Layout>
      <div className="max-w-6xl mx-auto p-6 md:p-8">
        {/* Welcome Section with Weather */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-3xl font-display font-bold text-slate-900">Dashboard</h1>
              <p className="text-slate-500 mt-1">
                Welcome back, {displayName}.
                {stats && ` You have ${(stats.byStatus.fnol || 0) + (stats.byStatus.open || 0) + (stats.byStatus.in_progress || 0)} active claims.`}
              </p>
            </div>
            {weatherLoading ? (
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <Loader2 className="h-5 w-5 text-slate-400 animate-spin" />
                <span className="text-sm text-slate-500">Loading weather...</span>
              </div>
            ) : weather && (
              <div className="bg-gradient-to-br from-sky-50 to-white border border-sky-200 rounded-xl px-4 py-3 shadow-sm" data-testid="weather-badge-desktop">
                <div className="flex items-start gap-4">
                  <div className="flex items-center gap-3">
                    {(() => {
                      const WeatherIcon = getWeatherIconComponent(weather.conditions);
                      return <WeatherIcon className="h-12 w-12 text-sky-500" />;
                    })()}
                    <div>
                      <div className="text-3xl font-bold text-foreground">{Math.round(weather.temp)}°F</div>
                      <p className="text-sm text-muted-foreground">{weather.conditions}</p>
                      {currentLocation && (currentLocation.city || currentLocation.state) && (
                        <div className="flex items-center gap-1 text-xs text-sky-600 mt-0.5">
                          <MapPin className="h-3 w-3" />
                          <span>{currentLocation.city}{currentLocation.city && currentLocation.state ? ', ' : ''}{currentLocation.state}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="border-l border-sky-200 pl-4 space-y-1">
                    {weather.feelsLike !== undefined && (
                      <div className="flex items-center gap-2 text-sm">
                        <Thermometer className="h-4 w-4 text-sky-500" />
                        <span className="text-muted-foreground">Feels</span>
                        <span className="font-medium">{Math.round(weather.feelsLike)}°</span>
                      </div>
                    )}
                    {weather.humidity !== undefined && (
                      <div className="flex items-center gap-2 text-sm">
                        <Droplets className="h-4 w-4 text-sky-500" />
                        <span className="text-muted-foreground">Humidity</span>
                        <span className="font-medium">{weather.humidity}%</span>
                      </div>
                    )}
                    {weather.windSpeed !== undefined && (
                      <div className="flex items-center gap-2 text-sm">
                        <Wind className="h-4 w-4 text-sky-500" />
                        <span className="text-muted-foreground">Wind</span>
                        <span className="font-medium">{Math.round(weather.windSpeed)} mph</span>
                      </div>
                    )}
                  </div>
                  {weather.forecast && weather.forecast.length > 0 && (
                    <div className="border-l border-sky-200 pl-4">
                      <p className="text-xs text-muted-foreground mb-1">Next Hours</p>
                      <div className="flex gap-3">
                        {weather.forecast.slice(0, 3).map((hour, idx) => (
                          <div key={idx} className="text-center">
                            <p className="text-xs text-muted-foreground">
                              {new Date(hour.time).toLocaleTimeString([], { hour: 'numeric' })}
                            </p>
                            <p className="text-sm font-medium">{Math.round(hour.temp)}°</p>
                            {hour.pop > 0 && (
                              <p className="text-xs text-sky-600">{hour.pop}%</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {weather.alerts && weather.alerts.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-amber-200 bg-amber-50 -mx-4 -mb-3 px-4 pb-2 rounded-b-xl">
                    <div className="flex items-center gap-2 text-amber-700">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-sm font-medium">{weather.alerts[0].event}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <Button size="lg" className="shadow-lg shadow-primary/20" onClick={scrollToBulkUpload}>
            <Plus className="mr-2 h-5 w-5" />
            New Claim
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-6 rounded-xl border border-border shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Claims</p>
              <p className="text-3xl font-display font-bold text-slate-900">
                {stats?.total || 0}
              </p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-border shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center text-primary">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Documents</p>
              <p className="text-3xl font-display font-bold text-slate-900">
                {stats?.totalDocuments || 0}
              </p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-border shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Processing</p>
              <p className="text-3xl font-display font-bold text-slate-900">
                {stats?.pendingDocuments || 0}
              </p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-border shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center text-green-600">
              <Camera className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Photos</p>
              <p className="text-3xl font-display font-bold text-slate-900">
                {stats?.totalPhotos || 0}
              </p>
            </div>
          </div>
        </div>

        {/* Total Value Card */}
        {stats && (stats.totalRcv > 0 || stats.totalAcv > 0) && (
          <div className="bg-gradient-to-r from-primary/10 to-secondary/10 p-6 rounded-xl border border-primary/20 mb-8">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-white flex items-center justify-center text-primary">
                <DollarSign className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-600">Total Claims Value</p>
                <div className="flex items-baseline gap-4 mt-1">
                  <div>
                    <span className="text-2xl font-display font-bold text-slate-900">
                      ${stats.totalRcv.toLocaleString()}
                    </span>
                    <span className="text-sm text-slate-500 ml-1">RCV</span>
                  </div>
                  <div>
                    <span className="text-xl font-display font-semibold text-slate-700">
                      ${stats.totalAcv.toLocaleString()}
                    </span>
                    <span className="text-sm text-slate-500 ml-1">ACV</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search claims..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="fnol">FNOL</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="review">In Review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Checkbox
              id="show-closed"
              checked={showClosed}
              onCheckedChange={(checked) => setShowClosed(checked === true)}
              data-testid="checkbox-show-closed"
            />
            <Label htmlFor="show-closed" className="text-sm text-muted-foreground cursor-pointer flex items-center gap-1">
              <Archive className="h-4 w-4" />
              Show closed
            </Label>
          </div>
        </div>

        {/* Claims List */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-display font-semibold text-slate-900">
              Claims
              {claims.length > 0 && (
                <span className="text-sm font-normal text-slate-500 ml-2">
                  ({claims.length} shown)
                </span>
              )}
            </h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-12 w-12 text-red-400 mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Failed to load claims</h3>
              <p className="text-slate-500 mb-4">{error}</p>
              <Button onClick={loadData}>Try Again</Button>
            </div>
          ) : claims.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Building2 className="h-12 w-12 text-slate-300 mb-4" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">No claims yet</h3>
              <p className="text-slate-500 mb-4">
                Drop files in the upload zone below to get started
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {claims.map((claim) => (
                <ClaimCard key={claim.id} claim={claim} />
              ))}
            </div>
          )}
        </div>

        {/* Claim Upload Wizard - Below claims list */}
        <div ref={bulkUploadRef} className="mt-8">
          <ClaimUploadWizard className="mb-8" onUploadComplete={loadData} />
        </div>
      </div>
    </Layout>
  );
}
