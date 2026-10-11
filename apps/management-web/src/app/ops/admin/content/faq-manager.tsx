'use client';

import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Badge } from '@abies/design-system/components/ui/badge';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { FieldError, Label, Textarea } from '@abies/design-system/components/ui/input';
import { Modal } from '@abies/design-system/components/ui/modal';
import { api, ApiError } from '@abies/design-system/api-client';
import { TranslationsControl, type TranslationField, type TranslationRow } from './translations-control';

export interface FaqRow {
  id: string;
  question: string;
  answer: string;
  priority: number;
  active: boolean;
  translations: TranslationRow[];
}

const TRANSLATED_FIELDS: TranslationField[] = [
  { key: 'question', label: 'Question', kind: 'textarea', rows: 2 },
  { key: 'answer', label: 'Answer', kind: 'textarea', rows: 5 },
];

export function FaqManager({ initial }: { initial: FaqRow[] }) {
  const [faqs, setFaqs] = useState(initial);
  const [modal, setModal] = useState<'create' | { edit: FaqRow } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleActive(entry: FaqRow) {
    setError(null);
    try {
      const { entry: updated } = await api.patch<{ entry: FaqRow }>(`/api/v1/admin/content/faq/${entry.id}`, { active: !entry.active });
      setFaqs((prev) => prev.map((f) => (f.id === entry.id ? updated : f)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this FAQ entry.');
    }
  }

  async function handleRemove(id: string) {
    setError(null);
    try {
      await api.delete(`/api/v1/admin/content/faq/${id}`);
      setFaqs((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove this FAQ entry.');
    }
  }

  // No drag-and-drop library in this repo — move-up/down against explicit,
  // distinct priority values per position (not a priority swap, which
  // would no-op whenever two entries tie, e.g. the common all-default-0 case).
  async function move(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= faqs.length) return;
    setError(null);
    const total = faqs.length;
    const a = faqs[index];
    const b = faqs[targetIndex];
    if (!a || !b) return;
    try {
      const [{ entry: updatedA }, { entry: updatedB }] = await Promise.all([
        api.patch<{ entry: FaqRow }>(`/api/v1/admin/content/faq/${a.id}`, { priority: total - targetIndex }),
        api.patch<{ entry: FaqRow }>(`/api/v1/admin/content/faq/${b.id}`, { priority: total - index }),
      ]);
      setFaqs((prev) => {
        const next = [...prev];
        next[index] = updatedB;
        next[targetIndex] = updatedA;
        return next;
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reorder these FAQ entries.');
    }
  }

  return (
    <div>
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}

      <div className="space-y-3">
        {faqs.map((f, index) => (
          <Card key={f.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-brand-neutral-900">{f.question}</p>
                  <Badge tone={f.active ? 'success' : 'neutral'}>{f.active ? 'Active' : 'Inactive'}</Badge>
                </div>
                <p className="mt-1 text-sm text-brand-neutral-500">{f.answer}</p>
                <TranslationsControl
                  endpoint={`/api/v1/admin/content/faq/${f.id}/translations`}
                  source={f}
                  fields={TRANSLATED_FIELDS}
                  translations={f.translations}
                  onChange={(translations) => setFaqs((prev) => prev.map((x) => (x.id === f.id ? { ...x, translations } : x)))}
                />
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="ghost" size="sm" onClick={() => move(index, -1)} disabled={index === 0}>
                  ↑
                </Button>
                <Button variant="ghost" size="sm" onClick={() => move(index, 1)} disabled={index === faqs.length - 1}>
                  ↓
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setModal({ edit: f })}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => toggleActive(f)}>
                  {f.active ? 'Deactivate' : 'Activate'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleRemove(f.id)}>
                  Remove
                </Button>
              </div>
            </div>
          </Card>
        ))}
        {faqs.length === 0 && <p className="text-sm text-brand-neutral-500">No FAQ entries yet.</p>}
      </div>

      <Button variant="secondary" className="mt-6" onClick={() => setModal('create')}>
        + New FAQ entry
      </Button>

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === 'create' ? 'New FAQ entry' : 'Edit FAQ entry'}>
        {modal !== null && (
          <FaqForm
            existing={modal === 'create' ? null : modal.edit}
            nextPriority={faqs.length}
            onSaved={(entry) => {
              setFaqs((prev) => (prev.some((f) => f.id === entry.id) ? prev.map((f) => (f.id === entry.id ? entry : f)) : [entry, ...prev]));
              setModal(null);
            }}
            onCancel={() => setModal(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function FaqForm({
  existing,
  nextPriority,
  onSaved,
  onCancel,
}: {
  existing: FaqRow | null;
  nextPriority: number;
  onSaved: (entry: FaqRow) => void;
  onCancel: () => void;
}) {
  const [question, setQuestion] = useState(existing?.question ?? '');
  const [answer, setAnswer] = useState(existing?.answer ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    if (!question.trim() || !answer.trim()) {
      setError('Both a question and an answer are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { entry } = existing
        ? await api.patch<{ entry: FaqRow }>(`/api/v1/admin/content/faq/${existing.id}`, { question, answer })
        : await api.post<{ entry: FaqRow }>('/api/v1/admin/content/faq', { question, answer, priority: nextPriority });
      onSaved(entry);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this FAQ entry.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="faq-question">Question</Label>
        <Textarea id="faq-question" rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} />
        <FieldError>{!question.trim() && error ? 'Question is required' : undefined}</FieldError>
      </div>
      <div>
        <Label htmlFor="faq-answer">Answer</Label>
        <Textarea id="faq-answer" rows={5} value={answer} onChange={(e) => setAnswer(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" loading={busy} onClick={handleSubmit}>
          {existing ? 'Save changes' : 'Add FAQ entry'}
        </Button>
      </div>
    </div>
  );
}
