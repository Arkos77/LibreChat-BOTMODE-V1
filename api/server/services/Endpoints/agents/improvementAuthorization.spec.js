const { authorizeImprovementPublicationForRequest } = require('./improvementAuthorization');
const { getSkillToolDeps } = require('./skillDeps');

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

describe('request-backed improvement authorization binding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates capability and EDIT checks to native skillDeps for the current request', async () => {
    const req = { user: { id: 'user-1', role: 'user' } };
    const canCreateSkill = jest.fn(async ({ req: actualReq }) => actualReq === req);
    const canEditSkill = jest.fn(async ({ req: actualReq, skillId }) => {
      return actualReq === req && skillId === 'skill-1';
    });
    getSkillToolDeps.mockReturnValue({ canCreateSkill, canEditSkill });

    const result = await authorizeImprovementPublicationForRequest({
      req,
      disposition: acceptedDisposition(),
      operation: 'update',
      actorId: 'user-1',
      skillId: 'skill-1',
      expectedVersion: 7,
    });

    expect(canCreateSkill).toHaveBeenCalledTimes(1);
    expect(canCreateSkill).toHaveBeenCalledWith({ req });
    expect(canEditSkill).toHaveBeenCalledTimes(1);
    expect(canEditSkill).toHaveBeenCalledWith({ req, skillId: 'skill-1' });
    expect(result.authorized).toBe(true);
    expect(result.publishable).toBe(true);
  });

  it('short-circuits EDIT when native create capability denies', async () => {
    const req = { user: { id: 'user-1', role: 'user' } };
    const canCreateSkill = jest.fn(async () => false);
    const canEditSkill = jest.fn(async () => true);
    getSkillToolDeps.mockReturnValue({ canCreateSkill, canEditSkill });

    const result = await authorizeImprovementPublicationForRequest({
      req,
      disposition: acceptedDisposition(),
      operation: 'update',
      actorId: 'user-1',
      skillId: 'skill-1',
      expectedVersion: 7,
    });

    expect(canCreateSkill).toHaveBeenCalledTimes(1);
    expect(canEditSkill).not.toHaveBeenCalled();
    expect(result.authorized).toBe(false);
    expect(result.publishable).toBe(false);
  });

  it('fails closed when actor identity does not match the request user', async () => {
    const req = { user: { id: 'user-1', role: 'user' } };
    const canCreateSkill = jest.fn(async () => true);
    const canEditSkill = jest.fn(async () => true);
    getSkillToolDeps.mockReturnValue({ canCreateSkill, canEditSkill });

    await expect(
      authorizeImprovementPublicationForRequest({
        req,
        disposition: acceptedDisposition(),
        operation: 'update',
        actorId: 'user-2',
        skillId: 'skill-1',
        expectedVersion: 7,
      }),
    ).rejects.toThrow();

    expect(canCreateSkill).not.toHaveBeenCalled();
    expect(canEditSkill).not.toHaveBeenCalled();
  });

  it('keeps create closed at this binding', async () => {
    const req = { user: { id: 'user-1', role: 'user' } };
    const canCreateSkill = jest.fn(async () => true);
    const canEditSkill = jest.fn(async () => true);
    getSkillToolDeps.mockReturnValue({ canCreateSkill, canEditSkill });

    await expect(
      authorizeImprovementPublicationForRequest({
        req,
        disposition: acceptedDisposition(),
        operation: 'create',
        actorId: 'user-1',
      }),
    ).rejects.toThrow();

    expect(canCreateSkill).not.toHaveBeenCalled();
    expect(canEditSkill).not.toHaveBeenCalled();
  });
});
