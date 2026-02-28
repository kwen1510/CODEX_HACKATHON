# Tool A Intake

Phase 1 upload + queue service.

## Endpoints

- `POST /api/intake/upload`
- `GET /api/intake/status?ws=<worksheet_id>`
- `GET /health`
- `GET /ws` (reserved, returns 404 in Phase 1)

## Run

```bash
cd tool-a-intake
npm install
npm run dev
```

Default port is `8787`.

Open `http://localhost:8787/` for drag-and-drop upload UI.

## Shared Storage Across Codex Worktrees

Codex Automations run in dedicated git worktrees. To let the intake app and automation share the same queue/uploads, set one common storage path in both places:

```bash
export TOOL_A_STORAGE_ROOT=/tmp/codex_hackathon_storage
```

Then start the intake server and run queue processing with that same env var.

## Secure Env For Automations (Recommended)

Create a secure env file outside git (one-time):

```bash
cd /Users/etdadmin/Downloads/Codex_Hackathon/tool-a-intake
npm run env:init
```

Edit `/tmp/codex_secrets/tool-a-intake.env` and set your real `OPENAI_API_KEY`.

Run queue processing with secure env load:

```bash
cd /Users/etdadmin/Downloads/Codex_Hackathon/tool-a-intake
npm run process:queue:secure
```

Optional custom path:

```bash
SECURE_ENV_FILE=/tmp/codex_secrets/tool-a-intake.env npm run process:queue:secure
```

## Codex Automation Prep

- Global policy file: `/Users/etdadmin/Downloads/Codex_Hackathon/AGENTS.md`
- Prompt template for Codex Automations: `/Users/etdadmin/Downloads/Codex_Hackathon/tool-a-intake/AUTOMATION_PROMPT.md`

## Queue Processing

Run Codex-first integration locally:

```bash
cd /Users/etdadmin/Downloads/Codex_Hackathon/tool-a-intake
npm run process:queue:secure
```

This command rewrites via Codex, builds, verifies OpenAI hook (`/api/runtime/ai`, `gpt-4.1`), and rejects Gemini leftovers.
