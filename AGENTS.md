# Codex Agent Guide (Tool A -> Shippable Build)

This repository is currently in **Phase 1**:

- Tool A intake is implemented.
- Tool B (scheduled integration automation) is not yet implemented as code.
- Tool C loader is deferred.

Your job when running Codex manually or via Codex App Automations is to process queued uploads into a sanitized shippable artifact.

## Source of Truth

- Storage root is `TOOL_A_STORAGE_ROOT` when set; otherwise default to `tool-a-intake/storage`.
- Queue file: `<STORAGE_ROOT>/queue/pending.json`
- Worksheet metadata files: `<STORAGE_ROOT>/metadata/<worksheet_id>.json`
- Uploaded zip artifact: `<STORAGE_ROOT>/intake/<worksheet_id>/original.zip`

## Target Output (Current "Shippable" Definition)

For each integrated worksheet, create:

- `<STORAGE_ROOT>/shippable/<worksheet_id>/`

This folder should contain either:

1. A build output (`dist/`) from the uploaded app, or
2. A normalized app package ready to deploy (if build is intentionally deferred), or
3. A static runtime repack (`index.html` + `app.js`) that runs without local build tooling and calls `/api/runtime/ai`.

Runtime AI contract:

- Client calls `/api/runtime/ai`
- Server enforces model `gpt-4.1`

## Preferred Execution Mode

Use Codex-first integration:

- `cd tool-a-intake && npm run process:queue`

For Codex Automations prototype runs, prefer manual mode (avoid nested Codex subprocess):

- `cd tool-a-intake && npm run process:queue -- --mode=manual`

In codex mode, the processor:

1. runs `codex exec` inside each worksheet project,
2. builds the worksheet,
3. verifies OpenAI hook + model reference,
4. verifies no Gemini leftovers,
5. verifies OpenAI `gpt-4.1` connectivity.

In manual mode, codex rewrite is skipped and only deterministic guardrails/build checks are applied.

## Required Workflow

1. Read `pending.json`.
2. Pick jobs where `state === "queued"` (and retry transient network `failed` jobs when enabled).
3. For each worksheet ID:
   - Mark metadata state as `processing`.
   - Create work dir: `<STORAGE_ROOT>/work/<worksheet_id>/`.
   - Unpack `original.zip` into the work dir.
   - Detect project root (`package.json`).
   - Run Codex rewrite for varied worksheet structures.
   - Apply guardrails (remove obvious Gemini dependencies).
   - Run install/build commands in project root.
   - Verify output has OpenAI hook, `gpt-4.1` reference, and no Gemini artifacts.
   - Verify OpenAI API connectivity for `gpt-4.1`.
   - Copy build output or normalized source into `<STORAGE_ROOT>/shippable/<worksheet_id>/`.
   - Update metadata:
     - `state: "integrated"`
     - `integrated_at: <ISO timestamp>`
     - `last_error: null`
   - Remove or update queue job state to non-queued.
4. On failure:
   - Keep queue job for retry or mark failed retry state.
   - Set metadata:
     - `state: "failed"`
     - `last_error: <error summary>`

## DNS/Network Fallback

If npm registry DNS/network is unavailable during automation:

1. Do not loop forever on install/build retries.
2. Produce a static runtime repack in `<STORAGE_ROOT>/shippable/<worksheet_id>/`:
   - remove Gemini artifacts
   - include `/api/runtime/ai` usage
   - include `gpt-4.1` reference
   - no `/index.css` or `/index.tsx` broken references
3. Update metadata:
   - `state: "integrated"`
   - `integration_mode: "static_runtime_repackage"`
   - `connectivity_verified: false`
   - `connectivity_note: <DNS/network reason>`

## Safety Rules

- Do not delete `.env`.
- Do not expose API keys into generated client bundles.
- Do not commit uploaded raw zips to git.
- Write JSON changes atomically (temp + rename) if editing queue/metadata.

## Git and Deploy Rules (for now)

- Prototype mode override: direct commit/push to `main` is allowed.
- Keep commits scoped to integration outputs and related metadata/queue updates only.

## Completion Criteria Per Worksheet

A worksheet is considered complete when:

1. metadata state is `integrated`
2. `integrated_at` is set
3. `<STORAGE_ROOT>/shippable/<worksheet_id>/` exists with usable output
4. queue no longer shows it as `queued`
