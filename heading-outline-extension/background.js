/**
 * Background: fetches accessibility tree via CDP, toggles overlay via content script.
 */

const ICON_PATHS = {
  on: { 16: "icons/on-16.png", 32: "icons/on-32.png", 48: "icons/on-48.png" },
  off: { 16: "icons/off-16.png", 32: "icons/off-32.png", 48: "icons/off-48.png" },
};

function updateActionState(enabled) {
  chrome.action.setTitle({
    title: enabled
      ? "Heading Outline: On (click to turn off)"
      : "Heading Outline: Off (click to turn on)",
  });
  chrome.action.setIcon({
    path: enabled ? ICON_PATHS.on : ICON_PATHS.off,
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

chrome.action.onClicked.addListener(async () => {
  const { enabled = false } = await chrome.storage.sync.get("enabled");
  const next = !enabled;
  await chrome.storage.sync.set({ enabled: next });
  updateActionState(next);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (next) {
    // Show panel immediately with DOM-only headings, then refine with AX tree
    chrome.tabs.sendMessage(tab.id, { action: "runDOM" }).catch(() => {});
    try {
      const nodes = await fetchAccessibilityTree(tab.id);
      chrome.tabs.sendMessage(tab.id, { action: "run", axTree: nodes });
    } catch (e) {
      updateActionState(false);
      await chrome.storage.sync.set({ enabled: false });
      chrome.tabs.sendMessage(tab.id, { action: "error", message: e?.message || String(e) });
    }
  } else {
    chrome.tabs.sendMessage(tab.id, { action: "hide" }).catch(() => {});
  }
});

chrome.storage.sync.get("enabled", ({ enabled = false }) => {
  updateActionState(enabled);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes.enabled) {
    updateActionState(changes.enabled.newValue);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.action !== "string") return;
  if (msg.action === "syncIcon") {
    chrome.storage.sync.get("enabled", ({ enabled = false }) => {
      updateActionState(enabled);
      sendResponse();
    });
    return true;
  }
  if (msg.action === "requestTree") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "No tab" });
      return;
    }
    fetchAccessibilityTree(tabId)
      .then((nodes) => {
        chrome.tabs.sendMessage(tabId, { action: "run", axTree: nodes });
        sendResponse({ ok: true });
      })
      .catch((e) => {
        chrome.tabs.sendMessage(tabId, { action: "error", message: e?.message || String(e) }).catch(() => {});
        sendResponse({ ok: false, error: e?.message });
      });
    return true; // async
  }
  if (msg.action === "refreshTree") {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => {
      if (t?.id) {
        fetchAccessibilityTree(t.id)
          .then((nodes) => sendResponse({ ok: true, nodes }))
          .catch((e) => sendResponse({ ok: false, error: e?.message || String(e) }));
      } else {
        sendResponse({ ok: false, error: "No active tab" });
      }
    });
    return true;
  }
});
