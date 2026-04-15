# Session Handoff Log — 2026-04-15

## Project Location
`/Users/dave/projects/company-private-os/incubator/docx-drive-mail`
- Git remote: `https://github.com/AP-Moose/Docx-Drive-Mail.git`
- Current branch: `minimal-field-flow` (merged origin/main into it — 13 new commits from main)
- Uncommitted changes: all the work below

## What Was Done This Session

### 1. Pulled updates from GitHub
- Merged `origin/main` (13 new commits) into `minimal-field-flow`
- Resolved 12 merge conflicts by accepting main's versions
- Commit: `1bf8165 Merge origin/main into minimal-field-flow`

### 2. Fixed mobile layout (guided step squishing)
- **File:** `client/src/pages/new-proposal.tsx`
- Removed the two-column `flex-col lg:flex-row` side-by-side layout
- Prompt card and preview now **stack vertically** (full width)
- Preview panel uses a collapsible `<details>` element — no more off-screen preview on iPhone 13

### 3. Added "Guided Prompts" toggle in Settings
- **File:** `client/src/pages/settings.tsx`
- New "Proposal Flow" section with a toggle switch
- Persisted in `localStorage` via `client/src/lib/app-settings.ts`

### 4. Added Quick (one-shot) mode
- **File:** `client/src/pages/new-proposal.tsx`
- New `step === "quick"` UI: single record button, single text area, one Generate button
- When guided prompts are OFF in settings, Step 2 goes to "quick" instead of "guided"
- The magical one-take flow: record → generate

### 5. Created settings utility
- **New file:** `client/src/lib/app-settings.ts`
- Exports `isGuidedPromptsEnabled()` and `setGuidedPromptsEnabled()`

## Session 2 Changes (2026-04-15 continued)

### 6. Moved voice mic to sticky footer (guided + quick steps)
- **File:** `client/src/pages/new-proposal.tsx`
- Removed the large inline green-gradient voice button from guided and quick steps
- Added a compact mic button in the sticky footer, styled identically to the review step's "Change with AI" mic bar
- Same container styling: `rounded-[20px] border border-border/70 bg-background/98` with the shadow
- Same button styling: secondary variant with amber recording state, green idle state
- Same states: "Tap to start recording" → "Tap to stop recording" → "Transcribing…"
- Guided step shows the current prompt question as the label; quick step shows "Describe the work"
- Generate Proposal button remains below the voice bar in the footer

### 7. Added Playwright testing
- Installed `@playwright/test` as devDependency
- Created `playwright.config.ts` — iPhone 13 viewport, dev server on port 3004
- Created `tests/smoke.spec.ts` — 5 tests covering PIN gate, home page, info step validation, footer mic presence, settings page
- Added `test` and `test:ui` scripts to `package.json`
- Updated `.gitignore` with `/test-results/`, `/playwright-report/`, `/blob-report/`, `.playwright-cli/`

### 8. `.gitignore` updated
- Added Playwright output directories and `.playwright-cli/`

## What Was NOT Done Yet (Next Session TODO)

### 🔴 Remaining from Dave's requests:

1. **Backend / AI generation quality is poor**
   - Reviewed `server/ai.ts` — prompt is well-structured but:
     - No `temperature` set (defaults to 1.0, should be 0.4–0.6 for structured output)
     - Only one example (water heater) — could benefit from trade-specific examples
     - No JSON parse error handling / retry
   - **Blocked on Dave:** Need to know what "poor" looks like and get a good output example
   - Action: Dave provides example good output → add as second prompt example

2. **OpenAI API key**
   - Dave shared one in chat but it needs to be rotated (exposed in plain text)
   - Action: Dave rotates key, then add to `.env`

## Key Files Reference
| File | Purpose |
|------|---------|
| `client/src/pages/new-proposal.tsx` | Multi-step proposal creation (info → guided/quick → review → confirm → done) |
| `client/src/pages/settings.tsx` | Settings page (Google connections, runtime checks, guided prompts toggle) |
| `client/src/lib/app-settings.ts` | localStorage settings utility |
| `server/ai.ts` | OpenAI proposal generation — **needs review for quality** |
| `server/routes.ts` | All API routes |
| `server/storage.ts` | Database + memory storage layer |
| `shared/schema.ts` | Drizzle schema (proposals, google_tokens) |
| `.env` | Environment variables (already exists, has current keys) |
| `.gitignore` | **MISSING — needs to be created** |

## How to Restart the App
```bash
cd /Users/dave/projects/company-private-os/incubator/docx-drive-mail
PORT=3004 npm run dev
```
Then ngrok tunnel is already on port 3004 → `https://unreleased-distinctly-cary.ngrok-free.dev`

## Mobile-First UI Improvements — Remaining (Dave approved list, speed-optimized)

### Quick wins (next session):
| # | Item | Effort |
|---|------|--------|
| 1 | Remove duplicate Generate button in guided card nav row (footer has it now) | 5 min |
| 2 | Add `temperature: 0.5` to AI call for consistent output | 5 min |
| 3 | Safe-area bottom padding on sticky footer for notched iPhones | 5 min |
| 4 | Responsive proposal preview (smaller padding/font on <400px screens) | 15 min |
| 5 | Collapsible review step preview (show edit mode by default on mobile) | 20 min |
| 6 | Auto-add email on blur (not just Enter/comma) | 5 min |
| 7 | Settings: copy button next to redirect URI | 10 min |

### Medium effort (later):
| # | Item | Effort |
|---|------|--------|
| 8 | Bottom tab nav (Home / + / Recent / Settings) on key screens | 1–2 hrs |
| 9 | Recent proposals: search/filter + relative dates | 30 min |
| 10 | Collapse "How it works" after first visit (localStorage) | 10 min |

### Nice-to-have:
| # | Item | Effort |
|---|------|--------|
| 11 | Haptic feedback on Generate / Send taps | 10 min |
| 12 | Voice recording amplitude indicator | 30 min |
| 13 | Pull-to-refresh on recent proposals | 20 min |
| 14 | Dark mode toggle in settings | 1 hr |

## Pre-existing Issues (from merge, not our changes)
- `MemoryStorage` class is missing methods (`getGoogleToken`, `upsertGoogleToken`, etc.) — TS errors in `server/storage.ts` and `server/google-token.ts`
- These don't affect runtime since the app uses `DatabaseStorage` when `DATABASE_URL` is set
