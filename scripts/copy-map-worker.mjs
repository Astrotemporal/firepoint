// MapLibre 6's module worker needs a stable same-origin URL under Next/Turbopack.
// Copy the package's licensed worker and its relative shared-module dependency.
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dist = dirname(fileURLToPath(import.meta.resolve("maplibre-gl")));
const target = resolve("public/vendor/maplibre");
await mkdir(target, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  await copyFile(join(dist, file), join(target, file));
}
await copyFile(join(dist, "..", "LICENSE.txt"), join(target, "LICENSE.txt"));
console.log("Copied MapLibre worker modules from the installed package");
