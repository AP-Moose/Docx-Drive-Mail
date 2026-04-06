import OpenAI from "openai";
import type { Proposal } from "@shared/schema";
import { appConfig, hasOpenAIConfig } from "./config";

function getOpenAIClient() {
  if (!hasOpenAIConfig()) throw new Error("OPENAI_NOT_CONFIGURED");
  return new OpenAI({
    apiKey: appConfig.openaiApiKey,
    baseURL: appConfig.openaiBaseUrl,
  });
}

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
  const openai = getOpenAIClient();
  const systemPrompt = `You are a professional contractor proposal writer for Inspiring Services, a home improvement company.
You write clean, direct proposals that are easy for homeowners to read. No fluff, no filler, no corporate jargon.
The contractor often dictates scope notes by voice, so the input may have typos, run-on sentences, and rough grammar — extract the facts and write professionally.
NEVER use bracket placeholders like [TBD], [TBD - xyz], [Client Name], etc. in the proposal body. If information is not provided, simply omit it. If something is to be decided by the homeowner, say it naturally (e.g. "Color to be selected by homeowner").
The ONLY allowed bracket placeholder is [PROPOSAL_LINK] in the emailBody field — this is required and will be replaced with the actual link.`;

  const userPrompt = `Write a contractor proposal with these details:

Customer: ${customerName}
${jobAddress ? `Job Address: ${jobAddress}` : ""}

Scope Notes from Contractor (may be rough voice dictation):
${scopeNotes}

Generate a clean, professional proposal using this EXACT structure. Match the style of this example output:

---
BATHROOM RENOVATION PROPOSAL

5200 Hilltop Dr, Brookhaven

PROJECT SCOPE

- Full demolition of existing bathroom
- Removal of all mold-affected drywall and materials
- Treatment and sanitizing of impacted framing areas
- Proper debris disposal

TOTAL INVESTMENT

$9,895 (Flat Rate)

This price includes all labor, standard installation materials, mold remediation treatment, debris removal, and full project management.

DEPOSIT SCHEDULE

- One-third ($3,298) due upon contract signing
- One-third ($3,298) due on the first day of on-site work
- Final one-third ($3,299) due upon project completion

PROJECT DETAILS

- Estimated timeline: 5–7 working days
- Final material selections to be confirmed prior to ordering
- Permit fees (if required) not included
- Any major structural repairs discovered during demolition will be discussed prior to proceeding

ACCEPTANCE OF PROPOSAL

By signing below, you agree to the scope of work and payment terms outlined above.

Client Name (Printed): __________________________________________

Client Signature: ________________________________________________

Date: _______________________
---

Rules:
- PROJECT SCOPE: One bullet per work item. Be specific. No sub-bullets or explanations.
- TOTAL INVESTMENT: State the price. One sentence about what it includes.
- DEPOSIT SCHEDULE: Split into thirds with calculated dollar amounts. Use bullet points.
- PROJECT DETAILS: Brief bullet points only. Timeline, material notes, exclusions.
- ACCEPTANCE OF PROPOSAL: Exactly as shown above — signing line, signature line, date line.
- If the contractor mentions multiple separate estimates/prices for different areas, list them all clearly in TOTAL INVESTMENT with a combined total.
- Do NOT add sections that aren't in the example. Do NOT add warranty info, terms and conditions, company descriptions, or any other extra sections.
- Do NOT use any bracket placeholders like [TBD] anywhere.
- Keep every line short and direct. No paragraphs in the scope section.

Title format: "[PROJECT TYPE] PROPOSAL" (all caps, e.g. "KITCHEN RENOVATION PROPOSAL")
If there's an address, put it on a second line of the title.

Please provide as JSON:
{
  "title": "PROJECT TYPE PROPOSAL\\nAddress if provided",
  "body": "the full proposal body starting from PROJECT SCOPE through the signature lines",
  "emailSubject": "${mode === "proposal_email" ? "a short professional email subject" : ""}",
  "emailBody": "${mode === "proposal_email" ? "a brief, friendly email body — keep it short and casual like a text from a contractor. Use [PROPOSAL_LINK] as placeholder for the link. Sign off as the contractor." : ""}",
  "projectType": "short label like Bathroom, Kitchen, Flooring, etc."
}`;

  const response = await openai.chat.completions.create({
    model: appConfig.openaiChatModel,
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
  const openai = getOpenAIClient();
  const shortcutMap: Record<string, string> = {
    shorter: "Make this proposal more concise. Remove unnecessary words but keep all facts and dollar amounts. Keep the exact same section structure.",
    longer: "Add more detail to the scope items. Keep the same section structure and style — no fluff, just more specifics.",
    regenerate: "Rewrite this proposal from scratch using the same facts and prices. Keep the exact same section structure. Fresh wording, same clean style.",
  };

  const resolvedInstruction = shortcutMap[instruction] || instruction;

  const response = await openai.chat.completions.create({
    model: appConfig.openaiChatModel,
    messages: [
      {
        role: "system",
        content:
          "You are a professional contractor proposal writer for Inspiring Services. Revise the proposal as instructed. Return ONLY the revised proposal body text — no JSON, no markdown fences, no extra commentary. Keep the section structure: PROJECT SCOPE, TOTAL INVESTMENT, DEPOSIT SCHEDULE, PROJECT DETAILS, ACCEPTANCE OF PROPOSAL. Keep it clean and direct — no fluff, no bracket placeholders. Never use [TBD] or any bracket notation.",
      },
      {
        role: "user",
        content: `Instruction: ${resolvedInstruction}\n\nCurrent proposal:\n${currentText}\n\nReturn only the revised proposal body text.`,
      },
    ],
  });

  return { body: response.choices[0]?.message?.content || currentText };
}
