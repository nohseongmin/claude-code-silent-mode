#!/usr/bin/env node
// trappist — Claude Code hook. One file, two entry points:
//   node trappist.js session   SessionStart:      inject the ruleset once
//   node trappist.js prompt    UserPromptSubmit:  track /trappist, re-anchor each turn
//
// Hooks must always exit 0. A crashing hook blocks the session, and no token
// saving is worth that, so every failure path here is swallowed deliberately.

const fs = require('fs');
const path = require('path');
const os = require('os');

const MODES = ['lite', 'full', 'ultra'];
const OFF = 'off';
const MAX_FLAG_BYTES = 16;

const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const flagPath = path.join(configDir, '.trappist-mode');

// Per-turn re-anchor. Kept short on purpose: this is input cost on every single
// message, so it has to stay far cheaper than the prose it prevents.
const REMINDER = {
  lite: 'TRAPPIST ACTIVE (lite). No preamble, no narration between tool calls, no closing summary. End with a receipt line plus at most two lines of why.',
  full: 'TRAPPIST ACTIVE (full). No preamble, no narration between tool calls, no closing summary. End with only: `\u2713 <what> \u00b7 <files> \u00b7 <check>` and an optional `next:` line. Break silence for destructive actions, security, failure or partial work, and direct questions.',
  ultra: 'TRAPPIST ACTIVE (ultra). Zero prose. One receipt line: `\u2713 <what> \u00b7 <check>`. Break silence only for destructive actions, security, failure or partial work, and direct questions.'
};

function envDefault() {
  const v = (process.env.TRAPPIST_MODE || '').trim().toLowerCase();
  if (v === OFF) return OFF;
  return MODES.includes(v) ? v : 'full';
}

// Whitelist on read: the flag file is user-writable, and its contents end up in
// model context. Never echo bytes we did not put there, and never follow a
// symlink pointing at something like ~/.ssh/id_rsa.
function readMode() {
  try {
    const st = fs.lstatSync(flagPath);
    if (!st.isFile() || st.size > MAX_FLAG_BYTES) return null;
    const v = fs.readFileSync(flagPath, 'utf8').trim().toLowerCase();
    return v === OFF || MODES.includes(v) ? v : null;
  } catch { return null; }
}

function writeMode(mode) {
  try { if (fs.lstatSync(flagPath).isSymbolicLink()) fs.unlinkSync(flagPath); } catch {}
  try { fs.writeFileSync(flagPath, mode, { mode: 0o600 }); } catch {}
}

// SKILL.md is the single source of truth for behavior, so the SessionStart hook
// reads it instead of duplicating the rules here. The intensity table and the
// example lines are filtered down to the active level — the other levels are
// pure context cost.
function rules(mode) {
  const roots = [];
  if (process.env.CLAUDE_PLUGIN_ROOT) roots.push(process.env.CLAUDE_PLUGIN_ROOT);
  roots.push(path.join(__dirname, '..'));

  let body = '';
  for (const root of roots) {
    try {
      body = fs.readFileSync(path.join(root, 'skills', 'trappist', 'SKILL.md'), 'utf8');
      break;
    } catch {}
  }
  if (!body) return 'TRAPPIST MODE ACTIVE \u2014 level: ' + mode + '\n\n' + REMINDER[mode];

  const kept = body
    .replace(/^---[\s\S]*?---\s*/, '')
    .split('\n')
    .filter(line => {
      const row = line.match(/^\|\s*\*\*(\S+?)\*\*\s*\|/);      // intensity table row
      if (row) return row[1] === mode;
      const ex = line.match(/^- (\S+?):\s/);                    // per-level example
      if (ex) return !MODES.includes(ex[1]) || ex[1] === mode;
      return true;
    })
    .join('\n');

  return 'TRAPPIST MODE ACTIVE \u2014 level: ' + mode + '\n\n' + kept;
}

// Returns the mode this prompt selects, or null if the prompt says nothing about it.
function parse(prompt) {
  const p = prompt.trim().toLowerCase().replace(/\s+/g, ' ');

  // Marketplace installs namespace commands as /trappist:trappist.
  const cmd = /^\/trappist(?::trappist)?(?:\s+(\S+))?/.exec(p);
  if (cmd) {
    const arg = cmd[1];
    if (!arg) return 'full';
    if (['off', 'stop', 'disable'].includes(arg)) return OFF;
    return MODES.includes(arg) ? arg : null;
  }

  if (/\b(stop|disable|deactivate|quit|exit) (the )?trappist\b/.test(p) ||
      /\btrappist( mode)? off\b/.test(p) ||
      /^(please )?(go |back to |switch (back )?to )?normal mode\b/.test(p) ||
      /(설명해 ?줘|자세히 설명|설명 필요)/.test(p)) return OFF;

  // Questions are never commands. The trailing '?' catches languages whose
  // interrogatives do not sit at the front of the sentence.
  if (/\?\s*$/.test(p) ||
      /^(what|whats|what's|how|why|when|does|do|is|are|can|should|explain|tell me)\b/.test(p)) return null;

  // Intent triggers. The hook catches the explicit phrasings deterministically;
  // everything else is left to ordinary skill matching on the description.
  if (/\b(activate|enable|start|turn on|use|switch to) trappist\b/.test(p) ||
      /^trappist( mode)?[.!]*$/.test(p) ||
      /\b(silent mode|quiet mode|work silently|work quietly|stop narrating|stop explaining|no narration|no commentary|results? only|just the results?|skip the explanation|less talk)\b/.test(p) ||
      /(결과물만|결과만|설명 ?말고|설명하지 ?말|말 ?그만|조용히|브리핑 ?말고|요약 ?말고|침묵 ?모드)/.test(p)) return 'full';

  return null;
}

const entry = process.argv[2];

if (entry === 'session') {
  const mode = readMode() || envDefault();
  if (mode === OFF) process.exit(0);
  writeMode(mode);
  process.stdout.write(rules(mode));
  process.exit(0);
}

if (entry === 'prompt') {
  let input = '';
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('error', () => process.exit(0));
  process.stdin.on('end', () => {
    let mode = readMode() || envDefault();
    try {
      const picked = parse(JSON.parse(input).prompt || '');
      if (picked) { mode = picked; writeMode(mode); }
    } catch {}
    if (mode === OFF) process.exit(0);
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: REMINDER[mode]
      }
    }));
    process.exit(0);
  });
}

module.exports = { parse, rules, readMode, writeMode, MODES, REMINDER };
