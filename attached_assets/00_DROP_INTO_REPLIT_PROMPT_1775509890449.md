# Replit Update Prompt

Use these uploaded files as the source of truth for the newer local version of the app.

Goal:

- update the Replit version of `AP-Moose/Docx-Drive-Mail` so it matches the newer UI, workflow, editing, and completion behavior from these files
- keep Replit connectors for Google Drive and Gmail
- do not replace Replit with the local OAuth setup unless absolutely necessary

Important boundaries:

- preserve Replit-native Google integration behavior
- do not blindly copy local-only runtime assumptions
- prioritize product parity over environment parity

What to port first:

- `01_client_home.tsx`
- `02_client_new-proposal.tsx`
- `03_client_proposal-detail.tsx`
- `04_client_recent-proposals.tsx`
- `05_client_settings.tsx`
- `06_client_proposal-preview.tsx`
- `10_server_routes.ts`
- `11_shared_schema.ts`

Then adapt as needed using:

- `12_server_google-drive.ts`
- `13_server_google-mail.ts`
- `14_server_ai.ts`
- `15_server_transcribe.ts`
- `16_server_google-auth.ts`
- `17_server_config.ts`

Most important behavior changes to preserve:

1. Customer info step should not require an extra action before moving on
- if the user typed a recipient email but did not press the separate add-email button yet, pressing `Next` should accept that email and continue
- do not make the user effectively click twice just to move forward

2. Main flow should feel linear and guided
- customer details
- describe the work
- review the proposal
- final send check
- completed

3. Scope capture should be voice-first
- the mic should feel like the main action on the scope step
- typed notes still exist, but voice is primary
- transcript should append to existing notes instead of overwriting them

4. Editing should feel continuous
- keep live preview visible while editing proposal text
- do not force preview/edit toggles if not needed
- make proposal review more direct and easier to refine

5. Proposal refinement changed
- old fixed shortcuts like `Shorter`, `Longer`, and `Redo` were replaced by a more natural “describe the change” flow
- make voice refinement prominent
- typed refinement should still be available behind a simple secondary path

6. Microphone placement changed
- on the scope step, the mic is now a prominent full-width primary card
- on review/detail, the mic for refinement belongs in a sticky footer action area, not buried beside a tiny input
- on the detail page, voice refinement should support reopen-and-edit behavior cleanly

7. Completion state is stronger
- final state should clearly show whether:
  - proposal is ready
  - file is saved
  - email is sent
  - next step is complete
- final actions should be obvious, like open Drive, open sent email, copy link, download docx

8. Backend logic should match the newer flow
- align the finalize/send behavior with the updated frontend
- use `gmailMessageId` instead of `gmailDraftId`
- return clearer completion metadata from finalize/send flows

Instructions:

- compare these uploaded files against the current Replit repo
- port the newer product behavior and UI
- where integration files differ, adapt the new behavior to Replit connectors instead of replacing connectors with local OAuth
- tell me clearly if any connector-specific part needs a manual decision

Reference:

- `90_replit_handoff_reference.md` is the fuller implementation brief
