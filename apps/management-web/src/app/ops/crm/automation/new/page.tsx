import { CreateRuleForm } from './create-rule-form';

export default function NewRulePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">New automation rule</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        A rule runs on a lead only when all of its conditions match. Leave conditions out to apply the rule to every lead.
      </p>
      <CreateRuleForm />
    </div>
  );
}
