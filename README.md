# Heading Inspector

Chrome extension that shows the **accessibility tree** heading
structure (h1–h6) as screen readers see it, with sequence validation.
Uses the Chrome DevTools Protocol (CDP) to fetch the real AX tree —
not a DOM approximation — so ARIA-promoted headings, `aria-level`
overrides, and computed accessible names match what assistive
technology actually sees.

Built and maintained by [Quatico](https://www.quatico.com/) ·
[issues & source on GitHub](https://github.com/quatico-solutions/heading-inspector).

## Installation

### From the Chrome Web Store

*(Coming soon. The extension is being prepared for v0.1.0 submission.)*

### From source (developer install)

1. Clone or download this repository.
2. Open `chrome://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the repository root.

## Usage

- **Click the extension icon** on any tab to show the heading outline
  panel for that page.
- The panel lists all headings with their level, indented by depth.
- **Green square** = correct heading order.
- **Red octagon** = sequence error (e.g. h4 directly after h2) —
  distinguished by both colour and shape so it is robust under
  colour-blindness and greyscale.
- **Click a heading** to scroll to it on the page with a highlight
  flash.
- Click **Close** or the extension icon again to hide.
- The panel is scoped to the tab you clicked on — navigating to a
  new page does not reopen it automatically. Click the icon again
  whenever you want to inspect a new page.

## Accessibility

The panel is built with screen reader users in mind:

- Native `<button>` elements for each heading entry (keyboard
  operable out of the box).
- Visually hidden text provides heading level and error status
  (e.g. "H3, skipped level:").
- Decorative icons are hidden from assistive technology.
- Semantic HTML throughout (headings, lists, landmarks).
- A visual legend explains the square / octagon distinction.

## Permissions

The manifest declares only the permissions actually used:

- **`activeTab`** — access to the current tab, granted only when you
  click the toolbar icon. No standing access to any page.
- **`scripting`** — needed to inject the content script on demand
  when you click the icon.
- **`debugger`** — used solely to call
  `Accessibility.getFullAXTree` via the Chrome DevTools Protocol.
  The debugger is attached and detached on each activation. Chrome
  may show a "Debugger attached" banner while the extension is
  active.

There are no `host_permissions`, no `storage` permission, no network
calls, and no `<all_urls>` matches.

**Tip:** Close DevTools before using the extension if you get
attachment errors.

See [`PRIVACY.md`](./PRIVACY.md) for what the extension does and does
not access.

## Privacy

Heading Inspector runs entirely on-device: no network calls, no
analytics, no telemetry. The full policy lives in
[`PRIVACY.md`](./PRIVACY.md).

## Building a release zip

```bash
./scripts/build.sh
```

Reads the version from `manifest.json` and writes
`heading-inspector-v{X.Y.Z}.zip` to the repo root. Uploaded to the
Chrome Web Store and Edge Add-ons store.

## License

MIT — see [`LICENSE`](./LICENSE).

Copyright © 2026 Quatico Solutions AG.

## Author

Originally written by **Patrick Fehr** at Quatico.
