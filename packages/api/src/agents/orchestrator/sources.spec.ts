import { z } from 'zod';
import { DynamicStructuredTool } from '@librechat/agents/langchain/tools';
import { collectSearchSourceUrls, assertResearchToolAvailability } from './sources';
import { deterministicPlanner } from './planner';
import { prepareBotModeMission } from './output';

describe('native research source admission', () => {
  it('takes only structured source links and excludes failed searches', () => {
    expect(
      collectSearchSourceUrls({
        organic: [{ link: 'https://example.org/report', title: 'Report', position: 1 }],
        references: [{ link: 'https://other.example/source', type: 'link' }],
      }),
    ).toEqual(['https://example.org/report', 'https://other.example/source']);
    expect(
      collectSearchSourceUrls({
        error: 'failed',
        references: [{ link: 'https://fake.example', type: 'link' }],
      }),
    ).toEqual([]);
  });
  it('denies a research task whose authorized agent lacks web_search', () => {
    const plan = deterministicPlanner.planMission(
      prepareBotModeMission({
        missionId: 'mission',
        taskId: 'root',
        objective: 'Research',
        constraints: [],
        requiredCapabilities: ['web_search'],
      }),
      {
        worker: {
          id: 'worker',
          agentId: 'worker',
          role: 'worker',
          constraints: [],
          capabilities: ['web_search'],
        },
        specialists: [],
      },
    );
    expect(() => assertResearchToolAvailability(plan, [{ id: 'worker', tools: [] }])).toThrow(
      /BOTMODE_WEB_SEARCH_UNAVAILABLE/,
    );
    expect(() =>
      assertResearchToolAvailability(plan, [{ id: 'worker', tools: ['web_search'] }]),
    ).not.toThrow();
    const tool = new DynamicStructuredTool({
      name: 'web_search',
      description: 'Search',
      schema: z.object({ query: z.string() }),
      func: async () => '',
    });
    expect(() =>
      assertResearchToolAvailability(plan, [{ id: 'worker', tools: [tool] }]),
    ).not.toThrow();
    expect(() =>
      assertResearchToolAvailability(plan, [
        { id: 'worker', tools: [], toolDefinitions: [{ name: 'web_search' }] },
      ]),
    ).not.toThrow();
    expect(() =>
      assertResearchToolAvailability(plan, [
        {
          id: 'worker',
          tools: [],
          toolRegistry: new Map([['web_search', { name: 'web_search' }]]),
        },
      ]),
    ).not.toThrow();
  });
});
