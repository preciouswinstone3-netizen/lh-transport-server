import nodemailer, { type Transporter } from 'nodemailer';

// Lazily created so a missing SMTP config doesn't crash the app at startup -
// it only matters once someone actually triggers an email-sending route.
let transporter: Transporter | null = null;
let transporterChecked = false;

function getTransporter(): Transporter | null {
  if (transporterChecked) return transporter;
  transporterChecked = true;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT || 587) === 465, // true for 465, false for other ports (STARTTLS)
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

export async function sendPasswordResetEmail(to: string, name: string, resetUrl: string): Promise<void> {
  const from = process.env.SMTP_FROM || 'LH Transport <no-reply@lhtransport.mw>';
  const subject = 'Reset your LH Transport password';
  const text =
    `Hi ${name},\n\n` +
    `We received a request to reset your LH Transport password. Click the link below to choose a new one:\n\n` +
    `${resetUrl}\n\n` +
    `This link expires in 1 hour. If you didn't request this, you can safely ignore this email - your password won't be changed.\n\n` +
    `- LH Transport`;
  const html = `
    <div style="font-family: -apple-system, Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1a1f36;">
      <h2 style="color: #0b1a3d;">Reset your password</h2>
      <p>Hi ${name},</p>
      <p>We received a request to reset your LH Transport password. Click the button below to choose a new one.</p>
      <p style="margin: 28px 0;">
        <a href="${resetUrl}" style="background:#0b1a3d;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">
          Reset Password
        </a>
      </p>
      <p style="color:#64748b;font-size:13px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email &mdash; your password won't be changed.</p>
      <p style="color:#94a3b8;font-size:12px;word-break:break-all;">Or copy this link: ${resetUrl}</p>
    </div>
  `;

  const transport = getTransporter();
  if (!transport) {
    // No SMTP configured (e.g. local development) - log instead of failing,
    // so the reset flow is still testable without a real mail provider.
    console.warn(
      `[emailService] SMTP is not configured. Would have sent a password reset email to ${to}:\n${resetUrl}`
    );
    return;
  }

  await transport.sendMail({ from, to, subject, text, html });
}
