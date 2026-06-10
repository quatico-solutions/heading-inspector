# Privacy policy

Heading Inspector reads the structure of web pages you visit to render an
outline of headings. It does **not** transmit any data over the network
and does **not** include analytics, telemetry, or third-party tracking.

## What the extension accesses

- **Page content (DOM + accessibility tree).** When you click the
  toolbar icon, the extension reads the active tab's accessibility
  tree via the Chrome DevTools Protocol (CDP) call
  `Accessibility.getFullAXTree`. The tree is processed in-memory in
  the extension's background service worker and content script.
  Nothing is sent off-device.
- **`activeTab` access only.** The content script that renders the
  outline panel is injected only after you click the toolbar icon.
  Chrome's `activeTab` grant covers the current tab for as long as you
  stay on the same site (origin); it is revoked the moment you
  navigate to a different site or close the tab. While you remain on
  the same site, the extension re-reads the new page's headings so the
  outline keeps up with your navigation. It never has standing access
  to sites you have not explicitly activated it on.
- **Session storage (tab state only).** The extension uses
  `chrome.storage.session` to remember which tabs currently have the
  panel open, so it can re-open the outline after you navigate within
  a site. This holds tab identifiers only — never page content, URLs,
  or AX-tree data. It is in-memory, never synced, and cleared when the
  browser closes.

## What the extension does not do

- Does **not** transmit page content, AX-tree data, URLs, or any user
  activity to any server.
- Does **not** include analytics, error reporting, telemetry, or
  third-party SDKs.
- Does **not** read or modify cookies, and stores no page content. The
  only data it persists is the in-memory list of tabs with an open
  panel (`chrome.storage.session`), cleared when the browser closes.

## The `debugger` permission

The extension declares the `debugger` permission solely to attach to
the active tab via CDP and call `Accessibility.getFullAXTree`. The
debugger is attached and detached on each activation, including each
time the outline is refreshed after you navigate within a site. Chrome
shows a "Debugger attached" banner while the extension is active — this
is a Chrome-enforced UI cue, not a sign of remote control. The
extension does not attach to other tabs and does not retain a
persistent debugger session.

## Contact

For questions or to report a privacy concern, open an issue at:
<https://github.com/quatico-solutions/heading-inspector/issues>

Or email Quatico's Data Protection Officer at
<admin@quatico.com>.

## Changes

Material updates to this policy will be noted at the top of this file
with a date and a brief change summary.
