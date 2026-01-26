/**
 * Historical Weather Service
 * Fetches weather conditions for a specific date and location using Open-Meteo's free Historical Weather API.
 * No API key required.
 */

import { db } from "../db";
import { claims } from "@shared/schema";
import { eq, and, isNull, isNotNull } from "drizzle-orm";

// Open-Meteo Historical Weather API response types
interface OpenMeteoHistoricalResponse {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  daily_units: {
    time: string;
    temperature_2m_max: string;
    temperature_2m_min: string;
    temperature_2m_mean: string;
    precipitation_sum: string;
    rain_sum: string;
    snowfall_sum: string;
    precipitation_hours: string;
    wind_speed_10m_max: string;
    wind_gusts_10m_max: string;
    weather_code: string;
  };
  daily: {
    time: string[];
    temperature_2m_max: (number | null)[];
    temperature_2m_min: (number | null)[];
    temperature_2m_mean: (number | null)[];
    precipitation_sum: (number | null)[];
    rain_sum: (number | null)[];
    snowfall_sum: (number | null)[];
    precipitation_hours: (number | null)[];
    wind_speed_10m_max: (number | null)[];
    wind_gusts_10m_max: (number | null)[];
    weather_code: (number | null)[];
  };
}

// WMO Weather interpretation codes
const WMO_CODES: Record<number, { condition: string; precipType?: string }> = {
  0: { condition: "Clear sky" },
  1: { condition: "Mainly clear" },
  2: { condition: "Partly cloudy" },
  3: { condition: "Overcast" },
  45: { condition: "Fog" },
  48: { condition: "Depositing rime fog" },
  51: { condition: "Light drizzle", precipType: "rain" },
  53: { condition: "Moderate drizzle", precipType: "rain" },
  55: { condition: "Dense drizzle", precipType: "rain" },
  56: { condition: "Light freezing drizzle", precipType: "freezing_rain" },
  57: { condition: "Dense freezing drizzle", precipType: "freezing_rain" },
  61: { condition: "Slight rain", precipType: "rain" },
  63: { condition: "Moderate rain", precipType: "rain" },
  65: { condition: "Heavy rain", precipType: "rain" },
  66: { condition: "Light freezing rain", precipType: "freezing_rain" },
  67: { condition: "Heavy freezing rain", precipType: "freezing_rain" },
  71: { condition: "Slight snow fall", precipType: "snow" },
  73: { condition: "Moderate snow fall", precipType: "snow" },
  75: { condition: "Heavy snow fall", precipType: "snow" },
  77: { condition: "Snow grains", precipType: "snow" },
  80: { condition: "Slight rain showers", precipType: "rain" },
  81: { condition: "Moderate rain showers", precipType: "rain" },
  82: { condition: "Violent rain showers", precipType: "rain" },
  85: { condition: "Slight snow showers", precipType: "snow" },
  86: { condition: "Heavy snow showers", precipType: "snow" },
  95: { condition: "Thunderstorm", precipType: "rain" },
  96: { condition: "Thunderstorm with slight hail", precipType: "hail" },
  99: { condition: "Thunderstorm with heavy hail", precipType: "hail" },
};

export interface HistoricalWeatherData {
  temperature: number | null; // Mean temp in Fahrenheit
  temperatureMin: number | null;
  temperatureMax: number | null;
  conditions: string;
  precipType: string | null;
  precipAmount: number | null; // inches
  windSpeed: number | null; // mph
  windGust: number | null; // mph
  hailSize: number | null; // inches (estimated based on weather code)
  humidity: number | null;
  summary: string;
  raw: OpenMeteoHistoricalResponse;
}

// Convert Celsius to Fahrenheit
function celsiusToFahrenheit(celsius: number | null): number | null {
  if (celsius === null) return null;
  return Math.round((celsius * 9/5) + 32);
}

// Convert km/h to mph
function kmhToMph(kmh: number | null): number | null {
  if (kmh === null) return null;
  return Math.round(kmh * 0.621371);
}

// Convert mm to inches
function mmToInches(mm: number | null): number | null {
  if (mm === null) return null;
  return Math.round(mm * 0.0393701 * 100) / 100;
}

// Estimate hail size based on weather code (rough approximation)
function estimateHailSize(weatherCode: number | null): number | null {
  if (weatherCode === 96) return 0.5; // Slight hail ~ pea to marble size
  if (weatherCode === 99) return 1.5; // Heavy hail ~ golf ball size
  return null;
}

/**
 * Fetch historical weather for a specific date and location
 */
export async function fetchHistoricalWeather(
  latitude: number,
  longitude: number,
  date: string // YYYY-MM-DD format
): Promise<HistoricalWeatherData | null> {
  try {
    // Open-Meteo Historical Weather API (free, no key required)
    const url = new URL("https://archive-api.open-meteo.com/v1/archive");
    url.searchParams.set("latitude", latitude.toString());
    url.searchParams.set("longitude", longitude.toString());
    url.searchParams.set("start_date", date);
    url.searchParams.set("end_date", date);
    url.searchParams.set("daily", [
      "temperature_2m_max",
      "temperature_2m_min", 
      "temperature_2m_mean",
      "precipitation_sum",
      "rain_sum",
      "snowfall_sum",
      "precipitation_hours",
      "wind_speed_10m_max",
      "wind_gusts_10m_max",
      "weather_code"
    ].join(","));
    url.searchParams.set("temperature_unit", "celsius");
    url.searchParams.set("wind_speed_unit", "kmh");
    url.searchParams.set("precipitation_unit", "mm");
    url.searchParams.set("timezone", "America/Chicago");

    console.log(`[HistoricalWeather] Fetching weather for ${date} at ${latitude}, ${longitude}`);
    
    const response = await fetch(url.toString());
    
    if (!response.ok) {
      console.error(`[HistoricalWeather] API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data: OpenMeteoHistoricalResponse = await response.json();
    
    if (!data.daily || !data.daily.time || data.daily.time.length === 0) {
      console.error("[HistoricalWeather] No daily data in response");
      return null;
    }

    // Extract the first (only) day's data
    const weatherCode = data.daily.weather_code?.[0] ?? null;
    const weatherInfo = weatherCode !== null ? WMO_CODES[weatherCode] : null;
    
    const tempMean = celsiusToFahrenheit(data.daily.temperature_2m_mean?.[0] ?? null);
    const tempMin = celsiusToFahrenheit(data.daily.temperature_2m_min?.[0] ?? null);
    const tempMax = celsiusToFahrenheit(data.daily.temperature_2m_max?.[0] ?? null);
    const windSpeed = kmhToMph(data.daily.wind_speed_10m_max?.[0] ?? null);
    const windGust = kmhToMph(data.daily.wind_gusts_10m_max?.[0] ?? null);
    const precipAmount = mmToInches(data.daily.precipitation_sum?.[0] ?? null);
    const snowfall = mmToInches(data.daily.snowfall_sum?.[0] ?? null);
    const hailSize = estimateHailSize(weatherCode);

    const conditions = weatherInfo?.condition || "Unknown";
    let precipType = weatherInfo?.precipType || null;
    
    // Override precipType if we have significant snowfall
    if (snowfall && snowfall > 0.1) {
      precipType = "snow";
    }

    // Build a human-readable summary
    const summaryParts: string[] = [];
    
    if (tempMean !== null) {
      summaryParts.push(`${tempMean}°F`);
    }
    
    if (conditions && conditions !== "Unknown") {
      summaryParts.push(conditions);
    }
    
    if (hailSize) {
      summaryParts.push(`Hail ${hailSize}in`);
    }
    
    if (snowfall && snowfall > 0) {
      summaryParts.push(`Snow ${snowfall}in`);
    } else if (precipAmount && precipAmount > 0 && precipType !== "snow") {
      summaryParts.push(`Precip ${precipAmount}in`);
    }
    
    if (windGust && windGust > 30) {
      summaryParts.push(`${windGust} mph gusts`);
    } else if (windSpeed && windSpeed > 20) {
      summaryParts.push(`${windSpeed} mph winds`);
    }

    const summary = summaryParts.join(", ");

    console.log(`[HistoricalWeather] Got weather for ${date}: ${summary}`);

    return {
      temperature: tempMean,
      temperatureMin: tempMin,
      temperatureMax: tempMax,
      conditions,
      precipType,
      precipAmount,
      windSpeed,
      windGust,
      hailSize,
      humidity: null, // Open-Meteo historical doesn't provide humidity in free tier
      summary,
      raw: data,
    };
  } catch (error) {
    console.error("[HistoricalWeather] Error fetching weather:", error);
    return null;
  }
}

/**
 * Fetch and store historical weather for a claim
 */
export async function fetchAndStoreClaimWeather(claimId: string): Promise<boolean> {
  try {
    // Get the claim
    const [claim] = await db.select().from(claims).where(eq(claims.id, claimId)).limit(1);
    
    if (!claim) {
      console.error(`[HistoricalWeather] Claim not found: ${claimId}`);
      return false;
    }

    // Check if we have the required data
    if (!claim.dateOfLoss) {
      console.log(`[HistoricalWeather] Claim ${claimId} has no date of loss`);
      return false;
    }

    if (!claim.propertyLatitude || !claim.propertyLongitude) {
      console.log(`[HistoricalWeather] Claim ${claimId} has no geocoded location`);
      return false;
    }

    const lat = parseFloat(claim.propertyLatitude);
    const lon = parseFloat(claim.propertyLongitude);
    
    // Format date as YYYY-MM-DD (dateOfLoss is a string from Drizzle date type)
    const dateStr = String(claim.dateOfLoss);

    // Fetch the weather
    const weather = await fetchHistoricalWeather(lat, lon, dateStr);
    
    if (!weather) {
      console.error(`[HistoricalWeather] Failed to fetch weather for claim ${claimId}`);
      return false;
    }

    // Update the claim with weather data
    await db.update(claims)
      .set({
        dolWeatherTemp: weather.temperature,
        dolWeatherTempMin: weather.temperatureMin,
        dolWeatherTempMax: weather.temperatureMax,
        dolWeatherConditions: weather.conditions,
        dolWeatherPrecipType: weather.precipType,
        dolWeatherPrecipAmount: weather.precipAmount,
        dolWeatherWindSpeed: weather.windSpeed,
        dolWeatherWindGust: weather.windGust,
        dolWeatherHailSize: weather.hailSize,
        dolWeatherHumidity: weather.humidity,
        dolWeatherSummary: weather.summary,
        dolWeatherRaw: weather.raw,
        dolWeatherFetchedAt: new Date(),
        dolWeatherSource: "open-meteo",
        updatedAt: new Date(),
      })
      .where(eq(claims.id, claimId));

    console.log(`[HistoricalWeather] Stored weather for claim ${claimId}: ${weather.summary}`);
    return true;
  } catch (error) {
    console.error(`[HistoricalWeather] Error storing weather for claim ${claimId}:`, error);
    return false;
  }
}

/**
 * Backfill missing weather data for claims
 */
export async function backfillMissingWeather(limit: number = 50): Promise<{ processed: number; success: number; failed: number }> {
  try {
    // Find claims with dateOfLoss and geocoding but no weather data
    const claimsToProcess = await db.select({
      id: claims.id,
      claimNumber: claims.claimNumber,
    })
    .from(claims)
    .where(
      and(
        isNotNull(claims.dateOfLoss),
        isNotNull(claims.propertyLatitude),
        isNotNull(claims.propertyLongitude),
        isNull(claims.dolWeatherFetchedAt)
      )
    )
    .limit(limit);

    console.log(`[HistoricalWeather] Found ${claimsToProcess.length} claims to backfill`);

    let success = 0;
    let failed = 0;

    for (const claim of claimsToProcess) {
      const result = await fetchAndStoreClaimWeather(claim.id);
      if (result) {
        success++;
      } else {
        failed++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return { processed: claimsToProcess.length, success, failed };
  } catch (error) {
    console.error("[HistoricalWeather] Error during backfill:", error);
    return { processed: 0, success: 0, failed: 0 };
  }
}
