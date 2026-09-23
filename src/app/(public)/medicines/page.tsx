import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';

export const metadata = { title: 'Medicines — ABIES' };

const PRINCIPLES = [
  { title: 'Prescription-led', body: 'Medicine orders are linked to your practitioner’s prescription, not sold as a standalone storefront.' },
  { title: 'No silent substitution', body: 'A pharmacy can’t swap what was prescribed without an explicit, recorded approval process.' },
  { title: 'Licensed partners only', body: 'Fulfilment partners are reviewed for dispensing licences, storage and batch/expiry controls.' },
  { title: 'Tracked to delivery', body: 'Pack, dispatch and delivery are visible in your Care Plan, with refill reminders tied to your actual prescription duration.' },
];

export default function MedicinesPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-orange-600">Medicines</p>
      <h1 className="mt-2 text-3xl font-semibold text-brand-neutral-900 sm:text-4xl">
        Prescription fulfilment, traceable end to end
      </h1>
      <p className="mt-4 max-w-2xl text-brand-neutral-600">
        Prescribed Ayurveda medicines are fulfilled by licensed pharmacy partners, with every step from
        order to delivery visible in your Care Plan.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {PRINCIPLES.map((p) => (
          <Card key={p.title}>
            <CardTitle className="text-base">{p.title}</CardTitle>
            <CardDescription>{p.body}</CardDescription>
          </Card>
        ))}
      </div>

      <Alert tone="info" className="mt-10">
        Pharmacy partner onboarding and ordering are a later build phase — this page describes how it
        will work, not a service you can order from yet.
      </Alert>
    </main>
  );
}
