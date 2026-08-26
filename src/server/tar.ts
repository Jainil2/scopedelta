import { gzipSync } from "node:zlib";

export type TarEntry = { name: string; content: Buffer };

function writeOctal(
  target: Buffer,
  offset: number,
  length: number,
  value: number,
) {
  const encoded = Math.max(0, value)
    .toString(8)
    .padStart(length - 1, "0")
    .slice(-(length - 1));
  target.write(encoded, offset, length - 1, "ascii");
  target[offset + length - 1] = 0;
}

function header(entry: TarEntry) {
  const name = Buffer.from(entry.name, "utf8");
  if (
    name.length > 100 ||
    entry.name.startsWith("/") ||
    entry.name.includes("..")
  ) {
    throw new Error("export_entry_name_invalid");
  }
  const result = Buffer.alloc(512);
  name.copy(result, 0);
  writeOctal(result, 100, 8, 0o644);
  writeOctal(result, 108, 8, 0);
  writeOctal(result, 116, 8, 0);
  writeOctal(result, 124, 12, entry.content.length);
  writeOctal(result, 136, 12, 0);
  result.fill(0x20, 148, 156);
  result[156] = "0".charCodeAt(0);
  result.write("ustar\0", 257, 6, "ascii");
  result.write("00", 263, 2, "ascii");
  result.write("scopedelta", 265, 10, "ascii");
  result.write("scopedelta", 297, 10, "ascii");
  const checksum = result.reduce((total, byte) => total + byte, 0);
  const checksumText = checksum.toString(8).padStart(6, "0").slice(-6);
  result.write(checksumText, 148, 6, "ascii");
  result[154] = 0;
  result[155] = 0x20;
  return result;
}

export function createDeterministicTarGz(entries: TarEntry[]) {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    chunks.push(header(entry), entry.content);
    const padding = (512 - (entry.content.length % 512)) % 512;
    if (padding) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(chunks), { level: 9 });
}
