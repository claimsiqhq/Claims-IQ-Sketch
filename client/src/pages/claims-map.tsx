/// <reference types="@types/google.maps" />
import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import Layout from "@/components/layout";
import { useDeviceMode } from "@/contexts/DeviceModeContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  MapPin,
  Navigation,
  AlertTriangle,
  Loader2,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

declare global {
  interface Window {
    google: typeof google;
    initGoogleMaps: () => void;
  }
}

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

export default function ClaimsMap() {
  const { isMobile } = useDeviceMode();
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  
  const [claims, setClaims] = useState<ClaimLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<ClaimLocation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchClaims() {
      try {
        const response = await fetch('/api/claims', { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to load claims');
        const data = await response.json();
        
        const claimsWithCoords = (data.claims || [])
          .filter((c: any) => c.propertyLatitude && c.propertyLongitude)
          .map((c: any) => ({
            id: c.id,
            claimNumber: c.claimNumber,
            insuredName: c.insuredName || c.policyholder || 'Unknown',
            address: c.propertyAddress || '',
            city: c.propertyCity || '',
            state: c.propertyState || '',
            zip: c.propertyZip || '',
            lat: parseFloat(c.propertyLatitude),
            lng: parseFloat(c.propertyLongitude),
            status: c.status,
            lossType: c.lossType || c.primaryPeril || 'Unknown',
            dateOfLoss: c.dateOfLoss,
          }));
        
        setClaims(claimsWithCoords);
      } catch (err) {
        console.error('Error loading claims:', err);
        setError('Failed to load claims');
      } finally {
        setLoading(false);
      }
    }
    fetchClaims();
  }, []);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) {
      setError('Google Maps API key not configured. Please add VITE_GOOGLE_MAPS_API_KEY to your environment.');
      setLoading(false);
      return;
    }

    if (window.google?.maps) {
      setMapLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&callback=initGoogleMaps`;
    script.async = true;
    script.defer = true;
    
    window.initGoogleMaps = () => {
      setMapLoaded(true);
    };

    script.onerror = () => {
      setError('Failed to load Google Maps. Please check your API key.');
      setLoading(false);
    };

    document.head.appendChild(script);

    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, []);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !window.google?.maps) return;

    const defaultCenter = { lat: 39.8283, lng: -98.5795 };
    
    const map = new google.maps.Map(mapRef.current, {
      center: defaultCenter,
      zoom: 4,
      mapTypeControl: true,
      mapTypeControlOptions: {
        position: google.maps.ControlPosition.TOP_RIGHT,
      },
      streetViewControl: false,
      fullscreenControl: true,
      zoomControl: true,
      styles: [
        {
          featureType: 'poi',
          elementType: 'labels',
          stylers: [{ visibility: 'off' }],
        },
      ],
    });

    googleMapRef.current = map;
  }, [mapLoaded]);

  useEffect(() => {
    if (!googleMapRef.current || !mapLoaded || claims.length === 0) return;

    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    const bounds = new google.maps.LatLngBounds();
    const infoWindow = new google.maps.InfoWindow();

    claims.forEach((claim, index) => {
      const position = { lat: claim.lat, lng: claim.lng };
      
      const marker = new google.maps.Marker({
        position,
        map: googleMapRef.current!,
        title: claim.claimNumber,
        label: {
          text: String(index + 1),
          color: 'white',
          fontWeight: 'bold',
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: getStatusColor(claim.status),
          fillOpacity: 1,
          strokeColor: 'white',
          strokeWeight: 2,
        },
      });

      marker.addListener('click', () => {
        setSelectedClaim(claim);
        infoWindow.setContent(`
          <div style="padding: 8px; max-width: 250px;">
            <strong>${claim.claimNumber}</strong><br/>
            <span style="color: #666;">${claim.insuredName}</span><br/>
            <span style="font-size: 12px; color: #888;">${claim.address}, ${claim.city}, ${claim.state}</span>
          </div>
        `);
        infoWindow.open(googleMapRef.current!, marker);
      });

      bounds.extend(position);
      markersRef.current.push(marker);
    });

    if (claims.length > 0) {
      googleMapRef.current.fitBounds(bounds);
      
      const listener = google.maps.event.addListener(googleMapRef.current, 'idle', () => {
        if (googleMapRef.current!.getZoom()! > 15) {
          googleMapRef.current!.setZoom(15);
        }
        google.maps.event.removeListener(listener);
      });
    }
  }, [claims, mapLoaded]);

  function getStatusColor(status: string): string {
    switch (status) {
      case 'open':
      case 'in_progress':
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

  const openInGoogleMaps = (claim: ClaimLocation) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      `${claim.address}, ${claim.city}, ${claim.state} ${claim.zip}`
    )}`;
    window.open(url, '_blank');
  };

  if (error && !GOOGLE_MAPS_API_KEY) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
          <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
          <h2 className="text-xl font-semibold mb-2">Google Maps API Key Required</h2>
          <p className="text-muted-foreground max-w-md mb-4">
            To use the Claims Map feature, you need to add a Google Maps API key to your environment variables.
          </p>
          <p className="text-sm text-muted-foreground">
            Add <code className="bg-muted px-1 py-0.5 rounded">VITE_GOOGLE_MAPS_API_KEY</code> to your secrets.
          </p>
        </div>
      </Layout>
    );
  }

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
          {(loading || !mapLoaded) && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/50 z-10">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Loading map...</span>
              </div>
            </div>
          )}
          
          <div ref={mapRef} className="w-full h-full" />

          {selectedClaim && (
            <Card className={cn(
              "absolute z-20 shadow-lg",
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
            "absolute bg-white rounded-lg shadow-md p-3 z-10",
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
            <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
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
