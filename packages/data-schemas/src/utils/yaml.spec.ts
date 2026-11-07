import { stripYamlTrailingComment } from './yaml';

describe('stripYamlTrailingComment', () => {
  it('strips YAML comments preceded by spaces or tabs', () => {
    expect(stripYamlTrailingComment('true # enabled')).toBe('true');
    expect(stripYamlTrailingComment('false   # disabled')).toBe('false');
    expect(stripYamlTrailingComment('true\t# enabled')).toBe('true');
    expect(stripYamlTrailingComment('  true  # enabled')).toBe('  true');
  });

  it('preserves literal hash characters and values without a comment', () => {
    expect(stripYamlTrailingComment('hashtag#literal')).toBe('hashtag#literal');
    expect(stripYamlTrailingComment('true')).toBe('true');
    expect(stripYamlTrailingComment('value #first #second')).toBe('value');
    expect(stripYamlTrailingComment('')).toBe('');
  });

  it('treats whitespace followed by a full-line comment as an empty scalar', () => {
    expect(stripYamlTrailingComment('# comment')).toBe('');
    expect(stripYamlTrailingComment('    # comment')).toBe('');
  });

  it('preserves legacy behavior around line breaks', () => {
    expect(stripYamlTrailingComment('value\n# comment')).toBe('value');
    expect(stripYamlTrailingComment('value\nother # comment')).toBe('value\nother # comment');
    expect(stripYamlTrailingComment('value # comment\n')).toBe('value # comment\n');
    expect(stripYamlTrailingComment('value # comment\r\n')).toBe('value # comment\r\n');
  });

  it('handles a long scalar with whitespace but no hash in linear work', () => {
    const value = `true${' '.repeat(40_000)}false`;
    expect(stripYamlTrailingComment(value)).toBe(value);
  });

  it('removes a comment after a long sequence of whitespace', () => {
    expect(stripYamlTrailingComment(`true${' '.repeat(40_000)}# comment`)).toBe('true');
  });
});
