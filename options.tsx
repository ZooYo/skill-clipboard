import { useEffect, useMemo, useRef, useState } from "react"

import { renderMarkdown } from "~lib/markdown"
import { MAX_SKILLS } from "~lib/storage"
import { useSkills } from "~lib/useSkills"

import "./style.css"

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
  const { skills, canAdd, addSkill, updateSkill, removeSkill } = useSkills()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const hashHandledRef = useRef(false)

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

  const html = useMemo(
    () => renderMarkdown(selected?.content ?? ""),
    [selected?.content]
  )

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
    await navigator.clipboard.writeText(selected.content)
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold">Skill Clipboard</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Manage up to {MAX_SKILLS} reusable prompts. The popup shows their
              names so you can copy any of them in one click.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCopy}
              disabled={!selected}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
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
                value={selected.name}
                onChange={(e) =>
                  updateSkill(selected.id, { name: e.target.value })
                }
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

            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              <div className="flex min-w-0 flex-col">
                <label
                  htmlFor="md-editor"
                  className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Editor
                </label>
                <textarea
                  id="md-editor"
                  value={selected.content}
                  onChange={(e) =>
                    updateSkill(selected.id, { content: e.target.value })
                  }
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
