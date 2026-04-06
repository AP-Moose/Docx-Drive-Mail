export function getGoogleProviderMode(): "oauth" | "replit" | "none" {
  if (process.env.REPLIT_CONNECTORS_HOSTNAME) return "replit";
  return "none";
}
