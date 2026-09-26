import { TicketQueueList } from '@/components/support/ticket-queue-list';
import { listQueue } from '@/modules/support/tickets.service';
import { requireSessionOrRedirect } from '@/server/current-user';

export default async function CustomerSupportQueuePage() {
  const session = await requireSessionOrRedirect();
  const tickets = await listQueue(session.user.role);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Ticket queue</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">Customer support tickets, ordered by priority.</p>
      <TicketQueueList tickets={JSON.parse(JSON.stringify(tickets))} basePath="/customer-support/tickets" />
    </div>
  );
}
