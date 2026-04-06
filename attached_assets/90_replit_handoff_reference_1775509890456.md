# Replit Handoff: Port `minimal-field-flow` Product Updates onto `origin/main`

## Goal

Update the Replit app so it keeps the existing Replit connector setup, while adopting the UI and product-flow improvements from the local `minimal-field-flow` branch.

Baseline repo:

- `https://github.com/AP-Moose/Docx-Drive-Mail`
- baseline branch: `main`
- comparison branch: `minimal-field-flow`

Recommended source of truth for this handoff:

- port from `minimal-field-flow`
- do **not** use `local-setup` as the primary merge target for Replit

Reason:

- `minimal-field-flow` is the cleaner product branch
- `local-setup` mixes in broader local-runtime and setup work that is not required for Replit

## What To Keep From Replit

Keep the Replit connector-based integrations as the production integration path on Replit.

That means:

- keep Replit Google Drive connector behavior
- keep Replit Gmail connector behavior
- keep Replit deployment/runtime expectations

Do **not** convert Replit to the local OAuth path just because it exists in the local branch.

## What To Port

Port the following from `minimal-field-flow`:

1. mobile-first UI cleanup
2. simpler step-by-step proposal flow
3. stronger review and completion states
4. cleaner proposal detail editing/refinement flow
5. runtime/settings visibility improvements that make sense on Replit
6. route/schema changes required to support the improved flow

## High-Level Branch Summary

Commits in `minimal-field-flow` that matter:

- `c394f42` `Validate local-first runtime and fix Google integrations`
- `13ed8d4` `Simplify operator flow for minimal field use`
- `c233cdd` `Simplify recent proposal state handling`

Diff size against `origin/main`:

- 26 files changed
- 2487 insertions
- 1244 deletions

## Priority Order For Replit

Implement in this order:

1. product flow and page UI
2. route and schema changes that support the new flow
3. settings/runtime status improvements
4. only then adapt connector-specific integration code if needed

This prevents local-only runtime changes from muddying the product work.

## Files To Port First

### Core product UI

- `client/src/pages/home.tsx`
- `client/src/pages/new-proposal.tsx`
- `client/src/pages/proposal-detail.tsx`
- `client/src/pages/recent-proposals.tsx`
- `client/src/pages/settings.tsx`
- `client/src/components/proposal-preview.tsx`

### Required backend and schema support

- `server/routes.ts`
- `shared/schema.ts`

### Integration/runtime files to review carefully

- `server/google-auth.ts`
- `server/google-drive.ts`
- `server/google-mail.ts`
- `server/storage.ts`
- `server/db.ts`
- `server/config.ts`
- `server/ai.ts`
- `server/transcribe.ts`
- `server/index.ts`

## Product Changes To Carry Over

### 1. Home screen is cleaner and more direct

File:

- `client/src/pages/home.tsx`

What changed:

- stronger visual hierarchy
- clear primary action for `Create Proposal`
- recent proposals and proposal-only actions moved into a cleaner supporting block
- better mobile-first layout and spacing
- settings moved into a secondary position

Why it matters:

- faster orientation for operators
- better first-run clarity
- less visual clutter before the main action

### 2. New proposal flow is much simpler

File:

- `client/src/pages/new-proposal.tsx`

What changed:

- clearer 5-step flow labels
- customer details first
- scope description second
- AI writing/loading states are more intentional
- review step is clearer
- final send check is cleaner
- completed state is clearer
- draft loading support added through `draft` query param
- better success/error handling
- typed AI refinement input is cleaner
- voice flow and refinement flow are more coherent

The product sequence now reads more like:

1. customer details
2. describe the work
3. review the proposal
4. final send check
5. completed

Why it matters:

- this is the main product improvement
- the flow feels more like a guided operator workflow and less like a form pile

### 3. Proposal detail page is more usable

File:

- `client/src/pages/proposal-detail.tsx`

What changed:

- better status labeling
- cleaner save and refine flows
- voice refinement support inside the detail view
- improved finalize result handling
- clearer success/failure messaging
- better support for editing and sending from an existing proposal

Why it matters:

- operators can reopen and finish work more confidently
- less ambiguity around whether something is ready, saved, or done

### 4. Recent proposals page is simplified

File:

- `client/src/pages/recent-proposals.tsx`

What changed:

- recent proposal state handling simplified
- improved list behavior and open/resume actions

Why it matters:

- faster return-to-work behavior
- less friction for reusing or reopening a proposal

### 5. Settings page is more useful

File:

- `client/src/pages/settings.tsx`

What changed:

- clearer runtime/integration readiness presentation
- explicit visibility into OpenAI, database, and Google status
- more practical operator-facing diagnostics

Why it matters:

- easier to understand whether the system is actually ready
- fewer hidden setup failures

### 6. Proposal preview rendering is more polished

File:

- `client/src/components/proposal-preview.tsx`

What changed:

- better layout and typography
- cleaner customer metadata block
- cleaner formatting/rendering of proposal content

Why it matters:

- preview feels more trustworthy
- easier for operator to review before sending

## Backend Changes Replit Should Also Adopt

### 1. Finalize/send route behavior improved

File:

- `server/routes.ts`

Important changes:

- add runtime/settings endpoint behavior used by the UI
- change from Gmail draft creation to direct send flow
- new route behavior is centered on send/finish, not draft creation
- finalize response now returns structured completion state and links

Important product-level change:

- old behavior: create Gmail draft
- new behavior: send the message and return completion metadata

Expected shape now includes:

- `proposal`
- `completion`
- `links`

Why it matters:

- the frontend now expects a clearer “did proposal save / did email send / what links are available” response

### 2. Schema changed from draft terminology to sent-message terminology

File:

- `shared/schema.ts`

Important changes:

- `gmailDraftId` becomes `gmailMessageId`
- insert schema becomes explicit and simpler instead of relying on broad omission from generated schema

Why it matters:

- matches the actual send behavior
- reduces confusion between “drafted” and “sent”

### 3. OpenAI configuration got centralized

Files:

- `server/config.ts`
- `server/ai.ts`
- `server/transcribe.ts`

Important changes:

- OpenAI config resolution is centralized
- model names are configurable
- missing config now fails more cleanly

Replit guidance:

- if Replit already has a preferred env pattern, keep that pattern
- still port the cleanup idea: one config source, one place to validate required env

## Integration Files: What Replit Should Keep vs Reuse

### `server/google-auth.ts`

This file was added locally to support dual-mode Google auth:

- local OAuth
- Replit connectors

For Replit:

- you may not need the full dual-mode structure
- but the separation of provider logic is worth borrowing if it simplifies the current connector code

### `server/google-drive.ts`

Local branch added:

- provider-mode branching
- OAuth support
- cleaner folder resolution helpers
- configurable Drive root folder

For Replit:

- keep connector-backed Drive behavior
- feel free to reuse the cleaner helper structure
- do **not** switch Replit away from connectors unless that is a deliberate separate decision

### `server/google-mail.ts`

Local branch changed:

- function name and behavior from draft creation to actual send
- OAuth path for local runtime
- connector path for Replit runtime

For Replit:

- keep connector-backed Gmail auth
- adopt the product behavior change to direct send if not already present
- update stored IDs and route expectations to `gmailMessageId`

### `server/storage.ts` and `server/db.ts`

Local branch added:

- optional database behavior
- in-memory fallback when DB is absent

For Replit:

- this is mostly local-runtime support
- only port it if it helps Replit development or makes the app more robust
- not required if Replit already has stable database availability

## Local-Only Changes Replit Can Ignore

These exist mainly to make the repo run outside Replit:

- `.env.example`
- `docker-compose.yml`
- local DB fallback from `server/storage.ts` if unnecessary on Replit
- local OAuth pieces if Replit will stay connector-first
- host binding changes in `server/index.ts` unless Replit needs them
- docs focused on local incubation:
  - `docs/agent-swarm-architecture.md`
  - `docs/working-branch-note.md`
  - `README.md`
  - local `AGENTS.md`
  - `CLAUDE.md`

## Recommended Replit Implementation Checklist

### Must do

- port `home.tsx`
- port `new-proposal.tsx`
- port `proposal-detail.tsx`
- port `recent-proposals.tsx`
- port `settings.tsx`
- port `proposal-preview.tsx`
- update `server/routes.ts` to match the new completion/send flow
- update `shared/schema.ts` to use `gmailMessageId`

### Should do

- clean up `server/ai.ts` and `server/transcribe.ts` config handling
- clean up Drive and Gmail integration structure while preserving connectors
- reuse better error handling patterns from the branch

### Optional

- port DB-optional behavior
- port local runtime support files

## Implementation Notes To Give Replit

Use wording like this:

> Keep Replit connectors as the integration path.
> Port the UI and product-flow improvements from `minimal-field-flow`.
> Do not blindly merge the local OAuth and local-runtime support work.
> The main goal is to make the Replit app match the newer operator flow:
> customer details -> describe work -> review proposal -> final send check -> completed.
> Also align the backend with the updated finalize response and `gmailMessageId` schema.

## One-Sentence Summary

Make Replit match the newer product experience from `minimal-field-flow`, but keep Replit’s connector-based Google integration model instead of importing the local-only runtime assumptions.
