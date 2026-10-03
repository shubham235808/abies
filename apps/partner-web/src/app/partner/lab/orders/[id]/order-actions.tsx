'use client';

import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { Input, Label } from '@abies/design-system/components/ui/input';
import { api, ApiError } from '@abies/design-system/api-client';

type SampleCollection = { collectorName: string | null; collectedAt: string | null; sampleBarcode: string | null };
type Report = { releasedToPatientAt: string | null; criticalFlag: boolean };

export function OrderActions({
  orderId,
  status: initialStatus,
  sampleCollection: initialSampleCollection,
  report: initialReport,
}: {
  orderId: string;
  status: string;
  sampleCollection: SampleCollection | null;
  report: Report | null;
}) {
  // Deliberately not synced from router.refresh() — a Client Component's
  // useState only takes its initial-render value from props and never
  // re-syncs on its own, so every action here updates this state directly
  // from that action's own response instead of relying on a parent
  // Server Component refetch to somehow flow back in.
  const [status, setStatus] = useState(initialStatus);
  const [sampleCollection, setSampleCollection] = useState(initialSampleCollection);
  const [report, setReport] = useState(initialReport);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [collectorName, setCollectorName] = useState('');
  const [sampleBarcode, setSampleBarcode] = useState('');

  async function handleSampleCollected() {
    setBusy(true);
    setError(null);
    try {
      const { order } = await api.post<{ order: { status: string } }>(`/api/labs/me/orders/${orderId}/sample-collected`, {
        collectorName: collectorName || undefined,
        sampleBarcode: sampleBarcode || undefined,
      });
      setStatus(order.status);
      setSampleCollection({
        collectorName: collectorName || null,
        sampleBarcode: sampleBarcode || null,
        collectedAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record sample collection.');
    } finally {
      setBusy(false);
    }
  }

  async function handleProcessing() {
    setBusy(true);
    setError(null);
    try {
      const { order } = await api.post<{ order: { status: string } }>(`/api/labs/me/orders/${orderId}/processing`, {});
      setStatus(order.status);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this order.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6">
      <h2 className="font-semibold text-brand-neutral-900">Fulfilment</h2>
      {error && (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      )}

      {sampleCollection?.collectedAt && (
        <p className="mt-3 text-sm text-brand-neutral-600">
          Sample collected {new Date(sampleCollection.collectedAt).toLocaleString()}
          {sampleCollection.collectorName ? ` by ${sampleCollection.collectorName}` : ''}
          {sampleCollection.sampleBarcode ? ` — barcode ${sampleCollection.sampleBarcode}` : ''}
        </p>
      )}

      {status === 'SCHEDULED' && (
        <div className="mt-3 space-y-3">
          <div>
            <Label htmlFor="collectorName">Collector name</Label>
            <Input id="collectorName" value={collectorName} onChange={(e) => setCollectorName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="sampleBarcode">Sample barcode</Label>
            <Input id="sampleBarcode" value={sampleBarcode} onChange={(e) => setSampleBarcode(e.target.value)} />
          </div>
          <Button loading={busy} onClick={handleSampleCollected}>
            Mark sample collected
          </Button>
        </div>
      )}

      {status === 'SAMPLE_COLLECTED' && (
        <div className="mt-3">
          <Button loading={busy} onClick={handleProcessing}>
            Start processing
          </Button>
        </div>
      )}

      {status === 'PROCESSING' && (
        <ReleaseReportForm
          orderId={orderId}
          onReleased={(criticalFlag) => {
            setStatus('COMPLETED');
            setReport({ releasedToPatientAt: new Date().toISOString(), criticalFlag });
          }}
        />
      )}

      {status === 'COMPLETED' && report && (
        <p className="mt-3 text-sm text-brand-neutral-600">
          Report released {report.releasedToPatientAt ? new Date(report.releasedToPatientAt).toLocaleString() : ''}
          {report.criticalFlag && <span className="ml-2 font-medium text-brand-magenta-700">Flagged critical</span>}
        </p>
      )}

      {status === 'CANCELLED' && <p className="mt-3 text-sm text-brand-neutral-500">This order was cancelled.</p>}
      {status === 'BOOKED' && <p className="mt-3 text-sm text-brand-neutral-500">Awaiting patient payment.</p>}
    </Card>
  );
}

function ReleaseReportForm({ orderId, onReleased }: { orderId: string; onReleased: (criticalFlag: boolean) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [criticalFlag, setCriticalFlag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set('criticalFlag', String(criticalFlag));
      if (file) formData.set('file', file);
      await api.postForm(`/api/labs/me/orders/${orderId}/report`, formData);
      onReleased(criticalFlag);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not release this report.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="reportFile">Report file (PDF)</Label>
        <input
          id="reportFile"
          type="file"
          accept="application/pdf,image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-brand-neutral-600"
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-brand-neutral-700">
        <input type="checkbox" checked={criticalFlag} onChange={(e) => setCriticalFlag(e.target.checked)} />
        Flag as a critical result (notifies the recommending doctor urgently)
      </label>
      <Button loading={submitting} onClick={handleSubmit}>
        Release report to patient
      </Button>
    </div>
  );
}
