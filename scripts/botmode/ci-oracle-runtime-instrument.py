#!/usr/bin/env python3
"""Ephemeral diagnostic instrumentation for exact PR14 source in CI only.

Important: the resulting Docker image is DIAGNOSTIC, NOT a release candidate.
Never modify the pinned commit or reuse its modified image for release proof.
"""
from pathlib import Path

file = Path("api/server/controllers/agents/client.js")
source = file.read_text()

anchor = """        await this.handleRunInterrupt(run, streamId);
        await this.assertTerminalMissionOracle(run);"""
replacement = """        await this.handleRunInterrupt(run, streamId);
        if (this.orchestratorPlan != null) {
          // Diagnostic metadata only. No prompt, output, secrets or agent IDs.
          let debugOutputs;
          let debugError = 'none';
          const instanceMethodType = typeof run?.getAgentOutputs;
          const graphMethodType = typeof run?.Graph?.getAgentOutputs;
          const sdkMethodType = typeof require('@librechat/agents').Run.prototype.getAgentOutputs;
          try {
            debugOutputs = run.getAgentOutputs();
          } catch (e) {
            const detail = String(e?.message ?? '').toLowerCase();
            debugError = detail.includes('getagentoutputs is not a function')
              ? 'METHOD_NOT_FUNCTION'
              : detail.includes('getagentoutputs') && detail.includes('not') 
              ? 'METHOD_UNAVAILABLE'
              : detail.includes('graph not initialized') ? 'GRAPH_UNINITIALIZED'
              : e?.name === 'TypeError' ? 'TYPE_ERROR' : 'GET_OUTPUT_EXCEPTION';
          }
          const expectedNodes = this.orchestratorPlan.tasks
            .filter((task) => task.validation.length > 0)
            .map((task) => task.nodeId);
          const actualOutputs = debugOutputs && typeof debugOutputs === 'object'
            ? debugOutputs : {};
          const missing = expectedNodes.filter((id) =>
            !Object.prototype.hasOwnProperty.call(actualOutputs, id));
          const firstOutput = actualOutputs[expectedNodes[0]];
          const content = firstOutput?.content;
          logger.warn(
            'CI_ORACLE_DIAGNOSTIC_OUTPUT ' +
            'actual=' + Object.keys(actualOutputs).length +
            ' expected=' + expectedNodes.length +
            ' missing=' + missing.length +
            ' contentType=' + (Array.isArray(content) ? 'array' : typeof content) +
            ' nonempty=' + (typeof content === 'string' && content.trim().length > 0) +
            ' halted=' + (run.getHaltReason() != null) +
            ' interrupted=' + (run.getInterrupt() != null) +
            ' outputError=' + debugError +
            ' instanceMethod=' + instanceMethodType +
            ' graphMethod=' + graphMethodType +
            ' sdkMethod=' + sdkMethodType
          );
        }
        await this.assertTerminalMissionOracle(run);"""
if source.count(anchor) != 1:
    raise SystemExit("CI_INSTRUMENT_ANCHOR_MISSING")
source = source.replace(anchor, replacement, 1)

anchor2 = """    } catch (error) {
      /** Mission Oracle failures are terminal QA failures, not ordinary provider errors."""
replacement2 = """    } catch (error) {
      // Safe, finite error classification; never log the exception or its text.
      const msg = String(error?.message ?? '').toLowerCase();
      const diagnosticClass = msg.includes('missing exact task output') ? 'MISSING_OUTPUT'
        : msg.includes('result persistence verification') ? 'VERDICT_PERSISTENCE'
        : msg.includes('evidence persistence verification') ? 'EVIDENCE_PERSISTENCE'
        : msg.includes('oracle blocked task') ? 'VERDICT_BLOCKED'
        : msg.includes('result replay conflict') ? 'RESULT_REPLAY_CONFLICT'
        : msg.includes('mission oracle requires') ? 'INVALID_MISSION'
        : msg.includes('getagentoutputs') ? 'SDK_OUTPUT_METHOD'
        : msg.includes('cannot read') ? 'TYPE_ACCESS'
        : msg.includes('job') ? 'JOB_STORAGE'
        : 'OTHER';
      const safeErrorName = ['TypeError', 'RangeError', 'ReferenceError', 'Error']
        .includes(String(error?.name)) ? String(error?.name) : 'OTHER';
      logger.warn(
        'CI_ORACLE_DIAGNOSTIC_FAILURE class=' + diagnosticClass +
        ' name=' + safeErrorName +
        ' codePresent=' + (error?.code != null)
      );
      /** Mission Oracle failures are terminal QA failures, not ordinary provider errors."""
if source.count(anchor2) != 1:
    raise SystemExit("CI_INSTRUMENT_ORACLE_CATCH_ANCHOR_MISSING")
source = source.replace(anchor2, replacement2, 1)
file.write_text(source)
print("CI_DIAGNOSTIC_INSTRUMENTATION_APPLIED=true")
