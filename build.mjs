/* The package, as Typst will import it: dist/<version>/, the version read from
   typst/typst.toml. The two sources are the package's two halves: typst/, what
   runs when a document compiles, is copied in as it is, with the README and the
   LICENSE; web/, what runs in the browser, is minified into web/ beside it,
   which is where lib.typ reads it from. So typst/lib.typ does not compile in
   place. Only the copy in dist/ has web/ next to it.

   Each source is transformed on its own, not bundled: every script is one
   IIFE, and the scripts share nothing but `window.vit`, the DOM and
   `vitMarks`, so names at the top level are kept. The stylesheet keeps every
   `var(--vit-…)`, which lib.typ reads back out of it.

   Then the API reference, docs/api.pdf, which tidy reads out of typst/lib.typ's
   own comments. It stays in docs/, where the README points, and is committed.
   `build` alone is the package, which is all the invariants need.
     node build.mjs            both, once
     node build.mjs --watch    both, again on every save (the reference by
                               `typst watch`, which knows what it read) */
import * as esbuild from "esbuild";
import { execFileSync, spawn } from "node:child_process";
import { cpSync, readFileSync, rmSync, watch } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const TYPST = join(ROOT, "typst");

/* `version` under [package], and not a `version` of any later table */
export const version = () => {
  const toml = readFileSync(join(TYPST, "typst.toml"), "utf8");
  const pkg = /^\[package\][^\n]*\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m.exec(toml)?.[1] ?? "";
  const v = /^\s*version\s*=\s*"([^"]+)"/m.exec(pkg)?.[1];
  if (!v) throw new Error("typst/typst.toml has no [package] version");
  return v;
};

export const out = () => join(ROOT, "dist", version());

const copy = dir => {
  cpSync(TYPST, dir, { recursive: true, filter: f => basename(f) !== ".DS_Store" });
  for (const f of ["README.md", "LICENSE"]) cpSync(join(ROOT, f), join(dir, f));
};

const options = dir => ({
  absWorkingDir: ROOT,
  entryPoints: ["web/hoist.js", "web/runtime.js", "web/chrome.js", "web/deck.css"],
  outbase: ".",
  outdir: dir,
  outExtension: { ".js": ".min.js" },
  minify: true,
  charset: "utf8",
  legalComments: "none",
  logLevel: "warning",
});

/* from nothing, so a file gone from typst/ or web/ is gone from the package */
export const build = async () => {
  const dir = out();
  rmSync(dir, { recursive: true, force: true });
  copy(dir);
  await esbuild.build(options(dir));
  return dir;
};

const DOCS = ["--root", ROOT, join(ROOT, "docs/api.typ"), join(ROOT, "docs/api.pdf")];

export const docs = () => execFileSync("typst", ["compile", ...DOCS], { stdio: "inherit" });

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = await build();
  console.log("built " + dir);
  if (process.argv.includes("--watch")) {
    const ctx = await esbuild.context({ ...options(dir), logLevel: "info" });
    await ctx.watch();
    watch(TYPST, { recursive: true }, (_, f) => {
      copy(dir);
      console.log("copied typst/" + (f ?? ""));
    });
    const reference = spawn("typst", ["watch", ...DOCS], { stdio: "inherit" });
    // a Ctrl-C reaches both, a kill only this one: the watcher goes with it
    for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => { reference.kill(); process.exit(); });
  } else {
    docs();
    console.log("built docs/api.pdf");
  }
}
