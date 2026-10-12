import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { generateSW } from "workbox-build";

const distDirectory = "dist";
const precacheFiles = new Set(["index.html"]);

function addReference(fromFile, reference) {
  if (/^(?:data:|https?:|\/)/i.test(reference)) return;
  const pathWithoutQuery = reference.split(/[?#]/, 1)[0];
  precacheFiles.add(
    path.posix.normalize(
      path.posix.join(path.posix.dirname(fromFile), pathWithoutQuery),
    ),
  );
}

const html = await readFile(path.join(distDirectory, "index.html"), "utf8");
for (const [, reference] of html.matchAll(/\b(?:href|src)=["']?([^"'\s>]+)/g)) {
  addReference("index.html", reference);
}

for (const file of [...precacheFiles].filter((name) => name.endsWith(".css"))) {
  const css = await readFile(path.join(distDirectory, file), "utf8");
  for (const [, reference] of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
    addReference(file, reference);
  }
}

for (const file of [...precacheFiles].filter((name) =>
  name.endsWith(".webmanifest"),
)) {
  const manifest = JSON.parse(
    await readFile(path.join(distDirectory, file), "utf8"),
  );
  manifest.icons?.forEach(({ src }) => addReference(file, src));
}

const additionalManifestEntries = await Promise.all(
  [...precacheFiles].map(async (url) => {
    const contents = await readFile(path.join(distDirectory, url));
    const revision = createHash("sha1").update(contents).digest("hex");
    return { url, revision };
  }),
);

const { count, size, warnings } = await generateSW({
  globDirectory: distDirectory,
  globPatterns: [],
  additionalManifestEntries,
  swDest: "dist/sw.js",
  clientsClaim: true,
  skipWaiting: true,
  navigateFallback: "index.html",
});

warnings.forEach((warning) => console.warn(warning));
console.log(`Generated service worker for ${count} files (${size} bytes).`);
