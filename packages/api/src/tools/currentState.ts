import { z } from 'zod';
import { DynamicStructuredTool } from '@librechat/agents/langchain/tools';
import { routeRegisteredCapability } from '../agents/orchestrator/capabilityRegistryRouting';
import { getActivatedCapabilityRegistry } from '../agents/extensions/nativeCapabilities';

export const CURRENT_STATE_TOOL_NAME = 'current_state';

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const WEATHER_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 4_000;
const MAX_WEATHER_AGE_MS = 45 * 60 * 1000;

type FetchLike = typeof fetch;

type GeocodeResult = {
  id?: number;
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  country?: string;
  country_code?: string;
  admin1?: string;
};

type Cached<T> = { value: T; expiresAt: number };

const geocodeCache = new Map<string, Cached<GeocodeResult>>();
const weatherCache = new Map<string, Cached<CurrentWeather>>();

export type CurrentStateFact = 'time' | 'weather';

export interface CurrentStateToolInput {
  location: string;
  facts?: CurrentStateFact[];
}

export interface CurrentWeather {
  sourceType: 'model-current';
  dataAt: string;
  dataAtUtc: string;
  ageMs: number;
  fresh: boolean;
  condition?: string;
  temperatureC?: number;
  apparentTemperatureC?: number;
  relativeHumidityPct?: number;
  precipitationMm?: number;
  weatherCode?: number;
  cloudCoverPct?: number;
  windSpeedKmh?: number;
  isDay?: boolean;
  generationTimeMs?: number;
}

export interface CurrentStateResult {
  ok: boolean;
  fallbackRequired: boolean;
  provider: 'runtime+open-meteo';
  resolvedAt: string;
  location?: {
    name: string;
    country?: string;
    countryCode?: string;
    admin1?: string;
    latitude: number;
    longitude: number;
    timezone: string;
  };
  time?: {
    timezone: string;
    utcOffset: string;
    localDateTime: string;
    utcInstant: string;
  };
  weather?: CurrentWeather;
  reason?: string;
  routing?: Partial<Record<'location.resolve' | 'time.current' | 'weather.current', string>>;
  provenance: {
    location?: string;
    weather?: string;
    time: 'runtime-clock';
    attribution?: string[];
  };
}

const currentStateInputSchema: z.ZodType<CurrentStateToolInput> = z.object({
  location: z.string().trim().min(2).max(200),
  facts: z
    .array(z.enum(['time', 'weather']))
    .min(1)
    .max(2)
    .optional(),
});

function cacheKey(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

function readCache<T>(cache: Map<string, Cached<T>>, key: string, now: number): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= now) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function writeCache<T>(
  cache: Map<string, Cached<T>>,
  key: string,
  value: T,
  now: number,
  ttlMs: number,
): T {
  cache.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

async function fetchJson(
  fetchImpl: FetchLike,
  url: URL,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Current-state provider HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data == null || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Current-state provider returned invalid JSON');
    }
    return data as Record<string, unknown>;
  } finally {
    clearTimeout(timeout);
  }
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

async function resolveLocation(
  location: string,
  fetchImpl: FetchLike,
  now: number,
  timeoutMs: number,
): Promise<GeocodeResult> {
  const key = cacheKey(location);
  const cached = readCache(geocodeCache, key, now);
  if (cached) return cached;

  const url = new URL(GEO_URL);
  url.searchParams.set('name', location);
  url.searchParams.set('count', '1');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');
  const data = await fetchJson(fetchImpl, url, timeoutMs);
  const results = Array.isArray(data.results) ? data.results : [];
  const first = results[0];
  if (first == null || typeof first !== 'object' || Array.isArray(first)) {
    throw new Error(`Location not found: ${location}`);
  }
  const candidate = first as Record<string, unknown>;
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
  const timezone = typeof candidate.timezone === 'string' ? candidate.timezone.trim() : '';
  const latitude = finiteNumber(candidate.latitude);
  const longitude = finiteNumber(candidate.longitude);
  if (!name || !timezone || latitude == null || longitude == null) {
    throw new Error('Geocoding result is incomplete');
  }
  return writeCache(
    geocodeCache,
    key,
    {
      ...(finiteNumber(candidate.id) != null ? { id: finiteNumber(candidate.id) } : {}),
      name,
      latitude,
      longitude,
      timezone,
      ...(typeof candidate.country === 'string' ? { country: candidate.country } : {}),
      ...(typeof candidate.country_code === 'string'
        ? { country_code: candidate.country_code }
        : {}),
      ...(typeof candidate.admin1 === 'string' ? { admin1: candidate.admin1 } : {}),
    },
    now,
    GEOCODE_CACHE_TTL_MS,
  );
}

function formatLocalDateTime(now: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(now));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get(
    'second',
  )}`;
}

function formatUtcOffset(now: number, timezone: string): string {
  const part = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'longOffset',
  })
    .formatToParts(new Date(now))
    .find((item) => item.type === 'timeZoneName')?.value;
  return part?.replace(/^GMT/, 'UTC') ?? 'UTC';
}

function weatherCondition(code: number | undefined): string | undefined {
  if (code == null) return undefined;
  if (code === 0) return 'Clear sky';
  if (code === 1) return 'Mainly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if ([51, 53, 55].includes(code)) return 'Drizzle';
  if ([56, 57].includes(code)) return 'Freezing drizzle';
  if ([61, 63, 65].includes(code)) return 'Rain';
  if ([66, 67].includes(code)) return 'Freezing rain';
  if ([71, 73, 75, 77].includes(code)) return 'Snow';
  if ([80, 81, 82].includes(code)) return 'Rain showers';
  if ([85, 86].includes(code)) return 'Snow showers';
  if (code === 95) return 'Thunderstorm';
  if (code === 96 || code === 99) return 'Thunderstorm with hail';
  return undefined;
}

function localApiTimeToUtc(localTime: string, utcOffsetSeconds: number): number | undefined {
  const normalized = /:\d{2}$/.test(localTime) ? localTime : `${localTime}:00`;
  const pseudoUtc = Date.parse(`${normalized}Z`);
  if (!Number.isFinite(pseudoUtc)) return undefined;
  return pseudoUtc - utcOffsetSeconds * 1000;
}

async function resolveWeather(
  location: GeocodeResult,
  fetchImpl: FetchLike,
  now: number,
  timeoutMs: number,
): Promise<CurrentWeather> {
  const key = `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}:${location.timezone}`;
  const cached = readCache(weatherCache, key, now);
  if (cached) return cached;

  const url = new URL(WEATHER_URL);
  url.searchParams.set('latitude', String(location.latitude));
  url.searchParams.set('longitude', String(location.longitude));
  url.searchParams.set(
    'current',
    [
      'temperature_2m',
      'apparent_temperature',
      'relative_humidity_2m',
      'precipitation',
      'weather_code',
      'cloud_cover',
      'wind_speed_10m',
      'is_day',
    ].join(','),
  );
  url.searchParams.set('timezone', location.timezone);
  url.searchParams.set('temperature_unit', 'celsius');
  url.searchParams.set('wind_speed_unit', 'kmh');

  const data = await fetchJson(fetchImpl, url, timeoutMs);
  const current =
    data.current != null && typeof data.current === 'object' && !Array.isArray(data.current)
      ? (data.current as Record<string, unknown>)
      : undefined;
  if (!current || typeof current.time !== 'string') {
    throw new Error('Weather provider returned no current model data');
  }
  const utcOffsetSeconds = finiteNumber(data.utc_offset_seconds) ?? 0;
  const dataEpoch = localApiTimeToUtc(current.time, utcOffsetSeconds);
  if (dataEpoch == null) {
    throw new Error('Weather provider returned an invalid current-data time');
  }
  const ageMs = Math.max(0, now - dataEpoch);
  const weatherCode = finiteNumber(current.weather_code);
  const result: CurrentWeather = {
    sourceType: 'model-current',
    dataAt: current.time,
    dataAtUtc: new Date(dataEpoch).toISOString(),
    ageMs,
    fresh: ageMs <= MAX_WEATHER_AGE_MS,
    ...(weatherCondition(weatherCode) ? { condition: weatherCondition(weatherCode) } : {}),
    ...(finiteNumber(current.temperature_2m) != null
      ? { temperatureC: finiteNumber(current.temperature_2m) }
      : {}),
    ...(finiteNumber(current.apparent_temperature) != null
      ? { apparentTemperatureC: finiteNumber(current.apparent_temperature) }
      : {}),
    ...(finiteNumber(current.relative_humidity_2m) != null
      ? { relativeHumidityPct: finiteNumber(current.relative_humidity_2m) }
      : {}),
    ...(finiteNumber(current.precipitation) != null
      ? { precipitationMm: finiteNumber(current.precipitation) }
      : {}),
    ...(weatherCode != null ? { weatherCode } : {}),
    ...(finiteNumber(current.cloud_cover) != null
      ? { cloudCoverPct: finiteNumber(current.cloud_cover) }
      : {}),
    ...(finiteNumber(current.wind_speed_10m) != null
      ? { windSpeedKmh: finiteNumber(current.wind_speed_10m) }
      : {}),
    ...(finiteNumber(current.is_day) != null ? { isDay: finiteNumber(current.is_day) === 1 } : {}),
    ...(finiteNumber(data.generationtime_ms) != null
      ? { generationTimeMs: finiteNumber(data.generationtime_ms) }
      : {}),
  };
  return writeCache(weatherCache, key, result, now, WEATHER_CACHE_TTL_MS);
}

async function routeCurrentStateCapability(
  capability: 'location.resolve' | 'time.current' | 'weather.current',
) {
  const registry = getActivatedCapabilityRegistry();
  return routeRegisteredCapability({
    registry,
    capability,
    resolve: (descriptor) => {
      const isRuntimeClock = descriptor.id === 'native:runtime-clock';
      const isOpenMeteo = descriptor.id === 'external:open-meteo-current-state';
      if (!isRuntimeClock && !isOpenMeteo) return undefined;
      return {
        id: descriptor.id,
        capabilities: [...descriptor.capabilities],
        executionMode: descriptor.executionMode,
        providerId: descriptor.providerId,
        signals: {
          available: true,
          pricingTier: 'free',
          freshness: 'ACTIVE',
          latencyMs: isRuntimeClock ? 0 : 250,
        },
      };
    },
  });
}

export async function resolveCurrentState({
  location,
  facts = ['time', 'weather'],
  now = Date.now(),
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: {
  location: string;
  facts?: CurrentStateFact[];
  now?: number;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<CurrentStateResult> {
  const resolvedAt = new Date(now).toISOString();
  try {
    const wantsTime = facts.includes('time');
    const wantsWeather = facts.includes('weather');
    const [locationRoute, timeRoute, weatherRoute] = await Promise.all([
      routeCurrentStateCapability('location.resolve'),
      wantsTime ? routeCurrentStateCapability('time.current') : Promise.resolve(undefined),
      wantsWeather ? routeCurrentStateCapability('weather.current') : Promise.resolve(undefined),
    ]);
    if (locationRoute.selectedCandidateId !== 'external:open-meteo-current-state') {
      throw new Error('Selected location provider has no current-state adapter');
    }
    if (timeRoute && timeRoute.selectedCandidateId !== 'native:runtime-clock') {
      throw new Error('Selected time provider has no current-state adapter');
    }
    if (weatherRoute && weatherRoute.selectedCandidateId !== 'external:open-meteo-current-state') {
      throw new Error('Selected weather provider has no current-state adapter');
    }

    const resolvedLocation = await resolveLocation(location, fetchImpl, now, timeoutMs);
    const weather = wantsWeather
      ? await resolveWeather(resolvedLocation, fetchImpl, now, timeoutMs)
      : undefined;
    const fallbackRequired = weather != null && !weather.fresh;
    return {
      ok: !fallbackRequired,
      fallbackRequired,
      provider: 'runtime+open-meteo',
      resolvedAt,
      location: {
        name: resolvedLocation.name,
        ...(resolvedLocation.country ? { country: resolvedLocation.country } : {}),
        ...(resolvedLocation.country_code ? { countryCode: resolvedLocation.country_code } : {}),
        ...(resolvedLocation.admin1 ? { admin1: resolvedLocation.admin1 } : {}),
        latitude: resolvedLocation.latitude,
        longitude: resolvedLocation.longitude,
        timezone: resolvedLocation.timezone,
      },
      ...(wantsTime
        ? {
            time: {
              timezone: resolvedLocation.timezone,
              utcOffset: formatUtcOffset(now, resolvedLocation.timezone),
              localDateTime: formatLocalDateTime(now, resolvedLocation.timezone),
              utcInstant: resolvedAt,
            },
          }
        : {}),
      ...(weather ? { weather } : {}),
      ...(fallbackRequired
        ? { reason: 'Structured weather model data is too old for a current-state claim' }
        : {}),
      routing: {
        'location.resolve': locationRoute.selectedCandidateId,
        ...(timeRoute ? { 'time.current': timeRoute.selectedCandidateId } : {}),
        ...(weatherRoute ? { 'weather.current': weatherRoute.selectedCandidateId } : {}),
      },
      provenance: {
        location: GEO_URL,
        ...(wantsWeather ? { weather: WEATHER_URL } : {}),
        time: 'runtime-clock',
        attribution: [
          'Weather data by Open-Meteo.com',
          'Location data based on GeoNames via Open-Meteo',
        ],
      },
    };
  } catch (error) {
    return {
      ok: false,
      fallbackRequired: true,
      provider: 'runtime+open-meteo',
      resolvedAt,
      reason: error instanceof Error ? error.message : 'Current-state resolution failed',
      provenance: { time: 'runtime-clock' },
    };
  }
}

export function clearCurrentStateCachesForTests(): void {
  geocodeCache.clear();
  weatherCache.clear();
}

export function createCurrentStateTool(): DynamicStructuredTool<z.ZodType<CurrentStateToolInput>> {
  return new DynamicStructuredTool<z.ZodType<CurrentStateToolInput>>({
    func: async (input) => JSON.stringify(await resolveCurrentState(input)),
    name: CURRENT_STATE_TOOL_NAME,
    description:
      'Fast structured resolver for current local time and current weather. Use it before web_search for simple current-state questions about a named city or place. It resolves location, timezone, runtime time, and fresh weather in one call. When ok=true, answer from this result and do not call web_search merely to add citations or a second source. If fallbackRequired is true, use web_search only for the missing or stale fact.',
    schema: currentStateInputSchema,
  });
}
