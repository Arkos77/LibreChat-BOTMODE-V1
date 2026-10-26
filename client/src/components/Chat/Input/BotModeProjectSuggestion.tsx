import { useEffect, useState } from 'react';
import { FolderPlus, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import type { TConversation, TChatProject } from 'librechat-data-provider';
import { useChatContext, useAgentsMapContext } from '~/Providers';
import { useLocalize } from '~/hooks';
import ProjectCreateDialog from '~/components/Projects/ProjectCreateDialog';

/**
 * Conservative local hint only: this does not call a provider, classify a
 * mission on the server, or change execution mode. A long or multi-stage user
 * request remains an ordinary chat until the user explicitly creates a project.
 */
export function shouldSuggestBotModeProject(value: string): boolean {
  const text = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length < 35 || /^(comment|pourquoi|qu'est.ce que|how to|what is)\b/.test(text)) {
    return false;
  }

  const action =
    /\b(cree|creer|developpe|developper|construis|construire|realise|realiser|mets en place|mettre en place|organise|organiser|lance|lancer|je veux|j'aimerais|i want|build|develop|create)\b/.test(
      text,
    );
  const project =
    /\b(application|appli|plateforme|site web|logiciel|projet|systeme|programme|architecture|web app|website|software|app)\b/.test(
      text,
    );
  const multiStage =
    /\b(complet|complete|de a a z|plusieurs etapes|sur plusieurs jours|planifie|planification|etapes de|full project|multiple stages|end to end)\b/.test(
      text,
    );

  return action && ((project && text.length >= 45) || (multiStage && text.length >= 100));
}

interface BotModeProjectSuggestionProps {
  text: string;
  conversation: TConversation | null;
  disabled?: boolean;
}

export default function BotModeProjectSuggestion({
  text,
  conversation,
  disabled = false,
}: BotModeProjectSuggestionProps) {
  const agentsMap = useAgentsMapContext();
  const localize = useLocalize();
  const { setConversation } = useChatContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dismissed, setDismissed] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [suggestedDraft, setSuggestedDraft] = useState('');

  const isWorker =
    Boolean(conversation?.agent_id) &&
    agentsMap?.[conversation?.agent_id ?? '']?.name === 'BOT MODE Worker';
  const inProject = Boolean(conversation?.chatProjectId || searchParams.get('projectId'));
  const display =
    !disabled && isWorker && !inProject && !dismissed && shouldSuggestBotModeProject(text);

  useEffect(() => {
    if (!text.trim()) {
      setDismissed(false);
    }
  }, [text]);

  const onCreated = (project: TChatProject) => {
    if (conversation) {
      setConversation({ ...conversation, chatProjectId: project._id });
    }
    const next = new URLSearchParams(searchParams);
    next.set('projectId', project._id);
    // Same draft-preserving update as ProjectLandingChip. The user can then
    // send the original text inside the newly created project.
    setSearchParams(next, { replace: true, flushSync: true });
  };

  return (
    <>
      {display && (
        <div
          role="note"
          className="mx-2 mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-border-light bg-surface-secondary px-3 py-2 text-sm text-text-primary"
        >
          <FolderPlus className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
          <span className="min-w-0 flex-1">{localize('com_ui_botmode_project_suggestion')}</span>
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-500"
            onClick={() => {
              setSuggestedDraft(text.trim());
              setDialogOpen(true);
            }}
          >
            {localize('com_ui_botmode_project_create')}
          </button>
          <button
            type="button"
            className="rounded-lg px-2 py-1.5 text-text-secondary hover:bg-surface-hover"
            onClick={() => setDismissed(true)}
          >
            {localize('com_ui_botmode_continue_chat')}
          </button>
          <button
            type="button"
            className="rounded-md p-1 text-text-secondary hover:bg-surface-hover"
            aria-label={localize('com_ui_botmode_dismiss_suggestion')}
            onClick={() => setDismissed(true)}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
      <ProjectCreateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={onCreated}
        initialName={suggestedDraft.split(/[\n.!?]/)[0]}
        initialDescription={suggestedDraft}
      />
    </>
  );
}
