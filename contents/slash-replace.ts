import { Storage } from "@plasmohq/storage"
import type { PlasmoCSConfig } from "plasmo"

import { migrateToLocalIfNeeded } from "~lib/migrate"
import {
  DEFAULT_PREFIX,
  parseSkillsState,
  STORAGE_KEYS,
  type SkillsState
} from "~lib/storage"

export const config: PlasmoCSConfig = {
  matches: [
    "https://www.perplexity.ai/*",
    "https://perplexity.ai/*",
    "https://chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*"
  ],
  run_at: "document_idle",
  all_frames: false
}

type Cache = {
  prefix: string
  byCommand: Map<string, string>
  pattern: RegExp | null
}

let cache: Cache = {
  prefix: DEFAULT_PREFIX,
  byCommand: new Map(),
  pattern: null
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function buildCache(state: SkillsState): Cache {
  const prefix = state.prefix && state.prefix.length > 0 ? state.prefix : DEFAULT_PREFIX
  const byCommand = new Map<string, string>()
  for (const skill of state.skills) {
    if (typeof skill.command === "string" && skill.command.length > 0) {
      byCommand.set(skill.command.toLowerCase(), skill.content)
    }
  }
  const pattern = byCommand.size
    ? new RegExp(`(^|\\s)(${escapeRegex(prefix)})([a-zA-Z0-9_-]{1,32})$`)
    : null
  return { prefix, byCommand, pattern }
}

// Must match the area used by the options/popup surfaces (lib/useSkills.ts);
// otherwise this content script reads a stale/empty key and command
// expansion silently stops working.
const storage = new Storage({ area: "local" })

async function reload() {
  try {
    const raw = await storage.get(STORAGE_KEYS.skills)
    cache = buildCache(parseSkillsState(raw))
  } catch {
    cache = { prefix: DEFAULT_PREFIX, byCommand: new Map(), pattern: null }
  }
}

// Live cache invalidation. Three independent signals so the cache stays
// fresh even when one of them drops:
//   1. chrome.storage.onChanged - the canonical push path. Bypasses
//      @plasmohq/storage's wrapper because the wrapper's listener has
//      been observed to silently stop firing in long-lived content
//      scripts after extension HMR / context invalidation.
//   2. visibilitychange (visible) - belt-and-suspenders pull path. Any
//      time the user tabs back to the chat page we re-read storage so
//      a missed event can never produce stale expansions.
//   3. focus - some browsers fire focus but not visibilitychange when
//      switching windows; covers that case.
try {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return
    if (!(STORAGE_KEYS.skills in changes)) return
    void reload()
  })
} catch {
  // chrome.storage.onChanged unavailable (extremely unusual in MV3
  // content scripts with the "storage" permission); the visibility/
  // focus paths still keep us mostly fresh.
}

const refresh = () => {
  if (document.visibilityState === "visible") void reload()
}
document.addEventListener("visibilitychange", refresh)
window.addEventListener("focus", refresh)

// First-run migration: pre-local installs still have data sitting in
// chrome.storage.sync. We must run this BEFORE the initial reload so the
// content script doesn't see an empty local store and silently disable
// command expansion until the user happens to open the options page.
// migrateToLocalIfNeeded is idempotent and races safely with options/popup.
void migrateToLocalIfNeeded()
  .catch(() => {
    // Migration is best-effort; reload still works against whatever's there.
  })
  .finally(() => {
    void reload()
  })

// ---------- Composer detection (works for textarea + contenteditable) ----------

function getComposer(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null
  return (
    target.closest("textarea") ??
    target.closest<HTMLElement>('[contenteditable="true"]') ??
    target.closest<HTMLElement>('[role="textbox"]') ??
    null
  )
}

// ---------- Match the prefix+token immediately before the caret ----------

type TextareaMatch = {
  kind: "textarea"
  start: number // index of prefix
  end: number // caret position
  token: string
}

type ContentEditableMatch = {
  kind: "contenteditable"
  node: Text
  startOffset: number
  endOffset: number
  token: string
}

type Match = TextareaMatch | ContentEditableMatch

function findMatch(el: HTMLElement, pattern: RegExp): Match | null {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const caret = el.selectionStart ?? el.value.length
    const before = el.value.slice(0, caret)
    const m = before.match(pattern)
    if (!m || m.index === undefined) return null
    // m[1] is leading boundary (start-of-string OR a whitespace char).
    const start = m.index + m[1].length
    return {
      kind: "textarea",
      start,
      end: caret,
      token: m[3]
    }
  }

  // contenteditable: read the text node where the caret sits.
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null
  const range = sel.getRangeAt(0)
  const node = range.startContainer
  if (node.nodeType !== Node.TEXT_NODE) return null
  const textNode = node as Text
  const caret = range.startOffset
  const before = textNode.data.slice(0, caret)
  const m = before.match(pattern)
  if (!m || m.index === undefined) return null
  const start = m.index + m[1].length
  return {
    kind: "contenteditable",
    node: textNode,
    startOffset: start,
    endOffset: caret,
    token: m[3]
  }
}

// ---------- Replacement ----------

function setReactTextareaValue(
  el: HTMLTextAreaElement | HTMLInputElement,
  newValue: string,
  caret: number
) {
  // React tracks value via a hidden internal field; calling the native
  // setter sidesteps that so the dispatched input event is treated as a
  // genuine user edit. Without this, React resets the value back.
  const proto = Object.getPrototypeOf(el)
  const desc = Object.getOwnPropertyDescriptor(proto, "value")
  if (desc?.set) {
    desc.set.call(el, newValue)
  } else {
    el.value = newValue
  }
  el.selectionStart = caret
  el.selectionEnd = caret
  el.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      cancelable: false,
      inputType: "insertText",
      data: newValue
    })
  )
}

function replaceTextarea(
  el: HTMLTextAreaElement | HTMLInputElement,
  match: TextareaMatch,
  replacement: string
) {
  const value = el.value
  const next = value.slice(0, match.start) + replacement + value.slice(match.end)
  setReactTextareaValue(el, next, match.start + replacement.length)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function textToHtmlParagraphs(text: string): string {
  // Map every \n to a paragraph boundary, with `<p><br></p>` for blank
  // lines so editors that strip empty paragraphs (Claude's ProseMirror)
  // still keep them as visible spacing. ChatGPT's PM and Lexical also
  // accept this representation.
  return text
    .split(/\r?\n/)
    .map((line) => (line === "" ? "<p><br></p>" : `<p>${escapeHtml(line)}</p>`))
    .join("")
}

function dispatchPaste(el: HTMLElement, text: string): boolean {
  // Simulate a real user paste. Editors with their own paste handler
  // (Lexical, ProseMirror, Slate) read clipboardData and convert it to
  // their schema's node tree.
  //   - text/plain is the universal fallback.
  //   - text/html with explicit <p> per line + <p><br></p> for blank
  //     lines forces paragraph-aware editors to preserve empty lines,
  //     which some schemas (Claude's PM) drop when given only \n\n.
  try {
    const dt = new DataTransfer()
    dt.setData("text/plain", text)
    if (text.includes("\n")) {
      dt.setData("text/html", textToHtmlParagraphs(text))
    }
    const evt = new ClipboardEvent("paste", {
      clipboardData: dt,
      bubbles: true,
      cancelable: true
    })
    el.dispatchEvent(evt)
    // Editors that handle paste call preventDefault. Plain contenteditable
    // without a paste handler returns true here, which means nothing was
    // inserted - we must fall through.
    return evt.defaultPrevented
  } catch {
    return false
  }
}

function insertViaExecCommand(text: string): boolean {
  // Split on newlines so every line gets its own insertText call with an
  // insertLineBreak between them. This works in plain contenteditable and
  // as a fallback for editors that don't intercept the paste event.
  const lines = text.split(/\r?\n/)
  let anySuccess = false
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      try {
        anySuccess = document.execCommand("insertLineBreak") || anySuccess
      } catch {
        // ignore
      }
    }
    if (lines[i].length > 0) {
      try {
        anySuccess =
          document.execCommand("insertText", false, lines[i]) || anySuccess
      } catch {
        // ignore
      }
    }
  }
  return anySuccess
}

// Editor detection helpers. Different rich editors take different paths
// because their selection / input handling differs:
// - ProseMirror (ChatGPT, Claude): ignores DOM selection AND ignores
//   synthetic beforeinput/keydown events (its handlers rely on real
//   browser-fired events with populated targetRanges). We have to fall
//   back to direct DOM mutation and let PM's MutationObserver reconcile.
// - Lexical (Perplexity): also keeps its own selection but accepts
//   synthetic key events. Backspace simulation works.
// - Quill (Gemini's Angular composer): trigger deletion via the generic
//   execCommand("delete") path works fine, but `insertLineBreak` is a
//   no-op in Quill so multi-line content gets flattened into a single
//   <p>. We drive Quill's keymap directly with synthetic Enter events
//   between insertText lines.
// - Everything else (plain CE): honours DOM selection; the classic
//   execCommand("delete") + execCommand("insertText/Break") path works.
function isProseMirror(el: HTMLElement): boolean {
  return Boolean(el.closest(".ProseMirror"))
}

function isLexical(el: HTMLElement): boolean {
  return Boolean(el.closest("[data-lexical-editor]"))
}

function isQuill(el: HTMLElement): boolean {
  return Boolean(el.closest(".ql-editor"))
}

// Insert multi-line text into a Quill editor (Gemini).
//
// Why not synthetic Enter keydown? Gemini's "send" handler is on
// keydown; a synthetic Enter event causes the message to get submitted
// mid-expansion and the rest of the lines never make it in. Anything
// that involves a real Enter/Return keydown is therefore off-limits.
//
// Why not synthetic paste? On current Gemini, dispatched ClipboardEvents
// don't reach Quill's clipboard handler (defaultPrevented stays false),
// so the multi-line input falls through to insertText per-line and
// joins everything into one paragraph.
//
// What works: execCommand("insertParagraph") fires beforeinput with
// inputType="insertParagraph". Quill's Input module turns that into a
// Delta '\n' insert (a real paragraph break) and crucially doesn't go
// through keydown -- Gemini's send handler stays silent.
function insertForQuill(target: HTMLElement, text: string): boolean {
  // target is intentionally received but unused: insertParagraph /
  // insertText operate on document.activeElement's selection, which is
  // already positioned correctly after phase 1.
  void target
  const lines = text.split(/\r?\n/)
  let anySuccess = false
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      try {
        anySuccess = document.execCommand("insertParagraph") || anySuccess
      } catch {
        // ignore; we'll fall through to the legacy paths below
      }
    }
    if (lines[i].length > 0) {
      try {
        anySuccess =
          document.execCommand("insertText", false, lines[i]) || anySuccess
      } catch {
        // ignore
      }
    }
  }
  return anySuccess
}

function simulateBackspaces(target: EventTarget, count: number) {
  // ProseMirror in modern Chrome listens to BOTH `beforeinput` (primary
  // path) and `keydown` (fallback). We dispatch both per iteration so PM
  // picks up at least one. Each event causes PM's own keymap / input
  // handler to delete a single character via its internal command pipeline,
  // bypassing the DOM-selection mismatch that defeats execCommand.
  for (let i = 0; i < count; i++) {
    target.dispatchEvent(
      new InputEvent("beforeinput", {
        inputType: "deleteContentBackward",
        bubbles: true,
        cancelable: true,
        composed: true
      })
    )
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Backspace",
        code: "Backspace",
        keyCode: 8,
        which: 8,
        bubbles: true,
        cancelable: true,
        composed: true
      })
    )
  }
}

function replaceContentEditable(
  el: HTMLElement,
  match: ContentEditableMatch,
  replacement: string
) {
  const sel = window.getSelection()
  if (!sel) return

  const triggerLen = match.endOffset - match.startOffset

  if (isProseMirror(el)) {
    // ProseMirror path: hybrid sync delete + async paste.
    //
    // Why not just manually insert text + <br>? PM's schema only accepts
    // `hardBreak` nodes (and only if the schema enables them) - inserting
    // raw <br> via the DOM either gets dropped (ChatGPT) or rendered as
    // inline whitespace (Claude). The right way to get proper line breaks
    // is to let PM's own paste handler parse text/plain newlines into
    // whatever break/paragraph structure its schema permits.
    //
    // Sequence:
    //   1. Synchronously delete the trigger with Range.deleteContents().
    //      PM's MutationObserver will queue a microtask to reconcile.
    //   2. Fire `input` so PM also gets a hint about the deletion.
    //   3. Defer paste to the next animation frame - by then PM has
    //      flushed its mutation queue and its internal selection is at
    //      the (now collapsed) caret. Paste fires through PM's normal
    //      paste handler, which converts \n to schema-correct breaks.
    const range = document.createRange()
    range.setStart(match.node, match.startOffset)
    range.setEnd(match.node, match.endOffset)
    range.deleteContents()
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)

    el.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: false,
        inputType: "deleteContentBackward"
      })
    )

    requestAnimationFrame(() => {
      if (dispatchPaste(el, replacement)) return

      // Paste declined: insert as text fragment + <br> as last resort.
      // Newlines may not render perfectly but content gets in.
      const lines = replacement.split(/\r?\n/)
      const fragment = document.createDocumentFragment()
      lines.forEach((line, i) => {
        if (i > 0) fragment.appendChild(document.createElement("br"))
        if (line.length > 0) fragment.appendChild(document.createTextNode(line))
      })
      const liveSel = window.getSelection()
      if (liveSel && liveSel.rangeCount > 0) {
        const r = liveSel.getRangeAt(0)
        r.insertNode(fragment)
        r.collapse(false)
      }
    })
    return
  }

  // Phase 1: delete trigger.
  if (isLexical(el)) {
    // Lexical handles synthetic Backspace events through its registered
    // KEY_BACKSPACE_COMMAND, deleting one char per event from its
    // internal model. This avoids the DOM-selection-sync delay that
    // defeats execCommand("delete").
    simulateBackspaces(el, triggerLen)
  } else {
    // Gemini / plain CE: classic DOM selection + execCommand("delete").
    const range = document.createRange()
    range.setStart(match.node, match.startOffset)
    range.setEnd(match.node, match.endOffset)
    sel.removeAllRanges()
    sel.addRange(range)

    let deleted = false
    try {
      deleted = document.execCommand("delete")
    } catch {
      deleted = false
    }
    if (!deleted) {
      range.deleteContents()
      const liveSel = window.getSelection()
      if (liveSel) {
        liveSel.removeAllRanges()
        liveSel.addRange(range)
      }
    }
  }

  // Phase 2: insert the replacement at the (now collapsed) caret.
  const isMultiline = /\r?\n/.test(replacement)
  if (isMultiline) {
    // Quill (Gemini) needs Enter keydown between lines because
    // execCommand("insertLineBreak") is a no-op for it; without this it
    // silently joins every line into one paragraph. Synthetic paste also
    // gets flattened on current Gemini, so we don't try it here.
    if (isQuill(el) && insertForQuill(el, replacement)) return
    if (dispatchPaste(el, replacement)) return
    if (insertViaExecCommand(replacement)) return
  } else {
    let inserted = false
    try {
      inserted = document.execCommand("insertText", false, replacement)
    } catch {
      inserted = false
    }
    if (inserted) return
    if (dispatchPaste(el, replacement)) return
  }

  // ---- Last resort: manual DOM mutation ----
  // Internal editor model may go out of sync but the user at least sees
  // the content with line breaks preserved.
  const lines = replacement.split(/\r?\n/)
  const fragment = document.createDocumentFragment()
  lines.forEach((line, i) => {
    if (i > 0) fragment.appendChild(document.createElement("br"))
    if (line.length > 0) fragment.appendChild(document.createTextNode(line))
  })
  const liveSel = window.getSelection()
  const insertRange =
    liveSel && liveSel.rangeCount > 0
      ? liveSel.getRangeAt(0)
      : (() => {
          const r = document.createRange()
          r.setStart(match.node, match.startOffset)
          r.setEnd(match.node, match.endOffset)
          return r
        })()
  insertRange.insertNode(fragment)
  insertRange.collapse(false)
  if (liveSel) {
    liveSel.removeAllRanges()
    liveSel.addRange(insertRange)
  }
}

// ---------- Keydown handler ----------

function onKeydown(e: KeyboardEvent) {
  if (!e.isTrusted) return
  if (e.isComposing || e.keyCode === 229) return // skip while IME is composing
  if (e.key !== " " && e.key !== "Tab") return
  if (!cache.pattern || cache.byCommand.size === 0) return

  const composer =
    getComposer(e.target) ?? getComposer(document.activeElement)
  if (!composer) return

  const match = findMatch(composer, cache.pattern)
  if (!match) return

  const replacement = cache.byCommand.get(match.token.toLowerCase())
  if (replacement === undefined) return

  e.preventDefault()
  e.stopImmediatePropagation()

  if (match.kind === "textarea") {
    replaceTextarea(composer as HTMLTextAreaElement, match, replacement)
  } else {
    replaceContentEditable(composer, match, replacement)
  }
}

window.addEventListener("keydown", onKeydown, true)
