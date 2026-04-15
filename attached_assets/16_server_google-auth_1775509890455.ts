import { google } from "googleapis";
import { appConfig, hasGoogleOAuthConfig } from "./config";

function getReplitIdentityToken() {
  if (process.env.REPL_IDENTITY) return `repl ${process.env.REPL_IDENTITY}`;
  if (process.env.WEB_REPL_RENEWAL) return `depl ${process.env.WEB_REPL_RENEWAL}`;
  return null;
}

export function getGoogleProviderMode(): "oauth" | "replit" | "none" {
  if (hasGoogleOAuthConfig()) return "oauth";
  if (process.env.REPLIT_CONNECTORS_HOSTNAME) return "replit";
  return "none";
}

export async function getOAuthClient() {
  if (!hasGoogleOAuthConfig()) throw new Error("GOOGLE_OAUTH_NOT_CONFIGURED");

  const oauth2Client = new google.auth.OAuth2(
    appConfig.googleClientId,
    appConfig.googleClientSecret,
    appConfig.googleRedirectUri,
  );

  oauth2Client.setCredentials({
    refresh_token: appConfig.googleRefreshToken,
  });

  return oauth2Client;
}

export async function getReplitAccessToken(connectorName: string) {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = getReplitIdentityToken();

  if (!hostname || !xReplitToken) throw new Error(`${connectorName.toUpperCase()}_NOT_CONNECTED`);

  const response = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=${connectorName}`,
    {
      headers: {
        Accept: "application/json",
        "X-Replit-Token": xReplitToken,
      },
    },
  );

  const payload = (await response.json()) as {
    items?: Array<{
      settings?: {
        access_token?: string;
        oauth?: { credentials?: { access_token?: string } };
      };
    }>;
  };

  const item = payload.items?.[0];
  const accessToken =
    item?.settings?.access_token || item?.settings?.oauth?.credentials?.access_token;

  if (!accessToken) throw new Error(`${connectorName.toUpperCase()}_NOT_CONNECTED`);

  return accessToken;
}

