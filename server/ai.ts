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

function parseStructuredNotes(scopeNotes: string): {
  customerRequest?: string;
  includedWork?: string;
  exclusions?: string;
  pricing?: string;
  timeline?: string;
  raw: string;
} {
  const sections: Record<string, string> = {};
  const sectionLabels: Record<string, string> = {
    "CUSTOMER REQUEST": "customerRequest",
    "INCLUDED WORK": "includedWork",
    "EXCLUSIONS / ASSUMPTIONS": "exclusions",
    "PRICING": "pricing",
    "TIMELINE": "timeline",
  };

  let currentKey: string | null = null;
  const lines = scopeNotes.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    let matched = false;
    for (const [label, key] of Object.entries(sectionLabels)) {
      if (trimmed === `${label}:` || trimmed.startsWith(`${label}:\n`)) {
        currentKey = key;
        matched = true;
        break;
      }
    }
    if (!matched && currentKey) {
      sections[currentKey] = ((sections[currentKey] || "") + "\n" + line).trim();
    }
  }

  return { ...sections, raw: scopeNotes } as {
    customerRequest?: string;
    includedWork?: string;
    exclusions?: string;
    pricing?: string;
    timeline?: string;
    raw: string;
  };
}

export async function generateProposal(
  customerName: string,
  customerEmail: string | null | undefined,
  jobAddress: string | null | undefined,
  scopeNotes: string,
  mode: string
): Promise<GeneratedProposal> {
  const openai = getOpenAIClient();

  const systemPrompt = `You write contractor proposals for small home service businesses.

Your job is to turn rough field notes into a clean, trustworthy proposal a homeowner can read and act on.

Rules you must follow:
- Sound like a real local contractor — direct, clear, professional but not corporate
- No fluff, no filler, no "we are pleased to provide", no generic marketing language
- Short sections and bullet points — not paragraphs
- Use the contractor's own numbers and facts exactly — do not change prices, timelines, or scope
- Do not hallucinate details that weren't mentioned
- If something is uncertain, put it in Project Details as a note, not as a promise
- Never use bracket placeholders like [TBD] anywhere in the proposal body
- The only allowed bracket placeholder is [PROPOSAL_LINK] in the emailBody field
- Keep the tone warm but to the point — like a text from a trustworthy contractor`;

  const isStructured =
    scopeNotes.includes("CUSTOMER REQUEST:") ||
    scopeNotes.includes("INCLUDED WORK:") ||
    scopeNotes.includes("PRICING:");

  const userPrompt = `Write a contractor proposal with these details:

Customer: ${customerName}
${jobAddress ? `Job Address: ${jobAddress}` : ""}

${isStructured ? "Field notes (organized by topic):" : "Scope Notes from Contractor (may be rough voice dictation):"}
${scopeNotes}

Generate a clean, professional proposal using this EXACT structure:

---
BATHROOM RENOVATION PROPOSAL

5200 Hilltop Dr, Brookhaven

PROJECT SCOPE

- Full demolition of existing bathroom
- Remove all tile, drywall, fixtures
- Install new cement board, tile, shower pan
- Install customer-supplied vanity and faucet
- Paint walls and ceiling

TOTAL INVESTMENT

$9,895 (Flat Rate)

This price includes all labor, standard installation materials, debris removal, and full project management.

DEPOSIT SCHEDULE

- One-third ($3,298) due upon signing
- One-third ($3,298) due on the first day of work
- Final one-third ($3,299) due upon completion

PROJECT DETAILS

- Estimated timeline: 5–7 working days
- Permit fees not included — contractor will advise if required
- Tile and fixture selections to be confirmed before ordering
- Any structural issues found during demo will be discussed before proceeding

NEXT STEPS

If this looks good, reply to approve and we can lock in your start date. A deposit is required before materials are ordered.

ACCEPTANCE OF PROPOSAL

Client Name (Printed): __________________________________________

Client Signature: ________________________________________________

Date: _______________________
---

Rules:
- PROJECT SCOPE: One bullet per task. Specific. No sub-bullets.
- TOTAL INVESTMENT: State the price clearly. One sentence about what's included.
- DEPOSIT SCHEDULE: Split into thirds with dollar amounts. Bullet points.
- PROJECT DETAILS: Timeline, exclusions, unknowns. Short bullets only.
- NEXT STEPS: 2–3 sentences. Practical next action for the homeowner. Not pushy.
- ACCEPTANCE OF PROPOSAL: Exactly as shown — three lines.
- If multiple prices are mentioned for different areas, list them all with a combined total.
- Do NOT add extra sections. Do NOT use [TBD] or any bracket notation.
- Infer the trade type from the work described and use it in the title.
- Title format: "[TRADE TYPE] PROPOSAL" (all caps). If there is an address, it goes on the line after the title.

Please provide as JSON:
{
  "title": "TRADE TYPE PROPOSAL\\nAddress if provided",
  "body": "the full proposal body starting from PROJECT SCOPE through the signature lines",
  "emailSubject": "${mode === "proposal_email" ? "a short, professional subject line for the proposal email" : ""}",
  "emailBody": "${mode === "proposal_email" ? "a brief, friendly email body — 3–4 sentences max, like a text from a local contractor. Include [PROPOSAL_LINK] as the placeholder for the proposal link. Sign off as the contractor." : ""}",
  "projectType": "short label like Bathroom, Kitchen, Plumbing, HVAC, Painting, etc."
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
          "You are a contractor proposal writer for a small home service business. Revise the proposal as instructed. Return ONLY the revised proposal body text — no JSON, no markdown fences, no extra commentary. Keep the section structure: PROJECT SCOPE, TOTAL INVESTMENT, DEPOSIT SCHEDULE, PROJECT DETAILS, NEXT STEPS, ACCEPTANCE OF PROPOSAL. Keep it clean and direct — no fluff, no bracket placeholders.",
      },
      {
        role: "user",
        content: `Instruction: ${resolvedInstruction}\n\nCurrent proposal:\n${currentText}\n\nReturn only the revised proposal body text.`,
      },
    ],
  });

  return { body: response.choices[0]?.message?.content || currentText };
}
