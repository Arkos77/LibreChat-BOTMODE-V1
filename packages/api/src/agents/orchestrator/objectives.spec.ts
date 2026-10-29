import { getBotModeObjectives } from './objectives';

describe('server-owned BOT MODE objectives', () => {
  it.each([
    ['analyze', false, ['research', 'analysis', 'synthesis'], ['analysis']],
    [
      'analyze',
      true,
      ['research', 'analysis', 'documentation', 'synthesis'],
      ['analysis', 'documentation'],
    ],
    [
      'develop',
      false,
      ['research', 'analysis', 'engineering', 'documentation', 'synthesis'],
      ['engineering', 'documentation'],
    ],
    ['watch', false, ['research', 'analysis', 'synthesis'], ['analysis']],
  ] as const)('preserves the %s graph (attachments=%s)', (mode, files, keys, dependencies) => {
    const tasks = getBotModeObjectives(mode, files);
    expect(tasks.map((task) => task.key)).toEqual(keys);
    expect(tasks[tasks.length - 1]?.dependsOn).toEqual(dependencies);
    expect(tasks.find((task) => task.key === 'research')).toMatchObject({
      requiredCapabilities: ['web_search'],
      dependsOn: [],
    });
    expect(tasks.find((task) => task.key === 'analysis')?.dependsOn).toEqual(['research']);
    if (tasks.some((task) => task.key === 'documentation')) {
      expect(tasks.find((task) => task.key === 'documentation')).toMatchObject({
        requiredCapabilities: ['file_search'],
        dependsOn: ['research'],
      });
    }
    if (mode === 'develop') {
      expect(tasks.find((task) => task.key === 'engineering')).toMatchObject({
        requiredCapabilities: ['execute_code'],
        dependsOn: ['analysis'],
      });
    }
  });

  it('does not leak recipe mutation across missions', () => {
    const first = getBotModeObjectives('analyze', false);
    first[1].dependsOn.length = 0;
    expect(getBotModeObjectives('analyze', false)[1].dependsOn).toEqual(['research']);
  });
});
