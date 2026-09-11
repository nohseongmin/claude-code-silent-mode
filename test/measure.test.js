const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MEASURE = path.join(__dirname, '..', 'tools', 'measure.js');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'measure-'));
}

function writeSession(dir, name, records) {
  fs.writeFileSync(path.join(dir, name), records.map(r => JSON.stringify(r)).join('\n'));
}

function run(dir, extraArgs = []) {
  return execFileSync(process.execPath, [MEASURE, '--dir', dir, ...extraArgs], { encoding: 'utf8' });
}

function runJson(dir) {
  return JSON.parse(run(dir, ['--json']));
}

// Session 1 exercises isUserTurn (a tool_result feed-back must NOT close the
// turn, a real user message must) and closeTurn's saved calculation.
// msg1 (10) + msg2 (20) stay in one turn, closed by the real user message;
// msg3 (5) is closed at end-of-file instead of being dropped.
const SESSION_1 = [
  { type: 'assistant', message: { usage: { output_tokens: 10 }, content: [{ type: 'text', text: 'aaa' }] } },
  { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] } },
  { type: 'assistant', message: { usage: { output_tokens: 20 }, content: [{ type: 'text', text: 'bbb' }] } },
  { type: 'user', message: { content: 'real user message' } },
  { type: 'assistant', message: { usage: { output_tokens: 5 }, content: [{ type: 'text', text: 'ccc' }] } }
];

// Session 2 exercises the prose/work split (text-only vs tool_use-only
// blocks), thinking-token exclusion, and a message with no content blocks
// (must count toward messages/thinking but not prose/work).
const SESSION_2 = [
  { type: 'assistant', message: { usage: { output_tokens: 15 }, content: [{ type: 'tool_use', name: 'Bash', input: {} }] } },
  { type: 'assistant', message: { usage: { output_tokens: 50, output_tokens_details: { thinking_tokens: 20 } }, content: [{ type: 'text', text: 'x' }] } },
  { type: 'assistant', message: { usage: { output_tokens: 999 }, content: [] } },
  { type: 'user', message: { content: 'closing' } }
];

test('isUserTurn ignores tool_result feedback and closeTurn banks unfinished turns', () => {
  const dir = tmpDir();
  writeSession(dir, 'session1.jsonl', SESSION_1);
  const out = runJson(dir);

  assert.equal(out.turns, 2);       // [msg1, msg2] closed by the real user turn, [msg3] closed at EOF
  assert.equal(out.messages, 3);
  assert.equal(out.prose, 35);      // text-only blocks: prose == visible tokens
  assert.equal(out.work, 0);
  assert.equal(out.saved, 10);      // narration(10) + max(0, last(20) - receipt(25))
});

test('prose/work split follows serialized block share, thinking tokens are excluded', () => {
  const dir = tmpDir();
  writeSession(dir, 'session2.jsonl', SESSION_2);
  const out = runJson(dir);

  assert.equal(out.messages, 3);       // the empty-content message still counts
  assert.equal(out.thinking, 20);
  assert.equal(out.prose, 30);         // text-only message: 50 - 20 thinking
  assert.equal(out.work, 15);          // tool_use-only message, no thinking
  assert.equal(out.turns, 1);
  assert.equal(out.saved, 5);          // single-message turn: max(0, 30 - 25)
});

test('--json aggregates across sessions', () => {
  const dir = tmpDir();
  writeSession(dir, 'session1.jsonl', SESSION_1);
  writeSession(dir, 'session2.jsonl', SESSION_2);
  const out = runJson(dir);

  assert.equal(out.sessions, 2);
  assert.equal(out.prose, 65);
  assert.equal(out.work, 15);
  assert.equal(out.thinking, 20);
  assert.equal(out.turns, 3);
  assert.equal(out.messages, 6);
  assert.equal(out.saved, 15);
  assert.equal(out.visible, 80);
  assert.equal(out.proseShare, 81.25);
  assert.equal(out.cut, 18.75);
  assert.equal(out.medianProsePerTurn, 30); // sorted per-turn totals [5, 30, 30]
});

test('human-readable output reports the same totals', () => {
  const dir = tmpDir();
  writeSession(dir, 'session1.jsonl', SESSION_1);
  const out = run(dir);

  assert.match(out, /1 sessions .* 2 turns .* 3 assistant messages/);
  assert.match(out, /100\.0%/); // work is 0 in this session, so prose is 100%
});

test('an empty directory is reported instead of crashing', () => {
  const dir = tmpDir();
  const out = run(dir);
  assert.match(out, /No transcripts with usage data found/);
});
