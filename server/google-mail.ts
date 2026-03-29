import { google } from "googleapis";
import { getGoogleProviderMode, getOAuthClient, getReplitAccessToken } from "./google-auth";

async function getGmailClient() {
  const auth = await getOAuthClient();
  return google.gmail({ version: "v1", auth });
}

async function ensureOAuthAccessToken() {
  const auth = await getOAuthClient();
  const accessTokenResponse = await auth.getAccessToken();
  const token =
    typeof accessTokenResponse === "string"
      ? accessTokenResponse
      : accessTokenResponse?.token;

  if (!token) throw new Error("GMAIL_NOT_CONNECTED");
  return token;
}

export function isGmailConnected(): boolean {
  return getGoogleProviderMode() !== "none";
}

export async function testGmailConnection(): Promise<boolean> {
  try {
    if (!isGmailConnected()) return false;
    const mode = getGoogleProviderMode();

    if (mode === "oauth") {
      // gmail.send scope is enough for the real product flow, but not for getProfile.
      await ensureOAuthAccessToken();
      return true;
    }

    await getReplitAccessToken("google-mail");
    return true;
  } catch {
    return false;
  }
}

export async function getGmailUserEmail(): Promise<string | null> {
  try {
    if (!isGmailConnected()) return null;
    const mode = getGoogleProviderMode();

    if (mode === "oauth") {
      // A send-only token may not be allowed to read profile details.
      await ensureOAuthAccessToken();
      return null;
    }

    const accessToken = await getReplitAccessToken("google-mail");
    const resp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = (await resp.json()) as { email?: string };
    return data.email || null;
  } catch {
    return null;
  }
}

function toBase64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildMimeMessage(to: string, subject: string, bodyText: string): string {
  const raw = [
    "MIME-Version: 1.0",
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    bodyText,
  ].join("\r\n");

  return toBase64Url(Buffer.from(raw));
}

export async function sendGmailMessage(
  to: string,
  subject: string,
  bodyText: string,
): Promise<{ messageId: string }> {
  const mode = getGoogleProviderMode();
  if (mode === "none") throw new Error("GMAIL_NOT_CONNECTED");

  const raw = buildMimeMessage(to, subject, bodyText);

  if (mode === "oauth") {
    const gmail = await getGmailClient();
    const response = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });
    if (!response.data.id) throw new Error("Gmail send returned no message ID");
    return { messageId: response.data.id };
  }

  const accessToken = await getReplitAccessToken("google-mail");
  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    },
  );

  const data = (await response.json()) as { id?: string; error?: unknown };
  if (!response.ok || !data.id) {
    throw new Error(`Gmail send failed: ${JSON.stringify(data.error || data)}`);
  }

  return { messageId: data.id };
}
