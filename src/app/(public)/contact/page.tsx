import { Alert } from '@/components/ui/alert';

export const metadata = { title: 'Contact ABIES' };

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold text-brand-neutral-900">Contact us</h1>
      <p className="mt-4 text-brand-neutral-600">
        The customer support console (ticketing, live chat, call-back requests) is part of a later
        build phase and isn&apos;t connected yet — see{' '}
        <a href="/support" className="text-brand-purple-600 underline">
          Support
        </a>{' '}
        for what it will cover once live.
      </p>
      <Alert tone="info" className="mt-6">
        A working contact channel will appear here once the support module ships. We&apos;d rather say
        that plainly than show a form that goes nowhere.
      </Alert>
    </main>
  );
}
