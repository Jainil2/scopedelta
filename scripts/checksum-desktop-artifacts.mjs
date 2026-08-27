import { createHash } from "node:crypto";
import {
  createReadStream,
  realpathSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative, resolve } from "node:path";

const targetRoot = realpathSync(resolve("src-tauri/target"));

function bundleDirectories(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return [];
    const path = join(directory, entry.name);
    return entry.name === "bundle" && basename(directory) === "release"
      ? [path]
      : bundleDirectories(path);
  });
}

const bundles = bundleDirectories(targetRoot);
if (bundles.length !== 1) {
  throw new Error(
    `Expected one desktop bundle directory, found ${bundles.length}.`,
  );
}
const root = bundles[0];
const output = join(root, "SHA256SUMS");

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return files(path);
    return entry.isFile() ? [path] : [];
  });
}

const artifacts = files(root)
  .filter((path) => basename(path) !== basename(output))
  .toSorted((left, right) =>
    relative(root, left).localeCompare(relative(root, right)),
  );
const lines = [];
for (const artifact of artifacts) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(artifact)) hash.update(chunk);
  lines.push(`${hash.digest("hex")}  ${relative(root, artifact)}`);
}
writeFileSync(output, `${lines.join("\n")}\n`);
console.log(`Wrote ${lines.length} checksums to ${output}.`);
