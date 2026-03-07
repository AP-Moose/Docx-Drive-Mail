import OpenAI from "openai";
import type { Proposal } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface GeneratedProposal {
  title: string;
  body: string;
  emailSubject: string;
  emailBody: string;
}

export async function generateProposal(
  customerName: string,
  customerEmail: string | null | undefined,
  jobAddress: string | null | undefined,
  projectType: string,
  priceEstimate: string | null | undefined,
  timeline: string | null | undefined,
  scopeNotes: string,
  mode: string
): Promise<GeneratedProposal> {
  const systemPrompt = `You are a professional contractor proposal writer. 
You write clear, professional proposals that are easy for homeowners to understand.
Tone: professional but not corporate, friendly and confident.
Do NOT invent facts not provided. Use [TBD] for missing critical details.`;

  const userPrompt = `Write a contractor proposal with these details:

Customer: ${customerName}
Project Type: ${projectType}
${jobAddress ? `Job Address: ${jobAddress}` : ""}
${priceEstimate ? `Price/Estimate: ${priceEstimate}` : ""}
${timeline ? `Timeline: ${timeline}` : ""}

Scope Notes from Contractor:
${scopeNotes}

Please provide:
1. A professional proposal title
2. The full proposal body with sections for: Scope of Work, Materials/Allowances, Timeline, Pricing/Estimate, and Notes
3. ${mode === "proposal_email" ? "An email subject line and email body" : "Just the title and body (no email needed)"}

Format your response as JSON with these exact keys:
{
  "title": "...",
  "body": "...",
  "emailSubject": "...",
  "emailBody": "..."
}

For the email body, include a friendly message mentioning the proposal and that the customer can view it via a link that will be added later. Use [PROPOSAL_LINK] as the placeholder for the link.
The email should be warm and professional. Sign off generically as "The Contractor".`;

  const response = await openai.chat.completions.create({
    model: "gpt-5.1",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw);

  return {
    title: parsed.title || `${projectType} Proposal for ${customerName}`,
    body: parsed.body || "",
    emailSubject: parsed.emailSubject || `Your ${projectType} Proposal`,
    emailBody: parsed.emailBody || "",
  };
}

export async function refineProposal(
  currentText: string,
  instruction: "shorter" | "longer" | "regenerate",
  originalData: Partial<Proposal>
): Promise<{ body: string }> {
  const instructionMap = {
    shorter: "Make this proposal more concise. Keep all key facts but remove unnecessary filler.",
    longer: "Expand this proposal with more detail. Add more specifics about the scope, materials, and process.",
    regenerate: "Rewrite this proposal from scratch using the same facts, but with fresh wording.",
  };

  const response = await openai.chat.completions.create({
    model: "gpt-5.1",
    messages: [
      {
        role: "system",
        content:
          "You are a professional contractor proposal writer. Revise the following proposal as instructed.",
      },
      {
        role: "user",
        content: `${instructionMap[instruction]}\n\nCurrent proposal:\n${currentText}\n\nReturn only the revised proposal body text, no JSON wrapper.`,
      },
    ],
  });

  return { body: response.choices[0]?.message?.content || currentText };
}
