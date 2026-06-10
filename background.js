/**
 * Background service worker.
 *
 * Permission model: activeTab + scripting + debugger + storage. The content
 * script is injected on demand via chrome.scripting.executeScript when the
 * user clicks the toolbar icon — no host_permissions, no broad content_scripts
 * manifest entry. Each toolbar click is a user gesture that grants activeTab
 * access to the current tab.
 *
 * Persist-across-navigation (issue #2): activeTab access survives same-origin
 * navigation (https://example.com → https://example.com/foo) and is revoked
 * only on a cross-origin navigation. So once the panel is opened on a tab we
 * remember that tab as "following" and re-inject + re-render on every
 * full-document load (chrome.tabs.onUpdated → "complete"). Re-injection uses
 * the still-valid activeTab grant; no new gesture, no host_permissions. A
 * cross-origin navigation revokes activeTab, executeScript throws, and we stop
 * following — so following is naturally scoped to the original origin per tab.
 *
 * The following set lives in chrome.storage.session (cleared on browser
 * restart, never synced, background-only) so it survives service-worker
 * teardown. Same-document (SPA) navigation is handled inside content.js, which
 * stays alive across pushState/replaceState/popstate and asks the background
 * for a fresh AX tree via the "requestTree" message.
 */

const CONTAINER_ID = "a11y-heading-outline";
const FOLLOW_KEY = "followingTabs";

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

// --- Following-set (which tabs re-open the panel after navigation) ----------

async function getFollowingMap() {
  const stored = await chrome.storage.session.get(FOLLOW_KEY);
  const map = stored[FOLLOW_KEY];
  return map && typeof map === "object" ? map : {};
}

async function setFollowing(tabId, on) {
  const map = await getFollowingMap();
  if (on) map[tabId] = true;
  else delete map[tabId];
  await chrome.storage.session.set({ [FOLLOW_KEY]: map });
}

async function isFollowing(tabId) {
  const map = await getFollowingMap();
  return !!map[tabId];
}

// --- AX tree + injection ----------------------------------------------------

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

// Tabs with an AX-tree read in flight. chrome.debugger allows only one
// attachment per tab, so overlapping reads (e.g. tabs.onUpdated firing
// "complete" twice for one load, or a navigation landing mid-refresh) would
// make the second attach throw. This guard drops the overlapping read instead.
const rendering = new Set();

// Render the panel on a tab: loading state first (DOM headings), then the full
// AX tree once the debugger has read it. Returns false if a read was already in
// flight (no-op); throws if the AX tree read itself fails.
async function renderPanel(tabId) {
  if (rendering.has(tabId)) return false;
  rendering.add(tabId);
  try {
    setTabIcon(tabId, true);
    chrome.tabs.sendMessage(tabId, { action: "runDOM" }).catch(() => {});
    const nodes = await fetchAccessibilityTree(tabId);
    chrome.tabs.sendMessage(tabId, { action: "run", axTree: nodes }).catch(() => {});
    return true;
  } finally {
    rendering.delete(tabId);
  }
}

async function stopFollowing(tabId) {
  await setFollowing(tabId, false);
  setTabIcon(tabId, false);
}

// --- Toolbar click ----------------------------------------------------------

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
    await stopFollowing(tabId);
    return;
  }

  await setFollowing(tabId, true);
  try {
    await renderPanel(tabId);
  } catch (e) {
    await stopFollowing(tabId);
    chrome.tabs
      .sendMessage(tabId, { action: "error", message: e?.message || String(e) })
      .catch(() => {});
  }
});

// --- Persist across full-document navigation --------------------------------

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== "complete") return;
  if (!(await isFollowing(tabId))) return;

  // If a live panel already exists, the content script survived this update —
  // i.e. it was a same-document (SPA) change, which content.js refreshes on its
  // own. Re-injecting here would race that refresh, so do nothing.
  if (await isPanelOpen(tabId)) return;

  // The document was replaced (full navigation). activeTab still covers this tab
  // iff the new document is same-origin as the one we were granted access to.
  // Same-origin → executeScript succeeds and we re-open. Cross-origin → activeTab
  // is revoked, executeScript throws, and we stop following (the panel does not
  // reopen on the new origin).
  try {
    await injectContentScript(tabId);
  } catch (_) {
    await stopFollowing(tabId);
    return;
  }

  try {
    await renderPanel(tabId);
  } catch (e) {
    await stopFollowing(tabId);
    chrome.tabs
      .sendMessage(tabId, { action: "error", message: e?.message || String(e) })
      .catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  setFollowing(tabId, false);
});

// --- Messages from content.js ----------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || typeof msg.action !== "string") return;

  const tabId = sender.tab?.id;

  // Close button: hide + stop following this tab.
  if (msg.action === "panelHidden") {
    if (tabId) stopFollowing(tabId);
    return;
  }

  // Same-document (SPA) navigation detected in content.js: re-read the AX tree
  // for the live document and push it back. The content script is still alive,
  // so no re-injection is needed. Skip if a read is already in flight for this
  // tab (chrome.debugger allows only one attachment per tab).
  if (msg.action === "requestTree") {
    if (!tabId || rendering.has(tabId)) return;
    rendering.add(tabId);
    fetchAccessibilityTree(tabId)
      .then((nodes) =>
        chrome.tabs.sendMessage(tabId, { action: "run", axTree: nodes }).catch(() => {})
      )
      .catch((e) =>
        chrome.tabs
          .sendMessage(tabId, { action: "error", message: e?.message || String(e) })
          .catch(() => {})
      )
      .finally(() => rendering.delete(tabId));
  }
});
