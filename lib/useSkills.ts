import { Storage } from "@plasmohq/storage"
import { useStorage } from "@plasmohq/storage/hook"
import { useCallback, useEffect, useRef } from "react"

import {
  COMMAND_PATTERN,
  createSkill,
  DEFAULT_PREFIX,
  DEFAULT_SKILLS_STATE,
  MAX_SKILLS,
  parseSkillsState,
  PREFIX_PATTERN,
  slugify,
  STORAGE_KEYS,
  type Skill,
  type SkillsState
} from "./storage"

export type CommandValidation =
  | { ok: true; reason?: never; conflictName?: never }
  | { ok: false; reason: "format" }
  | { ok: false; reason: "duplicate"; conflictName: string }

export type PrefixValidation =
  | { ok: true }
  | { ok: false; reason: "format" }

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
  const prefix = state?.prefix ?? DEFAULT_PREFIX

  const addSkill = useCallback(
    (init?: Partial<Pick<Skill, "name" | "content" | "command">>): Skill | null => {
      const current = state?.skills ?? []
      if (current.length >= MAX_SKILLS) return null
      const skill = createSkill(
        init?.name ?? "Untitled",
        init?.content ?? "",
        init?.command
      )
      setState({
        ...(state ?? DEFAULT_SKILLS_STATE),
        version: 1,
        skills: [...current, skill]
      })
      return skill
    },
    [state, setState]
  )

  const updateSkill = useCallback(
    (id: string, patch: Partial<Pick<Skill, "name" | "content" | "command">>) => {
      const current = state?.skills ?? []
      setState({
        ...(state ?? DEFAULT_SKILLS_STATE),
        version: 1,
        skills: current.map((s) => {
          if (s.id !== id) return s
          const next: Skill = { ...s, ...patch }

          if ("command" in patch) {
            // Caller explicitly set the command; treat as manual override.
            // Normalise empty/blank to undefined so storage stays clean.
            if (
              next.command === undefined ||
              next.command === null ||
              (typeof next.command === "string" && next.command.trim() === "")
            ) {
              delete next.command
            }
            return next
          }

          // Name changed without an explicit command: auto-sync the command
          // from the new name iff the current command was either empty or
          // matched slug(old name). If user has manually set a custom
          // command, leave it alone.
          if ("name" in patch && patch.name !== s.name) {
            const oldSlug = slugify(s.name)
            const currentCmd = s.command ?? ""
            if (currentCmd === "" || currentCmd === oldSlug) {
              const newSlug = slugify(patch.name ?? "")
              if (newSlug) {
                next.command = newSlug
              } else {
                delete next.command
              }
            }
          }

          return next
        })
      })
    },
    [state, setState]
  )

  const removeSkill = useCallback(
    (id: string) => {
      const current = state?.skills ?? []
      setState({
        ...(state ?? DEFAULT_SKILLS_STATE),
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
      setState({
        ...(state ?? DEFAULT_SKILLS_STATE),
        version: 1,
        skills: next
      })
    },
    [state, setState]
  )

  const setPrefix = useCallback(
    (next: string): boolean => {
      if (!PREFIX_PATTERN.test(next)) return false
      setState({
        ...(state ?? DEFAULT_SKILLS_STATE),
        version: 1,
        skills: state?.skills ?? DEFAULT_SKILLS_STATE.skills,
        prefix: next
      })
      return true
    },
    [state, setState]
  )

  const validatePrefix = useCallback((value: string): PrefixValidation => {
    return PREFIX_PATTERN.test(value)
      ? { ok: true }
      : { ok: false, reason: "format" }
  }, [])

  const validateCommand = useCallback(
    (raw: string, exceptId?: string): CommandValidation => {
      const value = raw.trim()
      if (!value) return { ok: true } // empty == disabled, no error
      if (!COMMAND_PATTERN.test(value)) return { ok: false, reason: "format" }
      const lower = value.toLowerCase()
      const conflict = (state?.skills ?? []).find(
        (s) =>
          s.id !== exceptId &&
          typeof s.command === "string" &&
          s.command.toLowerCase() === lower
      )
      if (conflict) {
        return {
          ok: false,
          reason: "duplicate",
          conflictName: conflict.name.trim() || "Untitled"
        }
      }
      return { ok: true }
    },
    [state]
  )

  return {
    state: state ?? DEFAULT_SKILLS_STATE,
    skills,
    prefix,
    canAdd: skills.length < MAX_SKILLS,
    addSkill,
    updateSkill,
    removeSkill,
    reorderSkill,
    setPrefix,
    validatePrefix,
    validateCommand
  }
}
