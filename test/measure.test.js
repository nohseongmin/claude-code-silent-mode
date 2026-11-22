const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { isUserTurn, measureFile, RECEIPT_TOKENS } = require('../tools/measure.js');

function tmpTranscript(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'measure-'));
  const file = path.join(dir, 'session.jsonl');
  fs.writeFileSync(file, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
  return file;
}

function assistantMsg(usage, content) {
  return { type: 'assistant', message: { usage, content } };
}

for (const args of [['--dir'], ['--dir', '--json']]) {
  test('CLI rejects a missing path for ' + args.join(' '), t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'measure-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.mkdirSync(path.join(dir, 'projects'));
    fs.writeFileSync(path.join(dir, 'projects', 'session.jsonl'), JSON.stringify(
      assistantMsg({ output_tokens: 50 }, [{ type: 'text', text: 'hello' }])
    ) + '\n');

    const result = spawnSync(process.execPath, [path.join(__dirname, '../tools/measure.js'), ...args], {
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_CONFIG_DIR: dir }
    });

    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Error: --dir requires a path\./);
    assert.match(result.stderr, /Usage: node tools\/measure\.js \[--dir <path>\] \[--json\]/);
  });
}

for (const args of [[], ['--json']]) {
  test('CLI measures an explicit directory ' + args.join(' '), t => {
    const file = tmpTranscript([
      assistantMsg({ output_tokens: 50 }, [{ type: 'text', text: 'hello' }])
    ]);
    const dir = path.dirname(file);
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

    const result = spawnSync(process.execPath, [path.join(__dirname, '../tools/measure.js'), '--dir', dir, ...args], {
      encoding: 'utf8'
    });

    assert.ifError(result.error);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    if (args.includes('--json')) {
      const measured = JSON.parse(result.stdout);
      assert.equal(measured.sessions, 1);
      assert.equal(measured.prose, 50);
      assert.equal(measured.visible, 50);
    } else {
      assert.match(result.stdout, /1 sessions · 1 turns · 1 assistant messages/);
    }
  });
}

test('isUserTurn identifies a real user turn', () => {
  assert.equal(isUserTurn({ type: 'user', message: { content: 'fix the bug' } }), true);
  assert.equal(isUserTurn({ type: 'user', message: { content: [{ type: 'text', text: 'hi' }] } }), true);
});

test('isUserTurn rejects tool results and non-user records', () => {
  assert.equal(isUserTurn({ type: 'assistant', message: { content: 'hi' } }), false);
  assert.equal(isUserTurn({
    type: 'user',
    message: { content: [{ type: 'tool_result', content: 'ok' }] }
  }), false);
});

test('measureFile returns null for a file with no usage records', () => {
  const file = tmpTranscript([{ type: 'user', message: { content: 'hello' } }]);
  assert.equal(measureFile(file), null);
});

test('measureFile ignores unparsable lines and blank lines', () => {
  const file = tmpTranscript([]);
  fs.writeFileSync(file, '\nnot json\n' + JSON.stringify(
    assistantMsg({ output_tokens: 10 }, [{ type: 'text', text: 'ok' }])
  ) + '\n');
  const m = measureFile(file);
  assert.equal(m.messages, 1);
  assert.equal(m.prose, 10);
});

test('measureFile ignores JSON values that are not records', () => {
  const file = tmpTranscript([
    null, true, 42, 'not a record', [],
    assistantMsg({ output_tokens: 10 }, [{ type: 'text', text: 'ok' }])
  ]);
  const m = measureFile(file);
  assert.equal(m.messages, 1);
  assert.equal(m.prose, 10);
});

test('measureFile ignores non-array assistant content and continues measuring', () => {
  const file = tmpTranscript([
    ...[null, true, 42, 'not blocks', {}].map(content =>
      assistantMsg({ output_tokens: 50 }, content)),
    assistantMsg({ output_tokens: 10 }, [{ type: 'text', text: 'ok' }])
  ]);
  const m = measureFile(file);
  assert.equal(m.messages, 6);
  assert.equal(m.prose, 10);
  assert.equal(m.work, 0);
});

test('measureFile ignores null blocks while preserving tool results and turn totals', () => {
  const file = tmpTranscript([
    { type: 'user', message: { content: [null, { type: 'text', text: 'do the thing' }] } },
    assistantMsg({ output_tokens: 30 }, [null, { type: 'text', text: 'working' }]),
    { type: 'user', message: { content: [null, { type: 'tool_result', content: 'ok' }] } },
    assistantMsg({ output_tokens: 20 }, [null, { type: 'tool_use', name: 'Read', input: {} }]),
    assistantMsg({ output_tokens: 40 }, [{ type: 'text', text: 'done' }, null]),
    { type: 'user', message: { content: [{ type: 'text', text: 'next task' }, null] } }
  ]);
  const m = measureFile(file);
  assert.equal(m.messages, 3);
  assert.equal(m.prose, 70);
  assert.equal(m.work, 20);
  assert.equal(m.turns, 1);
  assert.deepEqual(m.perTurn, [70]);
  assert.equal(m.saved, 30 + 15);
});

test('measureFile splits prose vs work by serialized character share', () => {
  const text = [{ type: 'text', text: 'a'.repeat(10) }];      // ~30 chars serialized
  const tool = [{ type: 'tool_use', name: 'Read', input: { a: 1 } }]; // ~30 chars serialized
  const file = tmpTranscript([
    assistantMsg({ output_tokens: 100 }, [...text, ...tool])
  ]);
  const m = measureFile(file);
  assert.equal(m.prose + m.work, 100);
  assert.ok(m.prose > 0 && m.work > 0);
});

test('measureFile excludes thinking tokens from visible output', () => {
  const file = tmpTranscript([
    assistantMsg(
      { output_tokens: 100, output_tokens_details: { thinking_tokens: 40 } },
      [{ type: 'text', text: 'hi' }]
    )
  ]);
  const m = measureFile(file);
  assert.equal(m.thinking, 40);
  assert.equal(m.prose, 60);
});

test('measureFile skips messages with no text or tool_use blocks', () => {
  const file = tmpTranscript([
    assistantMsg({ output_tokens: 50 }, [])
  ]);
  const m = measureFile(file);
  assert.equal(m.messages, 1);
  assert.equal(m.prose, 0);
  assert.equal(m.work, 0);
});

test('measureFile closes a turn on a real user message and totals per-turn prose', () => {
  const file = tmpTranscript([
    { type: 'user', message: { content: 'do the thing' } },
    assistantMsg({ output_tokens: 30 }, [{ type: 'text', text: 'x'.repeat(20) }]),
    assistantMsg({ output_tokens: 20 }, [{ type: 'text', text: 'y'.repeat(20) }]),
    { type: 'user', message: { content: 'next task' } }
  ]);
  const m = measureFile(file);
  assert.equal(m.turns, 1);
  assert.deepEqual(m.perTurn, [50]);
});

test('measureFile saved estimate is narration plus the last block above the receipt cost', () => {
  const file = tmpTranscript([
    { type: 'user', message: { content: 'do the thing' } },
    assistantMsg({ output_tokens: 30 }, [{ type: 'text', text: 'x'.repeat(20) }]),
    assistantMsg({ output_tokens: RECEIPT_TOKENS + 15 }, [{ type: 'text', text: 'y'.repeat(20) }]),
    { type: 'user', message: { content: 'next task' } }
  ]);
  const m = measureFile(file);
  // narration = first block (30) fully saved; last block only saves what exceeds a receipt.
  assert.equal(m.saved, 30 + 15);
});

test('measureFile does not save anything when the final block is at or under receipt cost', () => {
  const file = tmpTranscript([
    { type: 'user', message: { content: 'do the thing' } },
    assistantMsg({ output_tokens: RECEIPT_TOKENS }, [{ type: 'text', text: 'x'.repeat(10) }]),
    { type: 'user', message: { content: 'next task' } }
  ]);
  const m = measureFile(file);
  assert.equal(m.saved, 0);
});
