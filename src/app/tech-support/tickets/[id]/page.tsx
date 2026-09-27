import { notFound } from 'next/navigation';
import { NotFoundError } from '@/lib/errors';
import { getTicket } from '@/modules/support/tickets.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { TicketThread } from '@/components/support/ticket-thread';

export default async function TechSupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  const { id } = await params;

  let ticket;
  try {
    ticket = await getTicket(id, session.userId, session.user.role);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  return <TicketThread ticket={JSON.parse(JSON.stringify(ticket))} viewerRole={session.user.role} />;
}
