# Worksheet Platform Rebuild Roadmap (Phased)

## Cutover Notice

The old all-in-one prototype is intentionally removed.

This repository now follows a phased delivery model:

1. Phase 1: Tool A (ZIP Intake + Queue) only
2. Phase 2: Tool B (Codex Automation integration pipeline)
3. Phase 3: Tool C (worksheet loader by `?ws=<id>`)

## Why This Split

- Intake and integration are decoupled so uploads are fast and deterministic.
- Raw ZIP uploads are not committed to GitHub.
- GitHub branch pushes are reserved for integrated outputs in Phase 2.

---

## Phase 1: Tool A (Implemented Now)

### Goal

Accept worksheet ZIP uploads, persist artifacts and metadata locally, and enqueue integration jobs for Tool B.

### Scope

- `POST /api/intake/upload`
- `GET /api/intake/status?ws=<worksheet_id>`
- `GET /health`
- Reserved `GET /ws?ws=<worksheet_id>` returns 404 (Tool C not active yet)

### Storage Layout

All storage is local under `tool-a-intake/storage/`:

- `intake/<worksheet_id>/original.zip`
- `metadata/<worksheet_id>.json`
- `queue/pending.json`
- `locks/` (lock/temp helper directory)

### Worksheet ID Contract

Format: `ws_<YYYYMMDD>_<6char-random>`

Example: `ws_20260228_ab12cd`

### Metadata JSON Schema (per worksheet)

```json
{
  "worksheet_id": "ws_20260228_ab12cd",
  "title": "optional title",
  "owner_email": "optional@email.com",
  "original_filename": "worksheet.zip",
  "artifact_path": "storage/intake/ws_20260228_ab12cd/original.zip",
  "state": "queued",
  "uploaded_at": "ISO_DATE",
  "integrated_at": null,
  "last_error": null
}
```

### Queue JSON Schema

File: `storage/queue/pending.json`

```json
{
  "jobs": [
    {
      "worksheet_id": "ws_20260228_ab12cd",
      "state": "queued",
      "attempts": 0,
      "queued_at": "ISO_DATE"
    }
  ]
}
```

### Phase 1 API Contracts

#### `POST /api/intake/upload`

Request:

- Multipart form with required `file` (zip)
- Optional `title`
- Optional `owner_email`

Response:

```json
{
  "worksheet_id": "ws_20260228_ab12cd",
  "status": "queued",
  "artifact_path": "storage/intake/ws_20260228_ab12cd/original.zip"
}
```

Validation rules:

- `.zip` extension required
- zip MIME allowlist required
- zip magic bytes required
- max file size default 25 MB
- no unzip/build/rewrite/OpenAI calls

#### `GET /api/intake/status?ws=<worksheet_id>`

Response:

```json
{
  "worksheet_id": "ws_20260228_ab12cd",
  "state": "queued",
  "uploaded_at": "2026-02-28T03:15:00.000Z",
  "integrated_at": null,
  "last_error": null
}
```

#### `GET /health`

```json
{ "ok": true }
```

### Atomic Write Rule

All JSON writes must use temp-file + rename to avoid partial writes.

---

## Phase 2: Tool B (Reserved Next)

### Goal

Codex App Automation runs on schedule to process queued worksheets.

### Planned Behavior

1. Read `storage/queue/pending.json`
2. Claim queued worksheet jobs
3. Build/clean/integrate worksheet in automation workflow
4. Update metadata state (`processing`, `integrated`, `failed`)
5. Commit and push integrated results to `staging-integrated`
6. Append notification TODO event (no real email yet)

### Out of Scope in Phase 1

- No integration runner
- No git auto-commit/push logic
- No email provider calls

---

## Phase 3: Tool C (Reserved Later)

### Goal

Load integrated worksheet by id via query string:

- `GET /ws?ws=<worksheet_id>`

### Planned Behavior

1. Resolve worksheet by ID from metadata/index
2. If integrated, load app artifacts
3. If not integrated, return 404 or pending state

### Out of Scope in Phase 1

- No integrated artifact serving
- No runtime worksheet host page

---

## Explicit Non-Goals for This Rebuild Stage

- No OpenAI API usage in Tool A
- No Codex rewrite during upload
- No database server (JSON files are source of truth)
- No direct GitHub storage for raw uploads





# TODO
- Use Github as a DB for later