/**
 * Gmail integration via Replit Connectors + googleapis
 * Connection ID: conn_google-mail_01KK2ZW3XA21BVEEFSM7VC7Y6R
 *
 * Available scope: gmail.send — sends email directly (no draft creation possible)
 * WARNING: Never cache the Gmail client — access tokens expire.
 */
import { google } from "googleapis";

let connectionSettings: any;

async function getAccessToken() {
  // Re-use cached token if still valid
  if (
    connectionSettings &&
    connectionSettings.settings?.expires_at &&
    new Date(connectionSettings.settings.expires_at).getTime() > Date.now()
  ) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) throw new Error("X-Replit-Token not found");
  if (!hostname) throw new Error("GMAIL_NOT_CONNECTED");

  connectionSettings = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=google-mail`,
    {
      headers: {
        Accept: "application/json",
        "X-Replit-Token": xReplitToken,
      },
    }
  )
    .then((r) => r.json())
    .then((data) => data.items?.[0]);

  const accessToken =
    connectionSettings?.settings?.access_token ||
    connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error("GMAIL_NOT_CONNECTED");
  }
  return accessToken;
}

/** Get a fresh Gmail client — never cache */
async function getUncachableGmailClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

export function isGmailConnected(): boolean {
  return !!process.env.REPLIT_CONNECTORS_HOSTNAME;
}

/** Encode to base64url for Gmail raw message */
function toBase64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Build a MIME multipart/mixed message with plain text body and .docx attachment.
 */
function buildMimeMessage(
  to: string,
  subject: string,
  bodyText: string,
  attachmentBuffer: Buffer,
  attachmentFilename: string
): string {
  const boundary = `proposal_builder_${Date.now()}`;
  const safeName = attachmentFilename.replace(/"/g, "'");
  const attachmentB64 = attachmentBuffer.toString("base64").match(/.{1,76}/g)?.join("\r\n") || "";

  const raw = [
    `MIME-Version: 1.0`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    ``,
    bodyText,
    ``,
    `--${boundary}`,
    `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
    `Content-Disposition: attachment; filename="${safeName}"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    attachmentB64,
    ``,
    `--${boundary}--`,
  ].join("\r\n");

  return toBase64Url(Buffer.from(raw));
}

/**
 * Send an email directly via Gmail (uses gmail.send scope).
 * Returns the sent message ID — we store this as the "draft ID" in the DB
 * so the user can find it in their Sent folder.
 */
export async function createGmailDraft(
  to: string,
  subject: string,
  bodyText: string,
  attachmentBuffer: Buffer,
  attachmentFilename: string
): Promise<{ draftId: string }> {
  if (!isGmailConnected()) throw new Error("GMAIL_NOT_CONNECTED");

  const gmail = await getUncachableGmailClient();
  const raw = buildMimeMessage(to, subject, bodyText, attachmentBuffer, attachmentFilename);

  // Use messages.send — supported by gmail.send scope
  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  const messageId = response.data.id;
  if (!messageId) {
    throw new Error(`Gmail send returned no message ID: ${JSON.stringify(response.data)}`);
  }

  return { draftId: messageId };
}
