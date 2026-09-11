const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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
