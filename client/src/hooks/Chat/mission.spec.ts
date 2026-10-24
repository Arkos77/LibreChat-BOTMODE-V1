import { getBotModeSearchParams } from './mission';

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
