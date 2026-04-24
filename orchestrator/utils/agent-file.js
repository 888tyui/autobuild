import fs from 'node:fs/promises'
import path from 'node:path'
import YAML from 'yaml'

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/

export async function readAgentFile(rootDir, agentName) {
  const filePath = path.join(rootDir, '.claude', 'agents', `${agentName}.md`)
  const raw = await fs.readFile(filePath, 'utf8')
  const m = raw.match(FRONTMATTER_RE)
  if (!m) {
    throw new Error(`Agent file ${agentName}.md is missing frontmatter`)
  }
  const meta = YAML.parse(m[1])
  const body = m[2].trim()

  const tools = parseToolList(meta.tools)
  const model = normalizeModel(meta.model)

  return { meta, body, tools, model, filePath }
}

function parseToolList(value) {
  if (!value) return undefined
  if (Array.isArray(value)) return value.map((s) => String(s).trim()).filter(Boolean)
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function normalizeModel(value) {
  if (!value) return 'sonnet'
  const v = String(value).trim().toLowerCase()
  if (v === 'sonnet' || v === 'opus' || v === 'haiku') return v
  return value
}
