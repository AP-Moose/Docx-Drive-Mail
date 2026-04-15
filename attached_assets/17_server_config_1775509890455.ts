const firstNonEmpty = (...values: Array<string | undefined | null>) => {
  for (const value of values) {
    if (value && value.trim()) return value.trim();
  }
  return undefined;
};

export const appConfig = {
  openaiApiKey: firstNonEmpty(
    process.env.OPENAI_API_KEY,
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  ),
  openaiBaseUrl: firstNonEmpty(
    process.env.OPENAI_BASE_URL,
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  ),
  openaiChatModel: firstNonEmpty(process.env.OPENAI_MODEL, "gpt-5.1")!,
  openaiTranscriptionModel: firstNonEmpty(
    process.env.OPENAI_TRANSCRIPTION_MODEL,
    "whisper-1",
  )!,
  databaseUrl: firstNonEmpty(process.env.DATABASE_URL),
  googleClientId: firstNonEmpty(process.env.GOOGLE_CLIENT_ID),
  googleClientSecret: firstNonEmpty(process.env.GOOGLE_CLIENT_SECRET),
  googleRefreshToken: firstNonEmpty(process.env.GOOGLE_REFRESH_TOKEN),
  googleRedirectUri: firstNonEmpty(
    process.env.GOOGLE_REDIRECT_URI,
    "https://developers.google.com/oauthplayground",
  )!,
  googleDriveRootFolder: firstNonEmpty(
    process.env.GOOGLE_DRIVE_ROOT_FOLDER,
    "Proposal Builder",
  )!,
};

export function hasOpenAIConfig() {
  return Boolean(appConfig.openaiApiKey);
}

export function hasDatabaseConfig() {
  return Boolean(appConfig.databaseUrl);
}

export function hasGoogleOAuthConfig() {
  return Boolean(
    appConfig.googleClientId &&
      appConfig.googleClientSecret &&
      appConfig.googleRefreshToken,
  );
}

