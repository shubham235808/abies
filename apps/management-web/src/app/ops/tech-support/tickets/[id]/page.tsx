import { notFound } from 'next/navigation';
import { NotFoundError } from '@abies/domain/lib/errors';
import { getTicket } from '@abies/domain/modules/support/tickets.service';
import { requireSessionOrRedirect } from '@abies/domain/server/current-user';
import { TicketThread } from '@abies/design-system/support/ticket-thread';

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
