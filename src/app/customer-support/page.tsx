import { SupportQueueView } from '@/components/support/support-queue-view';
import { requireSessionOrRedirect } from '@/server/current-user';

export default async function CustomerSupportQueuePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await requireSessionOrRedirect();
  const { tab } = await searchParams;

  return (
    <SupportQueueView
      role={session.user.role}
      userId={session.userId}
      basePath="/customer-support/tickets"
      queuePath="/customer-support"
      title="Ticket queue"
      description="Customer support tickets, ordered by priority."
      tab={tab}
    />
  );
}
