import { useState } from 'react';
import { Button, Input } from '@librechat/client';
import { dataService } from 'librechat-data-provider';
import { Lightbulb, Plus, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TIdea } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

export default function IdeasView() {
  const localize = useLocalize();
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
  const update = useMutation(
    (x: { ideaId: string; status: TIdea['status'] }) => dataService.updateIdea(x),
    { onSuccess: () => qc.invalidateQueries(['ideas']) },
  );
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) create.mutate({ title: title.trim(), content });
  };
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
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
    </main>
  );
}
