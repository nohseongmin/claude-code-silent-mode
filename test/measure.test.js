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

function run(args, env = {}) {
  return execFileSync(process.execPath, [MEASURE, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });
}

test('prints a friendly message when no transcripts have usage data', () => {
  const dir = tmpDir();
  const out = run(['--dir', dir]);
  assert.match(out, /No transcripts with usage data found under/);
});

test('falls back to CLAUDE_CONFIG_DIR/projects when --dir is omitted', () => {
  const dir = tmpDir();
  const out = run([], { CLAUDE_CONFIG_DIR: dir });
  assert.ok(out.includes(path.join(dir, 'projects')));
});

test('splits prose vs work from real usage data, ignoring malformed lines and non-.jsonl files', () => {
  const dir = tmpDir();
  const projectDir = path.join(dir, 'project-a');
  fs.mkdirSync(projectDir, { recursive: true });

  const lines = [
    JSON.stringify({ type: 'user', message: { content: 'start the task' } }),
    JSON.stringify({
      type: 'assistant',
      message: {
        usage: { output_tokens: 100, output_tokens_details: { thinking_tokens: 0 } },
        content: [{ type: 'text', text: 'here is a natural language explanation of what I did' }]
      }
    }),
    'not valid json {{{',
    JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'no usage field, must be skipped' }] }
    }),
    JSON.stringify({
      type: 'assistant',
      message: {
        usage: { output_tokens: 100, output_tokens_details: { thinking_tokens: 0 } },
        content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }]
      }
    })
  ];
  const transcript = lines.join('\n') + '\n';
  fs.writeFileSync(path.join(projectDir, 'session.jsonl'), transcript);
  // same content under a non-.jsonl name — must be ignored by the walker,
  // otherwise every total below would silently double.
  fs.writeFileSync(path.join(projectDir, 'session.jsonl.bak'), transcript);

  const out = JSON.parse(run(['--dir', dir, '--json']));

  assert.equal(out.sessions, 1);
  assert.equal(out.messages, 2);
  assert.equal(out.turns, 1);
  assert.equal(out.thinking, 0);
  assert.equal(out.prose, 100);
  assert.equal(out.work, 100);
  assert.equal(out.visible, 200);
  assert.equal(out.proseShare, 50);
  assert.equal(out.saved, 75);
  assert.equal(out.cut, 37.5);
  assert.equal(out.medianProsePerTurn, 100);
});
