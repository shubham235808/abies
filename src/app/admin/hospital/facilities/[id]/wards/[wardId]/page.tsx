import Link from 'next/link';
import { getWard } from '@/modules/hospital/facilities.service';
import { BedsManager } from './beds-manager';

export default async function AdminWardPage({ params }: { params: Promise<{ id: string; wardId: string }> }) {
  const { id, wardId } = await params;
  const ward = await getWard(wardId);

  return (
    <div>
      <Link href={`/admin/hospital/facilities/${id}`} className="text-sm text-brand-purple-600">
        ← {ward.facility.name}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold text-brand-neutral-900">{ward.name}</h1>
      <p className="mt-1 text-sm text-brand-neutral-600">{ward.wardType}</p>

      <div className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">Beds</h2>
        <BedsManager wardId={ward.id} initial={ward.beds.map((b) => ({ id: b.id, label: b.label, status: b.status }))} />
      </div>
    </div>
  );
}
