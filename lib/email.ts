/**
 * lib/email.ts — Azure Communication Services email sender.
 *
 * All outbound email flows through this module:
 *   · Welcome / email-verification on registration
 *   · Project invite (existing user added to a project)
 *   · Password reset
 *
 * Usage:
 *   import { sendEmail } from "@/lib/email";
 *   await sendEmail({ to: "user@example.com", subject: "Hello", html: "<p>Hi</p>" });
 *
 * Set AZURE_COMMUNICATION_CONNECTION_STRING and AZURE_COMMUNICATION_SENDER in .env.
 * While those are placeholders, every call logs to console and returns without
 * throwing so the rest of the app still works locally without real Azure credentials.
 */

import { EmailClient, type EmailMessage } from "@azure/communication-email";

let _client: EmailClient | null = null;

function getClient(): EmailClient | null {
  const conn = process.env.AZURE_COMMUNICATION_CONNECTION_STRING;
  if (!conn || conn.includes("REPLACE_ME")) return null;
  if (!_client) _client = new EmailClient(conn);
  return _client;
}

type SendOptions = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

/**
 * Send a single transactional email.
 * Returns true on success, false if Azure is not configured (dev mode).
 */
export async function sendEmail(options: SendOptions): Promise<boolean> {
  const client = getClient();
  const sender = process.env.AZURE_COMMUNICATION_SENDER;

  if (!client || !sender || sender.includes("REPLACE_ME")) {
    // Dev mode — log the email to console so you can still test flows.
    console.log(`\n[email:dev] ──────────────────────────────────────────`);
    console.log(`  To:      ${options.to}`);
    console.log(`  Subject: ${options.subject}`);
    console.log(`  Body:    ${options.text ?? options.html.replace(/<[^>]+>/g, " ").trim().slice(0, 200)}`);
    console.log(`────────────────────────────────────────────────────────\n`);
    return false; // not actually sent, but not an error
  }

  const message: EmailMessage = {
    senderAddress: sender,
    content: {
      subject: options.subject,
      html: options.html,
      plainText: options.text ?? htmlToPlainText(options.html)
    },
    recipients: {
      to: [{ address: options.to }]
    }
  };

  try {
    const poller = await client.beginSend(message);
    const result = await poller.pollUntilDone();
    if (result.status === "Succeeded") return true;
    console.error("[email] Send failed:", result.error);
    return false;
  } catch (err) {
    console.error("[email] Send error:", err);
    return false;
  }
}

// ─── Template helpers ─────────────────────────────────────────────────────────

const BASE = () => process.env.APP_BASE_URL ?? "http://localhost:3000";

/** Wrap any content in the standard Fonia Projects email shell. */
function template(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background: #0d0d14; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #e2e8f0; }
    .wrap { max-width: 520px; margin: 40px auto; padding: 0 16px; }
    .card { background: #161622; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 36px 32px; }
    .logo { font-size: 18px; font-weight: 800; color: #38bdf8; margin-bottom: 28px; letter-spacing: -0.5px; }
    h1 { margin: 0 0 12px; font-size: 22px; font-weight: 700; color: #f1f5f9; }
    p { margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #94a3b8; }
    .btn { display: inline-block; margin: 8px 0 20px; padding: 12px 24px; background: #38bdf8; color: #0d0d14; font-weight: 700; font-size: 15px; text-decoration: none; border-radius: 8px; }
    .footer { margin-top: 28px; font-size: 12px; color: #475569; text-align: center; }
    .divider { border: none; border-top: 1px solid rgba(255,255,255,0.07); margin: 24px 0; }
    .link-box { background: rgba(255,255,255,0.04); border-radius: 6px; padding: 10px 14px; font-size: 13px; color: #64748b; word-break: break-all; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="logo">▲ Fonia Projects</div>
      ${bodyHtml}
    </div>
    <div class="footer">
      A Fonia Labs Product &nbsp;·&nbsp; You received this because an action was taken on your account.
    </div>
  </div>
</body>
</html>`;
}

/** Welcome + email verification email sent on registration. */
export function welcomeEmail(opts: { name: string; verifyUrl: string }): { subject: string; html: string } {
  return {
    subject: "Verify your Fonia Projects email",
    html: template("Verify your email", `
      <h1>Welcome, ${escHtml(opts.name)}!</h1>
      <p>You're almost in. Click the button below to verify your email address and activate your account.</p>
      <a href="${opts.verifyUrl}" class="btn">Verify email address</a>
      <hr class="divider" />
      <p style="font-size:13px;">Or copy this link into your browser:</p>
      <div class="link-box">${opts.verifyUrl}</div>
      <p style="font-size:13px;color:#475569;">This link expires in 24 hours. If you didn't sign up, you can ignore this email.</p>
    `)
  };
}

/** Project invitation email — sent when an owner/admin adds someone by email. */
export function inviteEmail(opts: {
  inviterName: string;
  projectName: string;
  inviteUrl: string;
  isNewUser: boolean;
}): { subject: string; html: string } {
  const action = opts.isNewUser
    ? `${escHtml(opts.inviterName)} invited you to join <b>${escHtml(opts.projectName)}</b> on Fonia Projects. Create your free account to get started.`
    : `${escHtml(opts.inviterName)} added you to <b>${escHtml(opts.projectName)}</b> on Fonia Projects.`;

  return {
    subject: `${opts.inviterName} invited you to "${opts.projectName}" on Fonia Projects`,
    html: template("You have been invited", `
      <h1>You've been invited</h1>
      <p>${action}</p>
      <a href="${opts.inviteUrl}" class="btn">${opts.isNewUser ? "Accept invitation" : "Open project"}</a>
      <hr class="divider" />
      <p style="font-size:13px;">Or copy this link:</p>
      <div class="link-box">${opts.inviteUrl}</div>
      <p style="font-size:13px;color:#475569;">This invitation expires in 7 days.</p>
    `)
  };
}

/** Password reset email. */
export function passwordResetEmail(opts: { name: string; resetUrl: string }): { subject: string; html: string } {
  return {
    subject: "Reset your Fonia Projects password",
    html: template("Reset your password", `
      <h1>Reset your password</h1>
      <p>Hi ${escHtml(opts.name)}, we received a request to reset the password for your Fonia Projects account.</p>
      <a href="${opts.resetUrl}" class="btn">Reset password</a>
      <hr class="divider" />
      <p style="font-size:13px;">Or copy this link:</p>
      <div class="link-box">${opts.resetUrl}</div>
      <p style="font-size:13px;color:#475569;">This link expires in 1 hour. If you didn't request a reset, you can safely ignore this email — your password won't change.</p>
    `)
  };
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

function escHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export { BASE };
