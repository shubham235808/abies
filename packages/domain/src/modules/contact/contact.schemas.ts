import { z } from 'zod';

export const CONTACT_QUERY_TYPES = [
  'GENERAL',
  'APPOINTMENT',
  'PANCHAKARMA',
  'DIAGNOSTICS',
  'ORDERS',
  'PAYMENT',
  'ACCOUNT',
  'TECHNICAL',
  'OTHER',
] as const;

export const CONTACT_PREFERRED_METHODS = ['EMAIL', 'WHATSAPP', 'PHONE'] as const;

// Control characters are removed. Tab, newline and carriage return are kept
// only in the message body. Header-injection attempts (CR/LF in an address or
// subject) end up as invalid input rather than reaching a mail header.
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const MESSAGE_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

// Any angle bracket in a single-line field is rejected outright. Names and
// subjects have no reason to contain markup.
const NO_ANGLE_BRACKETS = (v: string) => !/[<>]/.test(v);
// A message may contain "<" in ordinary text, but not something that looks like a tag.
const NO_MARKUP_IN_MESSAGE = (v: string) => !/<\/?[a-z!?][^>]*>/i.test(v);

function singleLine(label: string, max: number) {
  return z
    .string({ message: `${label} is required` })
    .transform((v) => v.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim())
    .pipe(
      z
        .string()
        .min(1, `${label} is required`)
        .max(max, `${label} is too long`)
        .refine(NO_ANGLE_BRACKETS, `${label} cannot contain < or >`),
    );
}

// Indian mobile: 10 digits starting 6-9, optionally with +91 or 91 and spaces
// or dashes. Stored as +91XXXXXXXXXX.
const MOBILE = /^(?:\+?91)?([6-9]\d{9})$/;

export const contactSchema = z.object({
  name: singleLine('Full name', 120),
  email: singleLine('Email address', 254)
    .pipe(z.string().email('Enter a valid email address'))
    .transform((v) => v.toLowerCase()),
  mobile: z
    .string({ message: 'Mobile number is required' })
    .transform((v) => v.replace(/[\s-]/g, ''))
    .pipe(z.string().regex(MOBILE, 'Enter a valid 10-digit mobile number'))
    // The capture group is the 10 digits; a number that itself starts with 91 stays intact.
    .transform((v) => `+91${MOBILE.exec(v)![1]}`),
  queryType: z.enum(CONTACT_QUERY_TYPES, { message: 'Choose a query type' }),
  subject: singleLine('Subject', 150),
  message: z
    .string({ message: 'Message is required' })
    .transform((v) => v.replace(MESSAGE_CONTROL_CHARS, '').trim())
    .pipe(
      z
        .string()
        .min(10, 'Please write a little more detail (at least 10 characters)')
        .max(4000, 'Message is too long (4000 characters at most)')
        .refine(NO_MARKUP_IN_MESSAGE, 'Message cannot contain HTML tags'),
    ),
  preferredContact: z.enum(CONTACT_PREFERRED_METHODS).optional(),
  // The guest confirms ABIES may reply about this enquiry. Required.
  consentAcknowledged: z.literal(true, { message: 'Please confirm ABIES may reply to you about this enquiry' }),
  // Honeypot: a field humans never see. Any value means a bot filled the form.
  website: z.string().max(0, 'Could not submit the form').optional(),
});

export type ContactInput = z.output<typeof contactSchema>;
