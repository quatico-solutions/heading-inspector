/**
 * Background service worker.
 *
 * Permission model: activeTab + scripting + debugger. The content script is
 * injected on demand via chrome.scripting.executeScript when the user clicks
 * the toolbar icon — no host_permissions, no broad content_scripts manifest
 * entry. Each toolbar click is a user gesture that grants activeTab access
 * to the current tab for the duration of this operation.
 *
 * The toggle state is derived from the DOM (probe for the panel container
 * element) rather than persisted in chrome.storage, so the extension needs
 * no storage permission and survives service-worker restarts cleanly.
 */

const CONTAINER_ID = "a11y-heading-outline";

const ICON_PATHS = {
  on: { 16: "icons/on-16.png", 32: "icons/on-32.png", 48: "icons/on-48.png" },
  off: { 16: "icons/off-16.png", 32: "icons/off-32.png", 48: "icons/off-48.png" },
};

function setTabIcon(tabId, enabled) {
  chrome.action.setIcon({ tabId, path: enabled ? ICON_PATHS.on : ICON_PATHS.off });
  chrome.action.setTitle({
    tabId,
    title: enabled
      ? "Heading Inspector: On (click to turn off)"
      : "Heading Inspector: Off (click to turn on)",
  });
}

async function fetchAccessibilityTree(tabId) {
  const debuggee = { tabId };
  try {
    await chrome.debugger.attach(debuggee, "1.3");
  } catch (e) {
    throw new Error("Could not attach debugger. Close DevTools if open and retry.");
  }
  try {
    await chrome.debugger.sendCommand(debuggee, "Accessibility.enable");
    const result = await chrome.debugger.sendCommand(debuggee, "Accessibility.getFullAXTree");
    await chrome.debugger.sendCommand(debuggee, "Accessibility.disable");
    const nodes = Array.isArray(result) ? result : result?.nodes ?? [];
    return nodes;
  } finally {
    try {
      await chrome.debugger.detach(debuggee);
    } catch (_) {}
  }
}

async function injectContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
}

async function isPanelOpen(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (id) => !!document.getElementById(id),
      args: [CONTAINER_ID],
    });
    return !!result;
  } catch {
    return false;
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  const tabId = tab?.id;
  if (!tabId) return;

  // chrome:// URLs, the Web Store, view-source:, and a few other origins
  // cannot be scripted. Inject first so subsequent calls have the listener.
  try {
    await injectContentScript(tabId);
  } catch (_) {
    // Page is not scriptable; silently abort.
    return;
  }

  if (await isPanelOpen(tabId)) {
    chrome.tabs.sendMessage(tabId, { action: "hide" }).catch(() => {});
    setTabIcon(tabId, false);
    return;
  }

  setTabIcon(tabId, true);
  chrome.tabs.sendMessage(tabId, { action: "runDOM" }).catch(() => {});

  try {
    const nodes = await fetchAccessibilityTree(tabId);
    chrome.tabs.sendMessage(tabId, { action: "run", axTree: nodes }).catch(() => {});
  } catch (e) {
    setTabIcon(tabId, false);
    chrome.tabs
      .sendMessage(tabId, { action: "error", message: e?.message || String(e) })
      .catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || typeof msg.action !== "string") return;
  if (msg.action === "panelHidden") {
    const tabId = sender.tab?.id;
    if (tabId) setTabIcon(tabId, false);
  }
});
