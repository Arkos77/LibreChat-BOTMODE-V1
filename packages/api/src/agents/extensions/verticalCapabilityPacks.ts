import type { ExtensionPackManifest } from './extensionPacks';

export interface VerticalCapabilityPack extends ExtensionPackManifest {
  kind: 'vertical';
  domainRules: readonly string[];
  complianceSignals: readonly string[];
  defaultSkills: readonly string[];
}

export function createVerticalCapabilityPack(input: Omit<VerticalCapabilityPack, 'kind'>): VerticalCapabilityPack {
  if (input.domainRules.length === 0) throw new Error('Vertical pack requires domain rules');
  if (input.defaultSkills.length === 0) throw new Error('Vertical pack requires default skills');
  return { ...input, kind: 'vertical', domainRules: [...input.domainRules], complianceSignals: [...input.complianceSignals], defaultSkills: [...input.defaultSkills] };
}

export const HOSPITALITY_INTELLIGENCE_PACK: VerticalCapabilityPack = createVerticalCapabilityPack({
  id: 'vertical:hospitality:intelligence',
  version: '1',
  name: 'Hospitality Intelligence',
  description: 'Hotel, restaurant, wellness, experience and rate-parity analysis capabilities.',
  capabilities: ['hospitality:rate-parity', 'hospitality:mystery-guest', 'hospitality:digital-journey'],
  evidenceRefs: ['memo:opportunity:hospitality'],
  enabled: false,
  domainRules: ['same-property', 'same-dates', 'same-room', 'same-occupancy', 'same-cancellation'],
  complianceSignals: ['travel-cost', 'reimbursement', 'confidentiality', 'deadline'],
  defaultSkills: ['hospitality-audit', 'rate-parity-audit'],
});
