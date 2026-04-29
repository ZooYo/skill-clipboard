# Skill Clipboard

A Chrome extension that lets you edit reusable markdown snippets and copy them
as prompts for AI chats.

Built with [Plasmo](https://docs.plasmo.com), React 18, TypeScript, and
Tailwind CSS v3. Markdown rendering uses `marked` + `DOMPurify` (no heavy
React-specific markdown libs, so the bundle stays small).

## Stack

- **Framework**: Plasmo (browser extension scaffolding, MV3 by default)
- **UI**: React 18 + TypeScript
- **Styling**: Tailwind CSS v3 (PostCSS plugin)
- **Markdown**: `marked` for parsing, `DOMPurify` for sanitisation
- **Storage**: `@plasmohq/storage` (shared between popup and options page)
- **Package manager**: pnpm (store pinned to `./.pnpm-store` via `.npmrc`)

## Surfaces

- **`options.tsx`** — full editor page (opens in its own tab). Two-pane
  layout: textarea on the left, live HTML preview on the right.
- **`popup.tsx`** — toolbar popup. Shows the current markdown and exposes
  **Copy as prompt** and **Edit** buttons.
- **`lib/storage.ts`** — shared storage keys + default content.
- **`lib/markdown.ts`** — `renderMarkdown(source)` helper.

The popup and the options page subscribe to the same `@plasmohq/storage` key,
so edits propagate live without any extra messaging.

## Getting started

Requirements: Node 18+ (you have v24), pnpm 8+.

```bash
pnpm install      # already done by setup, but safe to re-run
pnpm dev          # starts Plasmo dev build (writes to build/chrome-mv3-dev)
```

Then load the unpacked extension in Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select `build/chrome-mv3-dev`.
4. Pin the extension. Click the icon for the popup; right-click → **Options**
   (or use the **Edit** button in the popup) for the full editor.

Plasmo will hot-reload the extension on save.

## Production build

```bash
pnpm build        # outputs to build/chrome-mv3-prod
pnpm package      # zips it into build/chrome-mv3-prod.zip for the store
```

## Project layout

```
.
├── lib/
│   ├── markdown.ts      # marked + DOMPurify wrapper
│   └── storage.ts       # shared keys + default prompt
├── options.tsx          # full editor page
├── popup.tsx            # toolbar popup
├── style.css            # Tailwind entry + minimal preview styles
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
└── package.json         # `manifest` field configures the MV3 manifest
```

## Customising the manifest

Plasmo derives `manifest.json` from `package.json`'s `manifest` field. The
current manifest requests only the `storage` permission and forces the
options page to open in a tab (so you get the full editor experience). Add
fields there if you need more permissions, content scripts, etc.

## Roadmap ideas

- Multiple named snippets (sidebar of saved prompts).
- Keyboard shortcut for "copy active snippet".
- Optional richer markdown editor (e.g. CodeMirror) once the simple textarea
  feels limiting.
