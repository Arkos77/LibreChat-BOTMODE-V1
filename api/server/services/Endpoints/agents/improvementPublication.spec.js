const { publishImprovementSkillUpdateForRequest } = require('./improvementPublication');
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

function input(overrides = {}) {
  return {
    req: { user: { id: 'user-1', role: 'user' } },
    disposition: acceptedDisposition(),
    operation: 'update',
    actorId: 'user-1',
    skillId: 'skill-1',
    expectedVersion: 7,
    update: { description: 'Improved skill description long enough.' },
    ...overrides,
  };
}

describe('controlled improvement skill publication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('authorizes first, then delegates the mutation to native updateSkill with optimistic concurrency', async () => {
    authorizeImprovementPublicationForRequest.mockResolvedValue({
      candidateId: 'candidate-skill',
      traceId: 'trace-1',
      target: 'skill',
      operation: 'update',
      actorId: 'user-1',
      skillId: 'skill-1',
      expectedVersion: 7,
      publicationPath: 'native-skill-authoring-required',
      authorized: true,
      publishable: true,
    });
    const updateSkill = jest.fn(async () => ({
      status: 'updated',
      skill: { _id: 'skill-1', version: 8 },
      warnings: [],
    }));
    getSkillToolDeps.mockReturnValue({ updateSkill });

    const result = await publishImprovementSkillUpdateForRequest(input());

    expect(authorizeImprovementPublicationForRequest).toHaveBeenCalledTimes(1);
    expect(updateSkill).toHaveBeenCalledTimes(1);
    expect(updateSkill).toHaveBeenCalledWith({
      id: 'skill-1',
      expectedVersion: 7,
      update: { description: 'Improved skill description long enough.' },
    });
    expect(result.status).toBe('updated');
  });

  it('does not mutate when authorization is not publishable', async () => {
    authorizeImprovementPublicationForRequest.mockResolvedValue({
      candidateId: 'candidate-skill',
      traceId: 'trace-1',
      target: 'skill',
      operation: 'update',
      actorId: 'user-1',
      skillId: 'skill-1',
      expectedVersion: 7,
      publicationPath: 'native-skill-authoring-required',
      authorized: false,
      publishable: false,
    });
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
      authorizeImprovementPublicationForRequest.mockResolvedValue({
        candidateId: 'candidate-skill',
        traceId: 'trace-1',
        target: 'skill',
        operation: 'update',
        actorId: 'user-1',
        skillId: 'skill-1',
        expectedVersion: 7,
        publicationPath: 'native-skill-authoring-required',
        authorized: true,
        publishable: true,
      });
      const updateSkill = jest.fn(async () => nativeResult);
      getSkillToolDeps.mockReturnValue({ updateSkill });

      const result = await publishImprovementSkillUpdateForRequest(input());
      expect(result).toEqual(nativeResult);
    },
  );

  it('keeps create closed before any native mutation lookup', async () => {
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
