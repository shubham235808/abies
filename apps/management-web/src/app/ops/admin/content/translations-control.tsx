'use client';

import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Badge } from '@abies/design-system/components/ui/badge';
import { Button } from '@abies/design-system/components/ui/button';
import { FieldHint, Input, Label, Select, Textarea } from '@abies/design-system/components/ui/input';
import { Modal } from '@abies/design-system/components/ui/modal';
import { api, ApiError } from '@abies/design-system/api-client';
import {
  CONTENT_LANGUAGE_LABELS,
  TRANSLATION_LANGUAGES,
  type TranslationLanguage,
} from '@abies/domain/modules/content/languages';

export interface TranslationRow {
  id: string;
  language: string;
  active: boolean;
  [field: string]: unknown;
}

export interface TranslationField {
  key: string;
  label: string;
  kind?: 'text' | 'textarea' | 'list';
  rows?: number;
  optional?: boolean;
  hint?: string;
}

// One shared editor for every CMS model's translations: the English row is
// edited by the model's own form; this edits only the text that a
// translation overrides. Untranslated languages fall back to English on the
// public site, which the badges spell out so an admin isn't surprised.
export function TranslationsControl({
  endpoint,
  source,
  fields,
  translations,
  onChange,
}: {
  endpoint: string;
  source: object;
  fields: TranslationField[];
  translations: TranslationRow[];
  onChange: (translations: TranslationRow[]) => void;
}) {
  const [editing, setEditing] = useState<TranslationLanguage | null>(null);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-brand-neutral-500">
      {TRANSLATION_LANGUAGES.map((language) => {
        const existing = translations.find((t) => t.language === language);
        return (
          <span key={language} className="flex items-center gap-1.5">
            <span>{CONTENT_LANGUAGE_LABELS[language]}:</span>
            {existing ? (
              <Badge tone={existing.active ? 'purple' : 'neutral'}>{existing.active ? 'Translated' : 'Draft — English shown'}</Badge>
            ) : (
              <Badge tone="neutral">Not translated — English shown</Badge>
            )}
            <Button variant="ghost" size="sm" onClick={() => setEditing(language)}>
              {existing ? 'Edit translation' : 'Translate'}
            </Button>
          </span>
        );
      })}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Translation">
        {editing && (
          <TranslationForm
            key={editing}
            endpoint={endpoint}
            source={source}
            fields={fields}
            translations={translations}
            initialLanguage={editing}
            onSaved={(next) => {
              onChange(next);
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function toFormValue(field: TranslationField, value: unknown): string {
  if (field.kind === 'list') return Array.isArray(value) ? value.join(', ') : '';
  return typeof value === 'string' ? value : '';
}

function valuesFor(fields: TranslationField[], row: TranslationRow | undefined): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.key, toFormValue(f, row?.[f.key])]));
}

function TranslationForm({
  endpoint,
  source,
  fields,
  translations,
  initialLanguage,
  onSaved,
  onCancel,
}: {
  endpoint: string;
  source: object;
  fields: TranslationField[];
  translations: TranslationRow[];
  initialLanguage: TranslationLanguage;
  onSaved: (translations: TranslationRow[]) => void;
  onCancel: () => void;
}) {
  const [language, setLanguage] = useState<TranslationLanguage>(initialLanguage);
  const existing = translations.find((t) => t.language === language);
  const [values, setValues] = useState(() => valuesFor(fields, existing));
  const [active, setActive] = useState(existing?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchLanguage(next: TranslationLanguage) {
    const row = translations.find((t) => t.language === next);
    setLanguage(next);
    setValues(valuesFor(fields, row));
    setActive(row?.active ?? true);
    setError(null);
  }

  async function handleSave() {
    const missing = fields.find((f) => !f.optional && !values[f.key]?.trim());
    if (missing) {
      setError(`${missing.label} is required.`);
      return;
    }
    const body: Record<string, unknown> = { language, active };
    for (const f of fields) {
      const raw = values[f.key] ?? '';
      if (f.kind === 'list') body[f.key] = raw.split(',').map((s) => s.trim()).filter(Boolean);
      else if (raw.trim()) body[f.key] = raw;
    }
    setBusy(true);
    setError(null);
    try {
      const { translation } = await api.put<{ translation: TranslationRow }>(endpoint, body);
      onSaved([...translations.filter((t) => t.language !== language), translation]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save this translation.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError(null);
    try {
      await api.delete(`${endpoint}?language=${language}`);
      onSaved(translations.filter((t) => t.language !== language));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove this translation.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="translation-language">Language</Label>
        <Select
          id="translation-language"
          value={language}
          onChange={(e) => switchLanguage(e.target.value as TranslationLanguage)}
        >
          {TRANSLATION_LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {CONTENT_LANGUAGE_LABELS[l]}
            </option>
          ))}
        </Select>
        <FieldHint>Only this item&apos;s text is translated. Order, links, images and publish state follow the English version.</FieldHint>
      </div>
      {fields.map((f) => {
        const id = `translation-${f.key}`;
        const english = toFormValue(f, (source as Record<string, unknown>)[f.key]);
        const onValue = (value: string) => setValues((prev) => ({ ...prev, [f.key]: value }));
        return (
          <div key={f.key}>
            <Label htmlFor={id}>
              {f.label}
              {f.optional ? ' (optional)' : ''}
            </Label>
            {f.kind === 'textarea' ? (
              <Textarea id={id} lang={language} rows={f.rows ?? 4} value={values[f.key] ?? ''} onChange={(e) => onValue(e.target.value)} />
            ) : (
              <Input id={id} lang={language} value={values[f.key] ?? ''} onChange={(e) => onValue(e.target.value)} />
            )}
            <FieldHint>
              {f.hint ? `${f.hint} ` : ''}
              {english ? `English: ${english.length > 160 ? `${english.slice(0, 160)}…` : english}` : ''}
            </FieldHint>
          </div>
        );
      })}
      <label className="flex items-center gap-2 text-sm text-brand-neutral-700">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="h-4 w-4 rounded border-brand-neutral-300"
        />
        Published (unpublished translations fall back to English)
      </label>
      <div className="flex justify-between gap-2">
        <div>
          {existing && (
            <Button type="button" variant="ghost" onClick={handleRemove} disabled={busy}>
              Remove translation
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" loading={busy} onClick={handleSave}>
            Save translation
          </Button>
        </div>
      </div>
    </div>
  );
}
