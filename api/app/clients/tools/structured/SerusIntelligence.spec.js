const SerusIntelligence = require('./SerusIntelligence');

describe('SerusIntelligence', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loads without credentials but fails closed before any network call', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => {
      throw new Error('network should not be called');
    });
    const previousKey = process.env.SERUS_API_KEY;
    delete process.env.SERUS_API_KEY;
    try {
      const tool = new SerusIntelligence();
      const result = await tool._call({ action: 'verify_key' });
      expect(result).toContain('Missing SERUS_API_KEY');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      if (previousKey == null) {
        delete process.env.SERUS_API_KEY;
      } else {
        process.env.SERUS_API_KEY = previousKey;
      }
    }
  });

  it('verifies access without exposing the subject', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          subject: 'org-secret',
          scopes: ['account:read', 'darkweb:scan'],
          credits_remaining: 12.5,
        }),
    }));
    const tool = new SerusIntelligence({ SERUS_API_KEY: 'ak_test' });
    const result = JSON.parse(await tool._call({ action: 'verify_key' }));
    expect(result).toEqual({
      status: 'available',
      scopes: ['account:read', 'darkweb:scan'],
      credits_remaining: 12.5,
    });
    expect(JSON.stringify(result)).not.toContain('org-secret');
  });

  it('starts only masked scans and never sends reveal', async () => {
    global.fetch = jest.fn(async (_url, _options) => ({
      ok: true,
      text: async () =>
        JSON.stringify({ id: 'scan-1', status: 'processing', identifierType: 'email' }),
    }));
    const tool = new SerusIntelligence({ SERUS_API_KEY: 'ak_test' });
    const result = JSON.parse(
      await tool._call({
        action: 'start_scan',
        identifier_type: 'email',
        identifier_value: 'person@example.com',
      }),
    );
    expect(result).toEqual({
      id: 'scan-1',
      status: 'processing',
      identifierType: 'email',
      masked: true,
    });
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.serus.ai/v1/darkweb/scans');
    expect(options.body).not.toContain('reveal');
  });

  it('retrieves masked scan results without reveal query parameters', async () => {
    global.fetch = jest.fn(async (_url) => ({
      ok: true,
      text: async () => JSON.stringify({ id: 'scan-1', status: 'success', breaches: [] }),
    }));
    const tool = new SerusIntelligence({ SERUS_API_KEY: 'ak_test' });
    const result = JSON.parse(await tool._call({ action: 'get_scan', scan_id: 'scan-1' }));
    expect(result.masked).toBe(true);
    expect(global.fetch.mock.calls[0][0]).toBe('https://api.serus.ai/v1/darkweb/scans/scan-1');
  });
});
