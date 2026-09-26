import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'purple' | 'magenta' | 'blue' | 'orange' | 'success' | 'danger';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-brand-neutral-100 text-brand-neutral-700',
  purple: 'bg-brand-purple-100 text-brand-purple-700',
  magenta: 'bg-brand-magenta-100 text-brand-magenta-700',
  blue: 'bg-brand-blue-100 text-brand-blue-700',
  orange: 'bg-brand-orange-100 text-brand-orange-700',
  success: 'bg-emerald-100 text-emerald-700',
  danger: 'bg-red-100 text-red-700',
};

export function Badge({ tone = 'neutral', className, ...props }: { tone?: Tone } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', TONE_CLASSES[tone], className)}
      {...props}
    />
  );
}

// A few call sites map a domain status enum straight to a tone; keep that
// mapping here so it doesn't get re-invented per page.
const VERIFICATION_TONE: Record<string, Tone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'blue',
  UNDER_REVIEW: 'orange',
  APPROVED: 'success',
  REJECTED: 'danger',
  SUSPENDED: 'danger',
};

export function VerificationBadge({ status }: { status: string }) {
  return (
    <Badge tone={VERIFICATION_TONE[status] ?? 'neutral'}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}

const APPOINTMENT_STATUS_TONE: Record<string, Tone> = {
  PENDING_PAYMENT: 'orange',
  CONFIRMED: 'success',
  CANCELLED: 'danger',
  RESCHEDULED: 'blue',
  COMPLETED: 'purple',
  NO_SHOW: 'danger',
};

export function AppointmentStatusBadge({ status }: { status: string }) {
  return <Badge tone={APPOINTMENT_STATUS_TONE[status] ?? 'neutral'}>{status.replace(/_/g, ' ')}</Badge>;
}

const CONSULTATION_STATUS_TONE: Record<string, Tone> = {
  SCHEDULED: 'blue',
  IN_PROGRESS: 'orange',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

export function ConsultationStatusBadge({ status }: { status: string }) {
  return <Badge tone={CONSULTATION_STATUS_TONE[status] ?? 'neutral'}>{status.replace(/_/g, ' ')}</Badge>;
}

const PRESCRIPTION_STATUS_TONE: Record<string, Tone> = {
  DRAFT: 'neutral',
  FINALIZED: 'success',
  SUPERSEDED: 'orange',
};

export function PrescriptionStatusBadge({ status }: { status: string }) {
  return <Badge tone={PRESCRIPTION_STATUS_TONE[status] ?? 'neutral'}>{status}</Badge>;
}

const CARE_PLAN_STATUS_TONE: Record<string, Tone> = {
  DRAFT: 'neutral',
  ACTIVE: 'success',
  PAUSED: 'orange',
  COMPLETED: 'purple',
  CANCELLED: 'danger',
  SUPERSEDED: 'danger',
};

export function CarePlanStatusBadge({ status }: { status: string }) {
  return <Badge tone={CARE_PLAN_STATUS_TONE[status] ?? 'neutral'}>{status}</Badge>;
}

const CARE_PLAN_ITEM_STATUS_TONE: Record<string, Tone> = {
  PLANNED: 'neutral',
  ACTIVE: 'blue',
  COMPLETED: 'success',
  MISSED: 'orange',
  CANCELLED: 'danger',
};

export function CarePlanItemStatusBadge({ status }: { status: string }) {
  return <Badge tone={CARE_PLAN_ITEM_STATUS_TONE[status] ?? 'neutral'}>{status}</Badge>;
}

const MEDICINE_ORDER_STATUS_TONE: Record<string, Tone> = {
  PENDING: 'orange',
  ACCEPTED: 'blue',
  PACKING: 'blue',
  DISPATCHED: 'purple',
  DELIVERED: 'success',
  CANCELLED: 'danger',
};

export function MedicineOrderStatusBadge({ status }: { status: string }) {
  return <Badge tone={MEDICINE_ORDER_STATUS_TONE[status] ?? 'neutral'}>{status}</Badge>;
}

const PANCHAKARMA_BOOKING_STATUS_TONE: Record<string, Tone> = {
  RECOMMENDED: 'neutral',
  BOOKED: 'orange',
  SCHEDULED: 'blue',
  IN_PROGRESS: 'purple',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

export function PanchakarmaBookingStatusBadge({ status }: { status: string }) {
  return <Badge tone={PANCHAKARMA_BOOKING_STATUS_TONE[status] ?? 'neutral'}>{status.replace(/_/g, ' ')}</Badge>;
}
