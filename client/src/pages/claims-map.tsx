import { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import { Icon, DivIcon, LatLngBounds } from "leaflet";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, MapPin, RefreshCw, ExternalLink, AlertCircle } from "lucide-react";
import "leaflet/dist/leaflet.css";

interface ClaimMapData {
  id: string;
  claimNumber: string;
  status: string;
  lossType?: string;
  propertyAddress?: string;
  propertyCity?: string;
  propertyState?: string;
  latitude: number;
  longitude: number;
  assignedAdjusterId?: string;
  insuredName?: string;
  dateOfLoss?: string;
  createdAt: string;
}

interface MapStats {
  total: number;
  geocoded: number;
  pending: number;
  failed: number;
}

const statusColors: Record<string, string> = {
  fnol: "#3b82f6",
  assigned: "#8b5cf6",
  in_progress: "#f59e0b",
  pending_review: "#06b6d4",
  approved: "#10b981",
  closed: "#6b7280",
  denied: "#ef4444",
};

const statusLabels: Record<string, string> = {
  fnol: "FNOL",
  assigned: "Assigned",
  in_progress: "In Progress",
  pending_review: "Pending Review",
  approved: "Approved",
  closed: "Closed",
  denied: "Denied",
};

function createMarkerIcon(status: string): DivIcon {
  const color = statusColors[status] || "#6b7280";
  return new DivIcon({
    className: "custom-marker",
    html: `
      <div style="
        width: 24px;
        height: 24px;
        background: ${color};
        border: 2px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
    popupAnchor: [0, -24],
  });
}

function MapBoundsController({ claims }: { claims: ClaimMapData[] }) {
  const map = useMap();

  useEffect(() => {
    if (claims.length > 0) {
      const bounds = new LatLngBounds(
        claims.map((c) => [c.latitude, c.longitude])
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [claims, map]);

  return null;
}

async function fetchClaimsForMap(myClaims: boolean): Promise<{ claims: ClaimMapData[]; total: number }> {
  const params = new URLSearchParams();
  if (myClaims) params.set("my_claims", "true");
  
  const response = await fetch(`/api/claims/map?${params}`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to fetch claims");
  return response.json();
}

async function fetchMapStats(): Promise<MapStats> {
  const response = await fetch("/api/claims/map/stats", {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to fetch stats");
  return response.json();
}

async function triggerGeocoding(): Promise<{ queued: number }> {
  const response = await fetch("/api/claims/geocode-pending", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limit: 100 }),
  });
  if (!response.ok) throw new Error("Failed to trigger geocoding");
  return response.json();
}

export default function ClaimsMap() {
  const [myClaims, setMyClaims] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);

  const { data: claimsData, isLoading, refetch } = useQuery({
    queryKey: ["claims-map", myClaims],
    queryFn: () => fetchClaimsForMap(myClaims),
    refetchInterval: 30000,
  });

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ["map-stats"],
    queryFn: fetchMapStats,
    refetchInterval: 30000,
  });

  const handleGeocodeClick = async () => {
    setIsGeocoding(true);
    try {
      await triggerGeocoding();
      setTimeout(() => {
        refetch();
        refetchStats();
      }, 5000);
    } catch (error) {
      console.error("Geocoding failed:", error);
    } finally {
      setIsGeocoding(false);
    }
  };

  const claims = claimsData?.claims || [];

  return (
    <Layout>
      <div className="p-4 md:p-6 h-[calc(100vh-4rem)] md:h-screen flex flex-col" data-testid="page-claims-map">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Claims Map</h1>
            <p className="text-muted-foreground text-sm">
              {isLoading ? (
                "Loading claims..."
              ) : (
                <>Showing {claims.length} of {stats?.total || 0} claims on map</>
              )}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="my-claims"
                checked={myClaims}
                onCheckedChange={setMyClaims}
                data-testid="switch-my-claims"
              />
              <label htmlFor="my-claims" className="text-sm font-medium cursor-pointer">
                My Claims Only
              </label>
            </div>

            {stats && stats.pending > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleGeocodeClick}
                disabled={isGeocoding}
                data-testid="button-geocode"
              >
                {isGeocoding ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Geocode {stats.pending} Pending
              </Button>
            )}
          </div>
        </div>

        {stats && (
          <div className="flex gap-2 mb-4 flex-wrap">
            <Badge variant="secondary" className="gap-1">
              <MapPin className="h-3 w-3" />
              {stats.geocoded} geocoded
            </Badge>
            {stats.pending > 0 && (
              <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300">
                <Loader2 className="h-3 w-3" />
                {stats.pending} pending
              </Badge>
            )}
            {stats.failed > 0 && (
              <Badge variant="outline" className="gap-1 text-red-600 border-red-300">
                <AlertCircle className="h-3 w-3" />
                {stats.failed} failed
              </Badge>
            )}
          </div>
        )}

        <div className="flex-1 rounded-lg overflow-hidden border bg-white" data-testid="container-map">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : claims.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
              <MapPin className="h-12 w-12" />
              <p>No geocoded claims to display</p>
              <p className="text-sm">Claims will appear here after their addresses are geocoded</p>
            </div>
          ) : (
            <MapContainer
              center={[39.8283, -98.5795]}
              zoom={4}
              className="h-full w-full"
              scrollWheelZoom={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapBoundsController claims={claims} />
              {claims.map((claim) => (
                <Marker
                  key={claim.id}
                  position={[claim.latitude, claim.longitude]}
                  icon={createMarkerIcon(claim.status)}
                >
                  <Popup>
                    <Card className="border-0 shadow-none min-w-[200px]">
                      <CardContent className="p-0">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-sm">{claim.claimNumber}</span>
                            <Badge
                              style={{ backgroundColor: statusColors[claim.status] }}
                              className="text-white text-xs"
                            >
                              {statusLabels[claim.status] || claim.status}
                            </Badge>
                          </div>
                          {claim.insuredName && (
                            <p className="text-sm text-muted-foreground">{claim.insuredName}</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {[claim.propertyAddress, claim.propertyCity, claim.propertyState]
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                          {claim.lossType && (
                            <Badge variant="outline" className="text-xs">
                              {claim.lossType}
                            </Badge>
                          )}
                          <Link href={`/claim/${claim.id}`}>
                            <Button
                              variant="link"
                              size="sm"
                              className="p-0 h-auto text-xs"
                              data-testid={`link-claim-${claim.id}`}
                            >
                              View Claim <ExternalLink className="h-3 w-3 ml-1" />
                            </Button>
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          <span className="text-muted-foreground">Legend:</span>
          {Object.entries(statusLabels).map(([key, label]) => (
            <div key={key} className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded-full border border-white shadow-sm"
                style={{ backgroundColor: statusColors[key] }}
              />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
