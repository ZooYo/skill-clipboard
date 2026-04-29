export const MAX_SKILLS = 10

export const DEFAULT_PREFIX = ";"

// command tokens: 1-32 chars, alphanumeric + underscore + dash.
export const COMMAND_PATTERN = /^[a-zA-Z0-9_-]{1,32}$/

// prefix: 1-3 visible non-alphanumeric/non-whitespace ASCII chars.
// We deliberately exclude alphanumerics so commands are visually distinct
// from regular text, and exclude whitespace so the trigger is unambiguous.
export const PREFIX_PATTERN = /^[!-/:-@[-`{-~]{1,3}$/

export type Skill = {
  id: string
  name: string
  content: string
  command?: string
}

export type SkillsState = {
  version: 1
  skills: Skill[]
  prefix?: string
}

export const STORAGE_KEYS = {
  skills: "skill-clipboard:skills:v1",
  legacyMarkdown: "skill-clipboard:markdown"
} as const

export const DEFAULT_MARKDOWN = `# My Prompt

Write your reusable prompt here. Anything you save will appear in the popup,
so you can paste it straight into an AI chat.

- Bullet points work
- **Bold**, *italic*, \`inline code\`
- Code fences:

\`\`\`ts
const greet = (name: string) => \`Hello, \${name}!\`
\`\`\`
`

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  // Fallback for older runtimes; not cryptographically strong but unique enough.
  return `skill_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

// Convert a skill name into a valid command token. Non-allowed characters
// (incl. spaces and CJK) collapse into underscores; result is trimmed of
// leading/trailing underscores, capped at 32 chars, and may be empty.
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    .slice(0, 32)
}

export function createSkill(
  name: string = "Untitled",
  content: string = "",
  command?: string
): Skill {
  const skill: Skill = { id: generateId(), name, content }
  // If caller didn't specify a command, default to slugified name.
  // Empty slug (e.g. all CJK) means no command.
  const resolved = command !== undefined ? command : slugify(name)
  if (resolved) skill.command = resolved
  return skill
}

export const DEFAULT_SKILLS_STATE: SkillsState = {
  version: 1,
  skills: [createSkill("My Prompt", DEFAULT_MARKDOWN)],
  prefix: DEFAULT_PREFIX
}

function isSkill(value: unknown): value is Skill {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  if (
    typeof v.id !== "string" ||
    typeof v.name !== "string" ||
    typeof v.content !== "string"
  ) {
    return false
  }
  if (v.command !== undefined && typeof v.command !== "string") return false
  return true
}

function isSkillsState(value: unknown): value is SkillsState {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  if (v.version !== 1) return false
  if (!Array.isArray(v.skills) || !v.skills.every(isSkill)) return false
  if (v.prefix !== undefined && typeof v.prefix !== "string") return false
  return true
}

function sanitizeCommand(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  return COMMAND_PATTERN.test(trimmed) ? trimmed : undefined
}

function sanitizePrefix(raw: unknown): string {
  if (typeof raw === "string" && PREFIX_PATTERN.test(raw)) return raw
  return DEFAULT_PREFIX
}

// Plasmo storage hydrator. Handles three cases:
//  1. New JSON format already present.
//  2. Legacy single-string markdown lingering on the new key (defensive).
//  3. Nothing yet -> defaults.
export function parseSkillsState(stored: unknown): SkillsState {
  if (isSkillsState(stored)) {
    return {
      version: 1,
      skills: stored.skills.slice(0, MAX_SKILLS).map((s) => {
        const cleaned: Skill = { id: s.id, name: s.name, content: s.content }
        const cmd = sanitizeCommand(s.command)
        if (cmd) cleaned.command = cmd
        return cleaned
      }),
      prefix: sanitizePrefix(stored.prefix)
    }
  }
  if (typeof stored === "string" && stored.length > 0) {
    return {
      version: 1,
      skills: [createSkill("My Prompt", stored)],
      prefix: DEFAULT_PREFIX
    }
  }
  return DEFAULT_SKILLS_STATE
}
