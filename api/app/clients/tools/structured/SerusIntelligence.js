const { logger } = require('@librechat/data-schemas');
const { Tool } = require('@librechat/agents/langchain/tools');
const { getEnvironmentVariable } = require('@librechat/agents/langchain/utils/env');

const BASE_URL = 'https://api.serus.ai/v1';
const IDENTIFIER_TYPES = ['email', 'phone', 'username', 'domain', 'keyword', 'origin', 'password'];

const serusIntelligenceJsonSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['verify_key', 'start_scan', 'get_scan'],
      description:
        'verify_key checks API access without spending credits; start_scan starts a masked dark-web scan; get_scan retrieves masked results.',
    },
    identifier_type: {
      type: 'string',
      enum: IDENTIFIER_TYPES,
      description: 'Identifier type for start_scan.',
    },
    identifier_value: {
      type: 'string',
      minLength: 1,
      maxLength: 512,
      description: 'Identifier value for start_scan.',
    },
    scan_id: {
      type: 'string',
      minLength: 1,
      maxLength: 256,
      description: 'Serus scan ID for get_scan.',
    },
  },
  required: ['action'],
};

class SerusIntelligence extends Tool {
  static lc_name() {
    return 'SerusIntelligence';
  }

  constructor(fields = {}) {
    super(fields);
    this.name = 'serus_intelligence';
    this.description =
      'Security-intelligence tool for Serus. It verifies API access, starts masked dark-web scans, and retrieves masked results. Never reveals unmasked breach values. Starting a new scan may consume Serus credits.';
    this.description_for_model =
      'Use only for legitimate security, privacy, due-diligence, or exposure investigations. Prefer verify_key before a paid scan when availability is uncertain. start_scan may consume credits. Results remain masked; never claim access to unmasked secrets.';
    this.schema = serusIntelligenceJsonSchema;
    this.apiKey = fields.SERUS_API_KEY ?? this.getApiKey();
  }

  static get jsonSchema() {
    return serusIntelligenceJsonSchema;
  }

  getApiKey() {
    const key = getEnvironmentVariable('SERUS_API_KEY');
    if (!key) {
      throw new Error('Missing SERUS_API_KEY environment variable.');
    }
    return key;
  }

  async request(path, options = {}) {
    const response = await fetch(BASE_URL + path, {
      ...options,
      headers: {
        Authorization: 'Bearer ' + this.apiKey,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { message: text };
    }

    if (!response.ok) {
      const error = payload?.error;
      const code = error?.code ?? 'http_' + response.status;
      const message = error?.message ?? payload?.message ?? 'Serus API request failed';
      throw new Error(code + ': ' + message);
    }
    return payload;
  }

  async _call(args) {
    try {
      const { action, identifier_type, identifier_value, scan_id } = args ?? {};

      if (action === 'verify_key') {
        const result = await this.request('/hello');
        return JSON.stringify({
          status: 'available',
          scopes: Array.isArray(result.scopes) ? result.scopes : [],
          credits_remaining:
            typeof result.credits_remaining === 'number' ? result.credits_remaining : null,
        });
      }

      if (action === 'start_scan') {
        if (!IDENTIFIER_TYPES.includes(identifier_type) || !identifier_value?.trim()) {
          throw new Error('start_scan requires a valid identifier_type and identifier_value.');
        }
        const result = await this.request('/darkweb/scans', {
          method: 'POST',
          body: JSON.stringify({
            identifierType: identifier_type,
            identifierValue: identifier_value.trim(),
          }),
        });
        return JSON.stringify({
          id: result.id,
          status: result.status,
          identifierType: result.identifierType ?? identifier_type,
          masked: true,
        });
      }

      if (action === 'get_scan') {
        if (!scan_id?.trim()) {
          throw new Error('get_scan requires scan_id.');
        }
        const result = await this.request('/darkweb/scans/' + encodeURIComponent(scan_id.trim()));
        return JSON.stringify({
          ...result,
          masked: true,
        });
      }

      throw new Error('Unsupported Serus action.');
    } catch (error) {
      logger.error('Serus API request failed', error);
      return 'Serus API request failed: ' + error.message;
    }
  }
}

module.exports = SerusIntelligence;
