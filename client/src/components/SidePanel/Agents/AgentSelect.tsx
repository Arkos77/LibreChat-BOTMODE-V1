import { memo, useCallback, useEffect, useRef } from 'react';
import { EarthIcon, Network } from 'lucide-react';
import { ControlCombobox } from '@librechat/client';
import { useFormContext, Controller } from 'react-hook-form';
import { AgentCapabilities, defaultAgentFormValues } from 'librechat-data-provider';
import type { Agent, AgentCreateParams, StatefulCodeEnvironment } from 'librechat-data-provider';
import type { UseMutationResult, QueryObserverResult } from '@tanstack/react-query';
import type { TAgentCapabilities, AgentForm } from '~/common';
import { cn, createProviderOption, processAgentOption, getDefaultAgentFormValues } from '~/utils';
import { useLocalize, useAgentDefaultPermissionLevel } from '~/hooks';
import { mergeDirtyToolsWithServerActions } from './agentTools';
import { useListAgentsQuery } from '~/data-provider';

const keys = new Set(Object.keys(defaultAgentFormValues));

/**
 * The BOT MODE Worker is the orchestrator, not a specialist. Keep it in the
 * agent editor (so admins can still configure it), but provide a separate
 * selector and exclude it from the specialist combobox.
 */
export const isBotModeOrchestrator = (agent: { name?: string | null }): boolean =>
  agent.name?.trim() === 'BOT MODE Worker';

function AgentSelect({
  agentQuery,
  selectedAgentId = null,
  setCurrentAgentId,
  createMutation,
  defaultStatefulCodeEnvironment,
}: {
  selectedAgentId: string | null;
  agentQuery: QueryObserverResult<Agent>;
  setCurrentAgentId: React.Dispatch<React.SetStateAction<string | undefined>>;
  createMutation: UseMutationResult<Agent, Error, AgentCreateParams>;
  defaultStatefulCodeEnvironment: StatefulCodeEnvironment;
}) {
  const localize = useLocalize();
  const lastSelectedAgent = useRef<string | null>(null);
  const {
    control,
    getValues,
    reset,
    setValue,
    /** Subscribing dirtyFields is required for reset({ keepDirtyValues: true })
     * to preserve edits when an action mutation refreshes the agent query. */
    formState: { dirtyFields },
  } = useFormContext();
  const dirtyFieldsRef = useRef(dirtyFields);
  dirtyFieldsRef.current = dirtyFields;
  const permissionLevel = useAgentDefaultPermissionLevel();

  const { data: agents = null } = useListAgentsQuery(
    { requiredPermission: permissionLevel },
    {
      select: (res) =>
        res.data.map((agent) =>
          processAgentOption({
            agent: {
              ...agent,
              name: agent.name || agent.id,
            },
          }),
        ),
    },
  );

  const resetAgentForm = useCallback(
    (fullAgent: Agent, preserveDirtyValues = false) => {
      const isGlobal = fullAgent.isPublic ?? false;
      const update = {
        ...fullAgent,
        provider: createProviderOption(fullAgent.provider),
        label: fullAgent.name ?? '',
        value: fullAgent.id || '',
        icon: isGlobal ? <EarthIcon className={'icon-lg text-green-400'} /> : null,
      };

      const capabilities: TAgentCapabilities = {
        [AgentCapabilities.web_search]: false,
        [AgentCapabilities.file_search]: false,
        [AgentCapabilities.execute_code]: false,
        [AgentCapabilities.memory]: false,
        [AgentCapabilities.end_after_tools]: false,
        [AgentCapabilities.hide_sequential_outputs]: false,
        [AgentCapabilities.stateful_code_sessions]: false,
      };

      const agentTools: string[] = [];
      (fullAgent.tools ?? []).forEach((tool) => {
        if (capabilities[tool] !== undefined) {
          capabilities[tool] = true;
          return;
        }

        agentTools.push(tool);
      });

      const formValues: Partial<AgentForm & TAgentCapabilities> = {
        ...capabilities,
        agent: update,
        model: update.model,
        tools: agentTools,
        // Ensure the category is properly set for the form
        category: fullAgent.category || 'general',
        // Make sure support_contact is properly loaded
        support_contact: fullAgent.support_contact,
        avatar_file: null,
        avatar_preview: fullAgent.avatar?.filepath ?? '',
        avatar_action: null,
        stateful_code_environment: fullAgent.stateful_code_environment ?? 'user',
        code_environment_id: fullAgent.code_environment_id,
      };

      Object.entries(fullAgent).forEach(([name, value]) => {
        if (name === 'model_parameters') {
          formValues[name] = value;
          return;
        }

        if (capabilities[name] !== undefined) {
          formValues[name] = value;
          return;
        }

        if (
          name === 'agent_ids' &&
          Array.isArray(value) &&
          value.every((item) => typeof item === 'string')
        ) {
          formValues[name] = value;
          return;
        }

        if (
          name === 'skills' &&
          Array.isArray(value) &&
          value.every((item) => typeof item === 'string')
        ) {
          formValues[name] = value;
          return;
        }

        if (name === 'skills_enabled' && typeof value === 'boolean') {
          formValues[name] = value;
          return;
        }

        if (name === 'edges' && Array.isArray(value)) {
          formValues[name] = value;
          return;
        }

        if (name === 'subagents' && typeof value === 'object' && value !== null) {
          formValues[name] = value;
          return;
        }

        if (name === 'tool_options' && typeof value === 'object' && value !== null) {
          formValues[name] = value;
          return;
        }

        if (!keys.has(name)) {
          return;
        }

        if (name === 'recursion_limit' && typeof value === 'number') {
          formValues[name] = value;
          return;
        }

        if (typeof value !== 'number' && typeof value !== 'object') {
          formValues[name] = value;
        }
      });

      /** Legacy state from the removed Advanced kill switch: a non-empty
       * allowlist with the master flag off (or unset, for agents predating
       * the flag). The builder has no control left for it and the runtime
       * treats it as "no skills", yet the section would render the selection
       * as active. Normalize to enabled so the form matches what the UI
       * shows and a later save persists the displayed behavior. */
      if (
        Array.isArray(formValues.skills) &&
        formValues.skills.length > 0 &&
        formValues.skills_enabled !== true
      ) {
        formValues.skills_enabled = true;
      }

      const mergedDirtyTools =
        preserveDirtyValues && dirtyFieldsRef.current.tools != null
          ? mergeDirtyToolsWithServerActions(getValues('tools') ?? [], agentTools)
          : undefined;
      reset(formValues, { keepDirtyValues: preserveDirtyValues });
      if (mergedDirtyTools != null) {
        setValue('tools', mergedDirtyTools, { shouldDirty: true });
      }
    },
    [getValues, reset, setValue],
  );

  const onSelect = useCallback(
    (selectedId: string) => {
      const agentExists = !!(selectedId
        ? (agents ?? []).find((agent) => agent.id === selectedId)
        : undefined);

      createMutation.reset();
      if (!agentExists) {
        setCurrentAgentId(undefined);
        return reset(getDefaultAgentFormValues(defaultStatefulCodeEnvironment));
      }

      setCurrentAgentId(selectedId);
      const agent = agentQuery.data;
      if (!agent) {
        console.warn('Agent not found');
        return;
      }

      resetAgentForm(agent);
    },
    [
      agents,
      createMutation,
      setCurrentAgentId,
      agentQuery.data,
      resetAgentForm,
      reset,
      defaultStatefulCodeEnvironment,
    ],
  );

  useEffect(() => {
    if (agentQuery.data && agentQuery.isSuccess) {
      resetAgentForm(agentQuery.data, true);
    }
  }, [agentQuery.data, agentQuery.isSuccess, resetAgentForm]);

  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null;

    if (selectedAgentId === lastSelectedAgent.current) {
      return;
    }

    if (selectedAgentId != null && selectedAgentId !== '' && agents) {
      timerId = setTimeout(() => {
        lastSelectedAgent.current = selectedAgentId;
        onSelect(selectedAgentId);
      }, 5);
    }

    return () => {
      if (timerId) {
        clearTimeout(timerId);
      }
    };
  }, [selectedAgentId, agents, onSelect]);

  const createAgent = localize('com_ui_create_new_agent');
  const orchestrator = agents?.find(isBotModeOrchestrator);
  const specialists = orchestrator
    ? agents?.filter((agent) => !isBotModeOrchestrator(agent))
    : agents;
  const isOrchestratorSelected = orchestrator != null && selectedAgentId === orchestrator.id;

  return (
    <div className="flex w-full flex-col gap-2">
      {orchestrator != null && (
        <div className="rounded-lg border border-border-light bg-surface-secondary px-3 py-2">
          <div className="mb-1 text-xs font-semibold text-text-secondary">
            {localize('com_agents_botmode_orchestrator')}
          </div>
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-semibold hover:bg-surface-tertiary',
              isOrchestratorSelected ? 'text-text-primary' : 'text-text-secondary',
            )}
            onClick={() => orchestrator.id && onSelect(orchestrator.id)}
            aria-pressed={isOrchestratorSelected}
            aria-label={localize('com_agents_botmode_select_orchestrator')}
          >
            <Network className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">{orchestrator.name}</span>
          </button>
        </div>
      )}
      {orchestrator != null && (
        <div className="px-1 text-xs font-semibold text-text-secondary">
          {localize('com_agents_botmode_specialists')}
        </div>
      )}
      <Controller
        name="agent"
        control={control}
        render={({ field }) => (
          <ControlCombobox
            containerClassName="px-0"
            selectedValue={isOrchestratorSelected ? '' : (field?.value?.value ?? '') + ''}
            displayValue={isOrchestratorSelected ? '' : (field?.value?.label ?? '')}
            selectPlaceholder={
              isOrchestratorSelected
                ? localize('com_agents_botmode_select_specialist')
                : (field?.value?.value ?? createAgent)
            }
            iconSide="right"
            searchPlaceholder={localize('com_agents_search_name')}
            SelectIcon={isOrchestratorSelected ? undefined : field?.value?.icon}
            setValue={onSelect}
            items={
              specialists?.map((agent) => ({
                label: agent.name ?? '',
                value: agent.id ?? '',
                icon: agent.icon,
              })) ?? [
                {
                  label: 'Loading...',
                  value: '',
                },
              ]
            }
            className={cn(
              'z-50 flex h-9 w-full flex-none items-center justify-center truncate rounded-md bg-transparent font-bold',
            )}
            ariaLabel={
              orchestrator != null
                ? localize('com_agents_botmode_specialists')
                : localize('com_ui_agent')
            }
            isCollapsed={false}
            showCarat={true}
          />
        )}
      />
    </div>
  );
}

const MemoizedAgentSelect = memo(
  AgentSelect,
  (prevProps, nextProps) =>
    prevProps.selectedAgentId === nextProps.selectedAgentId &&
    prevProps.agentQuery.data === nextProps.agentQuery.data &&
    prevProps.agentQuery.isSuccess === nextProps.agentQuery.isSuccess &&
    prevProps.createMutation.data?.id === nextProps.createMutation.data?.id &&
    prevProps.createMutation.isLoading === nextProps.createMutation.isLoading,
);
MemoizedAgentSelect.displayName = 'AgentSelect';

export default MemoizedAgentSelect;
