/**
 * Gmail integration via Replit Connectors SDK
 * Uses: connectors.proxy("google-mail", endpoint, options)
 * Will be wired to conn_google-mail after OAuth authorization
 */
import { ReplitConnectors } from "@replit/connectors-sdk";

// Connector name will be confirmed once Gmail is connected
const GMAIL_CONNECTOR_NAME = "google-mail";

export function isGmailConnected(): boolean {
  return !!process.env.REPLIT_CONNECTORS_HOSTNAME;
}

/** Build a fresh connectors client — never cache, tokens expire */
function getConnectors() {
  return new ReplitConnectors();
}

/**
 * Encode a string to base64url (RFC 4648 §5), required for Gmail API message body.
 */
function toBase64Url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Build a MIME multipart email message with a .docx attachment.
 * Returns a base64url-encoded RFC 2822 message suitable for the Gmail API.
 */
function buildMimeMessage(
  to: string,
  subject: string,
  bodyText: string,
  attachmentBuffer: Buffer,
  attachmentFilename: string
): string {
  const boundary = `proposal_${Date.now()}`;

  const headers = [
    `MIME-Version: 1.0`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ].join("\r\n");

  const textPart = [
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: quoted-printable`,
    ``,
    bodyText,
  ].join("\r\n");

  const attachmentB64 = attachmentBuffer.toString("base64");
  const safeName = attachmentFilename.replace(/"/g, "'");
  const attachmentPart = [
    `--${boundary}`,
    `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
    `Content-Disposition: attachment; filename="${safeName}"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    // Split base64 into 76-char lines per MIME spec
    attachmentB64.match(/.{1,76}/g)?.join("\r\n") || attachmentB64,
  ].join("\r\n");

  const closingBoundary = `\r\n--${boundary}--`;

  const rawMessage = `${headers}\r\n\r\n${textPart}\r\n\r\n${attachmentPart}${closingBoundary}`;
  return toBase64Url(rawMessage);
}

/**
 * Create a Gmail draft with the proposal as an attachment.
 * Returns the draft ID.
 */
export async function createGmailDraft(
  to: string,
  subject: string,
  bodyText: string,
  attachmentBuffer: Buffer,
  attachmentFilename: string
): Promise<{ draftId: string }> {
  if (!isGmailConnected()) throw new Error("GMAIL_NOT_CONNECTED");

  const connectors = getConnectors();
  const rawMessage = buildMimeMessage(to, subject, bodyText, attachmentBuffer, attachmentFilename);

  const resp = await connectors.proxy(
    GMAIL_CONNECTOR_NAME,
    "/gmail/v1/users/me/drafts",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: { raw: rawMessage },
      }),
    }
  );

  const data = await resp.json() as any;

  if (data.error) {
    throw new Error(`Gmail draft creation failed: ${data.error.message || JSON.stringify(data.error)}`);
  }

  if (!data.id) {
    throw new Error(`Gmail API returned no draft ID: ${JSON.stringify(data)}`);
  }

  return { draftId: data.id };
}
