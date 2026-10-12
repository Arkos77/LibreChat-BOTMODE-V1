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
          try {
            debugOutputs = run.getAgentOutputs();
          } catch (e) {
            debugError = e?.name === 'TypeError' ? 'TYPE_ERROR' : 'GET_OUTPUT_EXCEPTION';
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
          logger.warn('CI_ORACLE_DIAGNOSTIC_OUTPUT', {
            actualOutputCount: Object.keys(actualOutputs).length,
            expectedValidatedOutputCount: expectedNodes.length,
            missingValidatedOutputCount: missing.length,
            matchedContentType: Array.isArray(content) ? 'array' : typeof content,
            matchedContentNonEmpty: typeof content === 'string' && content.trim().length > 0,
            haltPresent: run.getHaltReason() != null,
            interruptPresent: run.getInterrupt() != null,
            getOutputsError: debugError,
          });
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
      logger.warn('CI_ORACLE_DIAGNOSTIC_FAILURE', {
        diagnosticClass,
        errorName: ['TypeError', 'RangeError', 'ReferenceError', 'Error']
          .includes(String(error?.name)) ? String(error?.name) : 'OTHER',
        errorCodePresent: error?.code != null,
      });
      /** Mission Oracle failures are terminal QA failures, not ordinary provider errors."""
if source.count(anchor2) != 1:
    raise SystemExit("CI_INSTRUMENT_ORACLE_CATCH_ANCHOR_MISSING")
source = source.replace(anchor2, replacement2, 1)
file.write_text(source)
print("CI_DIAGNOSTIC_INSTRUMENTATION_APPLIED=true")
