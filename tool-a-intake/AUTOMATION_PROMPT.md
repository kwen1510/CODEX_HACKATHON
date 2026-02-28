Use this exact automation prompt:

You are operating in /Users/etdadmin/Downloads/Codex_Hackathon.

Preflight (required):
1) Run `pwd` and `ls -la`.
2) Ensure `./tool-a-intake` exists.
   - If missing, but `/Users/etdadmin/Downloads/Codex_Hackathon/tool-a-intake` exists, `cd /Users/etdadmin/Downloads/Codex_Hackathon`.
   - If still missing, stop and print:
     "Workspace missing tool-a-intake. Mount /Users/etdadmin/Downloads/Codex_Hackathon as project root."
3) `cd tool-a-intake`
4) Load env: `set -a; source .env; set +a`
5) Resolve storage root:
   - `STORAGE_ROOT="${TOOL_A_STORAGE_ROOT:-/Users/etdadmin/Downloads/Codex_Hackathon/tool-a-intake/storage}"`
6) Verify required paths:
   - `$STORAGE_ROOT`
   - `$STORAGE_ROOT/queue/pending.json`
   - `$STORAGE_ROOT/metadata`
   - `$STORAGE_ROOT/intake`
   If any are missing, stop and print a clear error with the missing path.
7) Print: `Using STORAGE_ROOT=<resolved path>`
8) Network preflight (required):
   - `node -e "require('dns').lookup('registry.npmjs.org',(e,a)=>{if(e){console.error('DNS_FAIL',e.code||e.message);process.exit(1);}console.log('DNS_OK',a);})"`
   - `npm ping --registry=https://registry.npmjs.org/`
   If either fails, stop and print:
   "Network/DNS not ready for npm registry; skipping queue run."

Processing flow:
- Read `$STORAGE_ROOT/queue/pending.json`
- Process worksheet jobs queued for integration (and retry transient failed jobs)
- Run processor in manual mode (no nested codex exec):
  - `TOOL_A_STORAGE_ROOT=/tmp/codex_hackathon_storage RETRY_FAILED_JOBS=1 MAX_FAILED_ATTEMPTS=10 PROCESSING_STALE_MS=120000 CODEX_REWRITE_TIMEOUT_MS=300000 NPM_INSTALL_TIMEOUT_MS=360000 BUILD_TIMEOUT_MS=300000 npm run process:queue -- --mode=manual`

If no queued jobs are found:
- Print "No queued jobs found in $STORAGE_ROOT/queue/pending.json"
- Exit without failure.

Failure handling:
- Keep metadata/queue state synchronized (`failed` with concise `last_error`).
- Do not delete `.env`.
- Do not leak secrets.

DNS fallback for deliverable output:
- If npm install/build is blocked by DNS/network in automation, produce a static runtime repack in `$STORAGE_ROOT/shippable/<worksheet_id>/`:
  - `index.html` + `app.js` only
  - must call `/api/runtime/ai`
  - must reference `gpt-4.1`
  - must not contain Gemini artifacts
  - must not reference missing `/index.css` or `/index.tsx`
- Update metadata:
  - `state: "integrated"`
  - `integration_mode: "static_runtime_repackage"`
  - `connectivity_verified: false`
  - `connectivity_note: <DNS/network reason>`

Prototype git behavior (allowed):
- Direct commit/push to `main` is allowed.
- Do not commit uploaded raw zips.

Commit step (only if there are changes to tracked repo files):
1) `cd /Users/etdadmin/Downloads/Codex_Hackathon`
2) `git checkout main`
3) `git pull --rebase origin main`
4) `git add -A`
5) `git commit -m "Process queued worksheets and update integration pipeline"`
6) `git push origin main`

Final output:
- Print one line per worksheet_id with:
  - final state
  - shippable path
  - dist produced (yes/no)
  - verification status (OpenAI hook, gpt-4.1, no Gemini, connectivity)
  - failure reason (if any)
