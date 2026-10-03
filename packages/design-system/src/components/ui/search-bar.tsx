import { cn } from '../../cn';

// Plain GET form — no client JS needed, works with Enter, and keeps
// search state in the URL like every other filter in this app
// (docs/PORTAL-UX-SPEC.md's "Search & Filter URL state" principle).
export function SearchBar({
  action,
  name = 'q',
  defaultValue,
  placeholder = 'Search…',
  className,
}: {
  action: string;
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <form action={action} method="GET" className={cn('flex gap-2', className)}>
      <input
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full rounded-lg border border-brand-neutral-200 bg-white px-3.5 py-2.5 text-sm text-brand-neutral-900 placeholder:text-brand-neutral-400 focus:border-brand-purple-400 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-brand-purple-200"
      />
      <button
        type="submit"
        className="rounded-lg bg-brand-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-purple-700"
      >
        Search
      </button>
    </form>
  );
}
