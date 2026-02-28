const fileInput = document.getElementById("file-input");
const dropzone = document.getElementById("dropzone");
const fileChip = document.getElementById("file-chip");
const form = document.getElementById("upload-form");
const submitBtn = document.getElementById("submit-btn");
const statusLine = document.getElementById("status-line");
const resultBox = document.getElementById("result-box");
const statusIdInput = document.getElementById("status-id-input");
const statusBtn = document.getElementById("status-btn");
const refreshWorksheetsBtn = document.getElementById("refresh-worksheets-btn");
const worksheetBrowserNote = document.getElementById("worksheet-browser-note");
const worksheetList = document.getElementById("worksheet-list");

function setStatus(text, kind) {
  statusLine.textContent = text;
  statusLine.className = `status status-${kind}`;
}

function setResult(value) {
  resultBox.textContent = JSON.stringify(value, null, 2);
}

function formatDate(value) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function renderWorksheets(worksheets) {
  worksheetList.innerHTML = "";
  if (!Array.isArray(worksheets) || worksheets.length === 0) {
    worksheetBrowserNote.textContent = "No worksheets found.";
    return;
  }

  worksheetBrowserNote.textContent = `Found ${worksheets.length} worksheet(s).`;

  for (const row of worksheets) {
    const card = document.createElement("article");
    card.className = "worksheet-card";

    const id = document.createElement("p");
    id.className = "worksheet-id";
    id.textContent = row.worksheet_id || "(unknown id)";
    card.appendChild(id);

    const meta = document.createElement("p");
    meta.className = "worksheet-meta";
    meta.textContent = `state=${row.state || "unknown"} • uploaded=${formatDate(row.uploaded_at)} • integrated=${formatDate(row.integrated_at)}`;
    card.appendChild(meta);

    if (row.last_error) {
      const error = document.createElement("p");
      error.className = "worksheet-error";
      error.textContent = `error: ${row.last_error}`;
      card.appendChild(error);
    }

    const actions = document.createElement("div");
    actions.className = "worksheet-actions";
    if (row.open_url) {
      const openLink = document.createElement("a");
      openLink.className = "open-link";
      openLink.href = row.open_url;
      openLink.textContent = "Open worksheet";
      openLink.target = "_blank";
      openLink.rel = "noreferrer noopener";
      actions.appendChild(openLink);
    } else {
      const pending = document.createElement("span");
      pending.className = "not-ready";
      pending.textContent = "Not ready yet";
      actions.appendChild(pending);
    }
    card.appendChild(actions);

    worksheetList.appendChild(card);
  }
}

async function loadWorksheets() {
  worksheetBrowserNote.textContent = "Loading worksheets...";
  try {
    const response = await fetch("/api/intake/worksheets");
    const json = await response.json();
    if (!response.ok) {
      worksheetBrowserNote.textContent = "Failed to load worksheets.";
      return;
    }
    renderWorksheets(json.worksheets || []);
  } catch (error) {
    worksheetBrowserNote.textContent = `Failed to load worksheets: ${String(error)}`;
  }
}

function updateSelectedFileUI(file) {
  if (!file) {
    fileChip.textContent = "No file selected";
    return;
  }
  fileChip.textContent = `${file.name} • ${(file.size / 1024 / 1024).toFixed(2)} MB`;
}

function selectedFile() {
  return fileInput.files && fileInput.files.length > 0 ? fileInput.files[0] : null;
}

function setFile(file) {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;
  updateSelectedFileUI(file);
}

dropzone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => updateSelectedFileUI(selectedFile()));

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("drag");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("drag");
});

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("drag");
  const files = event.dataTransfer?.files;
  if (!files || files.length === 0) return;
  setFile(files[0]);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = selectedFile();
  if (!file) {
    setStatus("Select a ZIP file first.", "error");
    return;
  }
  if (!file.name.toLowerCase().endsWith(".zip")) {
    setStatus("Only .zip files are supported.", "error");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  const title = document.getElementById("title").value.trim();
  const ownerEmail = document.getElementById("owner-email").value.trim();
  if (title) formData.append("title", title);
  if (ownerEmail) formData.append("owner_email", ownerEmail);

  submitBtn.disabled = true;
  setStatus("Uploading and queueing worksheet...", "working");

  try {
    const response = await fetch("/api/intake/upload", {
      method: "POST",
      body: formData
    });
    const json = await response.json();
    setResult(json);
    if (!response.ok) {
      setStatus("Upload failed.", "error");
      return;
    }
    setStatus("Upload queued successfully.", "ok");
    if (json.worksheet_id) {
      statusIdInput.value = json.worksheet_id;
    }
    await loadWorksheets();
  } catch (error) {
    setResult({ error: String(error) });
    setStatus("Request failed.", "error");
  } finally {
    submitBtn.disabled = false;
  }
});

statusBtn.addEventListener("click", async () => {
  const worksheetId = statusIdInput.value.trim();
  if (!worksheetId) {
    setStatus("Enter worksheet ID to check status.", "error");
    return;
  }

  setStatus("Checking status...", "working");
  try {
    const response = await fetch(`/api/intake/status?ws=${encodeURIComponent(worksheetId)}`);
    const json = await response.json();
    setResult(json);
    if (response.ok) {
      setStatus("Status loaded.", "ok");
    } else {
      setStatus("Status request failed.", "error");
    }
  } catch (error) {
    setResult({ error: String(error) });
    setStatus("Status request failed.", "error");
  }
});

refreshWorksheetsBtn.addEventListener("click", () => {
  void loadWorksheets();
});

void loadWorksheets();
