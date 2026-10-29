export function getBotModeSearchParams(current: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams();
  if (current.get('botmode') !== '1') return next;
  for (const key of [
    'botmode',
    'botmode_mode',
    'botmode_agent_mode',
    'botmode_agent_bindings',
    'agent_id',
  ]) {
    const value = current.get(key);
    if (value != null) next.set(key, value);
  }
  return next;
}
