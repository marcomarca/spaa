import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const rootDir = join(import.meta.dir, "..");
const distDir = join(rootDir, "dist");

if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// 1. Build TypeScript bundles
const buildResult = await Bun.build({
  entrypoints: [
    join(rootDir, "src/service-worker.ts"),
    join(rootDir, "src/content-script.ts"),
    join(rootDir, "src/popup/popup.ts"),
  ],
  outdir: distDir,
  target: "browser",
  minify: false,
});

if (!buildResult.success) {
  console.error("Build failed:", buildResult.logs);
  process.exit(1);
}

// 2. Generate dist/manifest.json pointing to built .js files
const manifestRaw = readFileSync(join(rootDir, "manifest.json"), "utf-8");
const manifest = JSON.parse(manifestRaw);

manifest.background = {
  service_worker: "service-worker.js",
  type: "module",
};
manifest.content_scripts = [
  {
    matches: manifest.content_scripts?.[0]?.matches || [
      "https://aistudio.google.com/*",
      "https://*.aistudio.google.com/*",
      "*://aistudio.google.com/*",
    ],
    js: ["content-script.js"],
    run_at: "document_idle",
  },
];
manifest.action = {
  default_title: "SPAA Worker Status",
  default_popup: "popup/popup.html",
};

writeFileSync(join(distDir, "manifest.json"), JSON.stringify(manifest, null, 2));

// 3. Copy popup HTML
const popupDistDir = join(distDir, "popup");
if (!existsSync(popupDistDir)) {
  mkdirSync(popupDistDir, { recursive: true });
}
cpSync(join(rootDir, "src/popup/popup.html"), join(popupDistDir, "popup.html"));

console.log("Extension dist/ successfully built and ready to load unpacked in Chrome!");
