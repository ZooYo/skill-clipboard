import { Storage } from "@plasmohq/storage"
import { useStorage } from "@plasmohq/storage/hook"
import { useCallback, useEffect, useRef } from "react"

import {
  createSkill,
  DEFAULT_SKILLS_STATE,
  MAX_SKILLS,
  parseSkillsState,
  STORAGE_KEYS,
  type Skill,
  type SkillsState
} from "./storage"

// One-time migration: if the new key is empty but the legacy single-markdown
// key still has content, fold it into a single named skill and drop the old
// key so we don't keep re-importing it.
async function migrateLegacyIfNeeded() {
  const storage = new Storage()
  const existing = await storage.get(STORAGE_KEYS.skills)
  if (existing) return

  const legacy = await storage.get<string>(STORAGE_KEYS.legacyMarkdown)
  if (typeof legacy !== "string" || legacy.length === 0) return

  const migrated: SkillsState = {
    version: 1,
    skills: [createSkill("My Prompt", legacy)]
  }
  await storage.set(STORAGE_KEYS.skills, migrated)
  await storage.remove(STORAGE_KEYS.legacyMarkdown)
}

export function useSkills() {
  const [state, setState] = useStorage<SkillsState>(
    STORAGE_KEYS.skills,
    (stored) => parseSkillsState(stored)
  )

  const migratedRef = useRef(false)
  useEffect(() => {
    if (migratedRef.current) return
    migratedRef.current = true
    migrateLegacyIfNeeded().catch(() => {
      // Migration is best-effort; defaults still work.
    })
  }, [])

  const skills = state?.skills ?? DEFAULT_SKILLS_STATE.skills

  const addSkill = useCallback(
    (init?: Partial<Pick<Skill, "name" | "content">>): Skill | null => {
      const current = state?.skills ?? []
      if (current.length >= MAX_SKILLS) return null
      const skill = createSkill(init?.name ?? "Untitled", init?.content ?? "")
      setState({
        version: 1,
        skills: [...current, skill]
      })
      return skill
    },
    [state, setState]
  )

  const updateSkill = useCallback(
    (id: string, patch: Partial<Pick<Skill, "name" | "content">>) => {
      const current = state?.skills ?? []
      setState({
        version: 1,
        skills: current.map((s) => (s.id === id ? { ...s, ...patch } : s))
      })
    },
    [state, setState]
  )

  const removeSkill = useCallback(
    (id: string) => {
      const current = state?.skills ?? []
      setState({
        version: 1,
        skills: current.filter((s) => s.id !== id)
      })
    },
    [state, setState]
  )

  const reorderSkill = useCallback(
    (id: string, dir: "up" | "down") => {
      const current = state?.skills ?? []
      const idx = current.findIndex((s) => s.id === id)
      if (idx < 0) return
      const target = dir === "up" ? idx - 1 : idx + 1
      if (target < 0 || target >= current.length) return
      const next = current.slice()
      ;[next[idx], next[target]] = [next[target], next[idx]]
      setState({ version: 1, skills: next })
    },
    [state, setState]
  )

  return {
    state: state ?? DEFAULT_SKILLS_STATE,
    skills,
    canAdd: skills.length < MAX_SKILLS,
    addSkill,
    updateSkill,
    removeSkill,
    reorderSkill
  }
}
