import { getMissionProgress, MISSION_PHASES } from './BotModeProgressPanel';

describe('BOT MODE progress reflects durable records only', () => {
  it('shows no completed stages when no trace exists', () => {
    const state = getMissionProgress([]);
    expect(MISSION_PHASES).toHaveLength(6);
    expect(state.count).toBe(0);
    expect(state.verified).toBe(0);
    expect(state.recorded.size).toBe(0);
  });

  it('uses actual MTO events and counts Oracle verdicts only from Oracle', () => {
    const state = getMissionProgress([
      { type: 'REQUESTED', source: 'orchestrator' },
      { type: 'PLANNED', source: 'orchestrator' },
      { type: 'AUTHORIZED', source: 'orchestrator' },
      { type: 'VERIFIED', source: 'tool' },
      { type: 'VERIFIED', source: 'oracle' },
      { type: 'REJECTED', source: 'oracle' },
    ]);
    expect(state.latest).toBe('AUTHORIZED');
    expect(state.count).toBe(3);
    expect(state.recorded.has('DECIDED')).toBe(false);
    expect(state.verified).toBe(1);
    expect(state.rejected).toBe(1);
  });
});
