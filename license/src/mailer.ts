import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_REJECT_UNAUTH = process.env.SMTP_REJECT_UNAUTH !== 'false';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const MAIL_FROM = process.env.MAIL_FROM || '"LeaveAt" <noreply@leaveat.com>';

let _transport: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter {
  if (_transport) return _transport;
  if (!SMTP_HOST) throw new Error('SMTP_HOST is not configured — email sending is disabled.');
  _transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    tls: { rejectUnauthorized: SMTP_REJECT_UNAUTH },
  });
  return _transport;
}

export function isEmailEnabled(): boolean {
  return Boolean(SMTP_HOST);
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  await getTransport().sendMail({ from: MAIL_FROM, ...opts });
}
