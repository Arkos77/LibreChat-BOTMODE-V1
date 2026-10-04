import { canExecuteSecurityLab, type SecurityLabScope } from './browserSecurity';

export type SecurityLabTool<Input = unknown, Output = unknown> = (input: Input) => Promise<Output>;

export interface SecurityLabExecutionResult<Output = unknown> {
  tool: string;
  output: Output;
}

export class SecurityLabExecutor {
  private active = 0;

  constructor(
    private readonly scope: SecurityLabScope,
    private readonly tools: ReadonlyMap<string, SecurityLabTool>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private assertRunnable(tool: string): void {
    if (!canExecuteSecurityLab(this.scope, this.now())) {
      throw new Error('Security lab scope is inactive or expired');
    }
    if (!this.scope.allowedTools.includes(tool)) {
      throw new Error('Tool is not allowed by security lab scope');
    }
    if (this.active >= this.scope.maxConcurrency) {
      throw new Error('Security lab maxConcurrency exceeded');
    }
    if (!this.tools.has(tool)) {
      throw new Error('Security lab tool is unavailable');
    }
  }

  async execute<Input = unknown, Output = unknown>(
    tool: string,
    input: Input,
  ): Promise<SecurityLabExecutionResult<Output>> {
    this.assertRunnable(tool);
    const handler = this.tools.get(tool) as SecurityLabTool<Input, Output>;
    this.active += 1;
    try {
      return { tool, output: await handler(input) };
    } finally {
      this.active -= 1;
    }
  }
}
