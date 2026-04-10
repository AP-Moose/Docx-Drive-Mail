const firstNonEmpty = (...values: Array<string | undefined | null>) => {
  for (const value of values) {
    if (value && value.trim()) return value.trim();
  }
  return undefined;
};

// If a direct OPENAI_API_KEY is set, prefer it and use the standard OpenAI endpoint.
// This avoids routing through the Replit AI proxy in deployed environments where
// certain models (e.g. whisper-1) may not be available via the proxy.
const directApiKey = process.env.OPENAI_API_KEY;
const integrationsApiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;

const resolvedApiKey = firstNonEmpty(directApiKey, integrationsApiKey);
const resolvedBaseUrl = directApiKey
  ? firstNonEmpty(process.env.OPENAI_BASE_URL)        // direct key → standard openai.com (or custom URL)
  : firstNonEmpty(
      process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,     // integrations key → Replit proxy
      process.env.OPENAI_BASE_URL,
    );

export const appConfig = {
  openaiApiKey: resolvedApiKey,
  openaiBaseUrl: resolvedBaseUrl,
  openaiChatModel: firstNonEmpty(process.env.OPENAI_MODEL, "gpt-4.5")!,
  openaiTranscriptionModel: firstNonEmpty(
    process.env.OPENAI_TRANSCRIPTION_MODEL,
    "whisper-1",
  )!,
  databaseUrl: firstNonEmpty(process.env.DATABASE_URL),
};

export function hasOpenAIConfig() {
  return Boolean(appConfig.openaiApiKey);
}

export function hasDatabaseConfig() {
  return Boolean(appConfig.databaseUrl);
}

export function hasGoogleOAuthConfig() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
