export type InformationWatchStatus = 'ACTIVE' | 'STALE' | 'UNAVAILABLE' | 'DISCONNECTED';

export interface InformationSourceDescriptor {
  sourceId: string;
  name: string;
  category: 'social' | 'video' | 'community' | 'web' | 'specialized';
  access: 'PUBLIC_HTTP' | 'USER_AUTHENTICATED' | 'PARTNER' | 'SEARCH_PROVIDER';
  connected: boolean;
  sourceUrl?: string;
}

export interface InformationSourceObservation {
  sourceId: string;
  checkedAt: string;
  status: InformationWatchStatus;
  sourceRef: string;
  evidenceRefs?: readonly string[];
  itemCount?: number;
  cursor?: string;
  note?: string;
}

export interface InformationSourceState extends InformationSourceDescriptor {
  status: InformationWatchStatus;
  checkedAt?: string;
  sourceRef?: string;
  evidenceRefs: readonly string[];
  itemCount?: number;
  cursor?: string;
  note?: string;
}

function validDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export class InformationWatchRegistry {
  private readonly states = new Map<string, InformationSourceState>();

  register(source: InformationSourceDescriptor): void {
    if (!source.sourceId.trim() || !source.name.trim())
      throw new Error('Information source identity is required');
    if (this.states.has(source.sourceId))
      throw new Error(`Information source already registered: ${source.sourceId}`);
    this.states.set(source.sourceId, {
      ...source,
      status: source.connected ? 'UNAVAILABLE' : 'DISCONNECTED',
      evidenceRefs: [],
    });
  }

  observe(observation: InformationSourceObservation): InformationSourceState {
    const state = this.states.get(observation.sourceId);
    if (!state) throw new Error(`Information source is not registered: ${observation.sourceId}`);
    if (!validDate(observation.checkedAt))
      throw new Error('Information source checkedAt must be a valid date');
    if (!observation.sourceRef.trim()) throw new Error('Information source sourceRef is required');
    if (
      observation.itemCount != null &&
      (!Number.isSafeInteger(observation.itemCount) || observation.itemCount < 0)
    ) {
      throw new Error('Information source itemCount must be a non-negative integer');
    }

    const next: InformationSourceState = {
      ...state,
      status: observation.status,
      checkedAt: observation.checkedAt,
      sourceRef: observation.sourceRef,
      evidenceRefs: [...(observation.evidenceRefs ?? [])],
      ...(observation.itemCount != null ? { itemCount: observation.itemCount } : {}),
      ...(observation.cursor ? { cursor: observation.cursor } : {}),
      ...(observation.note ? { note: observation.note } : {}),
    };
    this.states.set(state.sourceId, next);
    return { ...next, evidenceRefs: [...next.evidenceRefs] };
  }

  get(sourceId: string): InformationSourceState | undefined {
    const state = this.states.get(sourceId);
    return state ? { ...state, evidenceRefs: [...state.evidenceRefs] } : undefined;
  }

  list(): InformationSourceState[] {
    return [...this.states.values()]
      .sort((a, b) => a.sourceId.localeCompare(b.sourceId))
      .map((state) => ({ ...state, evidenceRefs: [...state.evidenceRefs] }));
  }

  size(): number {
    return this.states.size;
  }
}

export interface InformationSourceConstraint {
  sourceId: string;
  connectionStatus:
    | 'NOT_CONNECTED'
    | 'AUTH_REQUIRED'
    | 'ADMIN_APPROVAL_REQUIRED'
    | 'POLICY_LIMITED';
  requirement: string;
}

export const INFORMATION_WATCH_SOURCES: readonly InformationSourceDescriptor[] = [
  {
    sourceId: 'reddit',
    name: 'Reddit',
    category: 'social',
    access: 'USER_AUTHENTICATED',
    connected: false,
    sourceUrl: 'https://www.reddit.com',
  },
  {
    sourceId: 'youtube',
    name: 'YouTube',
    category: 'video',
    access: 'USER_AUTHENTICATED',
    connected: false,
    sourceUrl: 'https://www.youtube.com',
  },
  {
    sourceId: 'discord',
    name: 'Discord',
    category: 'community',
    access: 'USER_AUTHENTICATED',
    connected: false,
    sourceUrl: 'https://discord.com',
  },
  {
    sourceId: 'instagram',
    name: 'Instagram',
    category: 'social',
    access: 'USER_AUTHENTICATED',
    connected: false,
    sourceUrl: 'https://www.instagram.com',
  },
  {
    sourceId: 'tgstat',
    name: 'TGStat',
    category: 'specialized',
    access: 'USER_AUTHENTICATED',
    connected: false,
    sourceUrl: 'https://tgstat.com',
  },
  {
    sourceId: 'fmhy',
    name: 'FMHY',
    category: 'web',
    access: 'PUBLIC_HTTP',
    connected: false,
    sourceUrl: 'https://fmhy.net',
  },
];

export const INFORMATION_WATCH_CONSTRAINTS: readonly InformationSourceConstraint[] = [
  {
    sourceId: 'reddit',
    connectionStatus: 'AUTH_REQUIRED',
    requirement:
      'External applications must use the supported Reddit developer authentication path; do not scrape reddit.com directly.',
  },
  {
    sourceId: 'youtube',
    connectionStatus: 'AUTH_REQUIRED',
    requirement: 'YouTube Data API credentials are required for programmatic search.',
  },
  {
    sourceId: 'discord',
    connectionStatus: 'AUTH_REQUIRED',
    requirement: 'Use an authorized Discord bot/application; never automate a normal user account.',
  },
  {
    sourceId: 'instagram',
    connectionStatus: 'POLICY_LIMITED',
    requirement:
      'Use an officially authorized Meta/Instagram API integration; do not automate collection from instagram.com.',
  },
  {
    sourceId: 'tgstat',
    connectionStatus: 'AUTH_REQUIRED',
    requirement: 'Use TGStat API credentials and respect the selected plan/quota.',
  },
  {
    sourceId: 'fmhy',
    connectionStatus: 'NOT_CONNECTED',
    requirement:
      'Public web source; configure and verify a current feed endpoint before marking a live feed active.',
  },
];

export interface InformationWatchAdapter {
  readonly descriptor: InformationSourceDescriptor;
  check(): Promise<InformationSourceObservation>;
}

export interface InformationWatchRunnerOptions {
  maxSourcesPerPass?: number;
}

export class InformationWatchRunner {
  readonly registry: InformationWatchRegistry;
  private readonly maxSourcesPerPass: number;

  constructor(
    registry: InformationWatchRegistry = new InformationWatchRegistry(),
    options: InformationWatchRunnerOptions = {},
  ) {
    this.registry = registry;
    this.maxSourcesPerPass = Math.min(
      Number.isSafeInteger(options.maxSourcesPerPass) && (options.maxSourcesPerPass ?? 0) > 0
        ? options.maxSourcesPerPass!
        : 25,
      25,
    );
  }

  registerAdapters(adapters: readonly InformationWatchAdapter[]): void {
    if (adapters.length > this.maxSourcesPerPass)
      throw new Error('Information source watch limit exceeded');
    for (const adapter of adapters) {
      if (this.registry.get(adapter.descriptor.sourceId)) continue;
      this.registry.register(adapter.descriptor);
    }
  }

  async run(adapters: readonly InformationWatchAdapter[]): Promise<InformationSourceState[]> {
    if (adapters.length > this.maxSourcesPerPass)
      throw new Error('Information source watch limit exceeded');
    this.registerAdapters(adapters);
    const states: InformationSourceState[] = [];
    for (const adapter of adapters) {
      try {
        states.push(this.registry.observe(await adapter.check()));
      } catch (error) {
        states.push(
          this.registry.observe({
            sourceId: adapter.descriptor.sourceId,
            checkedAt: new Date().toISOString(),
            status: 'UNAVAILABLE',
            sourceRef: `watch:${adapter.descriptor.sourceId}:error`,
            note: error instanceof Error ? error.message : 'Unknown source watch failure',
          }),
        );
      }
    }
    return states;
  }
}
