import type { ToolEvidenceIntentDeclaration } from './toolEvidenceIntent';

interface TaskScope {
  nodeId: string;
  taskId: string;
  producerAgentId: string;
}
interface Scope {
  traceId: string;
  taskId: string;
  producerAgentId: string;
  declarations: ToolEvidenceIntentDeclaration[];
  collectSources?: true;
}
interface Configuration {
  traceId: string;
  declarations: (TaskScope & ToolEvidenceIntentDeclaration)[];
  sourceTasks?: TaskScope[];
}

export function createMissionEvidenceContext() {
  let scopes = new Map<string, Scope>();
  return {
    configure({ traceId, declarations, sourceTasks = [] }: Configuration): void {
      if (
        typeof traceId !== 'string' ||
        !traceId.trim() ||
        !Array.isArray(declarations) ||
        !Array.isArray(sourceTasks)
      ) {
        throw new Error('Invalid mission evidence configuration');
      }
      const next = new Map<string, Scope>();
      const add = (task: TaskScope): Scope => {
        if (
          ![task?.nodeId, task?.taskId, task?.producerAgentId].every(
            (value) => typeof value === 'string' && value.trim(),
          )
        ) {
          throw new Error('Invalid mission evidence identity');
        }
        const nodeId = task.nodeId.trim(),
          taskId = task.taskId.trim(),
          producerAgentId = task.producerAgentId.trim();
        const current = next.get(nodeId) ?? {
          traceId: traceId.trim(),
          taskId,
          producerAgentId,
          declarations: [],
        };
        if (current.taskId !== taskId || current.producerAgentId !== producerAgentId) {
          throw new Error('Mission evidence identity mismatch');
        }
        next.set(nodeId, current);
        return current;
      };
      for (const declaration of declarations) {
        add(declaration).declarations.push({
          toolName: declaration.toolName,
          criterionId: declaration.criterionId,
          expectedValue: declaration.expectedValue,
        });
      }
      for (const task of sourceTasks) add(task).collectSources = true;
      scopes = next;
    },
    resolve(nodeId?: string): Scope | undefined {
      if (typeof nodeId !== 'string' || !nodeId.trim()) return undefined;
      const scope = scopes.get(nodeId.trim());
      return scope == null ? undefined : structuredClone(scope);
    },
  };
}
