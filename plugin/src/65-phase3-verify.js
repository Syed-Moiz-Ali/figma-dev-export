function verificationSlug(value, fallback) {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function createVerificationHarness(screenRecords, files, generatedAt) {
  const screens = [];
  const outputFiles = [];

  for (const record of screenRecords) {
    const root = record.design.nodes && record.design.nodes[0];
    const slug = verificationSlug(record.name, `screen-${record.index}`);
    const expectedName = `${String(record.index).padStart(2, "0")}_${slug}.png`;
    const expectedPath = `verify/expected/${expectedName}`;
    const previewFile = record.preview
      ? files.find((file) => file.fileName === record.preview)
      : null;
    const expected1xName = `${String(record.index).padStart(2, "0")}_${slug}.png`;
    const expected1xPath = `verify/expected1x/${expected1xName}`;
    const preview1xFile = record.preview1x
      ? files.find((file) => file.fileName === record.preview1x)
      : null;

    if (previewFile) {
      outputFiles.push({
        fileName: expectedPath,
        mime: "image/png",
        bytes: previewFile.bytes
      });
    }
    if (preview1xFile) {
      outputFiles.push({
        fileName: expected1xPath,
        mime: "image/png",
        bytes: preview1xFile.bytes
      });
    }

    screens.push({
      index: record.index,
      name: record.name,
      slug,
      route: `/${slug}`,
      width: root && typeof root.width === "number" ? root.width : 0,
      height: root && typeof root.height === "number" ? root.height : 0,
      json: record.designPath,
      expected: previewFile ? expectedPath : null,
      expected1x: preview1xFile ? expected1xPath : null,
      actual: `verify/actual/${expectedName}`,
      diff: `verify/diff/${expectedName}`
    });
  }

  const manifest = {
    schema: "dev-export-verification",
    schemaVersion: "1.0.0",
    generatedAt,
    note: "Render each route at the screen size @2x, then run npm run verify. Set BASE_URL for your dev server.",
    threshold: 0.02,
    screens
  };

  outputFiles.push({
    fileName: "verify/expected/manifest.json",
    mime: "application/json",
    bytes: utf8Encode(JSON.stringify(manifest, null, 2))
  });

  outputFiles.push({
    fileName: "verify/package.json",
    mime: "application/json",
    bytes: utf8Encode(JSON.stringify({
      name: "dev-export-verify",
      private: true,
      type: "module",
      scripts: {
        verify: "node compare.mjs"
      },
      devDependencies: {
        playwright: "^1.49.0",
        pixelmatch: "^5.3.0",
        pngjs: "^7.0.0"
      }
    }, null, 2))
  });

  outputFiles.push({
    fileName: "verify/playwright.config.js",
    mime: "text/javascript",
    bytes: utf8Encode([
      "/** Playwright config used by compare.mjs if you extend it. */",
      "export default {",
      "  timeout: 60000,",
      "  use: {",
      "    deviceScaleFactor: 2,",
      "    headless: true",
      "  }",
      "};",
      ""
    ].join("\n"))
  });

  outputFiles.push({
    fileName: "verify/compare.mjs",
    mime: "text/javascript",
    bytes: utf8Encode([
      "import fs from 'node:fs';",
      "import path from 'node:path';",
      "import { fileURLToPath } from 'node:url';",
      "import { chromium } from 'playwright';",
      "import pixelmatch from 'pixelmatch';",
      "import { PNG } from 'pngjs';",
      "",
      "const root = path.dirname(fileURLToPath(import.meta.url));",
      "const manifest = JSON.parse(fs.readFileSync(path.join(root, 'expected', 'manifest.json'), 'utf8'));",
      "const baseUrl = process.env.BASE_URL || 'http://localhost:5173';",
      "const routePrefix = process.env.ROUTE_PREFIX || '';",
      "const only = process.env.SCREEN || '';",
      "const threshold = Number(process.env.THRESHOLD || manifest.threshold || 0.02);",
      "",
      "fs.mkdirSync(path.join(root, 'actual'), { recursive: true });",
      "fs.mkdirSync(path.join(root, 'diff'), { recursive: true });",
      "",
      "function readPng(file) {",
      "  return PNG.sync.read(fs.readFileSync(file));",
      "}",
      "",
      "function comparePng(expectedFile, actualFile, diffFile) {",
      "  const expected = readPng(expectedFile);",
      "  const actual = readPng(actualFile);",
      "  if (expected.width !== actual.width || expected.height !== actual.height) {",
      "    return { ok: false, reason: 'size-mismatch', expected: [expected.width, expected.height], actual: [actual.width, actual.height] };",
      "  }",
      "  const diff = new PNG({ width: expected.width, height: expected.height });",
      "  const mismatched = pixelmatch(expected.data, actual.data, diff.data, expected.width, expected.height, { threshold: 0.1 });",
      "  fs.writeFileSync(diffFile, PNG.sync.write(diff));",
      "  const ratio = mismatched / (expected.width * expected.height);",
      "  return { ok: ratio <= threshold, mismatched, ratio: Number(ratio.toFixed(5)), expected: [expected.width, expected.height] };",
      "}",
      "",
      "const browser = await chromium.launch({ headless: true });",
      "const report = { generatedAt: new Date().toISOString(), baseUrl, threshold, screens: [] };",
      "let failures = 0;",
      "",
      "for (const screen of manifest.screens) {",
      "  if (only && screen.slug !== only) continue;",
      "  if (!screen.expected) {",
      "    report.screens.push({ index: screen.index, name: screen.name, status: 'skipped', reason: 'no expected preview' });",
      "    continue;",
      "  }",
      "  const url = baseUrl + routePrefix + screen.route;",
      "  const page = await browser.newPage({ viewport: { width: screen.width, height: screen.height }, deviceScaleFactor: 2 });",
      "  try {",
      "    await page.goto(url, { waitUntil: 'networkidle' });",
      "    const actualFile = path.join(root, 'actual', path.basename(screen.expected));",
      "    await page.screenshot({ path: actualFile, fullPage: false });",
      "    const diffFile = path.join(root, 'diff', path.basename(screen.expected));",
      "    const result = comparePng(path.join(root, 'expected', path.basename(screen.expected)), actualFile, diffFile);",
      "    if (!result.ok) failures += 1;",
      "    report.screens.push({ index: screen.index, name: screen.name, url, status: result.ok ? 'pass' : 'fail', ...result });",
      "    console.log(`${result.ok ? 'PASS' : 'FAIL'} ${screen.index}. ${screen.name} (${(result.ratio * 100 || 0).toFixed(2)}% pixels, ${result.reason || 'pixel-diff'})`);",
      "  } catch (error) {",
      "    failures += 1;",
      "    report.screens.push({ index: screen.index, name: screen.name, url, status: 'error', error: String(error && error.message ? error.message : error) });",
      "    console.error(`ERROR ${screen.index}. ${screen.name}:`, error && error.message ? error.message : error);",
      "  } finally {",
      "    await page.close();",
      "  }",
      "}",
      "",
      "await browser.close();",
      "fs.writeFileSync(path.join(root, 'report.json'), JSON.stringify(report, null, 2));",
      "console.log(`Report: ${path.join(root, 'report.json')}`);",
      "if (failures > 0) process.exit(1);",
      ""
    ].join("\n"))
  });

  outputFiles.push({
    fileName: "verify/README.md",
    mime: "text/markdown",
    bytes: utf8Encode([
      "# Visual Verification",
      "",
      "This folder contains the expected @2x screen previews and a Playwright comparator.",
      "",
      "## Run",
      "",
      "```bash",
      "cd verify",
      "npm install",
      "BASE_URL=http://localhost:5173 npm run verify",
      "```",
      "",
      "- `BASE_URL` points at your running app.",
      "- Each screen is loaded from `route` in `expected/manifest.json` (`/{slug}` by default).",
      "- `ROUTE_PREFIX` is optional if your app is mounted under a subpath.",
      "- `SCREEN=home npm run verify` checks one screen.",
      "- `THRESHOLD=0.01 npm run verify` tightens the diff threshold.",
      "",
      "Outputs:",
      "",
      "- `actual/` — new screenshots",
      "- `diff/` — pixel diff images",
      "- `report.json` — pass/fail and pixel ratios",
      "",
      "For HTML/CSS, you can use `BASE_URL=file:///absolute/path/to/html-css` and a route like `/{file}` after editing the manifest.",
      "",
      "For Flutter, use the expected previews as golden reference images in a Flutter golden test; the Playwright script targets web builds.",
      ""
    ].join("\n"))
  });

  return { manifest, files: outputFiles };
}
