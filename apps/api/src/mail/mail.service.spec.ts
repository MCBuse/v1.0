import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailService } from './mail.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

const message = {
  to: 'a@b.test',
  subject: 'Code',
  text: 'Your code is 123456',
};

function service(env: Record<string, string | undefined>) {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  return new MailService(config);
}

describe('MailService', () => {
  const createTransport = nodemailer.createTransport as jest.Mock;
  const sendMail = jest.fn().mockResolvedValue({});

  beforeEach(() => {
    jest.clearAllMocks();
    createTransport.mockReturnValue({ sendMail });
  });

  it('sends through SMTP when configured', async () => {
    await service({
      SMTP_HOST: 'smtp.test',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'u',
      SMTP_PASSWORD: 'p',
      SMTP_FROM: 'MCBuse <no-reply@mcbuse.test>',
    }).send(message);

    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.test',
      port: 465,
      secure: true,
      requireTLS: true,
      auth: { user: 'u', pass: 'p' },
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'MCBuse <no-reply@mcbuse.test>',
      ...message,
    });
  });

  it('logs the message outside production when SMTP is not configured', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    await expect(
      service({ NODE_ENV: 'development' }).send(message),
    ).resolves.toBeUndefined();
    expect(createTransport).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('123456'));
    log.mockRestore();
  });

  it('refuses in production when SMTP is not configured', async () => {
    await expect(
      service({ NODE_ENV: 'production' }).send(message),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(createTransport).not.toHaveBeenCalled();
  });
});
