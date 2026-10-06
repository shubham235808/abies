import { describe, expect, it } from 'vitest';
import {
  SenderConfigError,
  getSenderAddresses,
  providerTemplateIdFor,
  readSenderAddress,
  senderFor,
  senderRoleFor,
} from '@abies/domain/modules/notifications/senders';

describe('sender defaults', () => {
  it('uses the documented default address for each role when env is unset', () => {
    expect(getSenderAddresses({})).toEqual({
      verification: 'verification@abies.in',
      notifications: 'notifications@abies.in',
      appointments: 'appointments-notify@abies.in',
      orders: 'orders-notify@abies.in',
      billing: 'billing-notify@abies.in',
    });
  });

  it('treats a blank env value as unset', () => {
    expect(readSenderAddress('orders', { ABIES_SENDER_ORDERS: '   ' })).toBe('orders-notify@abies.in');
  });

  it('reads each address from its own env variable', () => {
    const env = {
      ABIES_SENDER_VERIFICATION: 'otp@example.test',
      ABIES_SENDER_NOTIFICATIONS: 'hello@example.test',
      ABIES_SENDER_APPOINTMENTS: 'appt@example.test',
      ABIES_SENDER_ORDERS: 'orders@example.test',
      ABIES_SENDER_BILLING: 'bill@example.test',
    };
    expect(getSenderAddresses(env)).toEqual({
      verification: 'otp@example.test',
      notifications: 'hello@example.test',
      appointments: 'appt@example.test',
      orders: 'orders@example.test',
      billing: 'bill@example.test',
    });
  });

  it('rejects a configured value that is not an email address', () => {
    expect(() => readSenderAddress('billing', { ABIES_SENDER_BILLING: 'not-an-address' })).toThrow(SenderConfigError);
  });
});

describe('sender mapping by template key family', () => {
  it.each([
    ['auth.otp_code', 'verification'],
    ['auth.password_reset', 'verification'],
    ['appointment.confirmed', 'appointments'],
    ['appointment.booked', 'appointments'],
    ['order.shipped', 'orders'],
    ['order.delivered', 'orders'],
    ['payment.success', 'billing'],
    ['refund.completed', 'billing'],
    ['refund.approved', 'billing'],
    ['support.new_message', 'notifications'],
    ['diagnostic.report_ready', 'notifications'],
    ['crm.automation', 'notifications'],
    ['unknownkey', 'notifications'],
  ] as const)('maps %s to %s', (key, role) => {
    expect(senderRoleFor(key)).toBe(role);
    expect(senderFor(key, {}).role).toBe(role);
  });

  it('returns the configured address for the mapped role', () => {
    expect(senderFor('auth.otp_code', { ABIES_SENDER_VERIFICATION: 'otp@example.test' })).toEqual({
      role: 'verification',
      address: 'otp@example.test',
    });
  });
});

describe('provider template IDs', () => {
  it('returns undefined until a provider template is approved', () => {
    expect(providerTemplateIdFor('auth.otp_code', 'WHATSAPP')).toBeUndefined();
  });
});
