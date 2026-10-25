// Writes cloud-setup-script.sh: a setup script that installs the Shabbat guard for every Claude
// Code session it runs in (user settings in ~/.claude), whatever repository the session works on.
// Paste the result into a cloud environment's Setup script, or run it once on your own computer.
// Run again after changing shabbat-guard.mjs: node .claude/hooks/make-setup-script.mjs
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const here = new URL('.', import.meta.url)

export function setupScript() {
  const guard = readFileSync(new URL('shabbat-guard.mjs', here), 'utf8')
  return `#!/bin/bash
# Shabbat guard for every Claude Code session on this machine (made by make-setup-script.mjs in
# pixel-studio). It blocks all work from Friday afternoon until Saturday night in New York.
# To change the margins, edit SETTINGS below (hoursBeforeFridaySunset, hoursAfterSaturdaySunset).
mkdir -p "$HOME/.claude/hooks"
cat > "$HOME/.claude/hooks/shabbat-guard.mjs" <<'SHABBAT_GUARD_EOF'
${guard}SHABBAT_GUARD_EOF
node - <<'SHABBAT_SETTINGS_EOF'
const fs = require('fs')
const path = require('path')
const file = path.join(process.env.HOME, '.claude', 'settings.json')
let settings = {}
try { settings = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {}
const command = 'node "$HOME/.claude/hooks/shabbat-guard.mjs"'
settings.hooks = settings.hooks || {}
for (const event of ['SessionStart', 'UserPromptSubmit', 'PreToolUse']) {
  const groups = (settings.hooks[event] || []).filter((g) => !(g.hooks || []).some((h) => h.command === command))
  groups.push(event === 'PreToolUse' ? { matcher: '*', hooks: [{ type: 'command', command }] } : { hooks: [{ type: 'command', command }] })
  settings.hooks[event] = groups
}
fs.writeFileSync(file, JSON.stringify(settings, null, 2) + '\\n')
console.log('Shabbat guard installed in ' + file)
SHABBAT_SETTINGS_EOF
`
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  writeFileSync(new URL('cloud-setup-script.sh', here), setupScript())
}
