import { cp, mkdir, rm } from "node:fs/promises";

const output = new URL("./dist/", import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(new URL("./dist/vendor/", import.meta.url), { recursive: true });

for (const file of ["index.html", "style.css", "app.js", "core.js", "store.js", "icon.svg", "README.md"]) {
  await cp(new URL(`./${file}`, import.meta.url), new URL(`./dist/${file}`, import.meta.url));
}
for (const file of ["sql-wasm.js", "sql-wasm.wasm"]) {
  await cp(new URL(`./node_modules/sql.js/dist/${file}`, import.meta.url), new URL(`./dist/vendor/${file}`, import.meta.url));
}
