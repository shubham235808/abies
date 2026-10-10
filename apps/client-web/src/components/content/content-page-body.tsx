// ContentPage.body is plain text by design (no rich-text editor in admin,
// no HTML injection surface) — a blank line separates paragraphs.
export function ContentPageBody({ body, className }: { body: string; className?: string }) {
  return (
    <div className={className ?? 'mt-6 space-y-4'}>
      {body
        .split(/\n{2,}/)
        .filter((p) => p.trim())
        .map((paragraph, i) => (
          <p key={i} className="whitespace-pre-line text-brand-neutral-600">
            {paragraph}
          </p>
        ))}
    </div>
  );
}
