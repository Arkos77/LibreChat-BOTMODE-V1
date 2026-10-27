/**
 * Offline compatibility gate for MSAL 7 override; no tokens or network calls.
 * It does not establish live Azure authentication compatibility.
 */
import { createServer } from 'node:http';
import { DefaultAzureCredential, ManagedIdentityCredential } from '@azure/identity';

describe('Azure MSAL 7 compatibility (offline)', () => {
  const initialAccount = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  const initialConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

  afterEach(() => {
    if (initialAccount === undefined) {
      delete process.env.AZURE_STORAGE_ACCOUNT_NAME;
    } else {
      process.env.AZURE_STORAGE_ACCOUNT_NAME = initialAccount;
    }
    if (initialConnectionString === undefined) {
      delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    } else {
      process.env.AZURE_STORAGE_CONNECTION_STRING = initialConnectionString;
    }
    jest.resetModules();
  });

  it('constructs the real Azure credential without requesting a token', () => {
    expect(new DefaultAzureCredential()).toHaveProperty('getToken', expect.any(Function));
  });

  it('does not initialize Azure Blob service without explicit config', async () => {
    delete process.env.AZURE_STORAGE_ACCOUNT_NAME;
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    const { initializeAzureBlobService } = await import('../azure');
    await expect(initializeAzureBlobService()).resolves.toBeNull();
  });

  it('constructs a local managed identity Blob client without network', async () => {
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    process.env.AZURE_STORAGE_ACCOUNT_NAME = 'botmodeofflinefixture';
    const { initializeAzureBlobService } = await import('../azure');
    const client = await initializeAzureBlobService();
    expect(new URL(client?.url ?? '').origin).toBe(
      'https://botmodeofflinefixture.blob.core.windows.net',
    );
    expect(typeof client?.getContainerClient).toBe('function');
  });
  it(
    'obtains a managed identity token from a disposable local App Service endpoint',
    async () => {
      const keys = ['IDENTITY_ENDPOINT', 'IDENTITY_HEADER', 'MSI_ENDPOINT', 'MSI_SECRET'] as const;
      const previous = new Map(keys.map((key) => [key, process.env[key]]));
      const requests: Array<{ url: string; header: string | undefined }> = [];
      const server = createServer((request, response) => {
        requests.push({
          url: request.url ?? '',
          header: request.headers['x-identity-header'] as string | undefined,
        });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            access_token: 'botmode-local-synthetic-token',
            token_type: 'Bearer',
            expires_on: String(Math.floor(Date.now() / 1000) + 3600),
            resource: 'https://storage.azure.com/',
            client_id: '00000000-0000-0000-0000-000000000001',
          }),
        );
      });

      try {
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') {
          throw new Error('CI_AZURE_LOCAL_LISTENER_UNAVAILABLE');
        }
        delete process.env.MSI_ENDPOINT;
        delete process.env.MSI_SECRET;
        process.env.IDENTITY_ENDPOINT = `http://127.0.0.1:${address.port}/MSI/token`;
        process.env.IDENTITY_HEADER = 'botmode-local-header';
        const token = await new ManagedIdentityCredential().getToken(
          'https://storage.azure.com/.default',
        );

        expect(token?.token).toBe('botmode-local-synthetic-token');
        expect(requests).toHaveLength(1);
        expect(new URL(requests[0].url, 'http://127.0.0.1').searchParams.get('api-version')).toBe(
          '2019-08-01',
        );
        expect(requests[0].header).toBe('botmode-local-header');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        for (const [key, value] of previous) {
          if (value === undefined) {
            delete process.env[key];
          } else {
            process.env[key] = value;
          }
        }
      }
    },
    20000,
  );

});
