/**
 * Gmail integration via Replit Connectors + googleapis
 * Connection ID: conn_google-mail_01KK75AGEXV5QPJPD5F7YKR8AT
 *
 * Available scope: gmail.send — sends email directly (no draft creation possible)
 * WARNING: Never cache the Gmail client — access tokens expire.
 */
import { google } from "googleapis";
import { getGoogleProviderMode } from "./google-auth";

let connectionSettings: any;

async function getAccessToken() {
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
    .then((data: any) => data.items?.[0]);

  const accessToken =
    connectionSettings?.settings?.access_token ||
    connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error("GMAIL_NOT_CONNECTED");
  }
  return accessToken;
}

async function getUncachableGmailClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

export function isGmailConnected(): boolean {
  return getGoogleProviderMode() !== "none";
}

export async function testGmailConnection(): Promise<boolean> {
  try {
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}

export async function getGmailUserEmail(): Promise<string | null> {
  try {
    const accessToken = await getAccessToken();
    const resp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await resp.json()) as any;
    return data.email || null;
  } catch {
    return null;
  }
}

function toBase64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildMimeMessage(to: string, subject: string, bodyText: string): string {
  const raw = [
    `MIME-Version: 1.0`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    ``,
    bodyText,
  ].join("\r\n");

  return toBase64Url(Buffer.from(raw));
}

export async function sendGmailMessage(
  to: string,
  subject: string,
  bodyText: string,
): Promise<{ messageId: string }> {
  if (!isGmailConnected()) throw new Error("GMAIL_NOT_CONNECTED");

  const gmail = await getUncachableGmailClient();
  const raw = buildMimeMessage(to, subject, bodyText);

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  const messageId = response.data.id;
  if (!messageId) {
    throw new Error(`Gmail send returned no message ID: ${JSON.stringify(response.data)}`);
  }

  return { messageId };
}
