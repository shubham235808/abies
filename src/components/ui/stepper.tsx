// EXPANSION-1d — a visual progress indicator wrapped around an existing,
// already-real multi-stage flow (booking, checkout). Purely presentational:
// `currentStep` reflects state the flow already tracks, this component
// never drives navigation or gates anything itself.
export function Stepper({ steps, currentStep }: { steps: string[]; currentStep: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
      {steps.map((label, i) => {
        const step = i + 1;
        const state = step < currentStep ? 'done' : step === currentStep ? 'current' : 'upcoming';
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ' +
                (state === 'done'
                  ? 'bg-brand-purple-600 text-white'
                  : state === 'current'
                    ? 'border-2 border-brand-purple-600 text-brand-purple-700'
                    : 'border border-brand-neutral-300 text-brand-neutral-400')
              }
            >
              {state === 'done' ? '✓' : step}
            </span>
            <span className={state === 'upcoming' ? 'text-brand-neutral-400' : 'font-medium text-brand-neutral-800'}>{label}</span>
            {step < steps.length && <span className="mx-1 h-px w-6 bg-brand-neutral-200" aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
