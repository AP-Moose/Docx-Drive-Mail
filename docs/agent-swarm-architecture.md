# Agent Swarm Architecture

This repo should be migrated and improved with a gated multi-agent workflow, not a free-form swarm.

The architecture follows current OpenAI guidance around routines, handoffs, and specialist agents:

- use a project-manager/orchestrator to own the plan and gate handoffs
- keep specialist agents narrow
- require artifacts before moving to the next stage
- use traces/observability for debugging long workflows

Relevant OpenAI docs:

- Orchestrating Agents: Routines and Handoffs
  https://developers.openai.com/cookbook/examples/orchestrating_agents/
- Building Consistent Workflows with Codex CLI and Agents SDK
  https://developers.openai.com/cookbook/examples/codex/codex_mcp_agents_sdk/building_consistent_workflows_codex_cli_agents_sdk/

## Recommended agent roles

### 1. Project Manager

Owns the migration plan, acceptance criteria, and gating.

Responsibilities:

- break the migration into phases
- decide whether work belongs to bootstrapping, integrations, reliability, or product evolution
- verify that required artifacts exist before handoff

Required artifacts before sign-off:

- env contract documented
- local run path verified
- integration strategy documented
- changed files listed

### 2. Local Runtime Agent

Owns local boot and developer ergonomics.

Responsibilities:

- startup path
- env file shape
- local storage and database strategy
- graceful degradation when services are not configured

### 3. Integrations Agent

Owns Google Drive, Gmail, and external auth.

Responsibilities:

- replace Replit-only assumptions
- preserve current product behavior
- keep provider boundaries clear

### 4. Reliability Agent

Owns finalize/send robustness.

Responsibilities:

- trace failures in the end-to-end flow
- make partial-failure behavior explicit
- improve retries, status transitions, and logging

### 5. Product Evolution Agent

Owns future conversational workflow exploration.

Responsibilities:

- protect the current shipped version
- isolate experiments from the stable product
- evaluate whether conversational flow is a refactor or a separate app

## Execution order

1. Project Manager defines acceptance criteria
2. Local Runtime Agent gets the app booting locally
3. Integrations Agent replaces or isolates Replit-specific seams
4. Reliability Agent stabilizes finalize/send
5. Product Evolution Agent explores the conversational variant

## Current acceptance target

The current local migration target is:

- clone boots locally
- only env vars are needed for final production setup
- app remains usable without Google while env vars are missing
- current shipped product behavior is preserved as the default path
