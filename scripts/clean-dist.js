import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const distDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);

await rm(distDirectory, { force: true, recursive: true });
