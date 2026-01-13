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
} from "lucide-react";
import { Link } from "wouter";
import { getClaims, getClaimStats, type Claim, type ClaimStats } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { ClaimUploadWizard } from "@/components/ClaimUploadWizard";

function ClaimCard({ claim }: { claim: Claim }) {
  const statusColors: Record<string, string> = {
    fnol: "bg-purple-100 text-purple-700",
    open: "bg-blue-100 text-blue-700",
    in_progress: "bg-amber-100 text-amber-700",
    review: "bg-orange-100 text-orange-700",
    approved: "bg-green-100 text-green-700",
    closed: "bg-slate-100 text-slate-700",
  };

  const lossTypeIcons: Record<string, string> = {
    Water: "💧",
    Fire: "🔥",
    "Wind/Hail": "💨",
    Impact: "💥",
    Other: "📋",
  };

  return (
    <Link href={`/claim/${claim.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{lossTypeIcons[claim.lossType || "Other"] || "📋"}</span>
                <span className="font-semibold text-slate-900">{claim.claimNumber}</span>
              </div>
              <p className="text-sm text-slate-600">{claim.insuredName || "Unknown Insured"}</p>
            </div>
            <Badge className={statusColors[claim.status] || statusColors.fnol}>
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

          <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs text-slate-400">
            <span>
              {claim.documentCount || 0} docs • {claim.estimateCount || 0} estimates
            </span>
            <span>
              {claim.createdAt && !isNaN(new Date(claim.createdAt).getTime())
                ? `Received: ${new Date(claim.createdAt).toLocaleDateString()}`
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
  const statusColors: Record<string, string> = {
    fnol: "bg-purple-100 text-purple-700",
    open: "bg-blue-100 text-blue-700",
    in_progress: "bg-amber-100 text-amber-700",
    review: "bg-orange-100 text-orange-700",
    approved: "bg-green-100 text-green-700",
    closed: "bg-slate-100 text-slate-700",
  };

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
            <Badge className={`${statusColors[claim.status] || statusColors.fnol} text-xs shrink-0`}>
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
  conditions: string;
  icon: string;
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
    async function fetchWeather(lat: number, lng: number) {
      try {
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
              conditions: w.current?.conditions?.[0]?.main || 'Clear',
              icon: w.current?.conditions?.[0]?.icon || '01d',
            });
          }
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
        (position) => fetchWeather(position.coords.latitude, position.coords.longitude),
        () => fetchWeather(defaultLat, defaultLng), // Fallback on error
        { timeout: 5000, maximumAge: 300000 }
      );
    } else {
      fetchWeather(defaultLat, defaultLng);
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

  const displayName = authUser?.username || user.name;

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
              <div className="flex items-center gap-1.5 bg-sky-50 border border-sky-200 rounded-lg px-2 py-1.5" data-testid="weather-badge-home">
                {(() => {
                  const WeatherIcon = getWeatherIconComponent(weather.conditions);
                  return <WeatherIcon className="h-4 w-4 text-sky-600" />;
                })()}
                <span className="text-sm font-medium text-sky-700">{Math.round(weather.temp)}°F</span>
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
            <Link href="/voice-sketch">
              <div className="bg-gradient-to-br from-purple-500 to-primary text-white p-4 rounded-xl flex flex-col items-center justify-center gap-2 active:opacity-90 transition-opacity min-tap-target">
                <Mic className="h-6 w-6" />
                <span className="text-sm font-medium">Voice Sketch</span>
              </div>
            </Link>
          </div>

          {/* Claim Upload Wizard */}
          <div ref={bulkUploadRef}>
            <ClaimUploadWizard className="mb-4" onUploadComplete={loadData} />
          </div>

          {/* Mobile Stats - Compact horizontal scroll */}
          <div className="flex gap-3 overflow-x-auto pb-2 mb-4 -mx-4 px-4 scrollbar-hide">
            <div className="bg-white p-3 rounded-lg border border-border flex items-center gap-2 shrink-0 min-w-[100px]">
              <div className="h-8 w-8 rounded-full bg-purple-50 flex items-center justify-center text-purple-600">
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Claims</p>
                <p className="text-lg font-bold">{stats?.total || 0}</p>
              </div>
            </div>
            <div className="bg-white p-3 rounded-lg border border-border flex items-center gap-2 shrink-0 min-w-[100px]">
              <div className="h-8 w-8 rounded-full bg-blue-50 flex items-center justify-center text-primary">
                <FileText className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Documents</p>
                <p className="text-lg font-bold">{stats?.totalDocuments || 0}</p>
              </div>
            </div>
            <div className="bg-white p-3 rounded-lg border border-border flex items-center gap-2 shrink-0 min-w-[100px]">
              <div className="h-8 w-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Processing</p>
                <p className="text-lg font-bold">{stats?.pendingDocuments || 0}</p>
              </div>
            </div>
            <div className="bg-white p-3 rounded-lg border border-border flex items-center gap-2 shrink-0 min-w-[100px]">
              <div className="h-8 w-8 rounded-full bg-green-50 flex items-center justify-center text-green-600">
                <DollarSign className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total RCV</p>
                <p className="text-lg font-bold">${((stats?.totalRcv || 0) / 1000).toFixed(0)}k</p>
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
                <p className="text-sm text-slate-500 mb-3">No claims yet — drop files above to get started</p>
              </div>
            ) : (
              <div className="space-y-2">
                {claims.map((claim) => (
                  <MobileClaimCard key={claim.id} claim={claim} />
                ))}
              </div>
            )}
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
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2">
                <Loader2 className="h-5 w-5 text-slate-400 animate-spin" />
              </div>
            ) : weather && (
              <div className="flex items-center gap-2 bg-sky-50 border border-sky-200 rounded-xl px-4 py-2" data-testid="weather-badge-desktop">
                {(() => {
                  const WeatherIcon = getWeatherIconComponent(weather.conditions);
                  return <WeatherIcon className="h-5 w-5 text-sky-600" />;
                })()}
                <div>
                  <span className="text-lg font-semibold text-sky-700">{Math.round(weather.temp)}°F</span>
                  <p className="text-xs text-sky-600">{weather.conditions}</p>
                </div>
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
            <div className="h-12 w-12 rounded-full bg-purple-50 flex items-center justify-center text-purple-600">
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
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total RCV</p>
              <p className="text-3xl font-display font-bold text-slate-900">
                ${((stats?.totalRcv || 0) / 1000).toFixed(0)}k
              </p>
            </div>
          </div>
        </div>

        {/* Claim Upload Wizard - Desktop */}
        <div ref={bulkUploadRef}>
          <ClaimUploadWizard className="mb-8" onUploadComplete={loadData} />
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
                Drop files in the upload zone above to get started
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
      </div>
    </Layout>
  );
}
