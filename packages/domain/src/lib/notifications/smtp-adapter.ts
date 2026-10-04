import nodemailer, { type Transporter } from 'nodemailer';
import { getEnv } from '../env';
import type { NotificationAdapter, NotificationRecipient, SendResult } from './types';

// Real adapter (not a placeholder — see index.ts's comment on why it isn't
// subject to the mock provider's lockdown rule). Only EMAIL_PROVIDER=smtp
// uses this today, with requestOtp() (modules/auth/auth.service.ts) as the
// first real caller — every other notify() call in the codebase still uses
// the IN_APP channel.

function renderOtpCode(payload: Record<string, unknown>): { subject: string; text: string } {
  const otp = String(payload.otp ?? '');
  const minutes = Math.round(Number(payload.expiresInSeconds ?? 300) / 60);
  return {
    subject: `Your ABIES verification code: ${otp}`,
    text: `Your ABIES verification code is ${otp}. It expires in ${minutes} minute${minutes === 1 ? '' : 's'}. If you didn't request this, you can ignore this email.`,
  };
}

// Falls back to a plain dump for any templateKey this adapter doesn't know
// about yet — every existing notify() call site uses IN_APP, so there's
// nothing else real to render against today, but a future EMAIL caller
// still gets something sensible rather than a thrown error.
function render(templateKey: string, payload: Record<string, unknown>): { subject: string; text: string } {
  if (templateKey === 'auth.otp_code') return renderOtpCode(payload);
  return { subject: templateKey, text: JSON.stringify(payload) };
}

let transporter: Transporter | undefined;

function smtpTransport(): Transporter {
  if (transporter) return transporter;
  const env = getEnv();
  transporter = nodemailer.createTransport({
    host: env.EMAIL_SMTP_HOST,
    port: env.EMAIL_SMTP_PORT,
    secure: env.EMAIL_SMTP_PORT === 465,
    auth: env.EMAIL_SMTP_USER ? { user: env.EMAIL_SMTP_USER, pass: env.EMAIL_SMTP_PASSWORD } : undefined,
  });
  return transporter;
}

export function createSmtpAdapter(): NotificationAdapter {
  return {
    async send(recipient: NotificationRecipient, templateKey: string, payload: Record<string, unknown>): Promise<SendResult> {
      if (!recipient.email) {
        return { ok: false, error: 'Recipient has no email on file' };
      }
      const env = getEnv();
      const { subject, text } = render(templateKey, payload);
      try {
        const info = await smtpTransport().sendMail({
          from: env.EMAIL_FROM_ADDRESS ?? env.EMAIL_SMTP_USER,
          to: recipient.email,
          subject,
          text,
        });
        return { ok: true, providerRef: info.messageId };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'SMTP send failed' };
      }
    },
  };
}
