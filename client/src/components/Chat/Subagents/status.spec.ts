import { isLiveSubagentStatus, subagentStatusDotClass, subagentStatusLabelKey } from './status';

describe('subagent pause status presentation', () => {
  it('projects pause-requested and paused states explicitly', () => {
    expect(subagentStatusLabelKey('pause_requested')).toBe(
      'com_ui_subagent_thread_status_pause_requested',
    );
    expect(subagentStatusLabelKey('paused')).toBe('com_ui_subagent_thread_status_paused');
    expect(subagentStatusDotClass('pause_requested')).toBe('bg-status-info');
    expect(subagentStatusDotClass('paused')).toBe('bg-status-warning');
    expect(isLiveSubagentStatus('pause_requested')).toBe(true);
    expect(isLiveSubagentStatus('paused')).toBe(true);
  });
});
