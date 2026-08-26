import { createHash } from "node:crypto";
import {
  createReadStream,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "src-tauri/target/release/bundle");
const output = resolve(process.argv[3] ?? join(root, "SHA256SUMS"));

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

const artifacts = files(root).filter(
  (path) => statSync(path).isFile() && basename(path) !== basename(output),
);
const lines = [];
for (const artifact of artifacts) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(artifact)) hash.update(chunk);
  lines.push(`${hash.digest("hex")}  ${relative(root, artifact)}`);
}
writeFileSync(output, `${lines.sort().join("\n")}\n`);
console.log(`Wrote ${lines.length} checksums to ${output}.`);
