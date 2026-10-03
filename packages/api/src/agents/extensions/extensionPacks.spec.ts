import { BUILTIN_EXTENSION_PACKS, ExtensionPackRegistry, validateExtensionPack } from './extensionPacks';

describe('extension packs', () => {
  it('validates and isolates registered manifests', () => {
    const registry = new ExtensionPackRegistry();
    registry.register(BUILTIN_EXTENSION_PACKS[0]);
    const copy = registry.get(BUILTIN_EXTENSION_PACKS[0].id)!;
    (copy.capabilities as string[]).push('mutated');
    expect(registry.get(BUILTIN_EXTENSION_PACKS[0].id)!.capabilities).not.toContain('mutated');
  });

  it('rejects packs without evidence or capabilities', () => {
    expect(() => validateExtensionPack({ ...BUILTIN_EXTENSION_PACKS[0], capabilities: [] })).toThrow(
      'Extension pack requires at least one capability',
    );
    expect(() => validateExtensionPack({ ...BUILTIN_EXTENSION_PACKS[0], evidenceRefs: [''] })).toThrow(
      'Extension pack evidence refs must be non-empty',
    );
  });

  it('ships the planned business verticals as disabled-by-default capability packs', () => {
    expect(BUILTIN_EXTENSION_PACKS).toHaveLength(10);
    expect(BUILTIN_EXTENSION_PACKS.every((pack) => pack.enabled === false)).toBe(true);
    expect(BUILTIN_EXTENSION_PACKS.map((pack) => pack.id)).toEqual([
      'memory:hindsight',
      'qa:artifact-drift',
      'media:audio-voice',
      'opportunity:economic-enablement',
      'vertical:finance',
      'vertical:real-estate',
      'vertical:pme-procurement',
      'vertical:concierge',
      'vertical:automotive',
      'vertical:hospitality',
    ]);
  });
});
