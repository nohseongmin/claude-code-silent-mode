<p align="center">
  <img src="docs/assets/banner.svg" alt="trappist — silent mode for Claude Code" width="820">
</p>

<p align="center">
  <strong>The monks who took the vow still did the work.</strong>
</p>

<p align="center">
  Your agent narrates every step it takes. That narration is billed output,<br>
  and it is replayed as input on every turn after it.<br>
  <strong>trappist deletes it.</strong> The work happens. One receipt line comes back.
</p>

<p align="center">
  <a href="https://github.com/nohseongmin/claude-code-silent-mode/stargazers"><img src="https://img.shields.io/github/stars/nohseongmin/claude-code-silent-mode?style=flat&color=yellow" alt="Stars"></a>
  <img src="https://img.shields.io/badge/prose_in_real_sessions-34.7%25-D97757?style=flat" alt="34.7% prose, measured">
  <img src="https://img.shields.io/badge/dependencies-0-blue?style=flat" alt="zero dependencies">
  <a href="https://github.com/nohseongmin/claude-code-silent-mode/actions"><img src="https://github.com/nohseongmin/claude-code-silent-mode/actions/workflows/test.yml/badge.svg" alt="tests"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=flat" alt="MIT"></a>
</p>

<p align="center">
  <a href="#before--after">See it</a> ·
  <a href="#install">Install</a> ·
  <a href="#take-the-vow">Levels</a> ·
  <a href="#it-speaks-when-it-matters">When it speaks</a> ·
  <a href="#measure-it-on-your-own-sessions">Numbers</a> ·
  <a href="#outside-claude-code">Everywhere else</a> ·
  <a href="#the-whole-monastery">Ecosystem</a>
</p>

---

trappist is a plugin for [Claude Code](https://docs.anthropic.com/en/docs/claude-code), and a paste-in prompt for everything else. Install once. The agent stops narrating, stops summarizing, stops offering follow-ups, and ends its turn with a single receipt. It still writes the code, still runs the tests, still warns you before it breaks something — it just stops describing itself while it works.

## Before / after

Same task. Same files changed. Same tests run.

<table>
<tr>
<th width="50%">🗣️ Without the vow</th>
<th width="50%">🤫 With the vow</th>
</tr>
<tr>
<td valign="top">

I'll help you set that up! Let me start by looking at the existing route structure.

*[reads a file]*

Now that I understand the layout, I'll create the rate limiter. This will use an in-memory token bucket with sensible defaults...

*[writes a file]*

I've created `middleware/rateLimit.js`. Here's what it does:

1. Tracks requests per IP in a Map
2. Allows 5 attempts per minute
3. Returns 429 with a `Retry-After` header

*[edits a file]*

I've wired it into `routes/auth.js`. Let me run the tests to confirm.

*[runs tests]*

All 8 tests pass. The rate limiter is working correctly. Let me know if you'd like me to add Redis support for multi-process deployments!

</td>
<td valign="top">

*[reads a file]*

*[writes a file]*

*[edits a file]*

*[runs tests]*

```
✓ rate limit on POST /login · 2 files · 8/8 tests
next: npm test
```

</td>
</tr>
</table>

Not a summary of the turn. **That is the turn.**

```
┌──────────────────────────────────────────────────────────┐
│  220 real Claude Code sessions · 16.1M output tokens     │
│                                                          │
│  prose   ███░░░░░░░   34.7%    5.6M tokens   ← deleted   │
│  work    ███████░░░   65.3%   10.5M tokens   ← kept      │
│                                                          │
│  median turn talks for      3,042 tokens                 │
│  a receipt is                  25 tokens                 │
└──────────────────────────────────────────────────────────┘
```

Real billed tokens from real transcripts, not an estimate. Run the same count on your own machine in ten seconds: [Measure it yourself](#measure-it-on-your-own-sessions).

trappist does not make the agent dumber. It does not make it lazier. It makes it **quieter** — the thinking, the tool calls, and the code are untouched.

## Install

```bash
claude plugin marketplace add nohseongmin/claude-code-silent-mode
```

```bash
claude plugin install trappist@trappist
```

Active from the next session start. No config. Node ≥18. The repo is named for what it does; the plugin, skill, and command are all `trappist`.

> [!TIP]
> **You do not have to type a command.** Say *"results only"*, *"no commentary"*, *"skip the explanation"*, *"결과물만 보여줘"* — it takes the vow on its own. Say *"normal mode"* or *"설명해줘"* and it breaks.

<details>
<summary><strong>Not on Claude Code?</strong></summary>

<br>

The vow is a prompt. The plugin only automates installing it.

| Where | What to use |
|---|---|
| claude.ai, ChatGPT, any chat window | Paste [`prompts/chat.md`](prompts/chat.md) into custom or project instructions |
| claude.ai skills (plan permitting) | Upload [`skills/trappist/`](skills/trappist) as-is |
| Cursor, Codex, Cline, Copilot | Point the agent at [`AGENTS.md`](AGENTS.md), or drop it in your repo root |

The chat version is a different vow: there are no files to list, so **there is no receipt**. In a conversation the answer *is* the deliverable — the vow only strips the packaging around it. No greeting, no restating your question, no closing recap, no *"would you like me to..."*.

</details>

## Take the vow

| Command | Effect |
|---|---|
| `/trappist` | Take the vow at **full** — receipt only |
| `/trappist lite` | Receipt plus up to two lines of why |
| `/trappist ultra` | One line. `✓ <what> · <check>` |
| `/trappist off` | End the vow |

The level persists across sessions. `TRAPPIST_MODE=off` opts out globally.

The receipt is a fixed grammar, not a style suggestion:

```
✓ <what happened> · <files touched> · <check result>
next: <one command>
```

The `next:` line disappears when there is nothing to run. The check has to be one that actually ran — `12/12 tests`, `build ok`, `lint clean` — or the word `unverified`. A check that was never executed never appears.

## It speaks when it matters

> **Silence means success. Any prose means you have to do something.**

That invariant is the entire product, and it only survives if problems always break the vow.

| Trigger | Why |
|---|---|
| Destructive or irreversible action | You confirm before it happens, always |
| Security risk or exposed secret | Never compressed, never silent |
| Failed, partial, or skipped work | Silence would read as success |
| A real error | The shortest decisive line, quoted exactly |
| Blocking ambiguity | One question, `a)` / `b)` |
| You asked a question | A question is not a work order |

It resumes the vow immediately afterward.

**The vow is about output, not effort.** It never shortens the work — no skipped validation, no skipped error handling, no quietly dropped half of the request to keep the receipt short. A `✓` on unfinished work is the one unforgivable bug in this repo. Open an issue if you see one.

Code, commits, PR bodies, and any document you asked for are written normally and in full. The vow governs chat, not deliverables.

## Measure it on your own sessions

```bash
node tools/measure.js
```

```
  220 sessions · 716 turns · 19330 assistant messages
  16147.5k visible output tokens (thinking excluded: 3302.1k)

  prose   ███░░░░░░░  34.7%  5608.9k
  work    ███████░░░  65.3%  10538.6k

  median turn spends 3042 tokens talking; a receipt is 25

  under the vow, at most 5591.8k of that prose goes away
  = 34.6% of visible output tokens, 99.7% of the prose itself
```

It reads the transcripts Claude Code already writes to `~/.claude/projects` and reports what your own agent actually spent. `--json` for machine output, `--dir` to point somewhere else. Nothing leaves your machine.

<details>
<summary><strong>Method, and where it can be wrong</strong></summary>

<br>

**What is measured.** Every assistant message in a transcript carries the `usage.output_tokens` the API billed. Thinking tokens are subtracted — the vow does not touch reasoning. What remains is visible output.

**The one approximation.** A message's visible tokens are split between its `text` blocks and its `tool_use` blocks in proportion to serialized character count. Prose is the text; work is the tool calls. Character share is not token share, but across a corpus this size the drift is small.

**The upper bound.** The savings line is a simulation, not a measurement: all mid-turn narration goes to zero and each turn's final message collapses to a 25-token receipt. Real sessions land **below** it, because the vow deliberately keeps warnings, questions, and failure reports. Treat 34.6% as the ceiling and your own A/B with `/cost` as the truth.

**Not a pre-compressed baseline.** Only 19 of the 228 transcripts in this corpus ran with [caveman](https://github.com/JuliusBrussee/caveman) active, so this is close to what an unassisted agent talks like.

**What is left out.** Compounding is not counted. Every assistant message is replayed as input on every later turn of the session, so prose is billed once as output and many times as input. Prompt caching discounts that replay heavily, which is exactly why the honest headline number stays on the output side.

</details>

## How it works

Two hooks, one skill file, about 140 lines of Node, no dependencies.

- `SessionStart` injects the ruleset from [`skills/trappist/SKILL.md`](skills/trappist/SKILL.md), filtered down to the active level. The other levels are pure context cost, so they are never sent.
- `UserPromptSubmit` reads the prompt for `/trappist ...` and for intent phrasings in English and Korean, persists the level to `~/.claude/.trappist-mode`, and re-anchors one sentence per turn.

That per-turn reminder costs about 50 input tokens. Style instructions injected once at session start reliably decay over a long session, and 50 tokens is far cheaper than the paragraph it prevents. The flag file is read through a whitelist, so a tampered `.trappist-mode` can never inject text into the model's context — there is a test for exactly that.

## The whole monastery

- [caveman](https://github.com/JuliusBrussee/caveman) — compresses the prose you keep
- [ponytail](https://github.com/DietrichGebert/ponytail) — compresses the code you write
- **trappist** — deletes the prose you never needed

Stack all three and what is left is the diff.

## Develop

```bash
npm test
```

## License

MIT.
