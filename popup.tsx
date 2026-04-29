import { useStorage } from "@plasmohq/storage/hook"
import { useState } from "react"

import { DEFAULT_MARKDOWN, STORAGE_KEYS } from "~lib/storage"

import "./style.css"

function Popup() {
  const [markdown] = useStorage<string>(
    STORAGE_KEYS.markdown,
    (stored) => (typeof stored === "string" ? stored : DEFAULT_MARKDOWN)
  )

  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(markdown ?? "")
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const openEditor = () => {
    chrome.runtime.openOptionsPage()
  }

  const charCount = (markdown ?? "").length
  const lineCount = (markdown ?? "").split("\n").length

  return (
    <div className="flex w-[360px] flex-col gap-3 bg-white p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="flex items-center justify-between">
        <h1 className="text-base font-semibold">Skill Clipboard</h1>
        <span className="text-xs text-slate-500">
          {lineCount} lines · {charCount} chars
        </span>
      </header>

      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-2 text-xs leading-relaxed dark:border-slate-800 dark:bg-slate-900">
        {markdown || "(empty)"}
      </pre>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="flex-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          disabled={!markdown}>
          {copied ? "Copied!" : "Copy as prompt"}
        </button>
        <button
          type="button"
          onClick={openEditor}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
          Edit
        </button>
      </div>
    </div>
  )
}

export default Popup
