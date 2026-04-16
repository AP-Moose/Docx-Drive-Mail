export function getGoogleProviderMode(): "inapp" | "none" {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) return "inapp";
  return "none";
}
