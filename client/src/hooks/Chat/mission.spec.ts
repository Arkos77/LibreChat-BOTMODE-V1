import { getBotModeObjectives, getBotModeSearchParams } from './mission';

describe('BOT MODE navigation context', () => {
  it('keeps explicit FAST and agent identity without retaining one-shot launch parameters', () => {
    const current = new URLSearchParams({
      botmode: '1',
      botmode_mode: 'fast',
      agent_id: 'worker',
      prompt: 'launch once',
      q: 'search',
      submit: 'true',
    });
    expect(getBotModeSearchParams(current).toString()).toBe(
      'botmode=1&botmode_mode=fast&agent_id=worker',
    );
    expect(current.get('prompt')).toBe('launch once');
  });

  it.each(['', 'botmode_mode=analyze', 'botmode=0&botmode_mode=develop'])(
    'does not activate BOT MODE from %s',
    (search) => {
      expect(getBotModeSearchParams(new URLSearchParams(search)).toString()).toBe('');
    },
  );
});

describe('BOT MODE objective selection', () => {
  it('does not request code execution or document search for an ordinary analysis', () => {
    const objectives = getBotModeObjectives('analyze');
    expect(objectives.map((task) => task.key)).toEqual(['research', 'analysis', 'synthesis']);
    expect(objectives.flatMap((task) => task.requiredCapabilities)).not.toContain('execute_code');
    expect(objectives.flatMap((task) => task.requiredCapabilities)).not.toContain('file_search');
    expect(objectives.at(-1)?.dependsOn).toEqual(['analysis']);
  });

  it('adds document verification and its synthesis dependency when attachments exist', () => {
    const objectives = getBotModeObjectives('analyze', true);
    expect(objectives.map((task) => task.key)).toEqual([
      'research',
      'analysis',
      'documentation',
      'synthesis',
    ]);
    expect(objectives.at(-1)?.dependsOn).toEqual(['analysis', 'documentation']);
    expect(objectives.flatMap((task) => task.requiredCapabilities)).toContain('file_search');
    expect(objectives.flatMap((task) => task.requiredCapabilities)).not.toContain('execute_code');
  });

  it('retains the engineering and document work in explicit development mode', () => {
    const objectives = getBotModeObjectives('develop');
    expect(objectives.map((task) => task.key)).toEqual([
      'research',
      'analysis',
      'engineering',
      'documentation',
      'synthesis',
    ]);
    expect(objectives.at(-1)?.dependsOn).toEqual(['engineering', 'documentation']);
  });

  it('retains the research-analysis-synthesis watch path', () => {
    const objectives = getBotModeObjectives('watch');
    expect(objectives.map((task) => task.key)).toEqual(['research', 'analysis', 'synthesis']);
    expect(objectives.at(-1)?.dependsOn).toEqual(['analysis']);
  });
});
