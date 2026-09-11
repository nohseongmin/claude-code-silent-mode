#!/usr/bin/env node
// measure.js — how much of your agent's output is prose, measured on your own
// Claude Code transcripts. Token counts are not estimated: every transcript
// records the real `usage.output_tokens` the API billed for.
//
//   node tools/measure.js                 # all sessions under ~/.claude/projects
//   node tools/measure.js --dir <path>    # somewhere else
//   node tools/measure.js --json          # machine-readable
//
// Method, stated plainly so the numbers can be argued with:
//   visible output = output_tokens - thinking_tokens        (real, from usage)
//   that total is split between `text` and `tool_use` blocks in proportion to
//   their serialized character counts — the one approximation here.
//   Prose = the text blocks. Work = the tool calls.
//
// The vow simulation is an upper bound, not a measurement: mid-turn narration
// goes to zero, and the turn's final text block collapses to a receipt.

const fs = require('fs');
const path = require('path');
const os = require('os');

const RECEIPT_TOKENS = 25;          // "✓ <what> · <files> · <check>" + "next: <cmd>"
const MAX_FILE_BYTES = 200 * 1024 * 1024;

function walk(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.jsonl')) out.push(p);
  }
  return out;
}

const chars = blocks => blocks.reduce((n, b) => n + JSON.stringify(b).length, 0);

// A record of type 'user' is a real user turn only when it is not a tool result
// being fed back to the model.
function isUserTurn(rec) {
  if (rec.type !== 'user') return false;
  const c = rec.message && rec.message.content;
  if (typeof c === 'string') return true;
  return Array.isArray(c) && !c.some(b => b.type === 'tool_result');
}

function measureFile(file) {
  if (fs.statSync(file).size > MAX_FILE_BYTES) return null;

  const acc = { prose: 0, work: 0, thinking: 0, turns: 0, messages: 0, saved: 0, perTurn: [] };
  let turn = [];   // prose token counts of the assistant messages in the open turn

  const closeTurn = () => {
    if (!turn.length) return;
    acc.turns++;
    acc.perTurn.push(turn.reduce((a, b) => a + b, 0));
    const last = turn[turn.length - 1];
    const narration = turn.slice(0, -1).reduce((a, b) => a + b, 0);
    acc.saved += narration + Math.max(0, last - RECEIPT_TOKENS);
    turn = [];
  };

  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }

    if (isUserTurn(rec)) { closeTurn(); continue; }
    if (rec.type !== 'assistant' || !rec.message || !rec.message.usage) continue;

    const usage = rec.message.usage;
    const think = (usage.output_tokens_details && usage.output_tokens_details.thinking_tokens) || 0;
    const visible = Math.max(0, (usage.output_tokens || 0) - think);
    const blocks = rec.message.content || [];
    const text = blocks.filter(b => b.type === 'text');
    const tools = blocks.filter(b => b.type === 'tool_use');
    const denom = chars(text) + chars(tools);

    acc.thinking += think;
    acc.messages++;
    if (!denom) continue;

    const prose = Math.round(visible * (chars(text) / denom));
    acc.prose += prose;
    acc.work += visible - prose;
    if (prose > 0) turn.push(prose);
  }
  closeTurn();

  return acc.messages ? acc : null;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const dirArg = args[args.indexOf('--dir') + 1];
  const root = args.includes('--dir') && dirArg
    ? dirArg
    : path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects');

  const files = walk(root);
  const total = { prose: 0, work: 0, thinking: 0, turns: 0, messages: 0, saved: 0, sessions: 0 };
  const perTurn = [];
  for (const f of files) {
    const m = measureFile(f);
    if (!m) continue;
    total.sessions++;
    for (const k of ['prose', 'work', 'thinking', 'turns', 'messages', 'saved']) total[k] += m[k];
    perTurn.push(...m.perTurn);
  }

  const visible = total.prose + total.work;
  const pct = (n, d) => (d ? (100 * n / d) : 0);
  const proseShare = pct(total.prose, visible);
  perTurn.sort((a, b) => a - b);
  const median = perTurn.length ? perTurn[Math.floor(perTurn.length / 2)] : 0;
  const cut = pct(total.saved, visible);

  if (asJson) {
    const { perTurn: _drop, ...rest } = total;
    console.log(JSON.stringify({ ...rest, visible, proseShare, cut, medianProsePerTurn: median }, null, 2));
  } else if (!visible) {
    console.log('No transcripts with usage data found under ' + root);
  } else {
    const bar = p => '\u2588'.repeat(Math.round(p / 10)) + '\u2591'.repeat(10 - Math.round(p / 10));
    const k = n => (n / 1000).toFixed(1) + 'k';
    console.log('');
    console.log('  ' + total.sessions + ' sessions \u00b7 ' + total.turns + ' turns \u00b7 ' + total.messages + ' assistant messages');
    console.log('  ' + k(visible) + ' visible output tokens (thinking excluded: ' + k(total.thinking) + ')');
    console.log('');
    console.log('  prose   ' + bar(proseShare) + ' ' + proseShare.toFixed(1).padStart(5) + '%  ' + k(total.prose));
    console.log('  work    ' + bar(100 - proseShare) + ' ' + (100 - proseShare).toFixed(1).padStart(5) + '%  ' + k(total.work));
    console.log('');
    console.log('  median turn spends ' + median + ' tokens talking; a receipt is ' + RECEIPT_TOKENS);
    console.log('');
    console.log('  under the vow, at most ' + k(total.saved) + ' of that prose goes away');
    console.log('  = ' + cut.toFixed(1) + '% of visible output tokens, ' + pct(total.saved, total.prose).toFixed(1) + '% of the prose itself');
    console.log('');
  }
}

module.exports = { walk, isUserTurn, measureFile, RECEIPT_TOKENS };
