import { SupportQueueView } from '@/components/support/support-queue-view';
import { requireSessionOrRedirect } from '@/server/current-user';

export default async function TechSupportQueuePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await requireSessionOrRedirect();
  const { tab } = await searchParams;

  return (
    <SupportQueueView
      role={session.user.role}
      userId={session.userId}
      basePath="/tech-support/tickets"
      queuePath="/tech-support"
      title="Ticket queue"
      description="Technical support / incident tickets, ordered by priority."
      tab={tab}
    />
  );
}
