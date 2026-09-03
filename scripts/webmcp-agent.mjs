#!/usr/bin/env node
// Native WebMCP client for driving the ScopeDelta demo.
//
// Chrome 152 exposes an experimental `WebMCP` CDP domain (enable, invokeTool,
// cancelInvocation, toolsAdded/toolsRemoved/toolInvoked/toolResponded). This
// daemon attaches to one or two ordinary Chrome windows, mirrors the tools each
// page registers on `document.modelContext`, and invokes them the same way a
// browser agent would. No page code is injected and no tool is simulated.
//
//   node scripts/webmcp-agent.mjs launch team https://scopedelta.netlify.app
//   node scripts/webmcp-agent.mjs launch client https://scopedelta.netlify.app
//   node scripts/webmcp-agent.mjs serve
//
// then, from anywhere:
//   curl -s localhost:8765/status
//   curl -s 'localhost:8765/tools?win=team'
//   curl -s localhost:8765/call -d '{"win":"team","tool":"discover_workflows","input":{}}'

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// Keyed by role, not by screen side: the operator arranges the windows.
const WINDOWS = {
  team: { port: 9223, position: "0,0", size: "960,1080" },
  client: { port: 9222, position: "960,0", size: "960,1080" },
};
const FEATURES = "WebMCP,WebMCPTesting,DevToolsWebMCPSupport";
const HTTP_PORT = Number(process.env.WEBMCP_AGENT_PORT || 8765);
// Consequential tools wait on a real person reading a confirmation dialog, so
// the ceiling is generous and giving up never cancels a possibly-landed write.
const CALL_TIMEOUT_MS = Number(process.env.WEBMCP_CALL_TIMEOUT || 600_000);

function profileDir(win) {
  const dir = join(homedir(), ".scopedelta-demo", `profile-${win}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function launch(win, url) {
  const spec = WINDOWS[win];
  if (!spec) throw new Error(`unknown window ${win}`);
  const child = spawn(
    CHROME,
    [
      `--remote-debugging-port=${spec.port}`,
      `--user-data-dir=${profileDir(win)}`,
      `--enable-features=${FEATURES}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-search-engine-choice-screen",
      `--window-position=${spec.position}`,
      `--window-size=${spec.size}`,
      url || "about:blank",
    ],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  console.log(`window ${win} launching on port ${spec.port}`);
}

/** One attached Chrome window: a CDP socket plus its mirrored tool registry. */
class Window {
  constructor(name, port) {
    this.name = name;
    this.port = port;
    this.tools = new Map();
    this.pending = new Map();
    this.calls = new Map();
    this.nextId = 1;
    this.socket = undefined;
    this.target = undefined;
  }

  async attach() {
    const list = await fetch(`http://127.0.0.1:${this.port}/json/list`).then(
      (response) => response.json(),
    );
    const page = list.find(
      (item) => item.type === "page" && !item.url.startsWith("devtools://"),
    );
    if (!page) throw new Error(`window ${this.name}: no page target`);
    this.target = page;
    this.tools.clear();
    await new Promise((resolve, reject) => {
      const socket = new WebSocket(page.webSocketDebuggerUrl);
      socket.addEventListener("open", () => resolve());
      socket.addEventListener("error", () =>
        reject(new Error(`window ${this.name}: socket error`)),
      );
      socket.addEventListener("close", () => {
        if (this.socket === socket) this.socket = undefined;
      });
      socket.addEventListener("message", (event) =>
        this.receive(JSON.parse(event.data)),
      );
      this.socket = socket;
    });
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("WebMCP.enable");
    return this.describe();
  }

  receive(message) {
    if (message.id !== undefined) {
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
      return;
    }
    const { method, params } = message;
    if (method === "WebMCP.toolsAdded") {
      for (const tool of params.tools) this.tools.set(tool.name, tool);
    } else if (method === "WebMCP.toolsRemoved") {
      for (const tool of params.tools) this.tools.delete(tool.name);
    } else if (method === "WebMCP.toolResponded") {
      const waiter = this.calls.get(params.invocationId);
      if (waiter) {
        this.calls.delete(params.invocationId);
        waiter.resolve(params);
      }
    } else if (method === "Page.frameNavigated" && !params.frame.parentId) {
      // A new document re-registers from scratch; resync rather than guess.
      this.tools.clear();
      void this.resync();
    }
  }

  async resync() {
    try {
      await this.send("WebMCP.disable");
      await this.send("WebMCP.enable");
    } catch {
      // A closed socket is handled by the next attach.
    }
  }

  send(method, params = {}) {
    if (!this.socket || this.socket.readyState !== 1) {
      return Promise.reject(new Error(`window ${this.name}: not attached`));
    }
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method} timed out`));
      }, 30_000);
    });
  }

  async describe() {
    const { result } = await this.send("Runtime.evaluate", {
      expression:
        "JSON.stringify({url:location.href,title:document.title,native:!!(document.modelContext||navigator.modelContext)})",
      returnByValue: true,
    });
    return {
      window: this.name,
      ...JSON.parse(result.value),
      tools: [...this.tools.keys()],
    };
  }

  async call(toolName, input) {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        status: "NotRegistered",
        errorText: `${toolName} is not registered on this page. Registered: ${[...this.tools.keys()].join(", ")}`,
      };
    }
    const { invocationId } = await this.send("WebMCP.invokeTool", {
      frameId: tool.frameId,
      toolName,
      input: input ?? {},
    });
    return await new Promise((resolve) => {
      const timer = setTimeout(() => {
        // Never cancel here: the person may be mid-confirmation and the write
        // may already have committed. Report the uncertainty and verify state.
        if (this.calls.delete(invocationId)) {
          resolve({
            status: "OutcomeUnknown",
            invocationId,
            errorText:
              "No response within the wait window. The write may or may not have committed - read current state before retrying.",
          });
        }
      }, CALL_TIMEOUT_MS);
      this.calls.set(invocationId, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
      });
    });
  }

  async goto(url) {
    await this.send("Page.navigate", { url });
    return this.describe();
  }

  async screenshot(path) {
    const { data } = await this.send("Page.captureScreenshot", {
      format: "png",
    });
    writeFileSync(path, Buffer.from(data, "base64"));
    return { path };
  }
}

async function serve() {
  const windows = new Map();
  for (const [name, spec] of Object.entries(WINDOWS)) {
    const window = new Window(name, spec.port);
    try {
      const info = await window.attach();
      windows.set(name, window);
      console.log(`attached ${name}:`, JSON.stringify(info));
    } catch (error) {
      console.log(`window ${name} not attached: ${error.message}`);
    }
  }

  const pick = async (name) => {
    const window = windows.get(name || "team");
    if (!window) throw new Error(`window ${name} is not attached`);
    if (!window.socket || window.socket.readyState !== 1) await window.attach();
    return window;
  };

  const readBody = (request) =>
    new Promise((resolve) => {
      let body = "";
      request.on("data", (chunk) => (body += chunk));
      request.on("end", () => resolve(body ? JSON.parse(body) : {}));
    });

  createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const reply = (status, payload) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(payload, null, 1));
    };
    try {
      if (url.pathname === "/status") {
        const all = [];
        for (const [name, window] of windows) {
          try {
            all.push(await window.describe());
          } catch (error) {
            all.push({ window: name, error: error.message });
          }
        }
        return reply(200, all);
      }
      if (url.pathname === "/tools") {
        const window = await pick(url.searchParams.get("win"));
        const full = url.searchParams.get("full") === "1";
        return reply(
          200,
          [...window.tools.values()].map((tool) =>
            full
              ? tool
              : {
                  name: tool.name,
                  description: tool.description.slice(0, 160),
                },
          ),
        );
      }
      if (url.pathname === "/attach") {
        const name = url.searchParams.get("win") || "team";
        const window =
          windows.get(name) || new Window(name, WINDOWS[name].port);
        windows.set(name, window);
        return reply(200, await window.attach());
      }
      const body = await readBody(request);
      if (url.pathname === "/call") {
        const window = await pick(body.win);
        const started = Date.now();
        const result = await window.call(body.tool, body.input);
        return reply(200, { ms: Date.now() - started, ...result });
      }
      if (url.pathname === "/goto") {
        const window = await pick(body.win);
        return reply(200, await window.goto(body.url));
      }
      if (url.pathname === "/shot") {
        const window = await pick(body.win);
        return reply(200, await window.screenshot(body.path));
      }
      return reply(404, { error: "unknown path" });
    } catch (error) {
      return reply(500, { error: error.message });
    }
  }).listen(HTTP_PORT, "127.0.0.1", () =>
    console.log(`webmcp-agent listening on http://127.0.0.1:${HTTP_PORT}`),
  );
}

const [command, ...rest] = process.argv.slice(2);
if (command === "launch") launch(rest[0] || "team", rest[1]);
else if (command === "serve") await serve();
else {
  console.log("usage: webmcp-agent.mjs launch <team|client> [url] | serve");
  process.exit(1);
}
