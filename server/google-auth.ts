export function getGoogleProviderMode(): "inapp" | "replit" | "none" {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) return "inapp";
  if (process.env.REPLIT_CONNECTORS_HOSTNAME) return "replit";
  return "none";
}
