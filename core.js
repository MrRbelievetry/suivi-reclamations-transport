export const STATUSES = ["En cours", "À relancer", "Résolu"];
export const CARRIERS = ["Chronopost", "La Poste", "Colissimo", "Mondial Relay", "Relais Colis", "Amazon", "Autre"];
export const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

export const DEFAULT_TEMPLATES = [
  {
    title: "Retard colis",
    body: "Bonjour {client},\n\nNous vous remercions pour votre message. Après vérification, votre colis est bien en cours d’acheminement mais semble rencontrer un retard de transport.\n\nNous allons surveiller son évolution et reviendrons vers vous dès qu’une mise à jour sera disponible.\n\nLien de suivi : {lien_suivi}\n\nCordialement,\nService client Oriental Discount"
  },
  {
    title: "Enquête transporteur ouverte",
    body: "Bonjour {client},\n\nNous vous informons qu’une réclamation vient d’être ouverte auprès du transporteur concernant votre commande {commande}.\n\nNous suivons le dossier et vous tiendrons informé dès réception d’un retour.\n\nLien de suivi : {lien_suivi}\n\nCordialement,\nService client Oriental Discount"
  },
  {
    title: "Colis en point relais",
    body: "Bonjour {client},\n\nAprès vérification du suivi, votre colis semble disponible en point relais ou en attente de retrait.\n\nNous vous invitons à consulter le lien de suivi afin de vérifier l’adresse et les modalités de retrait : {lien_suivi}\n\nCordialement,\nService client Oriental Discount"
  },
  {
    title: "Remboursement après retour",
    body: "Bonjour {client},\n\nVotre colis est actuellement en cours de retour vers nos locaux. Dès réception, nous procéderons au remboursement conformément au suivi du dossier.\n\nCommande : {commande}\nLien de suivi : {lien_suivi}\n\nCordialement,\nService client Oriental Discount"
  }
];

export function normalizeUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  const candidate = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    const parsed = new URL(candidate);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

export function deletionInfo(record, now = new Date()) {
  if (!record || record.status !== "Résolu") {
    return { eligible: false, reason: "Le dossier doit être résolu.", days: 0, availableAt: null };
  }
  const value = record.resolvedAt || record.updatedAt;
  const resolved = value ? new Date(value) : null;
  if (!resolved || Number.isNaN(resolved.getTime())) {
    return { eligible: false, reason: "La date de clôture est inconnue.", days: 0, availableAt: null };
  }
  const elapsed = now.getTime() - resolved.getTime();
  const days = Math.max(0, Math.floor(elapsed / 86400000));
  const availableAt = new Date(resolved.getTime() + TEN_DAYS_MS);
  const eligible = elapsed > TEN_DAYS_MS;
  return {
    eligible,
    days,
    availableAt,
    reason: eligible
      ? "Ce dossier peut être supprimé."
      : `Suppression disponible après 10 jours complets (le ${availableAt.toLocaleDateString("fr-FR")}).`
  };
}

export function renderTemplate(template, record) {
  const values = {
    client: record?.clientName || "",
    commande: record?.orderNumber || "",
    suivi: record?.trackingNumber || "",
    lien_suivi: record?.trackingUrl || "",
    transporteur: record?.carrier || "Chronopost"
  };
  return String(template?.body || "").replace(/\{(client|commande|suivi|lien_suivi|transporteur)\}/g, (_, key) => values[key]);
}

export function matchesRecord(record, search, status) {
  if (status && status !== "Tous" && record.status !== status) return false;
  const needle = String(search || "").trim().toLocaleLowerCase("fr");
  if (!needle) return true;
  return [record.clientName, record.orderNumber, record.carrier, record.trackingNumber, record.trackingUrl]
    .some(value => String(value || "").toLocaleLowerCase("fr").includes(needle));
}

export function sortRecords(records) {
  const order = { "En cours": 0, "À relancer": 1, "Résolu": 2 };
  return [...records].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || Number(b.id) - Number(a.id));
}

export function normalizeState(raw = {}) {
  const now = new Date().toISOString();
  const records = Array.isArray(raw.records) ? raw.records.map((r, index) => {
    const status = STATUSES.includes(r.status) ? r.status : "En cours";
    const updatedAt = r.updatedAt || r.updated_at || r.createdAt || r.created_at || now;
    return {
      id: Number(r.id) || index + 1,
      clientName: String(r.clientName ?? r.client_name ?? ""),
      orderNumber: String(r.orderNumber ?? r.order_number ?? ""),
      carrier: String(r.carrier || "Chronopost"),
      trackingNumber: String(r.trackingNumber ?? r.tracking_number ?? ""),
      trackingUrl: String(r.trackingUrl ?? r.tracking_url ?? ""),
      openedDate: String(r.openedDate ?? r.opened_date ?? ""),
      status,
      resolvedAt: status === "Résolu" ? (r.resolvedAt || r.resolved_at || updatedAt) : null,
      createdAt: r.createdAt || r.created_at || now,
      updatedAt
    };
  }) : [];
  const actions = Array.isArray(raw.actions) ? raw.actions.map((a, index) => ({
    id: Number(a.id) || index + 1,
    recordId: Number(a.recordId ?? a.reclamation_id),
    date: String(a.date ?? a.action_date ?? ""),
    text: String(a.text ?? a.action_text ?? ""),
    createdAt: a.createdAt || a.created_at || now
  })) : [];
  const templates = Array.isArray(raw.templates) && raw.templates.length
    ? raw.templates.map((t, index) => ({ id: Number(t.id) || index + 1, title: String(t.title || ""), body: String(t.body || ""), createdAt: t.createdAt || t.created_at || now, updatedAt: t.updatedAt || t.updated_at || now }))
    : DEFAULT_TEMPLATES.map((t, index) => ({ ...t, id: index + 1, createdAt: now, updatedAt: now }));
  return {
    version: 1,
    records,
    actions,
    templates,
    nextRecordId: Math.max(0, ...records.map(r => r.id)) + 1,
    nextActionId: Math.max(0, ...actions.map(a => a.id)) + 1,
    nextTemplateId: Math.max(0, ...templates.map(t => t.id)) + 1
  };
}
