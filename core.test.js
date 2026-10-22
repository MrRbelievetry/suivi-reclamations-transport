import test from "node:test";
import assert from "node:assert/strict";
import { TEN_DAYS_MS, deletionInfo, matchesRecord, normalizeState, normalizeUrl, renderTemplate, sortRecords } from "./core.js";

test("un dossier non résolu ne peut jamais être supprimé", () => {
  assert.equal(deletionInfo({ status: "En cours", updatedAt: "2026-01-01T00:00:00Z" }, new Date("2026-03-01T00:00:00Z")).eligible, false);
});

test("exactement dix jours ne suffit pas", () => {
  const resolvedAt = "2026-10-01T12:00:00Z";
  assert.equal(deletionInfo({ status: "Résolu", resolvedAt }, new Date(new Date(resolvedAt).getTime() + TEN_DAYS_MS)).eligible, false);
});

test("plus de dix jours autorise la suppression", () => {
  const resolvedAt = "2026-10-01T12:00:00Z";
  const result = deletionInfo({ status: "Résolu", resolvedAt }, new Date(new Date(resolvedAt).getTime() + TEN_DAYS_MS + 1));
  assert.equal(result.eligible, true);
  assert.equal(result.days, 10);
});

test("une date de clôture absente ou invalide bloque la suppression", () => {
  assert.equal(deletionInfo({ status: "Résolu", resolvedAt: "incorrect", updatedAt: "" }).eligible, false);
});

test("une ancienne base résolue récupère updated_at comme date de clôture", () => {
  const state = normalizeState({ records: [{ id: 4, client_name: "A", status: "Résolu", updated_at: "2026-09-01 10:00" }] });
  assert.equal(state.records[0].resolvedAt, "2026-09-01 10:00");
  assert.equal(state.records[0].clientName, "A");
  assert.equal(state.nextRecordId, 5);
});

test("les modèles remplacent les variables connues", () => {
  assert.equal(renderTemplate({ body: "Bonjour {client} — {commande} — {transporteur}" }, { clientName: "Léa", orderNumber: "FA1", carrier: "Colissimo" }), "Bonjour Léa — FA1 — Colissimo");
});

test("recherche, tri et validation des liens", () => {
  const records = [{ id: 1, status: "Résolu", clientName: "Zoé" }, { id: 2, status: "En cours", clientName: "Amir", trackingNumber: "AB123" }];
  assert.equal(matchesRecord(records[1], "ab123", "Tous"), true);
  assert.equal(matchesRecord(records[1], "zoé", "Tous"), false);
  assert.equal(sortRecords(records)[0].id, 2);
  assert.equal(normalizeUrl("suivi.example/ABC"), "https://suivi.example/ABC");
  assert.equal(normalizeUrl("javascript:alert(1)"), "");
});
