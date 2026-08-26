import { invoke } from "@tauri-apps/api/core";

import "./styles.css";

type LocalSettings = {
  cloudOrigin: string | null;
  selectedOrigin: string | null;
  notificationsEnabled: boolean;
  pendingDeepLink: { server: string; path: string } | null;
  updaterEnabled: boolean;
};

const form = document.querySelector<HTMLFormElement>("#server-form")!;
const input = document.querySelector<HTMLInputElement>("#origin")!;
const status = document.querySelector<HTMLElement>("#status")!;
const preferences = document.querySelector<HTMLElement>("#preferences")!;
const notifications =
  document.querySelector<HTMLInputElement>("#notifications")!;
const pending = document.querySelector<HTMLElement>("#pending-link")!;
const pendingCopy = document.querySelector<HTMLElement>("#pending-copy")!;
const confirmSwitch =
  document.querySelector<HTMLButtonElement>("#confirm-switch")!;
const updates = document.querySelector<HTMLElement>("#updates")!;
const checkUpdate = document.querySelector<HTMLButtonElement>("#check-update")!;

let settings: LocalSettings;

function nativeAvailable() {
  return (
    typeof (
      globalThis as typeof globalThis & {
        __TAURI_INTERNALS__?: { invoke?: unknown };
      }
    ).__TAURI_INTERNALS__?.invoke === "function"
  );
}

function setBusy(busy: boolean, message = "") {
  form.setAttribute("aria-busy", String(busy));
  input.disabled = busy;
  form.querySelector<HTMLButtonElement>("button")!.disabled = busy;
  confirmSwitch.disabled = busy;
  status.textContent = message;
  status.dataset.state = busy ? "busy" : "";
}

function messageFrom(error: unknown) {
  const value = String(error);
  return value.includes(": ") ? value.split(": ").slice(1).join(": ") : value;
}

async function connect(origin: string, path?: string) {
  if (!nativeAvailable()) {
    status.textContent =
      "Server verification is available in the native desktop shell.";
    return;
  }
  setBusy(true, "Verifying the deployment…");
  try {
    await invoke("select_server", { origin, path: path ?? null });
    setBusy(false, "Connected. Opening ScopeDelta…");
  } catch (error) {
    setBusy(false, messageFrom(error));
    status.dataset.state = "error";
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const nextOrigin = input.value.trim().replace(/\/$/, "");
  if (
    settings.selectedOrigin &&
    settings.selectedOrigin !== nextOrigin &&
    !window.confirm(
      "Switch ScopeDelta servers? This clears cookies and browsing data for the current deployment, then asks you to sign in again.",
    )
  ) {
    return;
  }
  void connect(nextOrigin);
});

notifications.addEventListener("change", async () => {
  notifications.disabled = true;
  try {
    const result = await invoke<{ enabled: boolean; permission: string }>(
      "set_notifications_enabled",
      { enabled: notifications.checked },
    );
    notifications.checked = result.enabled;
    status.textContent =
      result.permission === "denied"
        ? "Notifications are blocked by system settings. ScopeDelta will keep working normally."
        : result.enabled
          ? "Desktop notifications enabled."
          : "Desktop notifications disabled.";
  } catch (error) {
    notifications.checked = !notifications.checked;
    status.textContent = messageFrom(error);
    status.dataset.state = "error";
  } finally {
    notifications.disabled = false;
  }
});

confirmSwitch.addEventListener("click", () => {
  if (settings.pendingDeepLink) {
    void connect(
      settings.pendingDeepLink.server,
      settings.pendingDeepLink.path,
    );
  }
});

checkUpdate.addEventListener("click", async () => {
  checkUpdate.disabled = true;
  status.textContent = "Checking the signed release channel…";
  try {
    const version = await invoke<string | null>("check_for_update");
    status.textContent = version
      ? `ScopeDelta ${version} was verified and installed. Restart the app to finish.`
      : "ScopeDelta is up to date.";
  } catch (error) {
    status.textContent = messageFrom(error);
    status.dataset.state = "error";
  } finally {
    checkUpdate.disabled = false;
  }
});

async function initialize() {
  if (!nativeAvailable()) {
    const previewPreferences = new URLSearchParams(location.search).has(
      "preferences",
    );
    settings = {
      cloudOrigin: "https://app.scopedelta.com",
      selectedOrigin: previewPreferences ? "https://app.scopedelta.com" : null,
      notificationsEnabled: false,
      pendingDeepLink: null,
      updaterEnabled: false,
    };
    input.value = settings.selectedOrigin ?? settings.cloudOrigin ?? "";
    preferences.hidden = !settings.selectedOrigin;
    input.focus();
    return;
  }
  try {
    settings = await invoke<LocalSettings>("local_settings");
    input.value = settings.selectedOrigin ?? settings.cloudOrigin ?? "";
    notifications.checked = settings.notificationsEnabled;
    preferences.hidden = !settings.selectedOrigin;
    updates.hidden = !settings.updaterEnabled;
    if (settings.pendingDeepLink) {
      pending.hidden = false;
      pendingCopy.textContent = `This link points to ${settings.pendingDeepLink.server}. Switching signs you out of the current deployment on this device.`;
    }
    input.focus();
  } catch (error) {
    status.textContent = messageFrom(error);
    status.dataset.state = "error";
  }
}

void initialize();
