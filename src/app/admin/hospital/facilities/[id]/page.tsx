import Link from 'next/link';
import { getFacility } from '@/modules/hospital/facilities.service';
import { WardsManager } from './wards-manager';

export default async function AdminFacilityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const facility = await getFacility(id);

  return (
    <div>
      <Link href="/admin/hospital?tab=facilities" className="text-sm text-brand-purple-600">
        ← All facilities
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-brand-neutral-900">{facility.name}</h1>
      <p className="mt-1 text-sm text-brand-neutral-600">
        {facility.addressLine1}
        {facility.addressLine2 ? `, ${facility.addressLine2}` : ''}, {facility.city}, {facility.state} {facility.postalCode}
      </p>

      <div className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">Wards</h2>
        <WardsManager
          facilityId={facility.id}
          initial={facility.wards.map((w) => ({ id: w.id, name: w.name, wardType: w.wardType, active: w.active, _count: w._count }))}
        />
      </div>
    </div>
  );
}
