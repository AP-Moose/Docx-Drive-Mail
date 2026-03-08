import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const file = new File([audioBuffer], "audio.webm", { type: "audio/webm" });

  const transcript = await openai.audio.transcriptions.create({
    file: file as any,
    model: "whisper-1",
    language: "en",
  });

  return transcript.text;
}
