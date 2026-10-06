import { Card } from '@abies/design-system/components/ui/card';
import { getOrganizationContact } from '@abies/domain/modules/contact/organization';
import { ContactForm } from './contact-form';

export const metadata = { title: 'Contact us — ABIES' };
// Read per request so a changed contact setting shows without a rebuild.
export const dynamic = 'force-dynamic';

export default function ContactPage() {
  // Every contact detail comes from one place (modules/contact/organization.ts).
  const org = getOrganizationContact();
  const whatsappHref = `https://wa.me/${org.whatsapp}?text=${encodeURIComponent(org.whatsappPrefill)}`;
  const callHref = `tel:+91${org.mobile.replace(/^\+?91/, '')}`;
  const emailHref = `mailto:${org.supportEmail}`;

  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="text-center">
        <h1 className="text-3xl font-semibold text-brand-neutral-900 sm:text-4xl">Need help?</h1>
        <p className="mt-3 text-brand-neutral-600">We&apos;re here to assist you. Send us a message, or reach us directly.</p>
      </header>

      <div className="mt-10 grid gap-8 md:grid-cols-5">
        <section className="md:col-span-3" aria-labelledby="contact-form-heading">
          <h2 id="contact-form-heading" className="sr-only">
            Contact form
          </h2>
          <ContactForm />
        </section>

        <aside className="space-y-6 md:col-span-2" aria-label="Contact information">
          <Card className="p-6">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand-purple-600">{org.clinicName}</p>
            <p className="mt-1 text-lg font-semibold text-brand-neutral-900">{org.contactPerson}</p>
            <address className="mt-3 not-italic text-brand-neutral-700">
              {org.addressLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>

            <dl className="mt-5 space-y-3 text-brand-neutral-700">
              <div>
                <dt className="text-sm text-brand-neutral-500">Clinic</dt>
                <dd>
                  <a href={callHref} className="font-medium text-brand-purple-700 underline">
                    {org.mobile}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-brand-neutral-500">WhatsApp</dt>
                <dd className="font-medium">+{org.whatsapp}</dd>
              </div>
              <div>
                <dt className="text-sm text-brand-neutral-500">Email</dt>
                <dd>
                  <a href={emailHref} className="font-medium text-brand-purple-700 underline">
                    {org.supportEmail}
                  </a>
                </dd>
              </div>
            </dl>

            <div className="mt-6 grid gap-3">
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-md bg-brand-purple-600 px-4 py-2.5 font-medium text-white hover:bg-brand-purple-700"
              >
                WhatsApp us
              </a>
              <a
                href={callHref}
                className="inline-flex items-center justify-center rounded-md border border-brand-neutral-300 px-4 py-2.5 font-medium text-brand-neutral-800 hover:bg-brand-neutral-50"
              >
                Call the clinic
              </a>
            </div>
          </Card>

          <p className="text-sm text-brand-neutral-500">
            Never share your password or OTP with anyone, including ABIES staff. We will not ask for them.
          </p>
        </aside>
      </div>
    </main>
  );
}
