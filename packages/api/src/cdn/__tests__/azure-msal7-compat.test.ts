/**
 * Offline compatibility gate for MSAL 7 override; no tokens or network calls.
 * It does not establish live Azure authentication compatibility.
 */
import { DefaultAzureCredential } from '@azure/identity';

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
});
