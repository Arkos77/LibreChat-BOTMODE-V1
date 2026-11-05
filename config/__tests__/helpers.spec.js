const { PassThrough } = require('stream');
const { askSilentQuestion, generateSecurePassword } = require('../helpers');

describe('askSilentQuestion', () => {
  it('shows the prompt without echoing the answer', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let written = '';

    input.isTTY = true;
    output.isTTY = true;
    output.columns = 80;
    output.on('data', (chunk) => {
      written += chunk.toString();
    });

    const answerPromise = askSilentQuestion('Enter new password: ', input, output);
    input.write('visible-secret\n');

    await expect(answerPromise).resolves.toBe('visible-secret');
    expect(written).toBe('Enter new password: \n');
  });
});

describe('generateSecurePassword', () => {
  it('produces unpredictable 24-character URL-safe passwords from crypto randomness', () => {
    const samples = Array.from({ length: 64 }, () => generateSecurePassword());

    for (const candidate of samples) {
      expect(candidate).toMatch(/^[A-Za-z0-9_-]{24}$/);
      expect(Buffer.from(candidate, 'base64url')).toHaveLength(18);
    }
    expect(new Set(samples).size).toBe(samples.length);
  });
});
