/**
 * Gmail integration — in-app OAuth only.
 * Requires a stored OAuth token from the in-app Google sign-in flow.
 * WARNING: Never cache the Gmail client — access tokens expire.
 */
import { google } from "googleapis";
import { getStoredAccessToken, hasStoredToken, getStoredTokenEmail } from "./google-token";

interface GoogleUserInfo {
  email?: string;
}

async function getAccessToken(): Promise<string> {
  const token = await getStoredAccessToken();
  if (!token) throw new Error("GMAIL_NOT_CONNECTED");
  return token;
}

async function getUncachableGmailClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

export async function isGmailConnected(): Promise<boolean> {
  return hasStoredToken();
}

export async function testGmailConnection(): Promise<boolean> {
  try {
    const token = await getStoredAccessToken();
    return token !== null;
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

function sanitizeMimeHeaderValue(value: string): string {
  return value
    .replace(/\r?\n/g, " ")
    .replace(/^subject:\s*/i, "")
    .replace(/^["']+|["']+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildMimeMessage(to: string, subject: string, bodyText: string): string {
  const safeSubject = sanitizeMimeHeaderValue(subject) || "Your Proposal";
  const raw = [
    `MIME-Version: 1.0`,
    `To: ${to}`,
    `Subject: ${safeSubject}`,
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
