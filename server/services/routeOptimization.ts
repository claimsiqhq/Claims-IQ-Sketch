// Route Optimization Service
// Uses Google Maps Directions API to optimize inspection routes

interface RouteStop {
  id: string;
  lat: number;
  lng: number;
  address?: string;
}

interface OptimizedRoute {
  orderedStops: string[]; // IDs in optimized order
  legs: RouteLeg[];
  totalDuration: number; // minutes
  totalDistance: number; // meters
}

interface RouteLeg {
  fromStopId: string;
  toStopId: string;
  duration: number; // minutes
  distance: number; // meters
  durationText: string;
  distanceText: string;
}

// Server-side uses VITE_ prefixed var which is available in the environment
const GOOGLE_MAPS_API_KEY = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';

export async function optimizeRoute(
  origin: { lat: number; lng: number } | string,
  stops: RouteStop[]
): Promise<OptimizedRoute> {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error('Google Maps API key not configured');
  }

  if (stops.length === 0) {
    return {
      orderedStops: [],
      legs: [],
      totalDuration: 0,
      totalDistance: 0,
    };
  }

  if (stops.length === 1) {
    // Single stop - just calculate from origin
    const leg = await getDirections(origin, stops[0]);
    return {
      orderedStops: [stops[0].id],
      legs: [{
        fromStopId: 'origin',
        toStopId: stops[0].id,
        duration: leg.duration,
        distance: leg.distance,
        durationText: leg.durationText,
        distanceText: leg.distanceText,
      }],
      totalDuration: leg.duration,
      totalDistance: leg.distance,
    };
  }

  // Use Directions API with waypoint optimization
  // For a round trip optimization, we use all stops as waypoints and let Google optimize the order
  const originStr = typeof origin === 'string' 
    ? origin 
    : `${origin.lat},${origin.lng}`;
  
  // All stops become waypoints with optimization enabled
  // We use the origin as both start and end for a true route optimization
  const allWaypoints = stops.map(s => `${s.lat},${s.lng}`).join('|');

  const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
  url.searchParams.set('origin', originStr);
  // Use first stop as destination since we want to visit all stops
  url.searchParams.set('destination', `${stops[stops.length - 1].lat},${stops[stops.length - 1].lng}`);
  // Include all but last as waypoints with optimization
  if (stops.length > 1) {
    const waypointsStr = stops.slice(0, -1).map(s => `${s.lat},${s.lng}`).join('|');
    url.searchParams.set('waypoints', `optimize:true|${waypointsStr}`);
  }
  url.searchParams.set('key', GOOGLE_MAPS_API_KEY);

  const response = await fetch(url.toString());
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Google Maps API HTTP error:', response.status, errorText);
    throw new Error(`Google Maps API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.status !== 'OK') {
    console.error('Directions API error:', data.status, data.error_message);
    throw new Error(`Directions API error: ${data.status} - ${data.error_message || 'Unknown error'}`);
  }

  const route = data.routes[0];
  const waypointOrder = route.waypoint_order || [];
  const waypoints = stops.slice(0, -1);
  const destination = stops[stops.length - 1];
  
  // Build ordered stops list from waypoint_order
  const orderedStops: string[] = [];
  for (const idx of waypointOrder) {
    orderedStops.push(waypoints[idx].id);
  }
  orderedStops.push(destination.id);

  // Build the ordered stops array for leg mapping
  const orderedStopsData = [
    ...waypointOrder.map((idx: number) => waypoints[idx]),
    destination
  ];

  // Build legs with duration/distance
  const legs: RouteLeg[] = [];
  let totalDuration = 0;
  let totalDistance = 0;

  for (let i = 0; i < route.legs.length; i++) {
    const leg = route.legs[i];
    const duration = Math.round(leg.duration.value / 60); // Convert to minutes
    const distance = leg.distance.value;

    legs.push({
      fromStopId: i === 0 ? 'origin' : orderedStopsData[i - 1].id,
      toStopId: orderedStopsData[i].id,
      duration,
      distance,
      durationText: leg.duration.text,
      distanceText: leg.distance.text,
    });

    totalDuration += duration;
    totalDistance += distance;
  }

  return {
    orderedStops,
    legs,
    totalDuration,
    totalDistance,
  };
}

async function getDirections(
  from: { lat: number; lng: number } | string,
  to: RouteStop
): Promise<{ duration: number; distance: number; durationText: string; distanceText: string }> {
  const originStr = typeof from === 'string' ? from : `${from.lat},${from.lng}`;
  
  const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
  url.searchParams.set('origin', originStr);
  url.searchParams.set('destination', `${to.lat},${to.lng}`);
  url.searchParams.set('key', GOOGLE_MAPS_API_KEY);

  const response = await fetch(url.toString());
  const data = await response.json();

  if (data.status !== 'OK' || !data.routes[0]) {
    return { duration: 0, distance: 0, durationText: 'N/A', distanceText: 'N/A' };
  }

  const leg = data.routes[0].legs[0];
  return {
    duration: Math.round(leg.duration.value / 60),
    distance: leg.distance.value,
    durationText: leg.duration.text,
    distanceText: leg.distance.text,
  };
}

export async function calculateDriveTimes(
  stops: RouteStop[]
): Promise<Map<string, { duration: number; durationText: string }>> {
  const driveTimes = new Map<string, { duration: number; durationText: string }>();
  
  if (!GOOGLE_MAPS_API_KEY || stops.length < 2) {
    return driveTimes;
  }

  // Calculate drive time between consecutive stops
  for (let i = 1; i < stops.length; i++) {
    const from = stops[i - 1];
    const to = stops[i];
    
    try {
      const result = await getDirections(from, to);
      driveTimes.set(to.id, {
        duration: result.duration,
        durationText: result.durationText,
      });
    } catch (error) {
      console.error(`Error calculating drive time from ${from.id} to ${to.id}:`, error);
    }
  }

  return driveTimes;
}
