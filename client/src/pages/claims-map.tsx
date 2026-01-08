import { useState, useEffect } from "react";
import { Link } from "wouter";
import Layout from "@/components/layout";
import { useDeviceMode } from "@/contexts/DeviceModeContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  MapPin,
  Navigation,
  Loader2,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface ClaimLocation {
  id: string;
  claimNumber: string;
  insuredName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
  status: string;
  lossType: string;
  dateOfLoss?: string;
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'open':
    case 'in_progress':
    case 'fnol':
      return '#3b82f6';
    case 'review':
      return '#f59e0b';
    case 'approved':
      return '#22c55e';
    case 'closed':
      return '#6b7280';
    case 'draft':
      return '#8b5cf6';
    default:
      return '#7763B7';
  }
}

function createClaimIcon(status: string, index: number) {
  const color = getStatusColor(status);
  return L.divIcon({
    className: 'custom-claim-marker',
    html: `<div style="
      background-color: ${color};
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 12px;
    ">${index + 1}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function FitBounds({ claims }: { claims: ClaimLocation[] }) {
  const map = useMap();
  
  useEffect(() => {
    if (claims.length > 0) {
      const bounds = L.latLngBounds(claims.map(c => [c.lat, c.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [claims, map]);
  
  return null;
}

export default function ClaimsMap() {
  const { isMobile } = useDeviceMode();
  const [claims, setClaims] = useState<ClaimLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClaim, setSelectedClaim] = useState<ClaimLocation | null>(null);

  useEffect(() => {
    async function fetchClaims() {
      try {
        const response = await fetch('/api/claims/map', { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to load claims');
        const data = await response.json();
        
        console.log('[ClaimsMap] API response:', data);
        
        const claimsWithCoords = (data.claims || [])
          .filter((c: any) => c.lat && c.lng && c.lat !== 0 && c.lng !== 0)
          .map((c: any) => ({
            id: c.id,
            claimNumber: c.claimNumber || 'Unknown',
            insuredName: c.insuredName || 'Unknown',
            address: c.address || '',
            city: c.city || '',
            state: c.state || '',
            zip: c.zip || '',
            lat: parseFloat(c.lat),
            lng: parseFloat(c.lng),
            status: c.status || 'unknown',
            lossType: c.lossType || 'Unknown',
            dateOfLoss: c.dateOfLoss,
          }));
        
        console.log('[ClaimsMap] Claims with coords:', claimsWithCoords);
        setClaims(claimsWithCoords);
      } catch (err) {
        console.error('Error loading claims:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchClaims();
  }, []);

  const openInGoogleMaps = (claim: ClaimLocation) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      `${claim.address}, ${claim.city}, ${claim.state} ${claim.zip}`
    )}`;
    window.open(url, '_blank');
  };

  return (
    <Layout>
      <div className={cn("flex flex-col", isMobile ? "h-[calc(100dvh-8rem)]" : "h-[calc(100vh-4rem)]")}>
        <div className={cn("bg-white border-b border-border", isMobile ? "px-4 py-3" : "px-6 py-4")}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className={cn("font-display font-bold text-foreground", isMobile ? "text-lg" : "text-2xl")}>
                Claims Map
              </h1>
              <p className="text-sm text-muted-foreground" data-testid="claims-count">
                {claims.length} claim{claims.length !== 1 ? 's' : ''} with locations
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
                data-testid="button-refresh"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/50 z-10">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Loading map...</span>
              </div>
            </div>
          )}
          
          <MapContainer
            center={[39.8283, -98.5795]}
            zoom={4}
            className="w-full h-full"
            style={{ zIndex: 1 }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
            {claims.length > 0 && <FitBounds claims={claims} />}
            
            {claims.map((claim, index) => (
              <Marker
                key={claim.id}
                position={[claim.lat, claim.lng]}
                icon={createClaimIcon(claim.status, index)}
                eventHandlers={{
                  click: () => setSelectedClaim(claim),
                }}
              >
                <Popup>
                  <div className="p-1">
                    <strong>{claim.claimNumber}</strong><br/>
                    <span className="text-gray-600">{claim.insuredName}</span><br/>
                    <span className="text-xs text-gray-500">{claim.address}, {claim.city}, {claim.state}</span>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {selectedClaim && (
            <Card className={cn(
              "absolute z-[1000] shadow-lg",
              isMobile ? "bottom-4 left-4 right-4" : "bottom-4 left-4 w-80"
            )}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold">{selectedClaim.claimNumber}</p>
                    <p className="text-sm text-muted-foreground">{selectedClaim.insuredName}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {selectedClaim.status}
                  </Badge>
                </div>
                
                <p className="text-sm mb-3">
                  {selectedClaim.address}, {selectedClaim.city}, {selectedClaim.state} {selectedClaim.zip}
                </p>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openInGoogleMaps(selectedClaim)}
                  >
                    <Navigation className="h-4 w-4 mr-1" />
                    Directions
                  </Button>
                  <Link href={`/claim/${selectedClaim.id}`}>
                    <Button size="sm" className="flex-1">
                      View Claim
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}

          <div className={cn(
            "absolute bg-white rounded-lg shadow-md p-3 z-[1000]",
            isMobile ? "top-2 right-2" : "top-4 right-4"
          )}>
            <p className="text-xs font-medium mb-2">Status</p>
            <div className="space-y-1">
              {[
                { status: 'open', label: 'Open', color: '#3b82f6' },
                { status: 'review', label: 'Review', color: '#f59e0b' },
                { status: 'approved', label: 'Approved', color: '#22c55e' },
                { status: 'closed', label: 'Closed', color: '#6b7280' },
              ].map(item => (
                <div key={item.status} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-xs">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {!loading && claims.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/50 z-[500]">
              <div className="text-center p-6">
                <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="font-medium mb-1">No claims with locations</h3>
                <p className="text-sm text-muted-foreground">
                  Claims will appear here once they have geocoded addresses.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
