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

1. Fill form (job info + scope notes with voice input, multiple email recipients)
2. AI generates proposal text, email subject/body
3. Review & edit with chat-based AI refinement + pretty preview toggle
4. Confirm step — review formatted proposal preview + editable email subject/body before sending
5. Finalize: generate .docx → upload to Drive (folder hierarchy) → set public link → send Gmail

## Key Files

- `shared/schema.ts` — Drizzle schema, types, insert schemas
- `server/routes.ts` — API routes (CRUD, generate, refine, finalize, docx, drive-upload, gmail-send)
- `server/ai.ts` — OpenAI proposal generation and refinement (supports free-form instructions)
- `server/docx-generator.ts` — .docx generation via `docx` package
- `server/google-drive.ts` — Drive upload with folder hierarchy + public permission
- `server/google-mail.ts` — Gmail send via `users.messages.send` (gmail.send scope, supports multiple To: recipients)
- `server/storage.ts` — IStorage interface + DatabaseStorage implementation
- `client/src/components/proposal-preview.tsx` — Rich formatted proposal preview (matches Drive/docx styling)
- `client/src/pages/new-proposal.tsx` — 5-step wizard (info → scope → review → confirm → done)
- `client/src/pages/home.tsx` — Home page
- `client/src/pages/recent-proposals.tsx` — Recent proposals list
- `client/src/pages/proposal-detail.tsx` — Single proposal detail view with formatted preview

## UI Flow (5 steps)

1. **Info** — customer name, multiple emails (chip input), address, project type, price, timeline
2. **Scope** — describe the work (text + voice input)
3. **Review & Edit** — toggle between raw text edit and pretty preview, chat-based refinement, quick buttons
4. **Confirm** — formatted proposal preview, editable email subject/body, recipient list, explicit send
5. **Done** — links to Drive doc, Gmail Sent, copy link, download .docx

## Modes

- `proposal_email` — generates proposal + sends email with attachment and Drive link
- `proposal_only` — generates proposal + uploads to Drive only (no email)

## Multiple Emails

- `customerEmail` field stores comma-separated emails (e.g., "a@b.com, c@d.com")
- Frontend uses chip-style input with add/remove
- MIME `To:` header natively supports comma-separated recipients

## Important Notes

- Gmail connector only has `gmail.send` scope — uses `users.messages.send` not `users.drafts.create`
- Google Drive uses `@replit/connectors-sdk` proxy — never cache the client
- Gmail uses `googleapis` with fresh token fetch — never cache the client
- Connection IDs: Drive `conn_google-drive_01KK2ZF93P7P2SGY6MJ22YKYB3`, Gmail `conn_google-mail_01KK2ZW3XA21BVEEFSM7VC7Y6R`
