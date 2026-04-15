/**
 * Gmail integration.
 * Prefers in-app OAuth token (stored in DB) when available.
 * Falls back to Replit Connectors if no in-app token exists.
 * WARNING: Never cache the Gmail client — access tokens expire.
 */
import { google } from "googleapis";
import { getStoredAccessToken, hasStoredToken, getStoredTokenEmail } from "./google-token";

interface ConnectorSettings {
  access_token?: string;
  expires_at?: string;
  oauth?: { credentials?: { access_token?: string } };
}

interface ConnectorItem {
  settings?: ConnectorSettings;
}

interface ConnectorListResponse {
  items?: ConnectorItem[];
}

interface GoogleUserInfo {
  email?: string;
}

let cachedReplitConnectorItem: ConnectorItem | null = null;

async function getReplitAccessToken(): Promise<string> {
  if (
    cachedReplitConnectorItem?.settings?.expires_at &&
    new Date(cachedReplitConnectorItem.settings.expires_at).getTime() > Date.now()
  ) {
    const token =
      cachedReplitConnectorItem.settings.access_token ??
      cachedReplitConnectorItem.settings.oauth?.credentials?.access_token;
    if (token) return token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  if (!hostname) throw new Error("GMAIL_NOT_CONNECTED");

  const xReplitToken =
    process.env.REPL_IDENTITY
      ? `repl ${process.env.REPL_IDENTITY}`
      : process.env.WEB_REPL_RENEWAL
        ? `depl ${process.env.WEB_REPL_RENEWAL}`
        : null;

  if (!xReplitToken) throw new Error("GMAIL_NOT_CONNECTED");

  const resp = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=google-mail`,
    { headers: { Accept: "application/json", "X-Replit-Token": xReplitToken } }
  );
  const data: ConnectorListResponse = await resp.json() as ConnectorListResponse;
  cachedReplitConnectorItem = data.items?.[0] ?? null;

  const accessToken =
    cachedReplitConnectorItem?.settings?.access_token ??
    cachedReplitConnectorItem?.settings?.oauth?.credentials?.access_token;

  if (!cachedReplitConnectorItem || !accessToken) throw new Error("GMAIL_NOT_CONNECTED");
  return accessToken;
}

async function getAccessToken(): Promise<string> {
  const storedToken = await getStoredAccessToken();
  if (storedToken) return storedToken;

  // Only attempt Replit connector fallback when env is configured
  if (!process.env.REPLIT_CONNECTORS_HOSTNAME) throw new Error("GMAIL_NOT_CONNECTED");
  return getReplitAccessToken();
}

async function getUncachableGmailClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

export async function isGmailConnected(): Promise<boolean> {
  const hasToken = await hasStoredToken();
  if (hasToken) return true;
  return !!process.env.REPLIT_CONNECTORS_HOSTNAME;
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
    const data: GoogleUserInfo = await resp.json() as GoogleUserInfo;
    return data.email ?? null;
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
  const connected = await isGmailConnected();
  if (!connected) throw new Error("GMAIL_NOT_CONNECTED");

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
