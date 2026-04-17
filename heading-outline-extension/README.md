# Heading Outline Chrome Extension

Shows the **accessibility tree** heading structure (h1-h6) as screen readers see it, with sequence validation. Uses Chrome DevTools Protocol (CDP) to fetch the real AX tree.

## Installation

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder

## Usage

- **Click the extension icon** to toggle the heading outline panel
- The panel lists all headings with their level, indented by depth
- **Green square** = correct heading order
- **Red octagon** = sequence error (e.g. h4 directly after h2) -- distinguished by both color and shape
- **Click a heading** to scroll to it on the page with a highlight flash
- Click **Close** or the extension icon again to hide

## Accessibility

The panel is built with screen reader users in mind:

- Native `<button>` elements for each heading entry (keyboard operable out of the box)
- Visually hidden text provides heading level and error status (e.g. "H3, skipped level:")
- Decorative icons are hidden from assistive technology
- Semantic HTML throughout (headings, lists, landmarks)
- A visual legend explains the square/octagon distinction

## Debugger permission

The extension uses the `debugger` permission to fetch the accessibility tree via CDP. Chrome may show a "Debugger attached" notice; the debugger is detached immediately after fetching the tree.

**Tip:** Close DevTools before using the extension if you get attachment errors.
