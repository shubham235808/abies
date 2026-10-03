export interface TimelineEntry {
  id: string;
  label: string;
  timestamp: string;
  detail?: string;
}

// Generalizes the bespoke history list originally written inline in
// src/app/sales/[id]/page.tsx (UX-10's lead stage-history) — same markup,
// pulled out so every later "show me what happened to this record" screen
// (document verification history, refund history, ticket timeline) reuses
// one component instead of re-hand-rolling it.
export function Timeline({ entries, emptyMessage = 'No activity yet.' }: { entries: TimelineEntry[]; emptyMessage?: string }) {
  if (entries.length === 0) {
    return <p className="text-sm text-brand-neutral-500">{emptyMessage}</p>;
  }
  return (
    <ol className="space-y-3 border-l border-brand-neutral-200 pl-4">
      {entries.map((entry) => (
        <li key={entry.id} className="text-sm">
          <p className="text-brand-neutral-900">{entry.label}</p>
          <p className="text-xs text-brand-neutral-400">{entry.timestamp}</p>
          {entry.detail && <p className="mt-0.5 text-xs text-brand-neutral-500">{entry.detail}</p>}
        </li>
      ))}
    </ol>
  );
}
