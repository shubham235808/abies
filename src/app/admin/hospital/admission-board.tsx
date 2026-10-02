'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { api, ApiError } from '@/lib/api-client';

type BedStatus = 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE';

export interface BoardAdmission {
  id: string;
  reason: string;
  admittedAt: string;
  patientName: string;
  doctorName: string;
}

export interface BoardBed {
  id: string;
  label: string;
  status: BedStatus;
  admission: BoardAdmission | null;
}

export interface BoardWard {
  id: string;
  name: string;
  beds: BoardBed[];
}

export interface BoardFacility {
  id: string;
  name: string;
  wards: BoardWard[];
}

const STATUS_TONE: Record<BedStatus, 'success' | 'orange' | 'neutral'> = { AVAILABLE: 'success', OCCUPIED: 'orange', MAINTENANCE: 'neutral' };

export function AdmissionBoard({ initial, doctorOptions }: { initial: BoardFacility[]; doctorOptions: { id: string; name: string }[] }) {
  const [facilities, setFacilities] = useState(initial);
  const [admitOpen, setAdmitOpen] = useState<{ bedId: string; bedLabel: string } | null>(null);
  const [transferOpen, setTransferOpen] = useState<{ admissionId: string; fromBedId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const availableBeds = facilities.flatMap((f) =>
    f.wards.flatMap((w) => w.beds.filter((b) => b.status === 'AVAILABLE').map((b) => ({ id: b.id, label: `${f.name} · ${w.name} · ${b.label}` }))),
  );

  function patchBed(bedId: string, patch: Partial<BoardBed>) {
    setFacilities((prev) =>
      prev.map((f) => ({ ...f, wards: f.wards.map((w) => ({ ...w, beds: w.beds.map((b) => (b.id === bedId ? { ...b, ...patch } : b)) })) })),
    );
  }

  async function handleDischarge(admissionId: string, bedId: string) {
    setError(null);
    try {
      await api.post(`/api/admin/hospital-admissions/${admissionId}/discharge`, {});
      patchBed(bedId, { status: 'AVAILABLE', admission: null });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not discharge this admission.');
    }
  }

  const hasAnyBeds = facilities.some((f) => f.wards.some((w) => w.beds.length > 0));

  return (
    <div>
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}

      {!hasAnyBeds ? (
        <EmptyState message="No beds set up yet — add a facility, ward and bed under the Facilities tab first." />
      ) : (
        <div className="space-y-8">
          {facilities.map((f) => (
            <div key={f.id}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">{f.name}</h2>
              {f.wards.map((w) => (
                <div key={w.id} className="mt-3">
                  <p className="text-sm font-medium text-brand-neutral-700">{w.name}</p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {w.beds.map((b) => (
                      <Card key={b.id}>
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-brand-neutral-900">{b.label}</p>
                          <Badge tone={STATUS_TONE[b.status]}>{b.status}</Badge>
                        </div>
                        {b.admission ? (
                          <div className="mt-2">
                            <p className="text-sm text-brand-neutral-800">{b.admission.patientName}</p>
                            <p className="text-xs text-brand-neutral-500">{b.admission.reason}</p>
                            <p className="mt-1 text-xs text-brand-neutral-400">
                              Attending {b.admission.doctorName} · {new Date(b.admission.admittedAt).toLocaleDateString('en-IN')}
                            </p>
                            <div className="mt-2 flex gap-2">
                              <Button size="sm" variant="secondary" onClick={() => setTransferOpen({ admissionId: b.admission!.id, fromBedId: b.id })}>
                                Transfer
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => handleDischarge(b.admission!.id, b.id)}>
                                Discharge
                              </Button>
                            </div>
                          </div>
                        ) : b.status === 'AVAILABLE' ? (
                          <Button size="sm" className="mt-2" onClick={() => setAdmitOpen({ bedId: b.id, bedLabel: `${f.name} · ${w.name} · ${b.label}` })}>
                            Admit here
                          </Button>
                        ) : (
                          <p className="mt-2 text-xs text-brand-neutral-400">Under maintenance</p>
                        )}
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <Modal open={admitOpen !== null} onClose={() => setAdmitOpen(null)} title={`Admit a patient — ${admitOpen?.bedLabel ?? ''}`}>
        {admitOpen && (
          <AdmitForm
            bedId={admitOpen.bedId}
            doctorOptions={doctorOptions}
            onAdmitted={(admission, bedId) => {
              patchBed(bedId, { status: 'OCCUPIED', admission });
              setAdmitOpen(null);
            }}
            onCancel={() => setAdmitOpen(null)}
          />
        )}
      </Modal>

      <Modal open={transferOpen !== null} onClose={() => setTransferOpen(null)} title="Transfer to a different bed">
        {transferOpen && (
          <TransferForm
            admissionId={transferOpen.admissionId}
            fromBedId={transferOpen.fromBedId}
            availableBeds={availableBeds}
            onTransferred={(toBedId) => {
              patchBed(transferOpen.fromBedId, { status: 'AVAILABLE', admission: null });
              // The new bed's admission summary isn't known client-side without
              // re-fetching the board — a refresh keeps the occupied badge
              // accurate rather than guessing patient/doctor names here.
              patchBed(toBedId, { status: 'OCCUPIED' });
              setTransferOpen(null);
              window.location.reload();
            }}
            onCancel={() => setTransferOpen(null)}
          />
        )}
      </Modal>
    </div>
  );
}

function AdmitForm({
  bedId,
  doctorOptions,
  onAdmitted,
  onCancel,
}: {
  bedId: string;
  doctorOptions: { id: string; name: string }[];
  onAdmitted: (admission: BoardAdmission, bedId: string) => void;
  onCancel: () => void;
}) {
  const [patientMobile, setPatientMobile] = useState('');
  const [admittingDoctorProfileId, setAdmittingDoctorProfileId] = useState(doctorOptions[0]?.id ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      const { admission } = await api.post<{ admission: { id: string; reason: string; admittedAt: string; patientUser: { mobile: string; patientProfile: { firstName: string | null; lastName: string | null } | null }; admittingDoctor: { firstName: string | null; lastName: string | null } } }>(
        '/api/admin/hospital-admissions',
        { patientMobile, admittingDoctorProfileId, bedId, reason },
      );
      onAdmitted(
        {
          id: admission.id,
          reason: admission.reason,
          admittedAt: admission.admittedAt,
          patientName: [admission.patientUser.patientProfile?.firstName, admission.patientUser.patientProfile?.lastName].filter(Boolean).join(' ') || admission.patientUser.mobile,
          doctorName: [admission.admittingDoctor.firstName, admission.admittingDoctor.lastName].filter(Boolean).join(' '),
        },
        bedId,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not admit this patient.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="patient-mobile">Patient mobile number</Label>
        <Input id="patient-mobile" value={patientMobile} onChange={(e) => setPatientMobile(e.target.value)} placeholder="9876543210" />
      </div>
      <div>
        <Label htmlFor="admitting-doctor">Admitting doctor</Label>
        <Select id="admitting-doctor" value={admittingDoctorProfileId} onChange={(e) => setAdmittingDoctorProfileId(e.target.value)}>
          {doctorOptions.length === 0 && <option value="">No approved doctors yet</option>}
          {doctorOptions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="admit-reason">Reason for admission</Label>
        <Textarea id="admit-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button loading={busy} disabled={!patientMobile || !admittingDoctorProfileId || !reason} onClick={handleSubmit}>
          Admit
        </Button>
      </div>
    </div>
  );
}

function TransferForm({
  admissionId,
  fromBedId,
  availableBeds,
  onTransferred,
  onCancel,
}: {
  admissionId: string;
  fromBedId: string;
  availableBeds: { id: string; label: string }[];
  onTransferred: (toBedId: string) => void;
  onCancel: () => void;
}) {
  const options = availableBeds.filter((b) => b.id !== fromBedId);
  const [toBedId, setToBedId] = useState(options[0]?.id ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/admin/hospital-admissions/${admissionId}/transfer`, { toBedId, reason: reason || undefined });
      onTransferred(toBedId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not transfer this admission.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="to-bed">Destination bed</Label>
        <Select id="to-bed" value={toBedId} onChange={(e) => setToBedId(e.target.value)}>
          {options.length === 0 && <option value="">No available beds</option>}
          {options.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="transfer-reason">Reason (optional)</Label>
        <Input id="transfer-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button loading={busy} disabled={!toBedId} onClick={handleSubmit}>
          Transfer
        </Button>
      </div>
    </div>
  );
}
