import { useEffect, useRef, useState } from "react"

import { useSkills } from "~lib/useSkills"

import "./style.css"

function openOptionsAt(hash?: string) {
  const url = chrome.runtime.getURL("options.html") + (hash ? `#${hash}` : "")
  // Use chrome.tabs.create so we can pass a hash; openOptionsPage strips it.
  if (chrome.tabs?.create) {
    chrome.tabs.create({ url })
  } else {
    window.open(url, "_blank")
  }
}

function Popup() {
  const { skills } = useSkills()
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current)
    }
  }, [])

  const handleCopy = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(id)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopiedId(null), 1500)
    } catch {
      setCopiedId(null)
    }
  }

  const copiedSkill = skills.find((s) => s.id === copiedId)

  return (
    <div className="flex w-[340px] flex-col bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <h1 className="text-sm font-semibold">Skill Clipboard</h1>
        <button
          type="button"
          onClick={() => openOptionsAt()}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
          Manage
        </button>
      </header>

      {skills.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No skills yet.
          </p>
          <button
            type="button"
            onClick={() => openOptionsAt("/new")}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
            Create one
          </button>
        </div>
      ) : (
        <ul className="flex max-h-[420px] flex-col divide-y divide-slate-200 overflow-y-auto dark:divide-slate-800">
          {skills.map((skill) => {
            const isCopied = copiedId === skill.id
            const displayName = skill.name.trim() || "Untitled"
            return (
              <li
                key={skill.id}
                className="flex items-stretch hover:bg-slate-50 dark:hover:bg-slate-900">
                <button
                  type="button"
                  onClick={() => handleCopy(skill.id, skill.content)}
                  title="Click to copy"
                  className="flex flex-1 items-center justify-between px-4 py-2.5 text-left text-sm">
                  <span className="truncate font-medium">{displayName}</span>
                  <span
                    className={`ml-3 shrink-0 text-xs ${
                      isCopied
                        ? "text-green-600 dark:text-green-400"
                        : "text-slate-400"
                    }`}>
                    {isCopied ? "Copied" : "Copy"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => openOptionsAt(`/skill/${skill.id}`)}
                  title="Edit"
                  aria-label={`Edit ${displayName}`}
                  className="flex items-center px-3 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                  </svg>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <footer className="min-h-[28px] border-t border-slate-200 px-4 py-1.5 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        {copiedSkill
          ? `Copied "${copiedSkill.name.trim() || "Untitled"}"`
          : `${skills.length} / 10 skills`}
      </footer>
    </div>
  )
}

export default Popup
