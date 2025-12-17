// Weather Service - Fetches weather data for inspection locations
// Uses OpenWeatherMap API

interface WeatherLocation {
  lat: number;
  lng: number;
  stopId?: string;
}

interface WeatherCondition {
  id: string;
  main: string;
  description: string;
  icon: string;
}

interface WeatherData {
  stopId: string;
  location: { lat: number; lng: number };
  current: {
    temp: number;
    feelsLike: number;
    humidity: number;
    windSpeed: number;
    windGust?: number;
    conditions: WeatherCondition[];
    visibility: number;
    uvIndex?: number;
  };
  alerts: WeatherAlert[];
  forecast: HourlyForecast[];
  inspectionImpact: InspectionImpact;
}

interface WeatherAlert {
  event: string;
  severity: 'minor' | 'moderate' | 'severe' | 'extreme';
  headline: string;
  description: string;
  start: string;
  end: string;
}

interface HourlyForecast {
  time: string;
  temp: number;
  pop: number; // Probability of precipitation
  conditions: WeatherCondition[];
  windSpeed: number;
}

interface InspectionImpact {
  score: 'good' | 'caution' | 'warning' | 'severe';
  reasons: string[];
  recommendations: string[];
}

const OPENWEATHERMAP_API_KEY = process.env.OPENWEATHERMAP_API_KEY || '';

export async function getWeatherForLocations(locations: WeatherLocation[]): Promise<WeatherData[]> {
  if (!OPENWEATHERMAP_API_KEY) {
    console.warn('OpenWeatherMap API key not configured');
    return locations.map(loc => createFallbackWeather(loc));
  }

  const results: WeatherData[] = [];
  
  for (const location of locations) {
    try {
      const weather = await fetchWeatherData(location);
      results.push(weather);
    } catch (error) {
      console.error(`Weather fetch failed for ${location.stopId}:`, error);
      results.push(createFallbackWeather(location));
    }
  }

  return results;
}

async function fetchWeatherData(location: WeatherLocation): Promise<WeatherData> {
  const { lat, lng, stopId = 'unknown' } = location;

  // Fetch current weather and forecast
  const url = new URL('https://api.openweathermap.org/data/3.0/onecall');
  url.searchParams.set('lat', lat.toString());
  url.searchParams.set('lon', lng.toString());
  url.searchParams.set('appid', OPENWEATHERMAP_API_KEY);
  url.searchParams.set('units', 'imperial');
  url.searchParams.set('exclude', 'minutely,daily');

  const response = await fetch(url.toString());
  
  if (!response.ok) {
    // Fall back to free tier API if One Call fails
    return fetchFreeWeatherData(location);
  }

  const data = await response.json();

  const current = {
    temp: Math.round(data.current.temp),
    feelsLike: Math.round(data.current.feels_like),
    humidity: data.current.humidity,
    windSpeed: Math.round(data.current.wind_speed),
    windGust: data.current.wind_gust ? Math.round(data.current.wind_gust) : undefined,
    conditions: data.current.weather.map((w: any) => ({
      id: w.id.toString(),
      main: w.main,
      description: w.description,
      icon: w.icon,
    })),
    visibility: Math.round(data.current.visibility / 1609.34), // meters to miles
    uvIndex: data.current.uvi,
  };

  const alerts: WeatherAlert[] = (data.alerts || []).map((alert: any) => ({
    event: alert.event,
    severity: mapAlertSeverity(alert.event),
    headline: alert.event,
    description: alert.description,
    start: new Date(alert.start * 1000).toISOString(),
    end: new Date(alert.end * 1000).toISOString(),
  }));

  const forecast: HourlyForecast[] = (data.hourly || []).slice(0, 8).map((hour: any) => ({
    time: new Date(hour.dt * 1000).toISOString(),
    temp: Math.round(hour.temp),
    pop: Math.round(hour.pop * 100),
    conditions: hour.weather.map((w: any) => ({
      id: w.id.toString(),
      main: w.main,
      description: w.description,
      icon: w.icon,
    })),
    windSpeed: Math.round(hour.wind_speed),
  }));

  const inspectionImpact = calculateInspectionImpact(current, alerts, forecast);

  return {
    stopId,
    location: { lat, lng },
    current,
    alerts,
    forecast,
    inspectionImpact,
  };
}

async function fetchFreeWeatherData(location: WeatherLocation): Promise<WeatherData> {
  const { lat, lng, stopId = 'unknown' } = location;

  // Use the free weather API endpoint
  const url = new URL('https://api.openweathermap.org/data/2.5/weather');
  url.searchParams.set('lat', lat.toString());
  url.searchParams.set('lon', lng.toString());
  url.searchParams.set('appid', OPENWEATHERMAP_API_KEY);
  url.searchParams.set('units', 'imperial');

  const response = await fetch(url.toString());
  
  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status}`);
  }

  const data = await response.json();

  const current = {
    temp: Math.round(data.main.temp),
    feelsLike: Math.round(data.main.feels_like),
    humidity: data.main.humidity,
    windSpeed: Math.round(data.wind.speed),
    windGust: data.wind.gust ? Math.round(data.wind.gust) : undefined,
    conditions: data.weather.map((w: any) => ({
      id: w.id.toString(),
      main: w.main,
      description: w.description,
      icon: w.icon,
    })),
    visibility: data.visibility ? Math.round(data.visibility / 1609.34) : 10,
    uvIndex: undefined,
  };

  const inspectionImpact = calculateInspectionImpact(current, [], []);

  return {
    stopId,
    location: { lat, lng },
    current,
    alerts: [],
    forecast: [],
    inspectionImpact,
  };
}

function createFallbackWeather(location: WeatherLocation): WeatherData {
  return {
    stopId: location.stopId || 'unknown',
    location: { lat: location.lat, lng: location.lng },
    current: {
      temp: 72,
      feelsLike: 72,
      humidity: 50,
      windSpeed: 5,
      conditions: [{ id: '800', main: 'Clear', description: 'clear sky', icon: '01d' }],
      visibility: 10,
    },
    alerts: [],
    forecast: [],
    inspectionImpact: {
      score: 'good',
      reasons: ['Weather data unavailable - assuming clear conditions'],
      recommendations: [],
    },
  };
}

function mapAlertSeverity(event: string): 'minor' | 'moderate' | 'severe' | 'extreme' {
  const lower = event.toLowerCase();
  if (lower.includes('tornado') || lower.includes('hurricane') || lower.includes('extreme')) {
    return 'extreme';
  }
  if (lower.includes('severe') || lower.includes('warning')) {
    return 'severe';
  }
  if (lower.includes('watch') || lower.includes('advisory')) {
    return 'moderate';
  }
  return 'minor';
}

function calculateInspectionImpact(
  current: WeatherData['current'],
  alerts: WeatherAlert[],
  forecast: HourlyForecast[]
): InspectionImpact {
  const reasons: string[] = [];
  const recommendations: string[] = [];
  let score: 'good' | 'caution' | 'warning' | 'severe' = 'good';

  // Check for severe alerts
  const severeAlerts = alerts.filter(a => a.severity === 'extreme' || a.severity === 'severe');
  if (severeAlerts.length > 0) {
    score = 'severe';
    reasons.push(`Active weather alerts: ${severeAlerts.map(a => a.event).join(', ')}`);
    recommendations.push('Consider rescheduling inspection for safety');
  }

  // Check current conditions
  const mainCondition = current.conditions[0]?.main?.toLowerCase() || '';
  
  // Rain/precipitation
  if (mainCondition.includes('rain') || mainCondition.includes('drizzle')) {
    if (score !== 'severe') score = 'caution';
    reasons.push('Rain may affect exterior inspection');
    recommendations.push('Bring rain gear', 'Focus on interior first');
  }

  // Thunderstorm
  if (mainCondition.includes('thunder')) {
    score = 'warning';
    reasons.push('Thunderstorm conditions - unsafe for roof inspection');
    recommendations.push('Avoid roof/exterior work', 'Wait for storm to pass');
  }

  // Snow/ice
  if (mainCondition.includes('snow') || mainCondition.includes('ice') || mainCondition.includes('sleet')) {
    score = 'warning';
    reasons.push('Snow/ice conditions - slippery surfaces');
    recommendations.push('Exercise caution on roofs', 'Allow extra travel time');
  }

  // High winds
  if (current.windSpeed > 25 || (current.windGust && current.windGust > 35)) {
    if (score === 'good') score = 'caution';
    reasons.push(`High winds (${current.windSpeed}+ mph) - roof work may be unsafe`);
    recommendations.push('Secure loose items', 'Consider delaying roof inspection');
  }

  // Extreme temperatures
  if (current.temp > 95) {
    if (score === 'good') score = 'caution';
    reasons.push('Extreme heat - take precautions');
    recommendations.push('Stay hydrated', 'Take breaks in shade');
  } else if (current.temp < 32) {
    if (score === 'good') score = 'caution';
    reasons.push('Freezing temperatures');
    recommendations.push('Watch for ice', 'Wear appropriate gear');
  }

  // Low visibility
  if (current.visibility < 3) {
    if (score === 'good') score = 'caution';
    reasons.push('Low visibility - drive carefully');
    recommendations.push('Allow extra travel time');
  }

  // Check forecast for upcoming precipitation
  const upcomingRain = forecast.slice(0, 4).filter(h => h.pop > 50);
  if (upcomingRain.length > 0 && score === 'good') {
    reasons.push('Rain expected later today');
    recommendations.push('Complete exterior inspection early');
  }

  if (reasons.length === 0) {
    reasons.push('Good conditions for inspection');
  }

  return { score, reasons, recommendations };
}

export type { WeatherData, WeatherAlert, HourlyForecast, InspectionImpact, WeatherLocation };
