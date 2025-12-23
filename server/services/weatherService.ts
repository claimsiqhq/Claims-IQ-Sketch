// Weather Service - Fetches weather data for inspection locations
// Uses the free National Weather Service (NWS) API - no API key required

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
  pop: number;
  conditions: WeatherCondition[];
  windSpeed: number;
}

interface InspectionImpact {
  score: 'good' | 'caution' | 'warning' | 'severe';
  reasons: string[];
  recommendations: string[];
}

// NWS API requires a User-Agent header
const NWS_USER_AGENT = 'ClaimsIQ/1.0 (claims-iq-app)';

// Cache for grid point lookups (they don't change for a location)
const gridPointCache = new Map<string, { office: string; gridX: number; gridY: number }>();

export async function getWeatherForLocations(locations: WeatherLocation[]): Promise<WeatherData[]> {
  const results: WeatherData[] = [];
  
  for (const location of locations) {
    try {
      const weather = await fetchNWSWeatherData(location);
      results.push(weather);
    } catch (error) {
      console.error(`Weather fetch failed for ${location.stopId}:`, error);
      results.push(createFallbackWeather(location));
    }
  }

  return results;
}

async function fetchNWSWeatherData(location: WeatherLocation): Promise<WeatherData> {
  const { lat, lng, stopId = 'unknown' } = location;

  // Round coordinates to 4 decimal places for NWS API
  const roundedLat = Math.round(lat * 10000) / 10000;
  const roundedLng = Math.round(lng * 10000) / 10000;
  const cacheKey = `${roundedLat},${roundedLng}`;

  // Step 1: Get grid point (cached if available)
  let gridPoint = gridPointCache.get(cacheKey);

  if (!gridPoint) {
    const pointsUrl = `https://api.weather.gov/points/${roundedLat},${roundedLng}`;
    const pointsResponse = await fetch(pointsUrl, {
      headers: { 'User-Agent': NWS_USER_AGENT },
    });

    if (!pointsResponse.ok) {
      // 404 means the coordinates are not covered by NWS (outside US, ocean, etc.)
      // This is expected for non-US locations, so handle gracefully
      if (pointsResponse.status === 404) {
        return createFallbackWeather(location, 'Location not covered by NWS');
      }
      throw new Error(`NWS points API error: ${pointsResponse.status}`);
    }

    const pointsData = await pointsResponse.json();
    gridPoint = {
      office: pointsData.properties.gridId,
      gridX: pointsData.properties.gridX,
      gridY: pointsData.properties.gridY,
    };
    gridPointCache.set(cacheKey, gridPoint);
  }

  // Step 2: Fetch gridpoint forecast data
  const gridUrl = `https://api.weather.gov/gridpoints/${gridPoint.office}/${gridPoint.gridX},${gridPoint.gridY}`;
  const [gridResponse, forecastResponse, alertsResponse] = await Promise.all([
    fetch(gridUrl, { headers: { 'User-Agent': NWS_USER_AGENT } }),
    fetch(`${gridUrl}/forecast/hourly`, { headers: { 'User-Agent': NWS_USER_AGENT } }),
    fetch(`https://api.weather.gov/alerts/active?point=${roundedLat},${roundedLng}`, {
      headers: { 'User-Agent': NWS_USER_AGENT },
    }),
  ]);

  // Parse grid data for current conditions
  let current = {
    temp: 72,
    feelsLike: 72,
    humidity: 50,
    windSpeed: 5,
    windGust: undefined as number | undefined,
    conditions: [{ id: '800', main: 'Clear', description: 'clear sky', icon: '01d' }] as WeatherCondition[],
    visibility: 10,
    uvIndex: undefined as number | undefined,
  };

  if (gridResponse.ok) {
    const gridData = await gridResponse.json();
    const props = gridData.properties;

    // Get current values (first in the time series)
    const tempC = getFirstValue(props.temperature);
    const apparentTempC = getFirstValue(props.apparentTemperature);
    const humidity = getFirstValue(props.relativeHumidity);
    const windSpeedVal = getFirstValue(props.windSpeed);
    const windSpeedUnit = getUnitCode(props.windSpeed);
    const windGustVal = getFirstValue(props.windGust);
    const windGustUnit = getUnitCode(props.windGust);
    const skyCover = getFirstValue(props.skyCover);
    const weatherConditions = getFirstValue(props.weather);

    current = {
      temp: tempC !== null ? Math.round(celsiusToFahrenheit(tempC)) : 72,
      feelsLike: apparentTempC !== null ? Math.round(celsiusToFahrenheit(apparentTempC)) : 72,
      humidity: humidity !== null ? Math.round(humidity) : 50,
      windSpeed: windSpeedVal !== null ? Math.round(convertToMph(windSpeedVal, windSpeedUnit)) : 5,
      windGust: windGustVal !== null ? Math.round(convertToMph(windGustVal, windGustUnit)) : undefined,
      conditions: parseNWSWeatherConditions(weatherConditions, skyCover),
      visibility: 10,
      uvIndex: undefined,
    };
  }

  // Parse hourly forecast
  const forecast: HourlyForecast[] = [];
  if (forecastResponse.ok) {
    const forecastData = await forecastResponse.json();
    const periods = forecastData.properties?.periods || [];
    
    for (const period of periods.slice(0, 8)) {
      const windSpeedMatch = period.windSpeed?.match(/(\d+)/);
      const windSpeed = windSpeedMatch ? parseInt(windSpeedMatch[1]) : 5;
      
      forecast.push({
        time: period.startTime,
        temp: period.temperature || 72,
        pop: period.probabilityOfPrecipitation?.value || 0,
        conditions: [{
          id: mapNWSConditionToId(period.shortForecast),
          main: extractMainCondition(period.shortForecast),
          description: period.shortForecast?.toLowerCase() || 'clear',
          icon: period.isDaytime ? '01d' : '01n',
        }],
        windSpeed,
      });
    }
  }

  // Parse alerts
  const alerts: WeatherAlert[] = [];
  if (alertsResponse.ok) {
    const alertsData = await alertsResponse.json();
    const features = alertsData.features || [];
    
    for (const feature of features) {
      const props = feature.properties;
      alerts.push({
        event: props.event || 'Weather Alert',
        severity: mapNWSAlertSeverity(props.severity),
        headline: props.headline || props.event || 'Weather Alert',
        description: props.description || '',
        start: props.effective || new Date().toISOString(),
        end: props.expires || new Date().toISOString(),
      });
    }
  }

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

function getFirstValue(layer: any): number | any | null {
  if (!layer?.values || layer.values.length === 0) return null;
  return layer.values[0]?.value ?? null;
}

function getUnitCode(layer: any): string {
  return layer?.uom || '';
}

function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9/5) + 32;
}

function convertToMph(speed: number, unitCode: string): number {
  // NWS uses various unit codes: wmoUnit:km_h-1, wmoUnit:m_s-1, etc.
  if (unitCode.includes('km_h') || unitCode.includes('km/h')) {
    return speed * 0.621371; // km/h to mph
  } else if (unitCode.includes('m_s') || unitCode.includes('m/s')) {
    return speed * 2.237; // m/s to mph
  }
  // If already in mph or unknown, return as-is
  return speed;
}

function parseNWSWeatherConditions(weatherValue: any, skyCover: number | null): WeatherCondition[] {
  // NWS weather is an array of condition objects
  if (Array.isArray(weatherValue) && weatherValue.length > 0) {
    return weatherValue.map((w: any, index: number) => ({
      id: `nws-${index}`,
      main: w.weather || 'Clear',
      description: w.weather?.toLowerCase() || 'clear',
      icon: w.intensity === 'light' ? '10d' : w.intensity === 'heavy' ? '09d' : '03d',
    }));
  }

  // Fall back to sky cover interpretation
  const cover = skyCover ?? 0;
  if (cover >= 75) {
    return [{ id: '804', main: 'Clouds', description: 'overcast clouds', icon: '04d' }];
  } else if (cover >= 50) {
    return [{ id: '803', main: 'Clouds', description: 'broken clouds', icon: '03d' }];
  } else if (cover >= 25) {
    return [{ id: '802', main: 'Clouds', description: 'scattered clouds', icon: '02d' }];
  }
  return [{ id: '800', main: 'Clear', description: 'clear sky', icon: '01d' }];
}

function mapNWSConditionToId(shortForecast: string | null): string {
  if (!shortForecast) return '800';
  const lower = shortForecast.toLowerCase();
  
  if (lower.includes('thunderstorm')) return '211';
  if (lower.includes('rain') || lower.includes('showers')) return '500';
  if (lower.includes('snow')) return '601';
  if (lower.includes('fog')) return '741';
  if (lower.includes('cloudy') || lower.includes('overcast')) return '804';
  if (lower.includes('partly')) return '802';
  if (lower.includes('sunny') || lower.includes('clear')) return '800';
  return '800';
}

function extractMainCondition(shortForecast: string | null): string {
  if (!shortForecast) return 'Clear';
  const lower = shortForecast.toLowerCase();
  
  if (lower.includes('thunderstorm')) return 'Thunderstorm';
  if (lower.includes('rain') || lower.includes('showers')) return 'Rain';
  if (lower.includes('snow')) return 'Snow';
  if (lower.includes('fog')) return 'Fog';
  if (lower.includes('cloudy') || lower.includes('overcast')) return 'Clouds';
  if (lower.includes('partly')) return 'Clouds';
  if (lower.includes('sunny') || lower.includes('clear')) return 'Clear';
  return 'Clear';
}

function mapNWSAlertSeverity(severity: string | null): 'minor' | 'moderate' | 'severe' | 'extreme' {
  if (!severity) return 'minor';
  const lower = severity.toLowerCase();
  
  if (lower === 'extreme') return 'extreme';
  if (lower === 'severe') return 'severe';
  if (lower === 'moderate') return 'moderate';
  return 'minor';
}

function createFallbackWeather(location: WeatherLocation, reason?: string): WeatherData {
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
      reasons: [reason || 'Weather data unavailable - assuming clear conditions'],
      recommendations: [],
    },
  };
}

function calculateInspectionImpact(
  current: WeatherData['current'],
  alerts: WeatherAlert[],
  forecast: HourlyForecast[]
): InspectionImpact {
  const reasons: string[] = [];
  const recommendations: string[] = [];
  let score: InspectionImpact['score'] = 'good';

  // Check for active severe alerts
  const severeAlerts = alerts.filter(a => a.severity === 'severe' || a.severity === 'extreme');
  if (severeAlerts.length > 0) {
    score = 'severe';
    reasons.push(`Active ${severeAlerts[0].event}`);
    recommendations.push('Consider rescheduling outdoor inspection');
  }

  // Check temperature extremes
  if (current.temp > 100) {
    if (score !== 'severe') score = 'warning';
    reasons.push('Extreme heat');
    recommendations.push('Plan for shorter outdoor exposure, bring water');
  } else if (current.temp > 90) {
    if (score === 'good') score = 'caution';
    reasons.push('High temperature');
  } else if (current.temp < 32) {
    if (score === 'good') score = 'caution';
    reasons.push('Freezing conditions');
    recommendations.push('Watch for ice on surfaces');
  } else if (current.temp < 20) {
    if (score !== 'severe') score = 'warning';
    reasons.push('Extreme cold');
    recommendations.push('Limit outdoor exposure time');
  }

  // Check wind
  if (current.windSpeed > 30 || (current.windGust && current.windGust > 40)) {
    if (score !== 'severe') score = 'warning';
    reasons.push('High winds');
    recommendations.push('Exercise caution on roofs and elevated areas');
  } else if (current.windSpeed > 20) {
    if (score === 'good') score = 'caution';
    reasons.push('Windy conditions');
  }

  // Check for rain in forecast
  const rainChance = forecast.slice(0, 4).find(f => f.pop > 50);
  if (rainChance) {
    if (score === 'good') score = 'caution';
    reasons.push(`${rainChance.pop}% chance of precipitation`);
    recommendations.push('Have rain gear ready');
  }

  // Check current conditions
  const mainCondition = current.conditions[0]?.main?.toLowerCase() || '';
  if (mainCondition.includes('thunderstorm')) {
    score = 'severe';
    reasons.push('Thunderstorm activity');
    recommendations.push('Avoid outdoor inspection until storm passes');
  } else if (mainCondition.includes('rain') || mainCondition.includes('shower')) {
    if (score !== 'severe') score = 'warning';
    reasons.push('Active precipitation');
    recommendations.push('Focus on interior inspection first');
  }

  if (reasons.length === 0) {
    reasons.push('Good conditions for inspection');
  }

  return { score, reasons, recommendations };
}

export type { WeatherData, WeatherLocation, InspectionImpact, WeatherAlert, HourlyForecast };
