/**
 * Generation-fenced native mission side-effect journal.
 *
 * A crash after an external action but before receipt commit is UNKNOWN, not
 * safe to retry. These atomic operations deliberately never turn a started
 * receipt back into a fresh reservation, even for the same owner.
 *
 * Stored inside the existing generation's Redis job hash. No second scheduler,
 * no tool execution, no external provider call, no Oracle publication.
 * Tool adapters must supply stable SHA-256 identities and verify private
 * result references. This module alone is not wired to the execution path.
 */
export interface NativeMissionEffectIdentity {
  streamId: string;
  createdAt: number;
  checkpointNamespace: string;
  providerExecutionId: string;
  /** Empty for a live original provider, opaque owner token after takeover. */
  recoveryOwnerToken: string;
  /** SHA-256 of the exact canonical operation identity. */
  operationKey: string;
  /** SHA-256 of filtered canonical operation arguments. */
  argumentsDigest: string;
}

export interface NativeMissionEffectCommit extends NativeMissionEffectIdentity {
  /** Authenticated immutable result pointer; result bytes are not stored here. */
  resultRef: string;
  resultDigest: string;
}

export interface NativeMissionEffectOutcome {
  accepted: boolean;
  reason: string;
}

export const MISSION_EFFECT_MAX_RECORDS: number = 256;

/** KEYS [job, claim], ARGV [epoch, namespace, providerId, ownerToken,
 * operationDigest, argumentsDigest].
 * Provider lease and claim are checked against Redis server TIME.
 */
const MISSION_EFFECT_ACTIVE_OWNER_GUARD =
  'if redis.call("HGET", KEYS[1], "createdAt") ~= ARGV[1] then return {0,"epoch"} end ' +
  'if ARGV[2] == "" or redis.call("HGET", KEYS[1], "checkpointNamespace") ~= ARGV[2] then return {0,"scope"} end ' +
  'if redis.call("HGET", KEYS[1], "status") ~= "running" ' +
  'or redis.call("HGET", KEYS[1], "providerDrained") ~= "0" then return {0,"status"} end ' +
  'if redis.call("HGET", KEYS[1], "providerExecutionId") ~= ARGV[3] ' +
  'or redis.call("HGET", KEYS[1], "providerExecutionStartedId") ~= ARGV[3] ' +
  'or redis.call("HGET", KEYS[1], "__missionProviderLeaseIdentity") ~= ARGV[3] then return {0,"provider"} end ' +
  'local tm = redis.call("TIME") local now = tonumber(tm[1])*1000 + math.floor(tonumber(tm[2])/1000) ' +
  'local deadline = tonumber(redis.call("HGET", KEYS[1], "__missionProviderLeaseUntil") or "") ' +
  'if not deadline or deadline <= now then return {0,"lease"} end ' +
  'local owner = redis.call("HGET", KEYS[1], "__missionRecoveryOwner") ' +
  'if owner then ' +
  'if owner ~= ARGV[4] or redis.call("GET", KEYS[2]) ~= owner ' +
  'or redis.call("PTTL", KEYS[2]) <= 0 then return {0,"owner"} end ' +
  'elseif ARGV[4] ~= "" then return {0,"owner"} end ';

/** Reserve ONCE before entering an external side effect. No retry after crash. */
export const MISSION_EFFECT_RESERVE_LUA: string =
  MISSION_EFFECT_ACTIVE_OWNER_GUARD +
  'if string.len(ARGV[5]) ~= 64 or not string.match(ARGV[5],"^[0-9a-f]+$") ' +
  'or string.len(ARGV[6]) ~= 64 or not string.match(ARGV[6],"^[0-9a-f]+$") then return {0,"identity"} end ' +
  'if not redis.call("HGET", KEYS[1], "orchestratorPlan") then return {0,"plan"} end ' +
  'local field = "__nativeEffect:" .. ARGV[5] ' +
  'local raw = redis.call("HGET", KEYS[1], field) ' +
  'if raw then ' +
  'local ok, doc = pcall(cjson.decode, raw) ' +
  'if not ok or type(doc) ~= "table" or doc.operationKey ~= ARGV[5] ' +
  'or doc.argumentsDigest ~= ARGV[6] then return {0,"mismatch_or_corrupt"} end ' +
  'if doc.state == "committed" then return {0,"already_committed"} end ' +
  'return {0,"uncertain"} end ' +
  'local count = tonumber(redis.call("HGET", KEYS[1], "__nativeEffectCount") or "0") ' +
  'if not count or count >= 256 then return {0,"capacity"} end ' +
  'local doc = {state="started",operationKey=ARGV[5],argumentsDigest=ARGV[6], ' +
  'provider=ARGV[3],createdAt=now} ' +
  'redis.call("HSET", KEYS[1], field, cjson.encode(doc), "__nativeEffectCount", tostring(count+1)) ' +
  'return {1,"reserved"}';

/** Commit only a private durable output reference after it has been persisted.
 * ARGV [epoch, namespace, providerId, ownerToken, opDigest, argsDigest,
 * resultRef, resultDigest]. Never store raw tool payloads in this metadata.
 */
export const MISSION_EFFECT_COMMIT_LUA: string =
  MISSION_EFFECT_ACTIVE_OWNER_GUARD +
  'if string.len(ARGV[5]) ~= 64 or not string.match(ARGV[5],"^[0-9a-f]+$") ' +
  'or string.len(ARGV[6]) ~= 64 or not string.match(ARGV[6],"^[0-9a-f]+$") ' +
  'or string.len(ARGV[7]) == 0 or string.len(ARGV[7]) > 256 ' +
  'or string.len(ARGV[8]) ~= 64 or not string.match(ARGV[8],"^[0-9a-f]+$") then return {0,"identity"} end ' +
  'local field = "__nativeEffect:" .. ARGV[5] ' +
  'local raw = redis.call("HGET", KEYS[1], field) ' +
  'if not raw then return {0,"missing_intent"} end ' +
  'local ok, doc = pcall(cjson.decode, raw) ' +
  'if not ok or type(doc) ~= "table" or doc.operationKey ~= ARGV[5] ' +
  'or doc.argumentsDigest ~= ARGV[6] then return {0,"mismatch_or_corrupt"} end ' +
  'if doc.state == "committed" then ' +
  'if doc.resultRef == ARGV[7] and doc.resultDigest == ARGV[8] then return {1,"already_committed"} end ' +
  'return {0,"result_conflict"} end ' +
  'if doc.state ~= "started" or doc.provider ~= ARGV[3] then return {0,"uncertain"} end ' +
  'doc.state = "committed" doc.resultRef = ARGV[7] doc.resultDigest = ARGV[8] doc.committedAt = now ' +
  'redis.call("HSET", KEYS[1], field, cjson.encode(doc)) return {1,"committed"}';

/** Read only; no owner authorization. Host must authorize before exposing ref. */
export const MISSION_EFFECT_READ_LUA: string =
  'if redis.call("HGET", KEYS[1], "createdAt") ~= ARGV[1] or ' +
  'redis.call("HGET", KEYS[1], "checkpointNamespace") ~= ARGV[2] then return {0,"generation"} end ' +
  'local raw = redis.call("HGET", KEYS[1], "__nativeEffect:" .. ARGV[3]) ' +
  'if not raw then return {0,"missing"} end ' +
  'local ok, doc = pcall(cjson.decode, raw) ' +
  'if not ok or type(doc) ~= "table" or doc.operationKey ~= ARGV[3] ' +
  'or doc.argumentsDigest ~= ARGV[4] then return {0,"mismatch_or_corrupt"} end ' +
  'if doc.state == "committed" and type(doc.resultRef) == "string" and string.len(doc.resultRef) > 0 ' +
  'and string.len(doc.resultRef) <= 256 and type(doc.resultDigest) == "string" ' +
  'and string.len(doc.resultDigest) == 64 and string.match(doc.resultDigest,"^[0-9a-f]+$") ' +
  'then return {1,"committed",doc.resultRef,doc.resultDigest} end ' +
  'return {0,"uncertain"}';
