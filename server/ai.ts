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
  projectType: string;
}

export async function generateProposal(
  customerName: string,
  customerEmail: string | null | undefined,
  jobAddress: string | null | undefined,
  scopeNotes: string,
  mode: string
): Promise<GeneratedProposal> {
  const systemPrompt = `You are a professional contractor proposal writer.
You write clear, professional proposals that are easy for homeowners to understand.
Tone: professional but not corporate, friendly and confident.
Do NOT invent facts not provided. Use [TBD] for missing critical details.`;

  const userPrompt = `Write a contractor proposal with these details:

Customer: ${customerName}
${jobAddress ? `Job Address: ${jobAddress}` : ""}

Scope Notes from Contractor:
${scopeNotes}

Based on the scope notes, determine the project type (e.g. Bathroom, Kitchen, Roofing, Deck, Flooring, Painting, Siding, Fencing, General Remodel, etc.).
If the contractor mentioned pricing, timeline, or materials in the scope notes, include those details in the proposal.

Use this EXACT section structure for the proposal body (use ALL CAPS headings):

PROJECT SCOPE
- List each work item as a bullet point (use "- " prefix)
- Be specific about what is being removed, installed, replaced
- Include materials if mentioned

TOTAL INVESTMENT
State the price as a flat rate or estimate range
Include a line about what the price covers (labor, materials, cleanup, etc.)

DEPOSIT SCHEDULE
Break the total into payment milestones (typically thirds):
- One-third due upon contract signing
- One-third due on the first day of on-site work
- Final one-third due upon project completion
Calculate the actual dollar amounts

PROJECT DETAILS
- Estimated timeline
- Material selection notes
- Exclusions (permits, structural, etc.)
- Any other relevant notes

ACCEPTANCE OF PROPOSAL
By signing below, you agree to the scope of work and payment terms outlined above.

Client Name (Printed): __________________________________________

Client Signature: ________________________________________________

Date: _______________________

Please provide:
1. A professional proposal title (format: "[Project Type] Proposal" followed by the job address on a new line, e.g. "BATHROOM RENOVATION PROPOSAL\\n5200 Hilltop Dr, Brookhaven")
2. The full proposal body following the exact section structure above
3. ${mode === "proposal_email" ? "An email subject line and email body" : "Just the title and body (no email needed)"}
4. The project type you inferred from the scope notes (a short label like "Deck", "Bathroom", "Roofing", etc.)

Format your response as JSON with these exact keys:
{
  "title": "...",
  "body": "...",
  "emailSubject": "...",
  "emailBody": "...",
  "projectType": "..."
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
    title: parsed.title || `Proposal for ${customerName}`,
    body: parsed.body || "",
    emailSubject: parsed.emailSubject || `Your Proposal`,
    emailBody: parsed.emailBody || "",
    projectType: parsed.projectType || "General",
  };
}

export async function refineProposal(
  currentText: string,
  instruction: string,
  originalData: Partial<Proposal>
): Promise<{ body: string }> {
  const shortcutMap: Record<string, string> = {
    shorter: "Make this proposal more concise. Keep all key facts but remove unnecessary filler. Keep the same section structure (PROJECT SCOPE, TOTAL INVESTMENT, DEPOSIT SCHEDULE, PROJECT DETAILS, ACCEPTANCE OF PROPOSAL).",
    longer: "Expand this proposal with more detail. Add more specifics about the scope, materials, and process. Keep the same section structure.",
    regenerate: "Rewrite this proposal from scratch using the same facts, but with fresh wording. Keep the same section structure (PROJECT SCOPE, TOTAL INVESTMENT, DEPOSIT SCHEDULE, PROJECT DETAILS, ACCEPTANCE OF PROPOSAL).",
  };

  const resolvedInstruction = shortcutMap[instruction] || instruction;

  const response = await openai.chat.completions.create({
    model: "gpt-5.1",
    messages: [
      {
        role: "system",
        content:
          "You are a professional contractor proposal writer. Revise the following proposal as instructed. Return only the revised proposal body text, no JSON wrapper, no markdown fences. Maintain the section structure with ALL CAPS headings (PROJECT SCOPE, TOTAL INVESTMENT, DEPOSIT SCHEDULE, PROJECT DETAILS, ACCEPTANCE OF PROPOSAL).",
      },
      {
        role: "user",
        content: `Instruction: ${resolvedInstruction}\n\nCurrent proposal:\n${currentText}\n\nReturn only the revised proposal body text.`,
      },
    ],
  });

  return { body: response.choices[0]?.message?.content || currentText };
}
