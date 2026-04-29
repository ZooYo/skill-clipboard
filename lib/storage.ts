export const MAX_SKILLS = 10

export type Skill = {
  id: string
  name: string
  content: string
}

export type SkillsState = {
  version: 1
  skills: Skill[]
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

export function createSkill(
  name: string = "Untitled",
  content: string = ""
): Skill {
  return { id: generateId(), name, content }
}

export const DEFAULT_SKILLS_STATE: SkillsState = {
  version: 1,
  skills: [createSkill("My Prompt", DEFAULT_MARKDOWN)]
}

function isSkill(value: unknown): value is Skill {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.content === "string"
  )
}

function isSkillsState(value: unknown): value is SkillsState {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return v.version === 1 && Array.isArray(v.skills) && v.skills.every(isSkill)
}

// Plasmo storage hydrator. Handles three cases:
//  1. New JSON format already present.
//  2. Legacy single-string markdown lingering on the new key (defensive).
//  3. Nothing yet -> defaults.
export function parseSkillsState(stored: unknown): SkillsState {
  if (isSkillsState(stored)) {
    return {
      version: 1,
      skills: stored.skills.slice(0, MAX_SKILLS)
    }
  }
  if (typeof stored === "string" && stored.length > 0) {
    return {
      version: 1,
      skills: [createSkill("My Prompt", stored)]
    }
  }
  return DEFAULT_SKILLS_STATE
}
