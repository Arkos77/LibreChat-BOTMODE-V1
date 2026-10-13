import * as fs from 'node:fs';
import * as path from 'node:path';
import JSZip from 'jszip';
import { convertDocxWithWorker, DocxBusyError, DocxTimeoutError } from './docxWorker';

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

  test('terminates a timed-out worker and restores processing capacity', async () => {
    const originalSetTimeout = global.setTimeout;
    const timeoutSpy = jest
      .spyOn(global, 'setTimeout')
      .mockImplementation(((
        callback: (...args: unknown[]) => void,
        delay?: number,
        ...args: unknown[]
      ) =>
        originalSetTimeout(callback, delay === 20_000 ? 1 : delay, ...args)) as typeof setTimeout);
    try {
      await expect(convertDocxWithWorker(fixture, 'text')).rejects.toBeInstanceOf(DocxTimeoutError);
    } finally {
      timeoutSpy.mockRestore();
    }
    expect(await convertDocxWithWorker(fixture, 'text')).toContain('sample DOCX');
  });


  test('records parent RSS during two large concurrent DOCX conversions', async () => {
    const zip = new JSZip();
    const paragraph = '<w:p><w:r><w:t>Bounded concurrent worker probe.</w:t></w:r></w:p>';
    zip.file(
      '[Content_Types].xml',
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    );
    zip.file(
      '_rels/.rels',
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    );
    zip.file(
      'word/document.xml',
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
        paragraph.repeat(12000) +
        '</w:body></w:document>',
    );
    const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const baselineRss = process.memoryUsage().rss;
    let peakRss = baselineRss;
    const sampler = setInterval(() => {
      peakRss = Math.max(peakRss, process.memoryUsage().rss);
    }, 10);
    try {
      const results = await Promise.all([
        convertDocxWithWorker(buffer, 'text'),
        convertDocxWithWorker(buffer, 'html'),
      ]);
      expect(results[0]).toContain('Bounded concurrent worker probe.');
      expect(results[1]).toContain('Bounded concurrent worker probe.');
    } finally {
      clearInterval(sampler);
    }
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
    console.log(
      'BOTMODE_DOCX_WORKER_RSS=' +
        JSON.stringify({
          baselineRssBytes: baselineRss,
          sampledPeakRssBytes: peakRss,
          sampledDeltaRssBytes: peakRss - baselineRss,
          conversions: 2,
          note: 'Jest process RSS; sampled, not an OS-enforced cap',
        }),
    );
    expect(peakRss).toBeGreaterThan(0);
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
