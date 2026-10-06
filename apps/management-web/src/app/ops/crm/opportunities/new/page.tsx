import { CreateOpportunityForm } from './create-opportunity-form';

export default function NewOpportunityPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">New opportunity</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Record a deal you are working on. Enter the expected value in whole rupees. If you know the lead, paste its ID to link them.
      </p>
      <CreateOpportunityForm />
    </div>
  );
}
