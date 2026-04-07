/**
 * In-app Google OAuth token manager.
 * Reads the stored token from the database, refreshes it when expired,
 * and provides a unified access-token getter for Drive and Gmail.
 */
import { storage } from "./storage";

const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export async function getStoredAccessToken(): Promise<string | null> {
  let token;
  try {
    token = await storage.getGoogleToken();
  } catch {
    return null;
  }
  if (!token) return null;

  const needsRefresh =
    !token.tokenExpiry ||
    new Date(token.tokenExpiry).getTime() - REFRESH_BUFFER_MS < Date.now();

  if (needsRefresh) {
    if (!token.refreshToken) return null;
    return refreshAccessToken(token.id, token.refreshToken);
  }

  return token.accessToken;
}

async function refreshAccessToken(tokenId: number, refreshToken: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    const data = (await resp.json()) as any;
    if (!data.access_token) {
      console.error("Token refresh failed:", data);
      return null;
    }

    const expiry = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : null;

    await storage.updateGoogleTokenAccess(tokenId, data.access_token, expiry);
    return data.access_token;
  } catch (e) {
    console.error("Error refreshing Google token:", e);
    return null;
  }
}

export async function hasStoredToken(): Promise<boolean> {
  const token = await getStoredAccessToken();
  return token !== null;
}

export async function getStoredTokenEmail(): Promise<string | null> {
  try {
    const token = await storage.getGoogleToken();
    return token?.email || null;
  } catch {
    return null;
  }
}
