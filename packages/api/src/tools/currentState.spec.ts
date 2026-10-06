import { clearCurrentStateCachesForTests, resolveCurrentState } from './currentState';

const NOW = Date.parse('2026-10-06T22:36:00.000Z');

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('current state resolver', () => {
  beforeEach(() => {
    clearCurrentStateCachesForTests();
  });

  it('resolves location, authoritative local time and fresh weather in one flow', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              id: 524901,
              name: 'Moscow',
              latitude: 55.75222,
              longitude: 37.61556,
              timezone: 'Europe/Moscow',
              country: 'Russia',
              country_code: 'RU',
              admin1: 'Moscow',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          latitude: 55.75,
          longitude: 37.62,
          generationtime_ms: 0.42,
          utc_offset_seconds: 10800,
          timezone: 'Europe/Moscow',
          current: {
            time: '2026-10-07T01:30',
            interval: 900,
            temperature_2m: 11.2,
            apparent_temperature: 10.6,
            relative_humidity_2m: 82,
            precipitation: 0.1,
            weather_code: 51,
            cloud_cover: 100,
            wind_speed_10m: 7.4,
            is_day: 0,
          },
        }),
      );

    const result = await resolveCurrentState({
      location: 'Moscow',
      now: NOW,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toMatchObject({
      ok: true,
      fallbackRequired: false,
      provider: 'runtime+open-meteo',
      location: {
        name: 'Moscow',
        country: 'Russia',
        countryCode: 'RU',
        timezone: 'Europe/Moscow',
      },
      time: {
        timezone: 'Europe/Moscow',
        utcOffset: 'UTC+03:00',
        localDateTime: '2026-10-07T01:36:00',
        utcInstant: '2026-10-06T22:36:00.000Z',
      },
      weather: {
        sourceType: 'model-current',
        dataAt: '2026-10-07T01:30',
        dataAtUtc: '2026-10-06T22:30:00.000Z',
        ageMs: 6 * 60 * 1000,
        fresh: true,
        condition: 'Drizzle',
        temperatureC: 11.2,
        apparentTemperatureC: 10.6,
        weatherCode: 51,
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0][0])).toContain('geocoding-api.open-meteo.com');
    expect(String(fetchImpl.mock.calls[1][0])).toContain('api.open-meteo.com/v1/forecast');
  });

  it('does not call weather when only current time is requested', async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(
      jsonResponse({
        results: [
          {
            name: 'Bissau',
            latitude: 11.86357,
            longitude: -15.59767,
            timezone: 'Africa/Bissau',
            country: 'Guinea-Bissau',
            country_code: 'GW',
          },
        ],
      }),
    );

    const result = await resolveCurrentState({
      location: 'Bissau',
      facts: ['time'],
      now: NOW,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.ok).toBe(true);
    expect(result.weather).toBeUndefined();
    expect(result.time?.timezone).toBe('Africa/Bissau');
    expect(result.time?.localDateTime).toBe('2026-10-06T22:36:00');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('marks stale weather as requiring web fallback instead of presenting it as current', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              name: 'Cergy',
              latitude: 49.03645,
              longitude: 2.07613,
              timezone: 'Europe/Paris',
              country: 'France',
              country_code: 'FR',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          utc_offset_seconds: 7200,
          generationtime_ms: 0.3,
          current: {
            time: '2026-10-06T20:00',
            temperature_2m: 18,
            weather_code: 3,
          },
        }),
      );

    const result = await resolveCurrentState({
      location: 'Cergy',
      now: NOW,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.ok).toBe(false);
    expect(result.fallbackRequired).toBe(true);
    expect(result.weather?.fresh).toBe(false);
    expect(result.reason).toContain('too old');
  });

  it('caches geocoding and fresh weather for repeated fast lookups', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              name: 'Moscow',
              latitude: 55.75222,
              longitude: 37.61556,
              timezone: 'Europe/Moscow',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          utc_offset_seconds: 10800,
          current: {
            time: '2026-10-07T01:30',
            temperature_2m: 11,
          },
        }),
      );

    const first = await resolveCurrentState({
      location: 'Moscow',
      now: NOW,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const second = await resolveCurrentState({
      location: 'Moscow',
      now: NOW + 60_000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('returns a compact fail-closed fallback signal on provider failure', async () => {
    const fetchImpl = jest.fn().mockResolvedValueOnce(jsonResponse({}, 503));

    const result = await resolveCurrentState({
      location: 'Paris',
      now: NOW,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toMatchObject({
      ok: false,
      fallbackRequired: true,
      provider: 'runtime+open-meteo',
    });
    expect(result.reason).toContain('HTTP 503');
  });
});
