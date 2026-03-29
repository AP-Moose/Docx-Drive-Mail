# AGENTS.md

This repo is an incubator clone of `AP-Moose/Docx-Drive-Mail`.

Treat it as a standalone implementation repo that currently lives under `company-private-os/incubator` for safety and easy deletion. Do not treat it as doctrine or durable company truth.

## Purpose

This app is the voice-to-proposal / docx-drive-mail product cloned from GitHub so it can be evaluated and adapted locally outside Replit.

## Git Workflow

- `origin` points to `https://github.com/AP-Moose/Docx-Drive-Mail.git`
- local working branch starts as `local-setup`
- if push access to `origin` fails, create a fork and push there instead
- keep changes small and reviewable while local viability is still being proven

## Read Order

1. `replit.md`
2. `package.json`
3. `server/routes.ts`
4. `server/index.ts`
5. `shared/schema.ts`
6. the specific integration file you are changing

## Repo Map

- `client/` React + Vite frontend
- `server/` Express backend and external integrations
- `shared/` shared schema/types
- `script/build.ts` production build entry
- `attached_assets/` local assets and sample files
- `.replit` Replit-specific runtime and deployment hints

## Important Files

- `server/routes.ts` main API surface
- `server/ai.ts` OpenAI generation logic
- `server/docx-generator.ts` DOCX generation
- `server/google-drive.ts` Google Drive integration
- `server/google-mail.ts` Gmail send integration
- `server/storage.ts` storage abstraction
- `server/db.ts` database wiring
- `shared/schema.ts` Drizzle schema

## Local Reality

- this repo is not hard-locked to Replit, but some integrations are
- likely local blockers are `DATABASE_URL`, Google auth/integration behavior, and Replit connector usage
- Replit-only Vite plugins are already gated by environment checks, so frontend dev should be easier than connector parity

## Rules

- prefer adapting integrations instead of broad rewrites
- do not remove working product behavior just to make local setup easier
- separate “make it run locally” changes from product changes whenever possible
- document any new local setup assumptions in `README.md` or a local setup note
