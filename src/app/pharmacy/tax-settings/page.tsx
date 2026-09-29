import { getMyTaxSettings } from '@/modules/medicines/pharmacies.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { TaxSettingsForm } from './tax-settings-form';

export default async function PharmacyTaxSettingsPage() {
  const session = await requireSessionOrRedirect();
  const settings = await getMyTaxSettings(session.userId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Tax settings</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Your GST registration profile. Required before you can record a sale at the POS counter — every invoice this
        pharmacy issues is numbered from here.
      </p>
      <div className="mt-6 max-w-xl">
        <TaxSettingsForm
          initial={
            settings
              ? {
                  legalBusinessName: settings.legalBusinessName,
                  gstin: settings.gstin,
                  registeredState: settings.registeredState,
                  stateCode: settings.stateCode,
                  invoicePrefix: settings.invoicePrefix,
                }
              : null
          }
        />
      </div>
    </div>
  );
}
