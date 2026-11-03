import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button, useToastContext } from '@librechat/client';
import { dataService, QueryKeys, resolveModelCatalogKey } from 'librechat-data-provider';
import type { TModelsConfig } from 'librechat-data-provider';
import type { AgentForm, StringOption } from '~/common';
import { useLocalize } from '~/hooks';

/**
 * An authenticated, owner-scoped first-run action; no browser-console scripts,
 * credential extraction, direct Mongo writes, or silent agent creation.
 * The server validates the selected model and enforces native ACLs and tool grants.
 */
export default function BotModeSetupButton({
  models,
  modelsReady,
  modelsError,
}: {
  models: TModelsConfig;
  modelsReady: boolean;
  modelsError: boolean;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const queryClient = useQueryClient();
  const { control } = useFormContext<AgentForm>();
  const providerOption = useWatch({ control, name: 'provider' });
  const model = useWatch({ control, name: 'model' });
  const provider =
    typeof providerOption === 'string'
      ? providerOption
      : ((providerOption as StringOption | undefined)?.value ?? '');

  const [isMissing, setIsMissing] = useState(false);
  const [checking, setChecking] = useState(true);
  const [running, setRunning] = useState(false);
  const [resultText, setResultText] = useState('');

  useEffect(() => {
    let alive = true;
    const loadStatus = async () => {
      try {
        const status = await dataService.getBotModeSetupStatus();
        if (alive) {
          setIsMissing(!status.configurationComplete);
        }
      } catch {
        if (alive) {
          setResultText(localize('com_ui_botmode_setup_unavailable'));
        }
      } finally {
        if (alive) {
          setChecking(false);
        }
      }
    };
    void loadStatus();
    return () => {
      alive = false;
    };
  }, [localize]);

  const selectedModelAvailable =
    modelsReady &&
    !modelsError &&
    Boolean(provider && model) &&
    (models[resolveModelCatalogKey(provider, models)] ?? []).includes(model ?? '');

  const initialize = useCallback(async () => {
    if (!selectedModelAvailable || running || !model || !provider) {
      showToast({
        message: localize('com_ui_botmode_setup_choose_model'),
        status: 'error',
      });
      return;
    }
    if (!window.confirm(localize('com_ui_botmode_setup_confirm'))) {
      return;
    }
    setRunning(true);
    setResultText('');
    try {
      await dataService.initializeBotModeAgents({ provider, model });
      const status = await dataService.getBotModeSetupStatus();
      await queryClient.invalidateQueries({ queryKey: [QueryKeys.agents] });
      if (
        status.configurationComplete &&
        status.inventoryComplete &&
        status.permissionsComplete &&
        status.delegationConfigured
      ) {
        setIsMissing(false);
        showToast({ message: localize('com_ui_botmode_setup_success') });
      } else {
        const missing =
          status.missing?.join(', ') ||
          status.missingCapabilities?.map((capability) => capability.name).join(', ');
        setResultText(
          `${localize('com_ui_botmode_setup_incomplete')}${missing ? ` : ${missing}` : ''}`,
        );
      }
    } catch {
      setResultText(localize('com_ui_botmode_setup_failed'));
    } finally {
      setRunning(false);
    }
  }, [localize, model, provider, queryClient, running, selectedModelAvailable, showToast]);

  if (checking || (!isMissing && !resultText)) {
    return null;
  }

  return (
    <section
      className="border-token-border-medium mt-3 rounded-lg border p-3"
      aria-label="BOT MODE"
    >
      {isMissing && (
        <>
          <p className="text-token-text-secondary mb-2 text-sm">
            {localize('com_ui_botmode_setup_description')}
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={!selectedModelAvailable || running}
            onClick={() => void initialize()}
            aria-label={localize('com_ui_botmode_setup_button')}
          >
            {running
              ? localize('com_ui_botmode_setup_running')
              : localize('com_ui_botmode_setup_button')}
          </Button>
          {!selectedModelAvailable && (
            <p className="text-token-text-secondary mt-2 text-xs">
              {localize('com_ui_botmode_setup_choose_model')}
            </p>
          )}
        </>
      )}
      {resultText && (
        <p role="status" aria-live="polite" className="text-token-text-secondary mt-2 text-sm">
          {resultText}
        </p>
      )}
    </section>
  );
}
