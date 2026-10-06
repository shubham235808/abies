// Pure consent rules: no database. The service applies them to stored choices.

export const CATEGORIES = ['SECURITY', 'TRANSACTIONAL', 'SERVICE', 'MARKETING'] as const;
export type Category = (typeof CATEGORIES)[number];
// Consent is per channel: a WhatsApp choice never implies email, or the reverse.
// ABIES has no SMS channel.
export const PREF_CHANNELS = ['EMAIL', 'WHATSAPP', 'IN_APP', 'PUSH'] as const;
export type PrefChannel = (typeof PREF_CHANNELS)[number];

// Security messages (OTP, account safety) can't be switched off.
export function canDisable(category: Category): boolean {
  return category !== 'SECURITY';
}

// Default when nothing is stored: transactional and service messages go out;
// marketing does not until the user opts in for that channel.
export function defaultEnabled(category: Category): boolean {
  return category !== 'MARKETING';
}

// Decides whether a send may go out, given the stored choice (or undefined).
export function mayBeSent(category: Category, stored: boolean | undefined): boolean {
  if (category === 'SECURITY') return true;
  if (stored === undefined) return defaultEnabled(category);
  return stored;
}
