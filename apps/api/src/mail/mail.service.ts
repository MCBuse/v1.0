import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/** Plain-text transactional email over the SMTP_* settings. */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  async send(message: {
    to: string;
    subject: string;
    text: string;
  }): Promise<void> {
    const host = this.config.get<string>('SMTP_HOST');
    const from = this.config.get<string>('SMTP_FROM');
    const user = this.config.get<string>('SMTP_USER');
    const password = this.config.get<string>('SMTP_PASSWORD');

    if (!host || !from || !user || !password) {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new ServiceUnavailableException('Email is not configured');
      }
      // Dev flow stays testable end-to-end without an SMTP server.
      this.logger.log(
        `[DEV] Email to ${message.to} | ${message.subject} | ${message.text}`,
      );
      return;
    }

    await nodemailer
      .createTransport({
        host,
        port: Number(this.config.get<string>('SMTP_PORT') ?? 587),
        secure: this.config.get<string>('SMTP_SECURE') === 'true',
        requireTLS: true,
        auth: { user, pass: password },
      })
      .sendMail({ from, ...message });
  }
}
