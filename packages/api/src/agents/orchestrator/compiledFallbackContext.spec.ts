const { check } = jest.requireActual<{ check: (mode: string) => Promise<void> }>(
  '../../../../../scripts/botmode/native-research-image-regression.cjs',
);

it.each([
  'success',
  'prose',
  'tool-error',
  'fallback429',
  'native-openrouter',
  'native-citation-unicode',
  'native-citation-escaped',
  'native-anchor-only',
])(
  'preserves compiled native research behavior with the patched SDK: %s',
  async (mode) => {
    await expect(check(mode)).resolves.toBeUndefined();
  },
  20000,
);
