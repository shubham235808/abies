import { describe, expect, it } from 'vitest';
import { canDisable, defaultEnabled, mayBeSent } from '@abies/domain/modules/notifications/preferences.rules';

describe('consent rules', () => {
  it('security messages cannot be disabled', () => {
    expect(canDisable('SECURITY')).toBe(false);
    expect(canDisable('TRANSACTIONAL')).toBe(true);
    expect(canDisable('MARKETING')).toBe(true);
  });

  it('transactional and service default on, marketing defaults off', () => {
    expect(defaultEnabled('TRANSACTIONAL')).toBe(true);
    expect(defaultEnabled('SERVICE')).toBe(true);
    expect(defaultEnabled('MARKETING')).toBe(false);
  });

  it('security is always sent, whatever is stored', () => {
    expect(mayBeSent('SECURITY', false)).toBe(true);
    expect(mayBeSent('SECURITY', undefined)).toBe(true);
  });

  it('marketing needs an explicit opt-in per channel', () => {
    expect(mayBeSent('MARKETING', undefined)).toBe(false);
    expect(mayBeSent('MARKETING', true)).toBe(true);
    expect(mayBeSent('MARKETING', false)).toBe(false);
  });

  it('a stored withdrawal stops transactional messages on that channel', () => {
    expect(mayBeSent('TRANSACTIONAL', false)).toBe(false);
    expect(mayBeSent('TRANSACTIONAL', undefined)).toBe(true);
  });
});
