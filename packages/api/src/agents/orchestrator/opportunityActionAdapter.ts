import { CREATE_FILE_TOOL_NAME } from '../tools';
import type { OpportunityTaskDispatchRequest } from './opportunityTaskDispatcher';

export interface OpportunityActionInput {
  path: string;
  content: string;
  overwrite?: boolean;
}

export type OpportunityActionInvoker = (
  toolName: typeof CREATE_FILE_TOOL_NAME,
  input: OpportunityActionInput,
  request: OpportunityTaskDispatchRequest,
) => Promise<unknown>;

const ACTION_TO_TOOL = {
  draft: CREATE_FILE_TOOL_NAME,
} as const;

function assertDraftInput(input: OpportunityActionInput): void {
  if (typeof input.path !== 'string' || input.path.trim() === '') {
    throw new Error('Opportunity draft path is required');
  }
  if (typeof input.content !== 'string' || input.content.length === 0) {
    throw new Error('Opportunity draft content is required');
  }
  if (input.path.includes('..')) {
    throw new Error('Opportunity draft path may not escape its bounded workspace');
  }
}

export async function executeOpportunityAction(
  request: OpportunityTaskDispatchRequest,
  input: OpportunityActionInput,
  invoke: OpportunityActionInvoker,
): Promise<{ tool: typeof CREATE_FILE_TOOL_NAME; output: unknown }> {
  if (request.intent.actionId !== 'draft') {
    throw new Error('Unsupported opportunity action');
  }
  if (ACTION_TO_TOOL[request.intent.actionId] !== CREATE_FILE_TOOL_NAME) {
    throw new Error('Opportunity action mapping is invalid');
  }
  assertDraftInput(input);
  const output = await invoke(CREATE_FILE_TOOL_NAME, input, request);
  return { tool: CREATE_FILE_TOOL_NAME, output };
}
