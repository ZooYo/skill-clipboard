import { Storage } from "@plasmohq/storage"

import { createSkill, STORAGE_KEYS, type SkillsState } from "./storage"

// Idempotent one-shot migration into chrome.storage.local. Each surface
// (options page, popup, content scripts) calls this on startup so the
// move happens regardless of which surface the user opens first.
//
// Steps, in order:
//   1. sync -> local: pre-local versions kept everything in
//      chrome.storage.sync. Move it over once and clear the old slot.
//   2. legacy single-markdown -> SkillsState: even older versions kept
//      one markdown string under a different key.
//
// The function bails early if local already has the new key, so repeat
// callers (and races between surfaces) are safe.
export async function migrateToLocalIfNeeded(): Promise<void> {
  const local = new Storage({ area: "local" })
  const existing = await local.get(STORAGE_KEYS.skills)
  if (existing) return

  const sync = new Storage({ area: "sync" })

  const fromSync = await sync.get(STORAGE_KEYS.skills)
  if (fromSync) {
    await local.set(STORAGE_KEYS.skills, fromSync)
    await sync.remove(STORAGE_KEYS.skills)
    return
  }

  const legacy = await sync.get<string>(STORAGE_KEYS.legacyMarkdown)
  if (typeof legacy !== "string" || legacy.length === 0) return

  const migrated: SkillsState = {
    version: 1,
    skills: [createSkill("My Prompt", legacy)]
  }
  await local.set(STORAGE_KEYS.skills, migrated)
  await sync.remove(STORAGE_KEYS.legacyMarkdown)
}
