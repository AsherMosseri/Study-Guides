// Render each study sheet to a color PDF and a black-and-white PDF next to its page, so it prints the same everywhere.
// Browsers' own printing varies (Safari and Chrome split and scale pages differently); a PDF
// doesn't. Rerun after changing a sheet or its styles:
//
//   NODE_PATH=$(npm root -g) node tools/make-sheet-pdf.mjs
//
// It serves the repo root itself, renders with the print styles in style.css, and checks that
// the sheet comes out at exactly two Letter pages.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// require() honors NODE_PATH (a global Playwright install); import doesn't.
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHEETS = ["human-geo/quiz/reading-2.1-2.2/review/"];
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".ico": "image/x-icon", ".svg": "image/svg+xml", ".pdf": "application/pdf" };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((ok) => server.listen(0, ok));
const base = "http://localhost:" + server.address().port + "/";

// --no-proxy-server keeps a system proxy from intercepting the local server.
const browser = await chromium.launch({ args: ["--no-proxy-server"] });
try {
  for (const sheet of SHEETS) {
    const page = await browser.newPage({ colorScheme: "light" });
    await page.goto(base + sheet, { waitUntil: "load" });
    await page.emulateMedia({ media: "print" });
    // .print-bw switches the print styles to black on white (see style.css).
    for (const [file, bw] of [["study-sheet.pdf", false], ["study-sheet-bw.pdf", true]]) {
      await page.evaluate((on) => document.documentElement.classList.toggle("print-bw", on), bw);
      const out = path.join(ROOT, sheet, file);
      await page.pdf({ path: out, format: "Letter", printBackground: true, margin: { top: "0.35in", bottom: "0.35in", left: "0.35in", right: "0.35in" } });
      const pages = (fs.readFileSync(out, "latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
      if (pages !== 2) throw new Error(`${sheet}${file}: expected 2 pages, got ${pages}`);
      console.log("wrote", path.relative(ROOT, out), "(" + pages + " pages)");
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
