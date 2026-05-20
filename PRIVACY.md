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
  outline panel is injected only on the active tab and only after
  you click the toolbar icon. The extension has no standing access
  to any page; access ends when you navigate away or close the tab.

## What the extension does not do

- Does **not** transmit page content, AX-tree data, URLs, or any user
  activity to any server.
- Does **not** include analytics, error reporting, telemetry, or
  third-party SDKs.
- Does **not** read or modify cookies or any browser storage. The
  extension declares no `storage` permission and persists nothing
  across activations.

## The `debugger` permission

The extension declares the `debugger` permission solely to attach to
the active tab via CDP and call `Accessibility.getFullAXTree`. The
debugger is attached and detached on each activation. Chrome shows a
"Debugger attached" banner while the extension is active — this is a
Chrome-enforced UI cue, not a sign of remote control. The extension
does not attach to other tabs and does not retain a persistent
debugger session.

## Contact

For questions or to report a privacy concern, open an issue at:
<https://github.com/quatico-solutions/heading-inspector/issues>

Or email Quatico's Data Protection Officer at
<admin@quatico.com>.

## Changes

Material updates to this policy will be noted at the top of this file
with a date and a brief change summary.
