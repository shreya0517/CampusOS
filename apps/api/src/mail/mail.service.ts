import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

export type MailConfig = { host: string; port: number; secure: boolean; user?: string; pass?: string; from: string };
export type MailMessage = { to: string; subject: string; text: string; html?: string };

/**
 * SMTP settings from the environment, or null when email isn't set up. SMTP_HOST turns it on; MAIL_FROM (or else
 * SMTP_USER) is the sender. Port 465 uses TLS from the start, other ports upgrade with STARTTLS; SMTP_SECURE overrides.
 * A blank value counts as unset, since `.env.example` leaves them blank.
 */
export const getMailConfig = (env: NodeJS.ProcessEnv = process.env): MailConfig | null => {
  const host = env.SMTP_HOST?.trim();
  const from = env.MAIL_FROM?.trim() || env.SMTP_USER?.trim();
  if (!host || !from) return null;
  const port = Number(env.SMTP_PORT?.trim() || 587);
  if (!Number.isSafeInteger(port) || port <= 0) throw new Error('SMTP_PORT must be a positive integer.');
  return { host, port, secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465, user: env.SMTP_USER?.trim() || undefined, pass: env.SMTP_PASS || undefined, from };
};

/** Sends email over SMTP when it is configured. Without SMTP settings `configured` is false and nothing is sent. */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly config = getMailConfig();
  private transport?: Transporter;

  get configured(): boolean {
    return this.config !== null;
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.config) throw new Error('Email is not configured.');
    this.transport ??= createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: this.config.user ? { user: this.config.user, pass: this.config.pass } : undefined,
    });
    await this.transport.sendMail({ from: this.config.from, ...message });
    // The subject only: recipient addresses stay out of the logs.
    this.logger.log(`Sent "${message.subject}"`);
  }
}
