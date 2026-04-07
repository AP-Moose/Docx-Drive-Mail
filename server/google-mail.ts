/**
 * Gmail integration.
 * Prefers in-app OAuth token (stored in DB) when available.
 * Falls back to Replit Connectors if no in-app token exists.
 * WARNING: Never cache the Gmail client — access tokens expire.
 */
import { google } from "googleapis";
import { getStoredAccessToken, hasStoredToken, getStoredTokenEmail } from "./google-token";

let replitConnectionSettings: any;

async function getReplitAccessToken(): Promise<string> {
  if (
    replitConnectionSettings &&
    replitConnectionSettings.settings?.expires_at &&
    new Date(replitConnectionSettings.settings.expires_at).getTime() > Date.now()
  ) {
    return replitConnectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) throw new Error("X-Replit-Token not found");
  if (!hostname) throw new Error("GMAIL_NOT_CONNECTED");

  replitConnectionSettings = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=google-mail`,
    {
      headers: { Accept: "application/json", "X-Replit-Token": xReplitToken },
    }
  )
    .then((r) => r.json())
    .then((data: any) => data.items?.[0]);

  const accessToken =
    replitConnectionSettings?.settings?.access_token ||
    replitConnectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!replitConnectionSettings || !accessToken) throw new Error("GMAIL_NOT_CONNECTED");
  return accessToken;
}

async function getAccessToken(): Promise<string> {
  const storedToken = await getStoredAccessToken();
  if (storedToken) return storedToken;
  return getReplitAccessToken();
}

async function getUncachableGmailClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

export function isGmailConnected(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID || process.env.REPLIT_CONNECTORS_HOSTNAME);
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
    const storedEmail = await getStoredTokenEmail();
    if (storedEmail) return storedEmail;
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
  bodyText: string
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
