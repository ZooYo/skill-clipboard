import { useEffect, useMemo, useRef, useState } from "react"

import { renderMarkdown } from "~lib/markdown"
import { MAX_SKILLS } from "~lib/storage"
import { useSkills } from "~lib/useSkills"

import "./style.css"

function stripLeadingPrefix(raw: string, prefix: string): string {
  if (!prefix) return raw
  let stripped = raw
  while (stripped.startsWith(prefix)) {
    stripped = stripped.slice(prefix.length)
  }
  return stripped
}

function parseHashSelection(hash: string): { kind: "id"; id: string } | { kind: "new" } | null {
  const stripped = hash.replace(/^#/, "")
  if (stripped === "/new") return { kind: "new" }
  const match = stripped.match(/^\/skill\/(.+)$/)
  if (match) return { kind: "id", id: match[1] }
  return null
}

function setSelectionHash(id: string | null) {
  const next = id ? `#/skill/${id}` : ""
  if (window.location.hash !== next) {
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}${next}`)
  }
}

function OptionsPage() {
  const {
    skills,
    prefix,
    canAdd,
    addSkill,
    updateSkill,
    removeSkill,
    setPrefix,
    validatePrefix,
    validateCommand
  } = useSkills()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const hashHandledRef = useRef(false)

  // Local draft for the prefix input so users can type without committing
  // invalid intermediate values to storage.
  const [prefixDraft, setPrefixDraft] = useState(prefix)
  useEffect(() => {
    setPrefixDraft(prefix)
  }, [prefix])
  const prefixCheck = validatePrefix(prefixDraft)
  const prefixDirty = prefixDraft !== prefix

  const handlePrefixChange = (next: string) => {
    setPrefixDraft(next)
    if (validatePrefix(next).ok) {
      setPrefix(next)
    }
  }


  // Resolve initial selection from URL hash, or fall back to first skill.
  // We re-run until skills have loaded the first time so hashes work even
  // when the page opens before storage hydrates.
  useEffect(() => {
    if (hashHandledRef.current) return
    if (skills.length === 0 && !parseHashSelection(window.location.hash)) {
      // Nothing to do yet; keep waiting until skills exist.
      return
    }

    const parsed = parseHashSelection(window.location.hash)

    if (parsed?.kind === "new") {
      if (canAdd) {
        const created = addSkill({ name: "Untitled" })
        if (created) {
          hashHandledRef.current = true
          setSelectedId(created.id)
          setSelectionHash(created.id)
          return
        }
      }
      // Cap reached — fall through to default selection.
    }

    if (parsed?.kind === "id") {
      const match = skills.find((s) => s.id === parsed.id)
      if (match) {
        hashHandledRef.current = true
        setSelectedId(match.id)
        return
      }
      // Hash referenced a deleted skill; fall through.
    }

    if (skills.length > 0) {
      hashHandledRef.current = true
      setSelectedId(skills[0].id)
    }
  }, [skills, canAdd, addSkill])

  // If the selected skill is deleted (e.g. from another surface), pick another.
  useEffect(() => {
    if (!selectedId) return
    if (!skills.some((s) => s.id === selectedId)) {
      const next = skills[0]?.id ?? null
      setSelectedId(next)
      setSelectionHash(next)
    }
  }, [skills, selectedId])

  const selected = useMemo(
    () => skills.find((s) => s.id === selectedId) ?? null,
    [skills, selectedId]
  )

  // Per-selection drafts for the name + content inputs. We deliberately avoid
  // binding the controlled <input>/<textarea> directly to `selected.name` /
  // `selected.content`: those values flow through @plasmohq/storage's async
  // round-trip, so a controlled value can briefly lag behind the DOM after a
  // keystroke. When React then re-syncs the value, the textarea's selection
  // collapses to the end and the caret "jumps" mid-edit. Holding a local
  // draft keeps the controlled value in step with the DOM on every keystroke
  // and lets storage catch up in the background.
  const [nameDraft, setNameDraft] = useState("")
  const [contentDraft, setContentDraft] = useState("")
  useEffect(() => {
    // Re-hydrate only when the active skill changes, not on every storage
    // echo of our own writes -- otherwise we'd risk stomping the caret again.
    if (!selected) {
      setNameDraft("")
      setContentDraft("")
      return
    }
    setNameDraft(selected.name)
    setContentDraft(selected.content)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selected !== null])

  const html = useMemo(() => renderMarkdown(contentDraft), [contentDraft])

  // Per-selection draft for the command input so users can type/erase without
  // hitting validation errors instantly committing to storage. Synced from
  // the skill record when selection changes or storage updates externally.
  const [commandDraft, setCommandDraft] = useState("")
  useEffect(() => {
    setCommandDraft(selected?.command ?? "")
  }, [selectedId, selected?.command])

  const commandCheck = useMemo(
    () => (selected ? validateCommand(commandDraft, selected.id) : null),
    [commandDraft, selected, validateCommand]
  )

  const handleCommandChange = (raw: string) => {
    // If the user pasted "/myskill" we silently strip the live prefix.
    const cleaned = stripLeadingPrefix(raw.trim(), prefix)
    setCommandDraft(cleaned)
    if (!selected) return
    if (cleaned === "") {
      updateSkill(selected.id, { command: undefined })
      return
    }
    const check = validateCommand(cleaned, selected.id)
    if (check.ok || check.reason === "duplicate") {
      // duplicates still commit (last-defined wins at runtime, with UI warning).
      updateSkill(selected.id, { command: cleaned })
    }
  }

  const handleSelect = (id: string) => {
    setSelectedId(id)
    setSelectionHash(id)
  }

  const handleAdd = () => {
    const created = addSkill({ name: "Untitled" })
    if (created) {
      setSelectedId(created.id)
      setSelectionHash(created.id)
    }
  }

  const handleDelete = () => {
    if (!selected) return
    if (
      !confirm(
        `Delete "${selected.name.trim() || "Untitled"}"? This can't be undone.`
      )
    ) {
      return
    }
    const idx = skills.findIndex((s) => s.id === selected.id)
    const fallback = skills[idx + 1]?.id ?? skills[idx - 1]?.id ?? null
    removeSkill(selected.id)
    setSelectedId(fallback)
    setSelectionHash(fallback)
  }

  const handleCopy = async () => {
    if (!selected) return
    // Copy what the user sees in the editor, not what's been flushed to
    // storage -- @plasmohq/storage's async write means selected.content
    // can lag a keystroke or two behind contentDraft.
    await navigator.clipboard.writeText(contentDraft)
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold">Skill Clipboard</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Manage up to {MAX_SKILLS} reusable prompts. Set a command on any
              skill and type{" "}
              <code className="rounded bg-slate-200 px-1 py-0.5 font-mono text-xs dark:bg-slate-800">
                {prefix}command
              </code>{" "}
              + Space/Tab in Perplexity, ChatGPT, Claude, or Gemini to expand
              it.
            </p>
          </div>
          <div className="flex items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
              <span className="uppercase tracking-wide">Trigger prefix</span>
              <input
                type="text"
                value={prefixDraft}
                onChange={(e) => handlePrefixChange(e.target.value)}
                spellCheck={false}
                maxLength={3}
                className={`w-20 rounded-md border bg-white px-2 py-1 text-center font-mono text-sm shadow-sm focus:outline-none focus:ring-1 dark:bg-slate-900 ${
                  prefixCheck.ok
                    ? "border-slate-300 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-700"
                    : "border-red-400 text-red-600 focus:border-red-500 focus:ring-red-500 dark:border-red-800 dark:text-red-400"
                }`}
              />
              <span
                className={`h-3 text-[10px] ${
                  prefixCheck.ok
                    ? "text-slate-400"
                    : "text-red-600 dark:text-red-400"
                }`}>
                {prefixCheck.ok
                  ? prefixDirty
                    ? "saved"
                    : "1\u20133 symbol chars"
                  : "1\u20133 symbol chars (no spaces, no letters)"}
              </span>
            </label>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!selected}
              className="mb-5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              Copy markdown
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl grid-cols-[240px_1fr] gap-4 px-6 py-6">
        <aside className="flex flex-col rounded-md border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-800">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Skills ({skills.length}/{MAX_SKILLS})
            </span>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!canAdd}
              title={canAdd ? "Add a new skill" : `Limit of ${MAX_SKILLS} reached`}
              className="rounded-md border border-slate-300 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              + New
            </button>
          </div>
          {skills.length === 0 ? (
            <p className="px-3 py-4 text-xs text-slate-500">
              No skills yet. Click <strong>+ New</strong> to create one.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
              {skills.map((skill) => {
                const active = skill.id === selectedId
                const displayName = skill.name.trim() || "Untitled"
                return (
                  <li key={skill.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(skill.id)}
                      className={`block w-full truncate px-3 py-2 text-left text-sm ${
                        active
                          ? "bg-blue-50 font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      }`}>
                      {displayName}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        {selected ? (
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => {
                  setNameDraft(e.target.value)
                  updateSkill(selected.id, { name: e.target.value })
                }}
                placeholder="Skill name"
                maxLength={80}
                className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900"
              />
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/30">
                Delete
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor="cmd-input"
                className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Command (optional)
              </label>
              <div
                className={`flex items-stretch overflow-hidden rounded-md border bg-white shadow-sm focus-within:ring-1 dark:bg-slate-900 ${
                  !commandCheck || commandCheck.ok
                    ? "border-slate-300 focus-within:border-blue-500 focus-within:ring-blue-500 dark:border-slate-700"
                    : commandCheck.reason === "duplicate"
                      ? "border-amber-400 focus-within:ring-amber-500 dark:border-amber-700"
                      : "border-red-400 focus-within:ring-red-500 dark:border-red-800"
                }`}>
                <span className="flex select-none items-center bg-slate-100 px-2.5 font-mono text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {prefix}
                </span>
                <input
                  id="cmd-input"
                  type="text"
                  value={commandDraft}
                  onChange={(e) => handleCommandChange(e.target.value)}
                  placeholder="myskill"
                  spellCheck={false}
                  autoComplete="off"
                  maxLength={32}
                  className="flex-1 bg-transparent px-3 py-2 font-mono text-sm focus:outline-none"
                />
              </div>
              <p
                className={`text-[11px] ${
                  !commandCheck || commandCheck.ok
                    ? "text-slate-400"
                    : commandCheck.reason === "duplicate"
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-red-600 dark:text-red-400"
                }`}>
                {(() => {
                  if (!commandCheck || commandDraft.trim() === "") {
                    return `Leave empty to disable. With a command, type "${prefix}${commandDraft || "myskill"}" + Space/Tab in supported chats.`
                  }
                  if (commandCheck.ok) {
                    return `Type "${prefix}${commandDraft}" + Space or Tab in supported chats to insert this prompt.`
                  }
                  if (commandCheck.reason === "duplicate") {
                    return `Already used by "${commandCheck.conflictName}". Last edit will win at runtime.`
                  }
                  return "Use 1\u201332 chars: a\u2013z, 0\u20139, _ or -."
                })()}
              </p>
            </div>

            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <div className="flex min-w-0 flex-col">
                <label
                  htmlFor="md-editor"
                  className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Editor
                </label>
                <textarea
                  id="md-editor"
                  value={contentDraft}
                  onChange={(e) => {
                    setContentDraft(e.target.value)
                    updateSkill(selected.id, { content: e.target.value })
                  }}
                  spellCheck={false}
                  className="min-h-[65vh] w-full resize-y rounded-md border border-slate-300 bg-white p-3 font-mono text-sm leading-relaxed text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex min-w-0 flex-col">
                <span className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Preview
                </span>
                <article
                  className="preview min-h-[65vh] overflow-auto rounded-md border border-slate-200 bg-white p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-md border border-dashed border-slate-300 bg-white p-12 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
            {canAdd
              ? "Select a skill on the left, or click + New to create one."
              : `You've reached the ${MAX_SKILLS}-skill limit. Delete one to add more.`}
          </div>
        )}
      </section>
    </main>
  )
}

export default OptionsPage
