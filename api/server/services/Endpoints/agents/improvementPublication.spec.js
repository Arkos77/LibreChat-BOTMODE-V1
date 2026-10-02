const { createImprovementPayloadDigest } = require('@librechat/api');
const {
  publishImprovementSkillCreateForRequest,
  publishImprovementSkillUpdateForRequest,
} = require('./improvementPublication');
const { authorizeImprovementPublicationForRequest } = require('./improvementAuthorization');
const { getSkillToolDeps } = require('./skillDeps');

jest.mock('./improvementAuthorization', () => ({
  authorizeImprovementPublicationForRequest: jest.fn(),
}));

jest.mock('./skillDeps', () => {
  const actual = jest.requireActual('./skillDeps');
  return {
    ...actual,
    getSkillToolDeps: jest.fn(),
  };
});

function acceptedDisposition() {
  return {
    candidateId: 'candidate-skill',
    traceId: 'trace-1',
    target: 'skill',
    oracleDecision: 'ACCEPT',
    disposition: 'AUTHORIZATION_REQUIRED',
    publicationPath: 'native-skill-authoring-required',
    authorized: false,
    publishable: false,
    requiresHumanReview: false,
  };
}

const DEFAULT_UPDATE = { description: 'Improved skill description long enough.' };
const DEFAULT_PAYLOAD_DIGEST = createImprovementPayloadDigest(DEFAULT_UPDATE);

function input(overrides = {}) {
  return {
    req: { user: { id: 'user-1', role: 'user' } },
    disposition: acceptedDisposition(),
    operation: 'update',
    actorId: 'user-1',
    skillId: 'skill-1',
    expectedVersion: 7,
    update: DEFAULT_UPDATE,
    ...overrides,
  };
}

function authorization(overrides = {}) {
  return {
    candidateId: 'candidate-skill',
    traceId: 'trace-1',
    target: 'skill',
    operation: 'update',
    actorId: 'user-1',
    skillId: 'skill-1',
    expectedVersion: 7,
    payloadDigest: DEFAULT_PAYLOAD_DIGEST,
    publicationPath: 'native-skill-authoring-required',
    authorized: true,
    publishable: true,
    ...overrides,
  };
}

describe('controlled improvement skill publication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('authorizes the exact payload first, then delegates native optimistic update', async () => {
    authorizeImprovementPublicationForRequest.mockResolvedValue(authorization());
    const updateSkill = jest.fn(async () => ({
      status: 'updated',
      skill: { _id: 'skill-1', version: 8 },
      warnings: [],
    }));
    const onAuthorized = jest.fn(async () => undefined);
    getSkillToolDeps.mockReturnValue({ updateSkill });

    const result = await publishImprovementSkillUpdateForRequest(input({ onAuthorized }));

    expect(authorizeImprovementPublicationForRequest).toHaveBeenCalledWith(
      expect.objectContaining({ payloadDigest: DEFAULT_PAYLOAD_DIGEST }),
    );
    expect(onAuthorized).toHaveBeenCalledWith(authorization());
    expect(onAuthorized.mock.invocationCallOrder[0]).toBeLessThan(
      updateSkill.mock.invocationCallOrder[0],
    );
    expect(updateSkill).toHaveBeenCalledTimes(1);
    expect(updateSkill).toHaveBeenCalledWith({
      id: 'skill-1',
      expectedVersion: 7,
      update: DEFAULT_UPDATE,
      improvementMutation: {
        candidateId: 'candidate-skill',
        payloadDigest: DEFAULT_PAYLOAD_DIGEST,
        expectedVersion: 7,
      },
    });
    expect(result.status).toBe('updated');
  });

  it('fails closed before native mutation when the durable authorization receipt cannot be recorded', async () => {
    authorizeImprovementPublicationForRequest.mockResolvedValue(authorization());
    const updateSkill = jest.fn();
    const onAuthorized = jest.fn(async () => {
      throw new Error('authorization journal unavailable');
    });
    getSkillToolDeps.mockReturnValue({ updateSkill });

    await expect(publishImprovementSkillUpdateForRequest(input({ onAuthorized }))).rejects.toThrow(
      /journal unavailable/i,
    );
    expect(onAuthorized).toHaveBeenCalledTimes(1);
    expect(updateSkill).not.toHaveBeenCalled();
  });

  it.each([
    ['candidateId', 'another-candidate'],
    ['traceId', 'another-trace'],
    ['actorId', 'another-actor'],
    ['skillId', 'another-skill'],
    ['expectedVersion', 8],
    ['operation', 'create'],
    ['target', 'workflow'],
    ['publicationPath', 'proposal-only'],
  ])('rejects mismatched authorization %s before native mutation', async (field, value) => {
    authorizeImprovementPublicationForRequest.mockResolvedValue(authorization({ [field]: value }));
    const updateSkill = jest.fn();
    getSkillToolDeps.mockReturnValue({ updateSkill });
    await expect(publishImprovementSkillUpdateForRequest(input())).rejects.toThrow(
      /authorization/i,
    );
    expect(getSkillToolDeps).not.toHaveBeenCalled();
    expect(updateSkill).not.toHaveBeenCalled();
  });

  it.each([
    { source: 'deployment' },
    { sourceMetadata: { origin: 'untrusted' } },
    { allowedTools: ['unsafe'] },
    {},
  ])(
    'rejects fields outside native PATCH skill payload before authorization: %p',
    async (update) => {
      const updateSkill = jest.fn();
      getSkillToolDeps.mockReturnValue({ updateSkill });
      await expect(publishImprovementSkillUpdateForRequest(input({ update }))).rejects.toThrow(
        /skill update|payload|field/i,
      );
      expect(authorizeImprovementPublicationForRequest).not.toHaveBeenCalled();
      expect(updateSkill).not.toHaveBeenCalled();
    },
  );

  it('blocks skill content rejected by native skill policy before mutation', async () => {
    const update = { description: 'Improved skill with PRIVATE-123 inside.' };
    authorizeImprovementPublicationForRequest.mockResolvedValue(
      authorization({
        payloadDigest: createImprovementPayloadDigest(update),
      }),
    );
    const updateSkill = jest.fn();
    getSkillToolDeps.mockReturnValue({ updateSkill });
    const req = {
      user: { id: 'user-1', role: 'user' },
      config: {
        filters: {
          skills: {
            pii: {
              customPatterns: [
                { id: 'private_token', label: 'private token', regex: 'PRIVATE-\\d+' },
              ],
            },
          },
        },
      },
    };
    await expect(
      publishImprovementSkillUpdateForRequest(
        input({
          req,
          update,
          disposition: {
            ...acceptedDisposition(),
            payloadDigest: createImprovementPayloadDigest(update),
          },
        }),
      ),
    ).rejects.toThrow(/content|filter|policy/i);
    expect(updateSkill).not.toHaveBeenCalled();
  });

  it('does not mutate when authorization is not publishable', async () => {
    authorizeImprovementPublicationForRequest.mockResolvedValue(
      authorization({ authorized: false, publishable: false }),
    );
    const updateSkill = jest.fn();
    getSkillToolDeps.mockReturnValue({ updateSkill });

    await expect(publishImprovementSkillUpdateForRequest(input())).rejects.toThrow();
    expect(updateSkill).not.toHaveBeenCalled();
  });

  it.each([
    ['conflict', { status: 'conflict', current: { _id: 'skill-1', version: 8 } }],
    ['not_found', { status: 'not_found' }],
  ])(
    'preserves native %s result without translating it into success',
    async (_name, nativeResult) => {
      authorizeImprovementPublicationForRequest.mockResolvedValue(authorization());
      const updateSkill = jest.fn(async () => nativeResult);
      getSkillToolDeps.mockReturnValue({ updateSkill });

      const result = await publishImprovementSkillUpdateForRequest(input());
      expect(result).toEqual(nativeResult);
    },
  );

  it('rejects an authorization bound to a different payload before mutation', async () => {
    authorizeImprovementPublicationForRequest.mockResolvedValue(
      authorization({
        payloadDigest: createImprovementPayloadDigest({
          description: 'Different authorized body.',
        }),
      }),
    );
    const updateSkill = jest.fn();
    getSkillToolDeps.mockReturnValue({ updateSkill });

    await expect(publishImprovementSkillUpdateForRequest(input())).rejects.toThrow(/payload/i);
    expect(updateSkill).not.toHaveBeenCalled();
  });

  it('keeps create closed before authorization or native mutation lookup', async () => {
    const updateSkill = jest.fn();
    getSkillToolDeps.mockReturnValue({ updateSkill });

    await expect(
      publishImprovementSkillUpdateForRequest(input({ operation: 'create' })),
    ).rejects.toThrow();

    expect(authorizeImprovementPublicationForRequest).not.toHaveBeenCalled();
    expect(getSkillToolDeps).not.toHaveBeenCalled();
    expect(updateSkill).not.toHaveBeenCalled();
  });
});

describe('controlled improvement skill create publication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates the exact authorized payload at the preallocated id and proves owner ACL', async () => {
    const create = {
      name: 'new-skill',
      description: 'New governed skill.',
      body: '# New skill',
    };
    const payloadDigest = createImprovementPayloadDigest(create);
    const skillId = '68df12a7d43d9b79b2b5a001';
    const createSkill = jest.fn(async (_data, options) => ({
      skill: { _id: options.skillId, version: 1 },
      warnings: [],
    }));
    const grantSkillOwner = jest.fn(async () => ({}));
    const hasSkillOwner = jest.fn(async () => true);
    getSkillToolDeps.mockReturnValue({ createSkill, grantSkillOwner, hasSkillOwner });

    const result = await publishImprovementSkillCreateForRequest({
      req: {
        user: {
          id: '68df12a7d43d9b79b2b5a010',
          _id: '68df12a7d43d9b79b2b5a010',
          name: 'Owner',
          tenantId: 'tenant-1',
        },
        config: {},
      },
      candidateId: 'candidate-skill',
      payloadDigest,
      skillId,
      create,
    });

    expect(createSkill).toHaveBeenCalledTimes(1);
    expect(createSkill.mock.calls[0][0]).toEqual({
      ...create,
      author: '68df12a7d43d9b79b2b5a010',
      authorName: 'Owner',
      tenantId: 'tenant-1',
    });
    expect(createSkill.mock.calls[0][1].skillId.toString()).toBe(skillId);
    expect(createSkill.mock.calls[0][1].improvementMutation).toEqual({
      operation: 'create',
      candidateId: 'candidate-skill',
      payloadDigest,
    });
    expect(grantSkillOwner).toHaveBeenCalledWith({
      req: expect.any(Object),
      skillId,
    });
    expect(hasSkillOwner).toHaveBeenCalledWith({
      req: expect.any(Object),
      skillId,
    });
    expect(result).toMatchObject({ status: 'created', skillId });
  });

  it('leaves a receipt-bearing created skill recoverable when owner grant fails', async () => {
    const create = {
      name: 'new-skill',
      description: 'New governed skill.',
      body: '# New skill',
    };
    const skillId = '68df12a7d43d9b79b2b5a001';
    const createSkill = jest.fn(async (_data, options) => ({
      skill: { _id: options.skillId, version: 1 },
      warnings: [],
    }));
    const grantSkillOwner = jest.fn(async () => {
      throw new Error('owner acl unavailable');
    });
    const hasSkillOwner = jest.fn();
    getSkillToolDeps.mockReturnValue({ createSkill, grantSkillOwner, hasSkillOwner });

    await expect(
      publishImprovementSkillCreateForRequest({
        req: {
          user: {
            id: '68df12a7d43d9b79b2b5a010',
            _id: '68df12a7d43d9b79b2b5a010',
            name: 'Owner',
          },
          config: {},
        },
        candidateId: 'candidate-skill',
        payloadDigest: createImprovementPayloadDigest(create),
        skillId,
        create,
      }),
    ).rejects.toThrow('owner acl unavailable');

    expect(createSkill).toHaveBeenCalledTimes(1);
    expect(hasSkillOwner).not.toHaveBeenCalled();
  });
});
