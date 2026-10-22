import test from "node:test";
import assert from "node:assert/strict";
import { configureConnection, loadState, saveState } from "./store.js";

test("charge puis enregistre le même fichier dans un dépôt GitHub privé", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      requests.push({ url, options });
      if (!options.method) {
        const content = Buffer.from(JSON.stringify({ records: [{ id: 8, clientName: "Mobile", status: "En cours" }] }), "utf8").toString("base64");
        return new Response(JSON.stringify({ sha: "sha-before", content }), { status: 200 });
      }
      const body = JSON.parse(options.body);
      assert.equal(body.sha, "sha-before");
      assert.equal(body.branch, "main");
      assert.match(Buffer.from(body.content, "base64").toString("utf8"), /Mobile/);
      return new Response(JSON.stringify({ content: { sha: "sha-after" } }), { status: 200 });
    };
    configureConnection({ owner: "compte", repo: "donnees-privees", token: "secret-test" });
    const state = await loadState();
    assert.equal(state.records[0].clientName, "Mobile");
    await saveState(state);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].options.headers.Authorization, "Bearer secret-test");
    assert.match(requests[0].url, /repos\/compte\/donnees-privees\/contents\/data\.json/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("initialise data.json quand le dépôt privé est vide", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async (_url, options = {}) => {
      calls += 1;
      if (!options.method) return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
      return new Response(JSON.stringify({ content: { sha: "initial-sha" } }), { status: 201 });
    };
    configureConnection({ owner: "compte", repo: "vide", token: "secret-test" });
    const state = await loadState();
    assert.equal(state.records.length, 0);
    assert.equal(state.templates.length, 4);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
