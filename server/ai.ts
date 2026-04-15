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

  const systemPrompt = `You write contractor proposals for small local home service businesses — plumbers, electricians, painters, HVAC techs, handymen, remodelers.

Your proposals sound like a trustworthy local contractor wrote them, not like a corporate marketing team.

Tone rules:
- Write the way a contractor talks: direct, clear, honest
- No filler phrases: no "we are pleased to", no "comprehensive solution", no "industry-leading", no "best practices"
- No throat-clearing at the start of sections
- Short sentences. Bullets instead of paragraphs.
- Use "we" or "I" naturally — it's one contractor writing to one homeowner
- If something is uncertain, say so plainly. Don't paper over it.
- Use specific numbers and details from the notes. Don't generalize.

Formatting rules:
- PROJECT SCOPE: one bullet per task. Verb-first. Specific. ("Remove old water heater", not "Water heater removal services")
- TOTAL INVESTMENT: price on its own line. One plain sentence about what's included. Nothing more.
- DEPOSIT SCHEDULE: standard thirds. Calculate the dollar amounts. Bullet list.
- PROJECT DETAILS: short bullets. Timeline, exclusions, open items. Honest.
- NEXT STEPS: 2 sentences max. What happens if they say yes. Practical. Not salesy.
- ACCEPTANCE OF PROPOSAL: three lines exactly as shown in the example.

Never use [TBD], [INSERT], or any bracket placeholders in the proposal body.
The only allowed bracket is [PROPOSAL_LINK] in the emailBody field.`;

  const isStructured =
    scopeNotes.includes("CUSTOMER REQUEST:") ||
    scopeNotes.includes("INCLUDED WORK:") ||
    scopeNotes.includes("PRICING:");

  const structuredNote = isStructured
    ? "The notes are organized by topic — use each section for the matching part of the proposal."
    : "The notes may be rough voice dictation — extract the facts and write cleanly.";

  const userPrompt = `Write a contractor proposal.

Customer: ${customerName}${jobAddress ? `\nJob Address: ${jobAddress}` : ""}

Contractor's notes (${structuredNote}):
${scopeNotes}

Use this exact structure and match this quality and style:

---
WATER HEATER REPLACEMENT PROPOSAL

1847 Oak Glen Rd, Plainfield

PROJECT SCOPE

- Drain and remove existing 40-gal gas water heater
- Haul away old unit
- Install new 40-gal Bradford White gas water heater
- Reconnect gas line, water supply, and pressure relief valve
- Test for leaks and verify proper operation

TOTAL INVESTMENT

$1,450 (Flat Rate)

Includes all labor, fittings, and standard installation materials. Unit cost is separate if customer is supplying.

DEPOSIT SCHEDULE

- $483 due upon signing
- $483 due when we start
- $484 due when the job is done

PROJECT DETAILS

- Estimated time: 3–4 hours
- Permit may be required — we'll confirm before starting
- If the gas shutoff valve or supply lines are corroded, replacing them is extra
- Customer is responsible for selecting the unit if not supplied by contractor

NEXT STEPS

If this looks right, let us know and we'll get you on the schedule. We'll need the deposit before we order materials.

ACCEPTANCE OF PROPOSAL

Client Name (Printed): __________________________________________

Client Signature: ________________________________________________

Date: _______________________
---

Important reminders:
- Infer the right trade type from the work described and use it in the title
- If notes have a PRICING section, use that exact price
- If no price is provided, estimate a realistic flat-rate for this type and scope of work — the contractor will review and correct if needed
- If notes have a TIMELINE section, use that — don't invent one
- If exclusions or open items are mentioned, include them honestly in PROJECT DETAILS
- Do not add sections that aren't in the example
- Title format: "[TRADE] PROPOSAL" (all caps). Address on the next line if provided.
- The NEXT STEPS section must always be present. Keep it practical and brief.

Respond as JSON:
{
  "title": "TRADE PROPOSAL\\nAddress if provided",
  "body": "full proposal body from PROJECT SCOPE through the signature lines",
  "emailSubject": "${mode === "proposal_email" ? "short, professional subject for the proposal email" : ""}",
  "emailBody": "${mode === "proposal_email" ? "3–4 sentence friendly email, like a text from a contractor. Include [PROPOSAL_LINK] for the proposal link. Sign off naturally." : ""}",
  "projectType": "short label — Plumbing, HVAC, Painting, Electrical, Flooring, Remodel, etc."
}`;

  const response = await openai.chat.completions.create({
    model: appConfig.openaiChatModel,
    temperature: 0.5,
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
    shorter: "Cut this down. Remove any filler sentences. Keep every fact, price, and bullet — just make it tighter.",
    longer: "Add more specific detail to the scope bullets. Same structure and tone — no fluff added, just more specifics about the work.",
    regenerate: "Rewrite this proposal fresh using the same facts, prices, and structure. Same clean contractor tone, new wording.",
  };

  const resolvedInstruction = shortcutMap[instruction] || instruction;

  const response = await openai.chat.completions.create({
    model: appConfig.openaiChatModel,
    messages: [
      {
        role: "system",
        content:
          "You write contractor proposals. You are revising an existing proposal. Return ONLY the revised proposal body text — no JSON, no markdown fences, no extra commentary. Keep the same section order: PROJECT SCOPE, TOTAL INVESTMENT, DEPOSIT SCHEDULE, PROJECT DETAILS, NEXT STEPS, ACCEPTANCE OF PROPOSAL. Keep the tone direct and contractor-like. No filler, no bracket placeholders.",
      },
      {
        role: "user",
        content: `Instruction: ${resolvedInstruction}\n\nCurrent proposal:\n${currentText}\n\nReturn only the revised body text.`,
      },
    ],
  });

  return { body: response.choices[0]?.message?.content || currentText };
}
