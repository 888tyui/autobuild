import fs from 'node:fs/promises'
import path from 'node:path'

const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const CYAN = '\x1b[36m'
const MAGENTA = '\x1b[35m'

function ts() {
  return new Date().toISOString().slice(11, 19)
}

function fmt(level, color, msg, scope) {
  const head = `${DIM}${ts()}${RESET} ${color}${BOLD}${level.padEnd(5)}${RESET}`
  const tag = scope ? ` ${MAGENTA}[${scope}]${RESET}` : ''
  return `${head}${tag} ${msg}`
}

export function createLogger(scope) {
  return {
    info: (msg) => console.log(fmt('INFO', CYAN, msg, scope)),
    ok: (msg) => console.log(fmt('OK', GREEN, msg, scope)),
    warn: (msg) => console.log(fmt('WARN', YELLOW, msg, scope)),
    error: (msg) => console.error(fmt('ERROR', RED, msg, scope)),
    sub: (subScope) => createLogger(scope ? `${scope}/${subScope}` : subScope),
  }
}

export async function appendCycleLog(ctx, line) {
  if (ctx?.dryRun) return
  const logPath = path.join(ctx.stateDir, 'cycle.log')
  await fs.appendFile(logPath, `[${new Date().toISOString()}] ${line}\n`, 'utf8')
}

export const log = createLogger()
