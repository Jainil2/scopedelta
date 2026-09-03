#!/usr/bin/env node
// Visual + overflow verification harness for the UI redesign.
//
// Attaches to a Chrome already running with --remote-debugging-port, then for
// every route x width x colour scheme: emulates the viewport and the
// prefers-color-scheme media feature, navigates, screenshots, and reruns the
// same horizontal-overflow assertion the Playwright suite makes at 390px
// (no element's right edge may exceed the viewport).
//
//   node scripts/ui-shots.mjs --port 9223 --base https://scopedelta.netlify.app \
//     --out output/ui-review --routes /app/nova-demo-studio-63594cb2,/sign-in
//
// Emulation overrides are always cleared on exit so the attached window is
// left exactly as it was found.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
}
const port = Number(args.get("port") || 9223);
const base = (args.get("base") || "http://localhost:3000").replace(/\/$/, "");
const outDir = args.get("out") || "output/ui-review";
const schemes = (args.get("schemes") || "light,dark").split(",");
const widths = (args.get("widths") || "1440,900,390")
  .split(",")
  .map((value) => Number(value));
const routes = (args.get("routes") || "/").split(",");
const settleMs = Number(args.get("settle") || 1400);

mkdirSync(outDir, { recursive: true });

const socketUrl = await fetch(`http://127.0.0.1:${port}/json/list`)
  .then((response) => response.json())
  .then((list) => {
    const page = list.find(
      (item) => item.type === "page" && !item.url.startsWith("devtools://"),
    );
    if (!page) throw new Error("no page target");
    return page.webSocketDebuggerUrl;
  });

const socket = new WebSocket(socketUrl);
const pending = new Map();
let nextId = 1;
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(message.error.message));
  else waiter.resolve(message.result);
});
await new Promise((resolve, reject) => {
  socket.addEventListener("open", () => resolve());
  socket.addEventListener("error", () => reject(new Error("cdp open failed")));
});

function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`${method} timed out`));
    }, 45_000);
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The Playwright suite's assertion, reused verbatim in spirit. */
const OVERFLOW_PROBE = `(() => {
  const limit = window.innerWidth + 0.5;
  const offenders = [];
  for (const element of document.querySelectorAll("body *")) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    if (rect.right > limit) {
      offenders.push({
        tag: element.tagName.toLowerCase(),
        className: typeof element.className === "string" ? element.className : "",
        right: Math.round(rect.right),
      });
    }
  }
  const seen = new Set();
  const unique = offenders.filter((item) => {
    const key = item.tag + "." + item.className;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return JSON.stringify({ limit, count: offenders.length, offenders: unique.slice(0, 12) });
})()`;

await send("Page.enable");
await send("Runtime.enable");

const report = [];
try {
  for (const scheme of schemes) {
    await send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: scheme }],
    });
    for (const width of widths) {
      await send("Emulation.setDeviceMetricsOverride", {
        width,
        height: width < 500 ? 844 : 1000,
        deviceScaleFactor: 1,
        mobile: width < 500,
      });
      for (const route of routes) {
        const url = `${base}${route}`;
        await send("Page.navigate", { url });
        await wait(settleMs);
        const probe = await send("Runtime.evaluate", {
          expression: OVERFLOW_PROBE,
          returnByValue: true,
        });
        const overflow = JSON.parse(probe.result.value);
        const slug =
          route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root";
        const name = `${slug}__${width}__${scheme}.png`;
        const shot = await send("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: true,
        });
        writeFileSync(join(outDir, name), Buffer.from(shot.data, "base64"));
        const row = {
          route,
          width,
          scheme,
          file: name,
          overflowCount: overflow.count,
          offenders: overflow.offenders,
        };
        report.push(row);
        const flag = overflow.count ? `OVERFLOW x${overflow.count}` : "ok";
        console.log(
          `${String(width).padStart(4)}px ${scheme.padEnd(5)} ${route.padEnd(42)} ${flag}`,
        );
        if (overflow.count) {
          for (const offender of overflow.offenders) {
            console.log(
              `        ${offender.tag}.${offender.className} right=${offender.right}`,
            );
          }
        }
      }
    }
  }
} finally {
  await send("Emulation.clearDeviceMetricsOverride").catch(() => {});
  await send("Emulation.setEmulatedMedia", { features: [] }).catch(() => {});
  writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 1));
  socket.close();
}

const failures = report.filter((row) => row.overflowCount > 0);
console.log(
  `\n${report.length} captures -> ${outDir}; ${failures.length} with horizontal overflow`,
);
process.exit(failures.length ? 1 : 0);
