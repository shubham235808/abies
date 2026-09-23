import { redirect } from 'next/navigation';

// Doctor verification is the only admin section that exists so far
// (docs/IMPLEMENTATION-PLAN.md Phase 11 adds broader admin operations) —
// redirect the bare portal root straight to it rather than showing an
// empty dashboard.
export default function AdminIndexPage() {
  redirect('/admin/doctors');
}
