import { cn } from '@/lib/cn';

export type Tone = 'neutral' | 'purple' | 'magenta' | 'blue' | 'orange' | 'success' | 'danger';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-brand-neutral-100 text-brand-neutral-700',
  purple: 'bg-brand-purple-100 text-brand-purple-700',
  magenta: 'bg-brand-magenta-100 text-brand-magenta-700',
  blue: 'bg-brand-blue-100 text-brand-blue-700',
  orange: 'bg-brand-orange-100 text-brand-orange-700',
  // docs/ABIES-DESIGN-SYSTEM.md §1.2 — semantic tokens, not raw Tailwind
  // color utilities, so a future palette tweak has one place to change.
  success: 'bg-[var(--color-semantic-success-50)] text-[var(--color-semantic-success-700)]',
  danger: 'bg-[var(--color-semantic-danger-50)] text-[var(--color-semantic-danger-700)]',
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

const SUPPORT_TICKET_STATUS_TONE: Record<string, Tone> = {
  OPEN: 'orange',
  IN_PROGRESS: 'blue',
  WAITING_CUSTOMER: 'purple',
  WAITING_PARTNER: 'purple',
  RESOLVED: 'success',
  CLOSED: 'neutral',
};

export function SupportTicketStatusBadge({ status }: { status: string }) {
  return <Badge tone={SUPPORT_TICKET_STATUS_TONE[status] ?? 'neutral'}>{status.replace(/_/g, ' ')}</Badge>;
}

const SUPPORT_TICKET_PRIORITY_TONE: Record<string, Tone> = {
  P1: 'danger',
  P2: 'orange',
  P3: 'blue',
  P4: 'neutral',
};

export function SupportTicketPriorityBadge({ priority }: { priority: string }) {
  return <Badge tone={SUPPORT_TICKET_PRIORITY_TONE[priority] ?? 'neutral'}>{priority}</Badge>;
}

const PARTNER_LEAD_STAGE_TONE: Record<string, Tone> = {
  NEW: 'neutral',
  CONTACTED: 'neutral',
  QUALIFIED: 'blue',
  DOCUMENTATION: 'blue',
  VERIFICATION: 'orange',
  COMMERCIAL: 'purple',
  ENABLEMENT: 'purple',
  ACTIVATED: 'success',
  REJECTED: 'danger',
};

export function PartnerLeadStageBadge({ stage }: { stage: string }) {
  return <Badge tone={PARTNER_LEAD_STAGE_TONE[stage] ?? 'neutral'}>{stage}</Badge>;
}
