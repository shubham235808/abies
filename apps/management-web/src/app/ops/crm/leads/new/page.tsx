import { CreateLeadForm } from './create-lead-form';

export default function NewLeadPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">New lead</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        A mobile number or an email is required. If the mobile or email matches an open lead, the lead is not created and
        you&apos;re told where the existing one is.
      </p>
      <CreateLeadForm />
    </div>
  );
}
