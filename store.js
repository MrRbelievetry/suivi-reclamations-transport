import { normalizeState } from "./core.js?v=1.1.0";

let connection = null;
let currentSha = null;

export function configureConnection({ owner, repo, token, path = "data.json", branch = "main" }) {
  if (!owner || !repo || !token) throw new Error("Les informations GitHub sont incomplètes.");
  connection = { owner: owner.trim(), repo: repo.trim(), token: token.trim(), path, branch };
  currentSha = null;
}

export function clearConnection() {
  connection = null;
  currentSha = null;
}

function headers() {
  if (!connection) throw new Error("Connexion GitHub requise.");
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${connection.token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json"
  };
}

function endpoint() {
  const { owner, repo, path } = connection;
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function encodeUtf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function decodeUtf8(base64) {
  const binary = atob(base64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function githubRequest(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  if (response.ok) return response.status === 204 ? null : response.json();
  let detail = "";
  try { detail = (await response.json()).message || ""; } catch {}
  const error = new Error(detail || `Erreur GitHub ${response.status}`);
  error.status = response.status;
  throw error;
}

export async function loadState() {
  if (!connection) throw new Error("Connexion GitHub requise.");
  const url = `${endpoint()}?ref=${encodeURIComponent(connection.branch)}`;
  try {
    const file = await githubRequest(url);
    currentSha = file.sha;
    return normalizeState(JSON.parse(decodeUtf8(file.content)));
  } catch (error) {
    if (error.status !== 404) throw error;
    const initial = normalizeState({});
    await saveState(initial, "Initialiser les données de suivi");
    return initial;
  }
}

export async function saveState(state, message = "Mettre à jour les suivis transport") {
  if (!connection) throw new Error("Connexion GitHub requise.");
  const normalized = normalizeState(state);
  normalized.nextRecordId = state.nextRecordId || normalized.nextRecordId;
  normalized.nextActionId = state.nextActionId || normalized.nextActionId;
  normalized.nextTemplateId = state.nextTemplateId || normalized.nextTemplateId;
  const body = {
    message,
    content: encodeUtf8(JSON.stringify(normalized, null, 2)),
    branch: connection.branch
  };
  if (currentSha) body.sha = currentSha;
  try {
    const result = await githubRequest(endpoint(), { method: "PUT", body: JSON.stringify(body) });
    currentSha = result.content.sha;
    return normalized;
  } catch (error) {
    if (error.status === 409 || error.status === 422) {
      throw new Error("Les données GitHub ont changé dans un autre onglet. Rechargez les données avant de réessayer.");
    }
    throw error;
  }
}

export function connectionLabel() {
  return connection ? `${connection.owner}/${connection.repo}` : "";
}
