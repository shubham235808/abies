import { describe, expect, it } from 'vitest';
import { DEFAULT_REPLY_TO, replyToFor } from '@abies/domain/modules/notifications/senders';

describe('Reply-To by family', () => {
  it.each([
    ['auth.otp_code', 'support@abies.in'],
    ['notifications.general', 'support@abies.in'],
    ['appointment.confirmed', 'care@abies.in'],
    ['appointment.cancelled', 'care@abies.in'],
    ['order.confirmed', 'orders@abies.in'],
    ['order.shipped', 'orders@abies.in'],
    ['order.delivered', 'orders@abies.in'],
    ['payment.success', 'accounts@abies.in'],
    ['refund.completed', 'accounts@abies.in'],
    ['partners.onboarded', 'partners@abies.in'],
  ])('%s replies to %s', (templateKey, replyTo) => {
    expect(replyToFor(templateKey)).toBe(replyTo);
  });

  it('falls back to support for an unlisted family', () => {
    expect(replyToFor('marketing.blast')).toBe(DEFAULT_REPLY_TO);
    expect(DEFAULT_REPLY_TO).toBe('support@abies.in');
  });
});
