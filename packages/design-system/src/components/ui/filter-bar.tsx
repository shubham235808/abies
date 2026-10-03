export interface FilterBarOption {
  value: string;
  label: string;
}

export interface FilterBarField {
  name: string;
  label: string;
  options: FilterBarOption[];
  defaultValue?: string;
}

// Same GET-form, URL-driven-state pattern as SearchBar — multiple filter
// dimensions submitted together, no client JS required.
export function FilterBar({
  action,
  fields,
  extraHidden,
}: {
  action: string;
  fields: FilterBarField[];
  extraHidden?: Record<string, string>;
}) {
  return (
    <form action={action} method="GET" className="flex flex-wrap items-end gap-3">
      {extraHidden &&
        Object.entries(extraHidden).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
      {fields.map((field) => (
        <div key={field.name}>
          <label htmlFor={`filter-${field.name}`} className="block text-xs font-medium text-brand-neutral-600">
            {field.label}
          </label>
          <select
            id={`filter-${field.name}`}
            name={field.name}
            defaultValue={field.defaultValue ?? ''}
            className="mt-1 rounded-lg border border-brand-neutral-200 bg-white px-3 py-2 text-sm text-brand-neutral-900 focus:border-brand-purple-400 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-brand-purple-200"
          >
            <option value="">All</option>
            {field.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ))}
      <button
        type="submit"
        className="rounded-lg border border-brand-neutral-200 bg-white px-4 py-2 text-sm font-medium text-brand-neutral-700 hover:bg-brand-neutral-100"
      >
        Apply
      </button>
    </form>
  );
}
