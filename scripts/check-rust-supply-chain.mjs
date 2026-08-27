import { readFileSync } from "node:fs";

const lockfile = readFileSync(
  new URL("../src-tauri/Cargo.lock", import.meta.url),
  "utf8",
);
const packages = Array.from(
  lockfile.matchAll(
    /\[\[package\]\]\s+name = "([^"]+)"\s+version = "([^"]+)"/g,
  ),
  ([, name, version]) => `${name}@${version}`,
);
const prohibited = new Set([
  "arrayref@0.3.10",
  "append-only-vec@0.1.9",
  "internment@0.8.7",
]);
const prohibitedNames = new Set([
  "proc-macro1",
  "proc-macro-en",
  "aovine",
  "arone",
  "aronenao",
  "tinymember",
]);
const findings = packages.filter((entry) => {
  const [name] = entry.split("@");
  return prohibited.has(entry) || prohibitedNames.has(name);
});

if (findings.length > 0) {
  console.error(
    `Prohibited Rust supply-chain packages: ${findings.join(", ")}`,
  );
  process.exit(1);
}

console.log(`Checked ${packages.length} locked Rust packages.`);
