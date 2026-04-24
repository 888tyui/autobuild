#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import YAML from 'yaml'

const ROOT_DIR = path.resolve(import.meta.dirname, '..')
const SOURCES_PATH = path.join(ROOT_DIR, 'presets', 'reference-sources.yaml')

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--project') out.project = argv[++i]
    else if (a === '--queries') out.queries = argv[++i]
    else if (a === '--source-ids') out.sourceIds = argv[++i]
    else if (a === '--max-per-source') out.maxPerSource = Number(argv[++i])
    else if (a === '--headless') out.headless = argv[++i] !== 'false'
  }
  if (out.headless === undefined) out.headless = true
  return out
}

function applyTemplate(template, vars) {
  return template
    .replace(/\{\{mood\}\}/g, encodeURIComponent(vars.mood ?? ''))
    .replace(/\{\{category\}\}/g, encodeURIComponent(vars.category ?? ''))
    .replace(/\{\{query\}\}/g, encodeURIComponent(vars.query ?? ''))
}

function safeName(s, maxLen = 60) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen)
}

async function loadSources(filterIds) {
  const raw = await fs.readFile(SOURCES_PATH, 'utf8')
  const doc = YAML.parse(raw)
  const all = doc.sources ?? []
  if (!filterIds || filterIds.length === 0) return all
  const set = new Set(filterIds)
  return all.filter((s) => set.has(s.id))
}

async function captureSource({ page, source, query, outDir, maxItems }) {
  const url = applyTemplate(source.search_url, query)
  const captures = []
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  } catch (err) {
    return { error: `navigate: ${err.message}` }
  }

  await page.waitForTimeout(2500)

  if (source.capture === 'infinite_scroll') {
    const passes = source.scroll_passes ?? 2
    for (let i = 0; i < passes; i++) {
      await page.mouse.wheel(0, 1800)
      await page.waitForTimeout(1500)
    }
  }

  const limit = Math.min(maxItems ?? source.max_items ?? 6, source.max_items ?? 6)

  if (source.capture === 'full_page') {
    const file = `${safeName(source.id)}-${safeName(query.mood)}-${safeName(query.query, 30)}.png`
    const fullPath = path.join(outDir, file)
    await page.screenshot({ path: fullPath, fullPage: true })
    captures.push({
      source_id: source.id,
      url,
      mood: query.mood,
      query: query.query,
      file: path.relative(outDir, fullPath),
      kind: 'full_page',
    })
    return { captures }
  }

  const fileBase = `${safeName(source.id)}-${safeName(query.mood)}-${safeName(query.query, 30)}`
  for (let i = 0; i < limit; i++) {
    const file = `${fileBase}-${String(i + 1).padStart(2, '0')}.png`
    const fullPath = path.join(outDir, file)
    const y = 200 + i * 600
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y)
    await page.waitForTimeout(700)
    try {
      await page.screenshot({ path: fullPath, fullPage: false })
      captures.push({
        source_id: source.id,
        url,
        mood: query.mood,
        query: query.query,
        file: path.relative(outDir, fullPath),
        kind: 'viewport',
        scroll_y: y,
      })
    } catch (err) {
      captures.push({
        source_id: source.id,
        url,
        mood: query.mood,
        query: query.query,
        error: err.message,
      })
    }
  }
  return { captures }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.project) {
    console.error('Usage: reference-scraper.js --project <project_id> --queries <json> [--source-ids id1,id2] [--max-per-source N] [--headless true|false]')
    process.exit(2)
  }

  const projectStateDir = path.join(ROOT_DIR, 'state', args.project)
  const refsDir = path.join(projectStateDir, 'references')
  await fs.mkdir(refsDir, { recursive: true })

  const queries = JSON.parse(args.queries ?? '[]')
  if (!Array.isArray(queries) || queries.length === 0) {
    console.error('--queries must be a non-empty JSON array of {mood, query, category?} objects')
    process.exit(2)
  }

  const filterIds = args.sourceIds ? args.sourceIds.split(',').map((s) => s.trim()) : null
  const sources = await loadSources(filterIds)

  const browser = await chromium.launch({ headless: args.headless })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (autobuild reference scraper)',
  })
  const page = await ctx.newPage()

  const manifest = {
    project_id: args.project,
    captured_at: new Date().toISOString(),
    queries,
    sources_attempted: sources.map((s) => s.id),
    items: [],
    errors: [],
  }

  for (const source of sources) {
    const sourceDir = path.join(refsDir, source.id)
    await fs.mkdir(sourceDir, { recursive: true })
    for (const q of queries) {
      console.log(`[scraper] ${source.id} :: ${q.mood} / ${q.query}`)
      const res = await captureSource({
        page,
        source,
        query: q,
        outDir: sourceDir,
        maxItems: args.maxPerSource,
      })
      if (res.error) {
        manifest.errors.push({ source: source.id, query: q, error: res.error })
        console.error(`[scraper] ! ${source.id}: ${res.error}`)
        continue
      }
      for (const c of res.captures) {
        manifest.items.push({
          ...c,
          file: path.posix.join(source.id, c.file),
        })
      }
    }
  }

  await browser.close()

  const manifestPath = path.join(refsDir, 'manifest.json')
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
  console.log(`[scraper] wrote ${manifest.items.length} items, ${manifest.errors.length} errors → ${manifestPath}`)
}

main().catch((err) => {
  console.error('[scraper] fatal:', err)
  process.exit(1)
})
