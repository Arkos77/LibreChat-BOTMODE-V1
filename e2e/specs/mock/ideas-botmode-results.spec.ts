import { expect, test } from '@playwright/test';

const linkedIdea = {
  _id: '665000000000000000000111',
  title: 'E2E Idée Oracle directement visible',
  content: 'Qualification de la fiche liée au projet',
  projectId: '665000000000000000000222',
  status: 'done',
  priority: 'normal',
};

const projectionPath = `/api/projects/${linkedIdea.projectId}/bot-mode`;
const publishedText = 'E2E_ORACLE_SETTLED_PUBLISHED_INSIDE_IDEA_20261019';

test.describe('BOT MODE Idea result visible in authenticated browser', () => {
  test('renders a linked project Oracle-settled result inside Ideas without navigating to a chat', async ({
    page,
  }) => {
    let projectionReads = 0;
    await page.route('**/api/ideas', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ideas: [linkedIdea] }),
      });
    });
    await page.route(`**${projectionPath}`, async (route) => {
      expect(route.request().method()).toBe('GET');
      projectionReads += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          projectId: linkedIdea.projectId,
          conversations: [
            {
              conversationId: '665000000000000000000333',
              usage: { input: 5, output: 12, cost: 0, costKnown: true },
              traces: [
                {
                  observations: [{ traceEventId: 'ci-oracle', type: 'SETTLED', source: 'oracle' }],
                },
              ],
              plans: [{ plan: { planVersion: 1, objective: 'Mission qualifiée', tasks: [] } }],
              results: [{ messageId: '665000000000000000000444', content: publishedText }],
              modelReceipts: [],
            },
          ],
          sources: [],
          totals: { input: 5, output: 12, cost: 0, costKnown: true },
          nextCursor: null,
        }),
      });
    });

    await page.goto('/ideas');
    await expect(page.getByRole('heading', { name: linkedIdea.title })).toBeVisible();
    await expect(page.getByText(publishedText)).toBeVisible({ timeout: 15000 });
    expect(projectionReads).toBeGreaterThan(0);
    await expect(page).toHaveURL(/\/ideas$/);
  });

  test('does not request or display project results for an Idea without projectId', async ({
    page,
  }) => {
    let projectionReads = 0;
    await page.route('**/api/ideas', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ideas: [{ ...linkedIdea, projectId: '', status: 'new' }] }),
      });
    });
    await page.route('**/api/projects/*/bot-mode', async (route) => {
      projectionReads += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          projectId: 'unauthorized-project',
          conversations: [
            {
              conversationId: 'other',
              traces: [],
              plans: [],
              results: [{ messageId: 'foreign', content: 'OTHER_PROJECT_PRIVATE_RESULT' }],
            },
          ],
        }),
      });
    });
    await page.goto('/ideas');
    await expect(page.getByRole('heading', { name: linkedIdea.title })).toBeVisible();
    expect(projectionReads).toBe(0);
    await expect(page.getByText('OTHER_PROJECT_PRIVATE_RESULT')).toHaveCount(0);
    await expect(page).toHaveURL(/\/ideas$/);
  });
});
