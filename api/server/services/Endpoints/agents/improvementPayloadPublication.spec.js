const { createImprovementPayloadDigest } = require('@librechat/api');
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

function baseInput(update) {
  return {
    req: { user: { id: 'user-1', role: 'user' } },
    disposition: acceptedDisposition(),
    operation: 'update',
    actorId: 'user-1',
    skillId: 'skill-1',
    expectedVersion: 7,
    update,
  };
}

describe('controlled publication payload digest binding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes the canonical update digest into authorization', async () => {
    const update = { description: 'Improved skill description long enough.' };
    const payloadDigest = createImprovementPayloadDigest(update);
    authorizeImprovementPublicationForRequest.mockResolvedValue({
      candidateId: 'candidate-skill',
      traceId: 'trace-1',
      target: 'skill',
      operation: 'update',
      actorId: 'user-1',
      skillId: 'skill-1',
      expectedVersion: 7,
      payloadDigest,
      publicationPath: 'native-skill-authoring-required',
      authorized: true,
      publishable: true,
    });
    const updateSkill = jest.fn(async () => ({ status: 'updated', skill: { version: 8 } }));
    getSkillToolDeps.mockReturnValue({ updateSkill });

    await publishImprovementSkillUpdateForRequest(baseInput(update));

    expect(authorizeImprovementPublicationForRequest).toHaveBeenCalledWith(
      expect.objectContaining({ payloadDigest }),
    );
  });

  it('rejects a substituted payload before native mutation', async () => {
    const authorizedUpdate = { description: 'Authorized description long enough.' };
    const substitutedUpdate = { description: 'Substituted description long enough.' };
    authorizeImprovementPublicationForRequest.mockResolvedValue({
      candidateId: 'candidate-skill',
      traceId: 'trace-1',
      target: 'skill',
      operation: 'update',
      actorId: 'user-1',
      skillId: 'skill-1',
      expectedVersion: 7,
      payloadDigest: createImprovementPayloadDigest(authorizedUpdate),
      publicationPath: 'native-skill-authoring-required',
      authorized: true,
      publishable: true,
    });
    const updateSkill = jest.fn();
    getSkillToolDeps.mockReturnValue({ updateSkill });

    await expect(
      publishImprovementSkillUpdateForRequest(baseInput(substitutedUpdate)),
    ).rejects.toThrow(/payload/i);

    expect(updateSkill).not.toHaveBeenCalled();
  });
});
