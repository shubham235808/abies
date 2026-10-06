import type { RequestContext } from '../../server/rbac';
import type { CrmActor } from './rbac';

// Builds the CRM actor from an authenticated request. Keeps the session's
// role as the single source of truth; nothing trusts a role sent by the client.
export function crmActorFromContext(ctx: RequestContext): CrmActor {
  return {
    userId: ctx.session.userId,
    role: ctx.session.user.role,
    mfaVerified: ctx.session.mfaVerified,
    sessionId: ctx.session.id,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  };
}

// Same actor for Server Components, which read the session directly.
export function crmActorFromSession(session: {
  id: string;
  userId: string;
  mfaVerified: boolean;
  user: { role: CrmActor['role'] };
}): CrmActor {
  return { userId: session.userId, role: session.user.role, mfaVerified: session.mfaVerified, sessionId: session.id };
}
