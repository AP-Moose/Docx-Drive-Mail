# Docx Drive Mail

Local-first clone of the voice-to-proposal contractor app. The current local target is a ship-ready flow that needs only env vars and external credentials at the end:

- capture customer details
- capture scope by voice or typing
- generate the proposal and matching email
- review a customer-ready document preview
- save the DOCX to Drive
- send the email live

## Local setup

1. Copy `.env.example` to `.env`
2. Fill in:
   - `OPENAI_API_KEY`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REFRESH_TOKEN`
   - `DATABASE_URL`
3. Start Postgres
   - `docker compose up -d postgres`
4. Push the schema
   - `npm run db:push`
5. Start the app
   - `npm run dev`

The app still supports in-memory storage when `DATABASE_URL` is omitted, but that is for quick local bring-up only. Persistent local work and anything close to shipping should use Postgres.

## Commands

- `npm run dev` - start the local dev server
- `npm run check` - type-check the project
- `npm run build` - production build
- `npm run start` - run the built server
- `npm run db:push` - push schema changes to Postgres
- `docker compose up -d postgres` - start the local database

## Runtime notes

- Google Drive and Gmail work through standard Google OAuth env vars outside Replit.
- Replit connectors are still supported when the app runs in Replit.
- The finalize flow is send-oriented, not draft-oriented.
- `proposal_email` means save to Drive and send the customer email.
- `proposal_only` means save to Drive without showing or attempting the email path.
- `/settings` now shows both account connectivity and local runtime readiness for OpenAI, Postgres, and Google provider mode.

## Demo framing

For screenshots and demo assets, use a portrait-first mobile framing that feels like an iPhone 13 screen instead of a narrow desktop crop:

- use a mobile viewport first
- keep margins tight
- preserve the feeling of holding a phone
- capture the major emotional beats: create, describe, generate, review, send, success
