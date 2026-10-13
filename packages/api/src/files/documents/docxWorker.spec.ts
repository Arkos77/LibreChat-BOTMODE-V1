import * as fs from 'node:fs';
import * as path from 'node:path';
import { convertDocxWithWorker, DocxBusyError } from './docxWorker';

const fixture = fs.readFileSync(path.join(__dirname, 'sample.docx'));

describe('bounded Mammoth worker isolation', () => {
  jest.setTimeout(30_000);

  test('extracts DOCX text in an isolated worker', async () => {
    const result = await convertDocxWithWorker(fixture, 'text');
    expect(result).toContain('sample DOCX');
  });

  test('renders DOCX HTML with style mappings in a worker', async () => {
    const result = await convertDocxWithWorker(fixture, 'html', [
      "p[style-name='Title'] => h1:fresh",
    ]);
    expect(result).toContain('sample DOCX');
  });

  test('propagates a conversion failure and subsequently recovers capacity', async () => {
    await expect(convertDocxWithWorker(Buffer.from('invalid'), 'text')).rejects.toThrow();
    expect(await convertDocxWithWorker(fixture, 'text')).toContain('sample DOCX');
  });

  test('bounds concurrent submissions rather than growing an unbounded queue', async () => {
    const requests = Array.from({ length: 12 }, () => convertDocxWithWorker(fixture, 'text'));
    const settled = await Promise.allSettled(requests);
    const accepted = settled.filter((x) => x.status === 'fulfilled');
    const refused = settled.filter((x) => x.status === 'rejected');
    expect(accepted.length).toBeGreaterThan(0);
    expect(refused.length).toBeGreaterThan(0);
    for (const result of refused) {
      expect((result as PromiseRejectedResult).reason).toBeInstanceOf(DocxBusyError);
    }
    expect(await convertDocxWithWorker(fixture, 'text')).toContain('sample DOCX');
  });
});
