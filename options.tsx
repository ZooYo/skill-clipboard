import { useStorage } from "@plasmohq/storage/hook"
import { useMemo, useState } from "react"

import { renderMarkdown } from "~lib/markdown"
import { DEFAULT_MARKDOWN, STORAGE_KEYS } from "~lib/storage"

import "./style.css"

function OptionsPage() {
  const [markdown, setMarkdown] = useStorage<string>(
    STORAGE_KEYS.markdown,
    (stored) => (typeof stored === "string" ? stored : DEFAULT_MARKDOWN)
  )

  const [justCopied, setJustCopied] = useState(false)

  const html = useMemo(() => renderMarkdown(markdown ?? ""), [markdown])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(markdown ?? "")
    setJustCopied(true)
    setTimeout(() => setJustCopied(false), 1500)
  }

  const handleReset = () => {
    if (confirm("Reset to the starter template? Your current text will be lost.")) {
      setMarkdown(DEFAULT_MARKDOWN)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold">Skill Clipboard</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Edit your reusable markdown. The popup always copies the latest version.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              Reset
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
              {justCopied ? "Copied!" : "Copy markdown"}
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 py-6 md:grid-cols-2">
        <div className="flex flex-col">
          <label
            htmlFor="md-editor"
            className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Editor
          </label>
          <textarea
            id="md-editor"
            value={markdown ?? ""}
            onChange={(event) => setMarkdown(event.target.value)}
            spellCheck={false}
            className="min-h-[70vh] w-full resize-y rounded-md border border-slate-300 bg-white p-3 font-mono text-sm leading-relaxed text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="flex flex-col">
          <span className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Preview
          </span>
          <article
            className="preview min-h-[70vh] overflow-auto rounded-md border border-slate-200 bg-white p-4 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </section>
    </main>
  )
}

export default OptionsPage
