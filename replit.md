# Proposal Builder

Mobile-first web app for contractors to create professional proposals, upload to Google Drive, and send via Gmail.

## Architecture

- **Frontend**: React + Vite + TailwindCSS + shadcn/ui + wouter routing
- **Backend**: Express (TypeScript) on port 5000
- **Database**: PostgreSQL via Drizzle ORM
- **AI**: OpenAI (gpt-5.1) via Replit AI Integrations
- **Google Drive**: Replit Connectors SDK (`@replit/connectors-sdk` proxy pattern)
- **Gmail**: googleapis + Replit Connectors (gmail.send scope — sends directly, no draft creation)

## Pipeline

1. Fill form (job info + scope notes with voice input)
2. AI generates proposal text, email subject/body
3. Review & edit with chat-based AI refinement (free-form instructions + quick buttons)
4. Confirm step — review email subject/body before sending, preview proposal
5. Finalize: generate .docx → upload to Drive (folder hierarchy) → set public link → send Gmail

## Key Files

- `shared/schema.ts` — Drizzle schema, types, insert schemas
- `server/routes.ts` — API routes (CRUD, generate, refine, finalize, docx, drive-upload, gmail-draft)
- `server/ai.ts` — OpenAI proposal generation and refinement (supports free-form instructions)
- `server/docx-generator.ts` — .docx generation via `docx` package
- `server/google-drive.ts` — Drive upload with folder hierarchy + public permission
- `server/google-mail.ts` — Gmail send via `users.messages.send` (gmail.send scope)
- `server/storage.ts` — IStorage interface + DatabaseStorage implementation
- `client/src/pages/new-proposal.tsx` — 5-step wizard (info → scope → review → confirm → done)
- `client/src/pages/home.tsx` — Home page
- `client/src/pages/recent-proposals.tsx` — Recent proposals list
- `client/src/pages/proposal-detail.tsx` — Single proposal detail view

## UI Flow (5 steps)

1. **Info** — customer name, email, address, project type, price, timeline
2. **Scope** — describe the work (text + voice input)
3. **Review & Edit** — view/edit proposal text, chat-based refinement, quick adjust buttons
4. **Confirm** — review email subject/body (editable), proposal preview, explicit send button
5. **Done** — links to Drive doc, Gmail Sent, copy link, download .docx

## Modes

- `proposal_email` — generates proposal + sends email with attachment and Drive link
- `proposal_only` — generates proposal + uploads to Drive only (no email)

## Important Notes

- Gmail connector only has `gmail.send` scope — uses `users.messages.send` not `users.drafts.create`
- Google Drive uses `@replit/connectors-sdk` proxy — never cache the client
- Gmail uses `googleapis` with fresh token fetch — never cache the client
- Connection IDs: Drive `conn_google-drive_01KK2ZF93P7P2SGY6MJ22YKYB3`, Gmail `conn_google-mail_01KK2ZW3XA21BVEEFSM7VC7Y6R`
