import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input } from '@librechat/client';
import { dataService } from 'librechat-data-provider';
import { PermissionBits } from 'librechat-data-provider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Lightbulb,
  ListTree,
  Plus,
  Trash2,
} from 'lucide-react';
import type { TIdea } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks/useLocalize';
import { subagentStatusDotClass, subagentStatusLabelKey } from '~/components/Chat/Subagents/status';
import { useBotModeProjectProjectionQuery, useParentSubagentsQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';

const MTO_STEPS = [
  'REQUESTED',
  'PLANNED',
  'DECIDED',
  'AUTHORIZED',
  'COMMITTED',
  'SETTLED',
] as const;

function IdeaConversationSubagents({ conversationId }: { conversationId: string }) {
  const localize = useLocalize();
  const { data } = useParentSubagentsQuery(conversationId, {
    enabled: conversationId !== '',
    refetchInterval: 5_000,
  });
  const subagents = data?.children ?? [];
  if (subagents.length === 0) return null;
  return (
    <>
      {subagents.map((subagent) => (
        <div
          key={subagent.threadId}
          className="flex items-center gap-2 rounded-xl border border-border-light px-3 py-2 text-xs"
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${subagentStatusDotClass(subagent.status)}`}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
            {subagent.title}
          </span>
          <span className="shrink-0 text-text-tertiary">
            {localize(subagentStatusLabelKey(subagent.status))}
          </span>
        </div>
      ))}
    </>
  );
}

function IdeaMissionView({ idea }: { idea: TIdea }) {
  const localize = useLocalize();
  const { data: projection, isLoading } = useBotModeProjectProjectionQuery(idea.projectId, {
    enabled: Boolean(idea.projectId),
    refetchInterval:
      idea.status === 'in_analysis' || idea.status === 'in_progress' ? 15_000 : false,
  });
  const projectConversationIds =
    projection?.conversations
      .map((conversation) => conversation.conversationId)
      .filter((conversationId): conversationId is string => Boolean(conversationId)) ?? [];

  const evidence =
    projection?.conversations.flatMap((conversation) =>
      conversation.traces.flatMap((trace) => trace.observations),
    ) ?? [];
  const plans =
    projection?.conversations.flatMap((conversation) =>
      conversation.plans.map((entry) => entry.plan),
    ) ?? [];
  const results =
    projection?.conversations.flatMap((conversation) => conversation.results ?? []) ?? [];
  const tasks = plans.flatMap((plan) => plan.tasks);
  const latestMto = [...evidence]
    .reverse()
    .find((observation) => MTO_STEPS.includes(observation.type as (typeof MTO_STEPS)[number]));
  const stepIndex = latestMto?.type
    ? MTO_STEPS.indexOf(latestMto.type as (typeof MTO_STEPS)[number])
    : -1;
  const progress = stepIndex >= 0 ? Math.round(((stepIndex + 1) / MTO_STEPS.length) * 100) : 0;
  let missionLabelKey: TranslationKeys = 'com_ui_bot_mode_idea_state_ready';
  if (idea.status === 'in_analysis') missionLabelKey = 'com_ui_bot_mode_idea_state_analysis';
  else if (idea.status === 'in_progress') missionLabelKey = 'com_ui_bot_mode_idea_state_developing';
  else if (latestMto?.type === 'SETTLED') missionLabelKey = 'com_ui_bot_mode_idea_state_completed';
  else if (idea.status === 'done') missionLabelKey = 'com_ui_bot_mode_project_state_settled';
  const missionLabel = localize(missionLabelKey);

  if (!idea.projectId) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-border-light px-4 py-3 text-xs text-text-secondary">
        {localize('com_ui_bot_mode_idea_tracking_unavailable')}
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-border-light bg-surface-secondary/30">
      <div className="flex items-center justify-between gap-3 border-b border-border-light px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-secondary">
            <Bot className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-text-primary">
              {localize('com_ui_bot_mode_project_activity')}
            </div>
            <div className="truncate text-xs text-text-secondary">{missionLabel}</div>
          </div>
        </div>
        <div className="shrink-0 text-xs font-medium tabular-nums text-text-secondary">
          {progress}%
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-tertiary">
          <div
            className="h-full rounded-full bg-text-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-wide text-text-tertiary">
          {MTO_STEPS.map((step, index) => (
            <span key={step} className={index <= stepIndex ? 'text-text-primary' : ''}>
              {step}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-3 border-t border-border-light p-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border-light bg-surface-primary/40 p-3">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <ListTree className="h-3.5 w-3.5" aria-hidden="true" />
            {localize('com_ui_bot_mode_idea_workplan')}
          </div>
          <div className="mt-1 text-lg font-semibold text-text-primary">{plans.length}</div>
          <div className="text-[11px] text-text-tertiary">
            {localize('com_ui_bot_mode_idea_plan_task_count', {
              plans: plans.length,
              tasks: tasks.length,
            })}
          </div>
        </div>
        <div className="rounded-xl border border-border-light bg-surface-primary/40 p-3">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            {localize('com_ui_bot_mode_project_evidence')}
          </div>
          <div className="mt-1 text-lg font-semibold text-text-primary">
            {projection?.sources?.length ?? 0}
          </div>
          <div className="text-[11px] text-text-tertiary">
            {localize('com_ui_bot_mode_idea_evidence_count', {
              files: projection?.sources?.length ?? 0,
              events: evidence.length,
            })}
          </div>
        </div>
        <div className="rounded-xl border border-border-light bg-surface-primary/40 p-3">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            {localize('com_ui_bot_mode_idea_activity')}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-text-primary">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {latestMto?.type ?? (isLoading ? 'Chargement…' : 'En attente')}
          </div>
          <div className="text-[11px] text-text-tertiary">
            {localize('com_ui_bot_mode_idea_background')}
          </div>
        </div>
        <div className="rounded-xl border border-border-light bg-surface-primary/40 p-3">
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <Bot className="h-3.5 w-3.5" aria-hidden="true" />
            {localize('com_ui_bot_mode_idea_agents')}
          </div>
          <div className="mt-1 text-lg font-semibold text-text-primary">{plans.length}</div>
          <div className="text-[11px] text-text-tertiary">
            {localize('com_ui_bot_mode_idea_analysis_runs')}
          </div>
        </div>
      </div>

      {projectConversationIds.length > 0 && (
        <div className="border-t border-border-light px-4 py-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-text-primary">
            <Bot className="h-3.5 w-3.5" aria-hidden="true" />
            {localize('com_ui_bot_mode_idea_specialists')}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {projectConversationIds.map((conversationId) => (
              <IdeaConversationSubagents key={conversationId} conversationId={conversationId} />
            ))}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="border-t border-border-light px-4 py-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-text-primary">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            {localize('com_ui_bot_mode_project_results')}
          </div>
          <div className="space-y-2">
            {results
              .slice(-3)
              .reverse()
              .map((result) => (
                <article
                  key={result.messageId}
                  className="rounded-xl border border-border-light bg-surface-primary/30 px-3 py-3"
                >
                  <div className="mb-1 text-[11px] text-text-tertiary">{result.messageId}</div>
                  <div className="max-h-52 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-text-secondary">
                    {result.content}
                  </div>
                </article>
              ))}
          </div>
        </div>
      )}

      {plans.length > 0 && (
        <div className="border-t border-border-light px-4 py-3">
          <div className="mb-2 text-xs font-semibold text-text-primary">
            {localize('com_ui_bot_mode_project_plans')}
          </div>
          {plans
            .slice(-5)
            .reverse()
            .map((plan, index) => (
              <div key={index} className="mb-2 rounded-xl border border-border-light px-3 py-2">
                <div className="text-xs font-medium text-text-primary">{`v${plan.planVersion ?? index + 1}`}</div>
                <div className="text-xs text-text-secondary">{plan.objective}</div>
              </div>
            ))}
        </div>
      )}

      {(plans.length > 0 || evidence.length > 0) && (
        <div className="border-t border-border-light px-4 py-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-text-primary">
            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
            {localize('com_ui_bot_mode_idea_recent_activity')}
          </div>
          <div className="space-y-2">
            {evidence
              .slice(-3)
              .reverse()
              .map((event, index) => (
                <div
                  key={`${event.traceEventId ?? event.timestamp ?? index}`}
                  className="flex items-center gap-2 text-xs"
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-text-secondary"
                    aria-hidden="true"
                  />
                  <span className="font-medium text-text-primary">{event.type ?? 'EVENT'}</span>
                  <span className="truncate text-text-tertiary">{event.source ?? 'BOT MODE'}</span>
                  <ChevronRight
                    className="ml-auto h-3 w-3 shrink-0 text-text-tertiary"
                    aria-hidden="true"
                  />
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function IdeasView() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const ideas = useQuery(['ideas'], () => dataService.listIdeas(), { staleTime: 60_000 });
  const create = useMutation((x: { title: string; content: string }) => dataService.createIdea(x), {
    onSuccess: () => {
      setTitle('');
      setContent('');
      qc.invalidateQueries(['ideas']);
    },
  });
  const remove = useMutation((id: string) => dataService.deleteIdea(id), {
    onSuccess: () => qc.invalidateQueries(['ideas']),
  });
  const createIdeaProject = useMutation(
    (idea: TIdea) =>
      dataService.createProject({
        name: `BOT MODE — ${idea.title}`,
        description: idea.content,
      }),
    { onSuccess: (project) => navigate(`/projects/${project._id}`) },
  );

  const launchIdeaMission = useMutation({
    mutationFn: async ({ idea, mode }: { idea: TIdea; mode: 'analyze' | 'develop' | 'watch' }) => {
      const project = idea.projectId
        ? { _id: idea.projectId }
        : await dataService.createProject({
            name: `BOT MODE — ${idea.title}`,
            description: idea.content,
          });
      let status: TIdea['status'];
      let prefix: string;
      switch (mode) {
        case 'analyze':
          status = 'in_analysis';
          prefix = 'Analyse cette idée avec BOT MODE et produis un résultat vérifiable.';
          break;
        case 'develop':
          status = 'to_develop';
          prefix = 'Développe cette idée avec BOT MODE en produisant un plan vérifiable.';
          break;
        default:
          status = 'to_study';
          prefix = 'Lance une veille BOT MODE sur cette idée et produis un résultat vérifiable.';
      }
      await dataService.updateIdea({ ideaId: idea._id, status, projectId: project._id });
      return {
        projectId: project._id,
        prompt: `${prefix}\n\nIDÉE : ${idea.title}\n\nCONTENU : ${idea.content}`,
      };
    },
    onSuccess: async ({ projectId, prompt }, { mode }) => {
      const agentsResponse = await dataService.listAgents({
        requiredPermission: PermissionBits.EDIT,
        limit: 1000,
      });
      const agent =
        agentsResponse.data.find((item) => item.name?.trim() === 'BOT MODE Worker') ??
        agentsResponse.data[0];
      if (!agent?.id) return;
      const params = new URLSearchParams({
        projectId,
        chatProjectId: projectId,
        agent_id: agent.id,
        prompt,
        submit: 'true',
        botmode: '1',
        botmode_mode: mode,
      });
      navigate(`/c/new?${params.toString()}`);
    },
  });
  const update = useMutation(
    (x: { ideaId: string; status: TIdea['status'] }) => dataService.updateIdea(x),
    { onSuccess: () => qc.invalidateQueries(['ideas']) },
  );
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) create.mutate({ title: title.trim(), content });
  };
  return (
    <main className="h-full min-h-0 w-full overflow-y-auto overscroll-contain">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-6 p-6">
        <header>
          <div className="flex items-center gap-3">
            <Lightbulb className="size-7" />
            <h1 className="text-2xl font-semibold">{localize('com_ui_ideas')}</h1>
          </div>
          <p className="mt-1 text-sm text-text-secondary">{localize('com_ui_ideas_description')}</p>
        </header>
        <form onSubmit={submit} className="rounded-2xl border border-border-light p-4">
          <div className="flex gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={localize('com_ui_idea_title')}
            />
            <Button type="submit" disabled={create.isLoading}>
              <Plus className="mr-2 size-4" />
              {localize('com_ui_add_idea')}
            </Button>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={localize('com_ui_idea_content')}
            className="mt-3 min-h-28 w-full rounded-xl border border-border-light bg-transparent p-3"
          />
        </form>
        <section className="space-y-3">
          {ideas.data?.ideas.map((idea) => (
            <article key={idea._id} className="rounded-2xl border border-border-light p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-medium">{idea.title}</h2>
                  {idea.content && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-text-secondary">
                      {idea.content}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => remove.mutate(idea._id)}
                  aria-label={localize('com_ui_delete')}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => launchIdeaMission.mutate({ idea, mode: 'analyze' })}
                >
                  {localize('com_ui_idea_analyze')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => launchIdeaMission.mutate({ idea, mode: 'develop' })}
                >
                  {localize('com_ui_idea_develop')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => launchIdeaMission.mutate({ idea, mode: 'watch' })}
                >
                  {localize('com_ui_idea_watch')}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    if (idea.projectId) navigate(`/projects/${idea.projectId}`);
                    else createIdeaProject.mutate(idea);
                  }}
                  disabled={createIdeaProject.isLoading}
                >
                  {localize('com_ui_idea_project')}
                </Button>
              </div>
              <IdeaMissionView idea={idea} />
              <div className="mt-4 flex flex-wrap gap-2">
                <select
                  value={idea.status}
                  onChange={(e) =>
                    update.mutate({ ideaId: idea._id, status: e.target.value as TIdea['status'] })
                  }
                  className="rounded-lg border border-border-light bg-transparent px-2 py-1 text-sm"
                >
                  {[
                    ['new', 'Nouvelle'],
                    ['to_study', 'À étudier'],
                    ['in_analysis', 'En analyse'],
                    ['solution_proposed', 'Solution proposée'],
                    ['to_develop', 'À développer'],
                    ['in_progress', 'En cours'],
                    ['done', 'Terminée'],
                    ['archived', 'Archivée'],
                  ].map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <span className="rounded-lg bg-surface-secondary px-2 py-1 text-xs">
                  {idea.priority}
                </span>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
