/**
 * Heading Inspector - shows accessibility tree as screen readers see it.
 * Uses AX tree from CDP: hierarchy + heading levels (h1–h6) for sequence validation.
 * Click entry to scroll to heading and highlight.
 */

"use strict";

// Injected on demand via chrome.scripting.executeScript (activeTab + scripting
// permission model). Guard against re-execution: each toolbar click triggers
// a re-injection, which would otherwise redeclare top-level const/let.
(() => {
  if (window.__headingInspectorLoaded) return;
  window.__headingInspectorLoaded = true;

const CONTAINER_ID = "a11y-heading-outline";
const HIGHLIGHTER_ID = "a11y-heading-highlighter";

const CONTAINER_STYLE =
  "position:fixed;top:0;right:0;bottom:0;width:400px;max-width:90vw;box-shadow:-4px 0 20px rgba(0,0,0,0.15);z-index:1000001;background:#fff;overflow:hidden;display:flex;flex-direction:column;";
const HIGHLIGHTER_STYLE =
  "pointer-events:none;position:fixed;border:2px solid #0081BE;box-shadow:0 0 20px 2px rgba(0,84,150,0.5);opacity:0;z-index:2147483647;transition:opacity 200ms;background:rgba(0,129,190,0.08);";

function axValueToString(v) {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v.value === "string") return v.value;
  if (typeof v.value === "number") return String(v.value);
  return "";
}

function getAxRole(node) {
  return (node.role && axValueToString(node.role)) || "";
}

function getAxName(node) {
  return (node.name && axValueToString(node.name)) || "";
}

function getAxLevel(node) {
  if (!node.properties) return null;
  const prop = node.properties.find((p) => p.name === "level");
  if (!prop || !prop.value) return null;
  const v = prop.value.value;
  return typeof v === "number" ? v : parseInt(v, 10) || null;
}

function idKey(id) {
  return id == null ? "" : String(id);
}

function buildTree(nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) return null;
  const byId = new Map();
  const childIds = new Set();
  for (const n of nodes) {
    byId.set(idKey(n.nodeId), { ...n, children: [] });
    for (const cid of n.childIds || []) childIds.add(idKey(cid));
  }
  for (const n of nodes) {
    const entry = byId.get(idKey(n.nodeId));
    for (const cid of n.childIds || []) {
      const child = byId.get(idKey(cid));
      if (child) entry.children.push(child);
    }
  }
  const root = nodes.find((n) => !childIds.has(idKey(n.nodeId)));
  return root ? byId.get(idKey(root.nodeId)) : byId.get(idKey(nodes[0].nodeId));
}

function collectHeadingsInOrder(node, list) {
  if (!node) return;
  const role = getAxRole(node);
  if (role === "heading" && !node.ignored) {
    const level = getAxLevel(node) ?? 1;
    list.push({ level, name: getAxName(node) });
  }
  for (const c of node.children || []) {
    collectHeadingsInOrder(c, list);
  }
}

function isHeadingElement(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  if (el.getAttribute?.("role") === "presentation") return false;
  // tagName is always uppercase in HTML — no need for the i flag
  return /^H[1-6]$/.test(el.tagName) || el.getAttribute?.("role") === "heading";
}

function collectDOMHeadings(root, out) {
  if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
  if (root.id === CONTAINER_ID) return;
  if (root.tagName === "IFRAME") {
    try {
      const doc = root.contentDocument;
      if (doc?.body) collectDOMHeadings(doc.body, out);
    } catch (_) {}
    return;
  }
  if (root.tagName === "SLOT") {
    for (const n of root.assignedNodes({ flatten: true })) {
      if (n.nodeType === Node.ELEMENT_NODE) collectDOMHeadings(n, out);
    }
    return;
  }
  if (isHeadingElement(root)) out.push(root);
  if (root.shadowRoot) {
    for (const c of root.shadowRoot.children) {
      collectDOMHeadings(c, out);
    }
  } else {
    for (const c of root.children) {
      collectDOMHeadings(c, out);
    }
  }
}

function findSequenceErrors(headings) {
  const errors = new Set();
  let prev = 0;
  for (let i = 0; i < headings.length; i++) {
    const { level } = headings[i];
    if (level > prev + 1 && prev >= 1) errors.add(i);
    prev = level;
  }
  return errors;
}

function htmlEntities(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getDOMHeadingLevel(el) {
  const aria = el.getAttribute?.("aria-level");
  if (aria) return parseInt(aria, 10) || 1;
  const m = el.tagName?.match(/^H([1-6])$/i);
  return m ? parseInt(m[1], 10) : 1;
}

function getDOMHeadingName(el) {
  return (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 150);
}

function matchHeadingsToDOM(axHeadings, domHeadings) {
  const result = [];
  let nextDom = 0;
  for (const ax of axHeadings) {
    const wantLevel = ax.level;
    const wantName = (ax.name || "").trim().toLowerCase();
    let best = null;
    let bestIdx = -1;
    for (let j = nextDom; j < domHeadings.length; j++) {
      const dom = domHeadings[j];
      const domLevel = getDOMHeadingLevel(dom);
      if (domLevel !== wantLevel) continue;
      const domName = getDOMHeadingName(dom).toLowerCase();
      if (!wantName || domName.includes(wantName) || wantName.includes(domName)) {
        best = dom;
        bestIdx = j;
        break;
      }
    }
    result.push(best);
    if (bestIdx >= 0) nextDom = bestIdx + 1;
  }
  return result;
}

function headingsToHTMLFromList(headings, headingErrors) {
  if (headings.length === 0) {
    return '<p class="no-data">No headings in accessibility tree.</p>';
  }
  let html = "";
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    const wrong = headingErrors.has(i);
    const cls = wrong ? "wrong-level" : "correct-level";
    const status = wrong ? ", skipped level" : "";
    const text = htmlEntities(h.name || "(no text)");
    html += `<li class="${cls}" style="margin-left:${h.level}em;"><button data-index="${i}"><span class="level" data-level="${h.level}" aria-hidden="true"></span><span class="sr-only">H${h.level}${status}: </span><span class="text">${text}</span></button></li>`;
  }
  return `<ul id="headings">${html}</ul>`;
}

const IFRAME_HTML = `
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,minimum-scale=1.0,initial-scale=1,user-scalable=yes">
<style>
* { margin: 0; padding: 0; border: 0; box-sizing: border-box; }
body { font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #284900; background: #fff; padding: 15px 15px 30px; }
ul { margin: 0 0 0 -10px; padding: 0; list-style: none; }
li { position: relative; line-height: 1.3; border-radius: 3px; max-width: 30em; }
li:hover { background: rgba(0,0,0,0.05); }
li.is-active { background: rgba(0,129,190,0.12); }
li button { display: flex; align-items: flex-start; padding: 2px 4px 2px 28px; width: 100%; background: none; border: none; font: inherit; color: inherit; text-align: left; cursor: pointer; position: relative; }
li .level { display: inline-flex; align-items: center; justify-content: center; background-color: currentColor; font-size: 85%; font-weight: bold; width: 2.7ex; height: 2.7ex; min-width: 2.7ex; text-align: center; box-sizing: border-box; position: absolute; left: 2px; top: 2px; border-radius: 2px; flex-shrink: 0; }
li .level:before { content: attr(data-level); color: white; }
li .text { margin-left: 4px; }
li.correct-level { color: #284900; }
li.wrong-level { color: #AF3A37; }
li.wrong-level .level { background-color: #AF3A37; clip-path: polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%); border-radius: 0; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.no-data { color: #666; padding: 16px; font-size: 13px; margin: 0; }
.error-box { background: #fce8e8; color: #c5221f; padding: 10px 12px; border-radius: 4px; margin-bottom: 10px; font-size: 12px; }
.loading { display: flex; align-items: center; gap: 10px; padding: 16px; color: #666; font-size: 13px; }
.spinner { width: 16px; height: 16px; border: 2px solid #e0e0e0; border-top-color: #0081BE; border-radius: 50%; animation: spin 0.6s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
header { padding-bottom: 12px; margin-bottom: 10px; border-bottom: 1px solid #e0e0e0; }
.button-close { position: absolute; top: 12px; right: 12px; padding: 6px 12px; border-radius: 4px; border: 1px solid #ccc; font-size: inherit; cursor: pointer; background: #fff; }
.button-close:hover { background: #f5f5f5; }
h2 { font-weight: bold; font-size: 14px; }
.subtitle { font-size: 11px; color: #666; margin-top: 4px; }
#result { overflow: auto; flex: 1; min-height: 100px; }
.legend { display: flex; gap: 12px; align-items: center; margin: 6px 0 0; padding: 0; font-size: 11px; color: #666; list-style: none; }
.legend-item { display: flex; align-items: center; gap: 4px; }
.legend-square { width: 10px; height: 10px; background: #284900; border-radius: 2px; }
.legend-octagon { width: 10px; height: 10px; background: #AF3A37; clip-path: polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%); }
</style>
</head>
<body>
<header>
<button class="button-close" data-action="close">Close</button>
<h2>Heading Inspector</h2>
<p class="subtitle">Click to scroll to heading.</p>
<ul class="legend"><li class="legend-item"><span class="legend-square" aria-hidden="true"></span> Correct order</li><li class="legend-item"><span class="legend-octagon" aria-hidden="true"></span> Sequence error</li></ul>
</header>
<main id="result"></main>
</body>
</html>
`;

let container = null;
let headingElements = [];
let highlighterEl = null;
let highlighterAnimation = null;
let activeItemTimer = null;
let pollInterval = null;
let pollTimeout = null;

function resetTimers() {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  if (pollTimeout) { clearTimeout(pollTimeout); pollTimeout = null; }
  if (highlighterAnimation) { highlighterAnimation.cancel(); highlighterAnimation = null; }
  if (activeItemTimer) { clearTimeout(activeItemTimer); activeItemTimer = null; }
}

function createPanel(onLoad) {
  const existing = document.getElementById(CONTAINER_ID);
  if (existing) existing.remove();

  container = document.createElement("div");
  container.id = CONTAINER_ID;
  container.style.cssText = CONTAINER_STYLE;

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "width:100%;flex:1;min-height:0;border:0;display:block;";
  iframe.srcdoc = IFRAME_HTML;
  iframe.addEventListener("load", () => onLoad(iframe.contentDocument), { once: true });
  container.appendChild(iframe);
  document.body.appendChild(container);
  document.body.style.marginRight = container.offsetWidth + "px";
}

function scrollElementIntoView(el) {
  if (!el) return;
  const doc = el.ownerDocument;
  const win = doc?.defaultView;
  if (!win) return;

  if (doc !== document) {
    // Element in iframe: scroll internally, then scroll iframe into viewport
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const frame = win.frameElement;
    if (frame) frame.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  // Main document: use explicit window.scrollTo (more reliable than scrollIntoView)
  const rect = el.getBoundingClientRect();
  const offsetTop = 80; // offset for fixed headers
  const targetY = window.scrollY + rect.top - offsetTop;
  window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
}

function positionHighlighter(el) {
  let rect = el.getBoundingClientRect();
  let node = el;
  while ((rect.width < 2 || rect.height < 2) && node) {
    node = node.parentElement || node.getRootNode?.()?.host;
    if (!node || node === document.body) break;
    rect = node.getBoundingClientRect();
  }
  const hl = document.getElementById(HIGHLIGHTER_ID);
  if (!hl) return;
  const pad = 4;
  hl.style.left = Math.max(0, rect.left - pad) + "px";
  hl.style.top = Math.max(0, rect.top - pad) + "px";
  hl.style.width = Math.max(8, rect.width + 2 * pad) + "px";
  hl.style.height = Math.max(8, rect.height + 2 * pad) + "px";
  if (highlighterAnimation) { highlighterAnimation.cancel(); highlighterAnimation = null; }

  highlighterAnimation = hl.animate([
    { opacity: 0,    offset: 0    },
    { opacity: 1,    offset: 0.15 },
    { opacity: 1,    offset: 0.40 },
    { opacity: 0.15, offset: 0.58 },
    { opacity: 1,    offset: 0.72 },
    { opacity: 1,    offset: 0.85 },
    { opacity: 0,    offset: 1    },
  ], { duration: 1000, fill: "forwards" });
  highlighterAnimation.onfinish = () => { highlighterAnimation = null; };
}

function highlightElement(el, scroll = true) {
  if (!el) return;
  resetTimers();

  if (!scroll) {
    positionHighlighter(el);
    return;
  }

  scrollElementIntoView(el);

  let lastTop = el.getBoundingClientRect().top;
  let stableCount = 0;
  pollInterval = setInterval(() => {
    const top = el.getBoundingClientRect().top;
    if (Math.abs(top - lastTop) < 1) {
      stableCount++;
      if (stableCount >= 3) {
        if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
        if (pollTimeout) { clearTimeout(pollTimeout); pollTimeout = null; }
        positionHighlighter(el);
      }
    } else {
      stableCount = 0;
    }
    lastTop = top;
  }, 60);

  pollTimeout = setTimeout(() => {
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    pollTimeout = null;
    positionHighlighter(el);
  }, 1500);
}

function showError(message) {
  createPanel((doc) => {
    doc.querySelector('[data-action="close"]')?.addEventListener("click", () => hide());
    const result = doc.querySelector("#result");
    if (result) {
      const div = doc.createElement("div");
      div.className = "error-box";
      div.textContent = message;
      result.appendChild(div);
    }
  });
}

function ensureHighlighter() {
  if (!highlighterEl) {
    highlighterEl = document.createElement("div");
    highlighterEl.id = HIGHLIGHTER_ID;
    highlighterEl.style.cssText = HIGHLIGHTER_STYLE;
  }
  if (!highlighterEl.parentNode) document.body.appendChild(highlighterEl);
}

function showPanel(html) {
  createPanel((doc) => {
    doc.querySelector('[data-action="close"]')?.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "panelHidden" }).catch(() => {});
      hide();
    });

    const result = doc.querySelector("#result");
    if (result) result.innerHTML = html;

    const headingsList = doc.querySelector("#headings");
    if (!headingsList) return;

    headingsList.addEventListener("click", (e) => {
      const btn = e.target.closest?.("button[data-index]");
      if (!btn) return;
      const idx = parseInt(btn.dataset.index, 10);
      const el = headingElements[idx];
      if (!el) return;
      highlightElement(el, true);
      doc.querySelectorAll("#headings li").forEach((item, i) => {
        item.classList.toggle("is-active", i === idx);
      });
      if (activeItemTimer) clearTimeout(activeItemTimer);
      activeItemTimer = setTimeout(() => {
        doc.querySelectorAll("#headings li").forEach((item) => item.classList.remove("is-active"));
        activeItemTimer = null;
      }, 1000);
    });
  });
}

function runDOM() {
  resetTimers();
  headingElements = [];
  showPanel('<div class="loading"><div class="spinner"></div>Loading headings\u2026</div>');
}

function run(axTree) {
  resetTimers();

  const root = buildTree(axTree);
  if (!root) {
    headingElements = [];
    const h = document.getElementById(HIGHLIGHTER_ID);
    if (h) h.remove();
    highlighterEl = null;
    const count = axTree?.length ?? 0;
    const firstKeys = axTree?.[0] ? Object.keys(axTree[0]).join(", ") : "none";
    showPanel(`<p class="no-data">No root found. Nodes: ${count}. First keys: ${htmlEntities(firstKeys)}</p>`);
    return;
  }

  const axHeadings = [];
  collectHeadingsInOrder(root, axHeadings);
  const domHeadings = [];
  collectDOMHeadings(document.body, domHeadings);
  headingElements = matchHeadingsToDOM(axHeadings, domHeadings);
  ensureHighlighter();
  showPanel(headingsToHTMLFromList(axHeadings, findSequenceErrors(axHeadings)));
}

function hide() {
  resetTimers();
  document.body.style.marginRight = "";
  const c = document.getElementById(CONTAINER_ID);
  if (c) c.remove();
  const h = document.getElementById(HIGHLIGHTER_ID);
  if (h) h.remove();
  container = null;
  highlighterEl = null;
  headingElements = [];
}

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || typeof msg.action !== "string") return;
  if (msg.action === "runDOM") {
    runDOM();
  } else if (msg.action === "run" && Array.isArray(msg.axTree)) {
    run(msg.axTree);
  } else if (msg.action === "error") {
    showError(typeof msg.message === "string" ? msg.message : "Unknown error");
  } else if (msg.action === "hide") {
    hide();
  }
});

})();
