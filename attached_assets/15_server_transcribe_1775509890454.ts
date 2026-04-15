import OpenAI from "openai";
import { appConfig, hasOpenAIConfig } from "./config";

function getOpenAIClient() {
  if (!hasOpenAIConfig()) throw new Error("OPENAI_NOT_CONFIGURED");
  return new OpenAI({
    apiKey: appConfig.openaiApiKey,
    baseURL: appConfig.openaiBaseUrl,
  });
}

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const openai = getOpenAIClient();
  const file = new File([audioBuffer], "audio.webm", { type: "audio/webm" });

  const transcript = await openai.audio.transcriptions.create({
    file: file as any,
    model: appConfig.openaiTranscriptionModel,
    language: "en",
  });

  return transcript.text;
}
