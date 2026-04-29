// Centralised storage keys so popup and options never disagree on names.
export const STORAGE_KEYS = {
  markdown: "skill-clipboard:markdown"
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
