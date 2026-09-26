import {
  createImprovementPayloadDigest,
  verifyImprovementPayloadDigest,
} from './improvementPayload';

describe('Improvement publication payload binding', () => {
  it('produces the same digest for semantically identical objects with different key order', () => {
    const left = {
      description: 'Improved description',
      frontmatter: { beta: true, alpha: 'x' },
      body: 'Body',
    };
    const right = {
      body: 'Body',
      frontmatter: { alpha: 'x', beta: true },
      description: 'Improved description',
    };

    expect(createImprovementPayloadDigest(left)).toBe(createImprovementPayloadDigest(right));
  });

  it('changes the digest when any authored update value changes', () => {
    const original = {
      description: 'Improved description',
      frontmatter: { alpha: 'x' },
    };
    const changed = {
      description: 'Different description',
      frontmatter: { alpha: 'x' },
    };

    expect(createImprovementPayloadDigest(original)).not.toBe(
      createImprovementPayloadDigest(changed),
    );
  });

  it('distinguishes omitted values from explicit null', () => {
    expect(createImprovementPayloadDigest({ description: 'x' })).not.toBe(
      createImprovementPayloadDigest({ description: 'x', category: null }),
    );
  });

  it('verifies only the exact canonical payload bound to the digest', () => {
    const update = { description: 'Improved description', alwaysApply: false };
    const digest = createImprovementPayloadDigest(update);

    expect(verifyImprovementPayloadDigest(update, digest)).toBe(true);
    expect(
      verifyImprovementPayloadDigest(
        { description: 'Improved description', alwaysApply: true },
        digest,
      ),
    ).toBe(false);
  });

  it.each([undefined, null, 'text', 7, true, []])(
    'rejects non-object update payloads: %p',
    (value) => {
      expect(() => createImprovementPayloadDigest(value)).toThrow();
    },
  );
});
