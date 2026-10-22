import { CARRIERS, STATUSES, deletionInfo, matchesRecord, normalizeState, normalizeUrl, renderTemplate, sortRecords } from "./core.js?v=1.1.0";
import { clearConnection, configureConnection, connectionLabel, loadState, saveState } from "./store.js?v=1.1.0";

const $ = id => document.getElementById(id);
const today = () => new Date().toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();
let state = normalizeState({});
let githubConnected = false;
let selectedRecordId = null;
let toastTimer;

function toast(message, error = false) {
  const node = $("toast");
  node.textContent = message;
  node.className = `toast show${error ? " error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.className = "toast", 3200);
}

async function persist(message) {
  try {
    state = await saveState(state, message);
    return true;
  } catch (error) {
    toast(error.message || "Enregistrement GitHub impossible.", true);
    return false;
  }
}

function formatDate(value, includeTime = false) {
  if (!value) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + "T12:00:00") : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", includeTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }).format(date);
}

function makeButton(label, action, className = "mini-button") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", event => { event.stopPropagation(); action(); });
  return button;
}

function statusClass(status) {
  return status === "À relancer" ? "status-a-relancer" : status === "Résolu" ? "status-resolu" : "status-en-cours";
}

function renderStats() {
  const counts = Object.fromEntries(STATUSES.map(status => [status, state.records.filter(record => record.status === status).length]));
  const eligible = state.records.filter(record => deletionInfo(record).eligible).length;
  $("stats").innerHTML = `
    <div class="stat en-cours"><strong>${counts["En cours"]}</strong><span>En cours</span></div>
    <div class="stat a-relancer"><strong>${counts["À relancer"]}</strong><span>À relancer</span></div>
    <div class="stat resolu"><strong>${counts["Résolu"]}</strong><span>Résolus</span></div>
    <div class="stat"><strong>${eligible}</strong><span>Suppressibles (+ de 10 jours)</span></div>`;
}

function filteredRecords() {
  return sortRecords(state.records.filter(record => matchesRecord(record, $("search").value, $("status-filter").value)));
}

function renderRecords() {
  renderStats();
  const records = filteredRecords();
  const body = $("records-body");
  body.replaceChildren();
  $("result-count").textContent = `${records.length} dossier${records.length > 1 ? "s" : ""}`;
  $("empty-state").hidden = records.length > 0;
  $("records-body").closest(".table-wrap").hidden = records.length === 0;

  for (const record of records) {
    const row = document.createElement("tr");
    row.dataset.id = record.id;
    row.tabIndex = 0;
    row.setAttribute("aria-selected", String(selectedRecordId === record.id));
    if (selectedRecordId === record.id) row.classList.add("selected");
    row.addEventListener("click", () => { selectedRecordId = record.id; renderRecords(); });
    row.addEventListener("dblclick", () => openRecord(record.id));
    row.addEventListener("keydown", event => { if (event.key === "Enter") openRecord(record.id); });

    const statusCell = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = `status-pill ${statusClass(record.status)}`;
    pill.textContent = record.status;
    statusCell.append(pill);

    const client = document.createElement("td"); client.textContent = record.clientName || "—";
    const order = document.createElement("td"); order.textContent = record.orderNumber || "—";
    const carrier = document.createElement("td"); carrier.textContent = record.carrier || "—";
    const tracking = document.createElement("td");
    if (normalizeUrl(record.trackingUrl)) tracking.append(makeButton("Ouvrir le suivi", () => window.open(normalizeUrl(record.trackingUrl), "_blank", "noopener"), "mini-button"));
    else tracking.textContent = record.trackingNumber || "—";
    const opened = document.createElement("td"); opened.textContent = formatDate(record.openedDate);
    const actions = document.createElement("td");
    const actionBox = document.createElement("div"); actionBox.className = "row-actions";
    actionBox.append(makeButton("Ouvrir", () => openRecord(record.id)));
    if (record.status !== "Résolu") actionBox.append(makeButton("Résoudre", () => markResolved(record.id)));
    if (deletionInfo(record).eligible) actionBox.append(makeButton("Supprimer", () => deleteRecord(record.id), "mini-button danger"));
    actions.append(actionBox);
    row.append(statusCell, client, order, carrier, tracking, opened, actions);
    body.append(row);
  }
}

function renderTemplates() {
  const selects = [$("template-select"), $("template-manager-select")];
  for (const select of selects) {
    const previous = select.value;
    select.replaceChildren(...state.templates.map(template => {
      const option = document.createElement("option");
      option.value = template.id;
      option.textContent = template.title;
      return option;
    }));
    if (state.templates.some(template => String(template.id) === previous)) select.value = previous;
  }
  loadTemplateEditor(Number($("template-manager-select").value));
}

function addAction(recordId, text, date = today()) {
  state.actions.push({ id: state.nextActionId++, recordId, date, text, createdAt: nowIso() });
}

async function markResolved(id) {
  const record = state.records.find(item => item.id === id);
  if (!record) return;
  if (record.status !== "Résolu") {
    record.status = "Résolu";
    record.resolvedAt = nowIso();
    record.updatedAt = nowIso();
    addAction(id, "Dossier marqué comme résolu");
    await persist();
    renderRecords();
    toast("Le dossier est marqué comme résolu.");
  }
}

async function deleteRecord(id) {
  const record = state.records.find(item => item.id === id);
  const eligibility = deletionInfo(record);
  if (!eligibility.eligible) {
    toast(eligibility.reason, true);
    return;
  }
  if (!window.confirm(`Supprimer définitivement le dossier de ${record.clientName} ?\n\nCette action supprimera aussi son historique et ne peut pas être annulée.`)) return;
  state.records = state.records.filter(item => item.id !== id);
  state.actions = state.actions.filter(action => action.recordId !== id);
  if (selectedRecordId === id) selectedRecordId = null;
  await persist();
  $("record-dialog").close();
  renderRecords();
  toast("Le dossier a été supprimé.");
}

function openRecord(id = null) {
  const record = id ? state.records.find(item => item.id === id) : null;
  $("record-form").reset();
  $("record-id").value = record?.id || "";
  $("record-title").textContent = record ? "Fiche réclamation" : "Nouvelle réclamation";
  $("client-name").value = record?.clientName || "";
  $("order-number").value = record?.orderNumber || "";
  $("carrier").value = record?.carrier || "Chronopost";
  $("record-status").value = record?.status || "En cours";
  $("tracking-number").value = record?.trackingNumber || "";
  $("opened-date").value = record?.openedDate || today();
  $("tracking-url").value = record?.trackingUrl || "";
  $("action-date").value = today();
  $("action-text").value = "";
  $("history-section").hidden = !record;
  $("delete-record").hidden = !record || record.status !== "Résolu";
  if (record) {
    const info = deletionInfo(record);
    $("delete-record").disabled = !info.eligible;
    $("deletion-note").hidden = record.status !== "Résolu";
    $("deletion-note").textContent = info.eligible ? `Clôturé depuis ${info.days} jours : ce dossier peut être supprimé définitivement.` : info.reason;
    renderActions(record.id);
  } else {
    $("deletion-note").hidden = true;
    $("actions-list").replaceChildren();
  }
  $("record-dialog").showModal();
  $("client-name").focus();
}

function renderActions(recordId) {
  const list = $("actions-list");
  list.replaceChildren();
  const actions = state.actions.filter(action => action.recordId === recordId)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id);
  if (!actions.length) {
    const item = document.createElement("li"); item.className = "muted"; item.textContent = "Aucune action enregistrée."; list.append(item); return;
  }
  for (const action of actions) {
    const item = document.createElement("li");
    const time = document.createElement("time"); time.textContent = formatDate(action.date); time.dateTime = action.date;
    item.append(time, document.createTextNode(action.text));
    list.append(item);
  }
}

async function submitRecord(event) {
  event.preventDefault();
  const id = Number($("record-id").value);
  const current = id ? state.records.find(item => item.id === id) : null;
  const status = $("record-status").value;
  const timestamp = nowIso();
  const record = {
    id: current?.id || state.nextRecordId++,
    clientName: $("client-name").value.trim(),
    orderNumber: $("order-number").value.trim(),
    carrier: $("carrier").value,
    trackingNumber: $("tracking-number").value.trim(),
    trackingUrl: $("tracking-url").value.trim(),
    openedDate: $("opened-date").value,
    status,
    resolvedAt: status === "Résolu" ? (current?.status === "Résolu" ? current.resolvedAt || current.updatedAt : timestamp) : null,
    createdAt: current?.createdAt || timestamp,
    updatedAt: timestamp
  };
  if (!record.clientName) { toast("Le nom du client est obligatoire.", true); return; }
  if (record.trackingUrl && !normalizeUrl(record.trackingUrl)) { toast("Le lien de suivi n’est pas valide.", true); return; }
  if (current) {
    if (current.status !== "Résolu" && status === "Résolu") addAction(id, "Dossier marqué comme résolu");
    if (current.status === "Résolu" && status !== "Résolu") addAction(id, `Dossier rouvert avec le statut « ${status} »`);
    state.records[state.records.indexOf(current)] = record;
  } else {
    state.records.push(record);
    if (status === "Résolu") addAction(record.id, "Dossier créé avec le statut résolu");
  }
  selectedRecordId = record.id;
  await persist();
  $("record-dialog").close();
  renderRecords();
  toast("La fiche a bien été enregistrée.");
}

async function copyText(text, success) {
  try {
    await navigator.clipboard.writeText(text);
    toast(success);
  } catch {
    toast("Le navigateur n’a pas autorisé la copie.", true);
  }
}

function selectedRecord() {
  const record = state.records.find(item => item.id === selectedRecordId);
  if (!record) toast("Cliquez d’abord sur un dossier dans la liste.", true);
  return record;
}

function loadTemplateEditor(id) {
  const template = state.templates.find(item => item.id === Number(id));
  $("template-id").value = template?.id || "";
  $("template-title").value = template?.title || "";
  $("template-body").value = template?.body || "";
  $("delete-template").disabled = !template;
}

function openTemplateManager() {
  renderTemplates();
  $("template-dialog").showModal();
}

async function submitTemplate(event) {
  event.preventDefault();
  const id = Number($("template-id").value);
  const timestamp = nowIso();
  const template = state.templates.find(item => item.id === id);
  const value = { id: template?.id || state.nextTemplateId++, title: $("template-title").value.trim(), body: $("template-body").value, createdAt: template?.createdAt || timestamp, updatedAt: timestamp };
  if (!value.title || !value.body.trim()) { toast("Le nom et le texte du modèle sont obligatoires.", true); return; }
  if (template) state.templates[state.templates.indexOf(template)] = value; else state.templates.push(value);
  await persist();
  renderTemplates();
  $("template-manager-select").value = value.id;
  loadTemplateEditor(value.id);
  toast("Le modèle a été enregistré.");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function exportBackup() {
  downloadBlob(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }), `suivi-reclamations-${today()}.json`);
  toast("La sauvegarde a été téléchargée.");
}

async function importBackup(file) {
  try {
    const parsed = JSON.parse(await file.text());
    const incoming = normalizeState(parsed);
    if (!window.confirm(`Importer cette sauvegarde (${incoming.records.length} dossiers) ?\n\nLes données actuelles de ce navigateur seront remplacées.`)) return;
    state = incoming;
    selectedRecordId = null;
    await persist();
    renderTemplates(); renderRecords();
    toast("La sauvegarde a été importée.");
  } catch {
    toast("Ce fichier de sauvegarde n’est pas valide.", true);
  }
}

function rowsFromQuery(db, sql) {
  const result = db.exec(sql)[0];
  if (!result) return [];
  return result.values.map(values => Object.fromEntries(result.columns.map((column, index) => [column, values[index]])));
}

async function importSqlite(file) {
  try {
    if (!window.initSqlJs) throw new Error("sql.js indisponible");
    const SQL = await window.initSqlJs({ locateFile: name => `./vendor/${name}` });
    const db = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
    const tables = rowsFromQuery(db, "SELECT name FROM sqlite_master WHERE type='table'").map(row => row.name);
    if (!tables.includes("reclamations")) throw new Error("table absente");
    const raw = {
      records: rowsFromQuery(db, "SELECT * FROM reclamations"),
      actions: tables.includes("actions") ? rowsFromQuery(db, "SELECT * FROM actions") : [],
      templates: tables.includes("message_templates") ? rowsFromQuery(db, "SELECT * FROM message_templates") : []
    };
    db.close();
    const incoming = normalizeState(raw);
    if (!window.confirm(`Reprendre ${incoming.records.length} dossiers depuis l’ancienne base ?\n\nLes données actuelles de ce navigateur seront remplacées.`)) return;
    state = incoming;
    selectedRecordId = null;
    await persist();
    renderTemplates(); renderRecords();
    toast("L’ancienne base a été importée.");
  } catch (error) {
    console.error(error);
    toast("Cette base SQLite n’est pas compatible avec l’ancienne application.", true);
  }
}

$("carrier").replaceChildren(...CARRIERS.map(value => new Option(value, value)));
$("record-status").replaceChildren(...STATUSES.map(value => new Option(value, value)));
$("new-record").addEventListener("click", () => openRecord());
$("record-form").addEventListener("submit", submitRecord);
document.querySelectorAll(".close-dialog").forEach(button => button.addEventListener("click", () => $("record-dialog").close()));
$("delete-record").addEventListener("click", () => deleteRecord(Number($("record-id").value)));
$("add-action").addEventListener("click", async () => {
  const id = Number($("record-id").value);
  const text = $("action-text").value.trim();
  if (!id || !text) { toast("Saisissez une action.", true); return; }
  addAction(id, text, $("action-date").value || today());
  const record = state.records.find(item => item.id === id); if (record) record.updatedAt = nowIso();
  $("action-text").value = "";
  await persist(); renderActions(id); renderRecords(); toast("L’action a été ajoutée.");
});
$("search").addEventListener("input", renderRecords);
$("status-filter").addEventListener("change", renderRecords);
$("copy-message").addEventListener("click", () => {
  const record = selectedRecord(); if (!record) return;
  const template = state.templates.find(item => item.id === Number($("template-select").value));
  if (!template) { toast("Sélectionnez un modèle.", true); return; }
  copyText(renderTemplate(template, record), "Le message client a été copié.");
  addAction(record.id, `Message client copié : ${template.title}`); persist().then(renderRecords);
});
$("manage-templates").addEventListener("click", openTemplateManager);
$("template-manager-select").addEventListener("change", event => loadTemplateEditor(Number(event.target.value)));
$("new-template").addEventListener("click", () => { $("template-manager-select").selectedIndex = -1; loadTemplateEditor(null); $("template-title").focus(); });
$("template-form").addEventListener("submit", submitTemplate);
document.querySelectorAll(".close-template").forEach(button => button.addEventListener("click", () => $("template-dialog").close()));
$("delete-template").addEventListener("click", async () => {
  const id = Number($("template-id").value);
  const template = state.templates.find(item => item.id === id);
  if (!template || !window.confirm(`Supprimer le modèle « ${template.title} » ?`)) return;
  state.templates = state.templates.filter(item => item.id !== id);
  await persist(); renderTemplates(); toast("Le modèle a été supprimé.");
});
$("reload-data").addEventListener("click", async () => {
  if (!githubConnected) {
    $("github-dialog").showModal();
    return;
  }
  const button = $("reload-data");
  button.disabled = true;
  button.textContent = "Synchronisation…";
  try {
    state = await loadState();
    selectedRecordId = null;
    renderTemplates();
    renderRecords();
    toast("Les dernières données GitHub sont chargées.");
  } catch (error) {
    toast(error.message || "Synchronisation GitHub impossible.", true);
  } finally {
    button.disabled = false;
    button.textContent = "Synchroniser";
  }
});
$("github-settings").addEventListener("click", () => {
  $("cancel-github").hidden = !githubConnected;
  $("github-token").value = "";
  $("github-error").hidden = true;
  $("github-dialog").showModal();
});
$("cancel-github").addEventListener("click", () => $("github-dialog").close());
$("github-form").addEventListener("submit", async event => {
  event.preventDefault();
  const button = $("connect-github");
  const errorNode = $("github-error");
  button.disabled = true;
  button.textContent = "Connexion…";
  errorNode.hidden = true;
  try {
    clearConnection();
    configureConnection({
      owner: $("github-owner").value,
      repo: $("github-repo").value,
      token: $("github-token").value
    });
    state = await loadState();
    githubConnected = true;
    selectedRecordId = null;
    $("github-token").value = "";
    $("github-dialog").close();
    renderTemplates();
    renderRecords();
    toast(`Données chargées depuis ${connectionLabel()}.`);
  } catch (error) {
    clearConnection();
    githubConnected = false;
    errorNode.textContent = error.status === 401 || error.status === 403
      ? "Connexion refusée. Vérifiez la clé et son droit « Contents: Read and write » sur ce dépôt privé."
      : error.status === 404
        ? "Dépôt introuvable. Vérifiez le compte, le nom du dépôt et l’accès accordé à la clé."
        : (error.message || "Connexion GitHub impossible.");
    errorNode.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = "Charger les données";
  }
});
$("export-data").addEventListener("click", exportBackup);
$("import-data").addEventListener("click", () => $("backup-file").click());
$("import-sqlite").addEventListener("click", () => $("sqlite-file").click());
$("backup-file").addEventListener("change", event => { const file = event.target.files[0]; if (file) importBackup(file); event.target.value = ""; });
$("sqlite-file").addEventListener("change", event => { const file = event.target.files[0]; if (file) importSqlite(file); event.target.value = ""; });

renderTemplates();
renderRecords();
$("github-dialog").showModal();
