#!/usr/bin/env python3
"""Disposable proof of an SDK instance compatibility bridge for PR14 Oracle.

This instrument is NOT part of the immutable release candidate. The native SDK
Run method is borrowed only when the authorized host receives a different Run
implementation without the accessor; it still reads real model-backed output.
If both fail, Oracle must fail closed without publishing content.
"""
from pathlib import Path
path = Path('api/server/controllers/agents/client.js')
src = path.read_text()
needle = '''      await assertTerminalMissionTasksVerified(
        this.orchestratorPlan,
        run.getAgentOutputs(),
        this.missionOracleState,''';
replacement = '''      // SDK instance compatibility: the host's imported Run prototype may
      // expose the accessor while a distinct createRun-built instance does
      // not. Never invent output or bypass the deterministic Oracle.
      const oracleOutputReader = typeof run?.getAgentOutputs === 'function'
        ? run.getAgentOutputs.bind(run)
        : typeof Run?.prototype?.getAgentOutputs === 'function'
          ? Run.prototype.getAgentOutputs.bind(run)
          : null;
      if (oracleOutputReader == null) {
        throw new Error('Mission Oracle could not access SDK agent outputs');
      }
      const oracleOutputs = oracleOutputReader();
      if (oracleOutputs == null || typeof oracleOutputs !== 'object') {
        throw new Error('Mission Oracle SDK agent outputs unavailable');
      }
      await assertTerminalMissionTasksVerified(
        this.orchestratorPlan,
        oracleOutputs,
        this.missionOracleState,''';
if src.count(needle) != 1:
    raise SystemExit('CI_ORACLE_INSTANCE_BRIDGE_ANCHOR_UNEXPECTED')
path.write_text(src.replace(needle, replacement, 1))
print('CI_ORACLE_INSTANCE_BRIDGE_APPLIED=true')
