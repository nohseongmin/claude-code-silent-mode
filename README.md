<p align="center">
  <img src="docs/assets/banner.svg" alt="trappist — silent mode for Claude Code" width="820">
</p>

<p align="center">
  <strong>The monks who took the vow still did the work.</strong>
</p>

<p align="center">
  No preamble. No narration between tool calls. No closing summary.<br>
  The agent does the job and leaves <strong>one receipt line.</strong><br>
  Silence means it worked. If it talks, you have something to do.
</p>

<p align="center">
  <a href="#license"><img src="https://img.shields.io/badge/license-MIT-green?style=flat" alt="MIT"></a>
  <img src="https://img.shields.io/badge/Claude%20Code-plugin-D97757?style=flat" alt="Claude Code plugin">
  <img src="https://img.shields.io/badge/dependencies-0-blue?style=flat" alt="zero dependencies">
  <a href="https://github.com/nohseongmin/claude-code-silent-mode/actions"><img src="https://github.com/nohseongmin/claude-code-silent-mode/actions/workflows/test.yml/badge.svg" alt="tests"></a>
</p>

<p align="center">
  <a href="#see-it">See it</a> ·
  <a href="#install">Install</a> ·
  <a href="#take-the-vow">Levels</a> ·
  <a href="#when-it-speaks-anyway">When it speaks</a> ·
  <a href="#outside-claude-code">Outside Claude Code</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#honest-numbers">Honest numbers</a>
</p>

---

## See it

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

Every word on the left is output tokens, and output is the expensive direction. Worse, it compounds: each assistant message is replayed as **input** on every following turn. A long build session pays for its own narration over and over, and not one word of it changed a file.

## Install

```bash
claude plugin marketplace add nohseongmin/claude-code-silent-mode
```

```bash
claude plugin install trappist@trappist
```

Active from the next session start. No config needed. The repo is named for what it does; the plugin, skill, and command are all `trappist`.

## Take the vow

| Command | Effect |
|---|---|
| `/trappist` | Take the vow at **full** — receipt only |
| `/trappist lite` | Receipt plus up to two lines of why |
| `/trappist ultra` | One line. `✓ <what> · <check>` |
| `/trappist off` | End the vow |

Plain English works too: *"silent mode"*, *"stop narrating"*, *"normal mode"*.
The level persists across sessions. `TRAPPIST_MODE=off` opts out globally.

The receipt is a fixed grammar, not a style suggestion:

```
✓ <what happened> · <files touched> · <check result>
next: <one command>
```

The check has to be a real one — `12/12 tests`, `build ok`, `lint clean` — or the word `unverified` when nothing was run. A check that was never executed never appears.

## When it speaks anyway

> **Silence means success. Any prose means you have to do something.**

That invariant is the whole product, and it only holds if problems always break the vow.

| Trigger | Why |
|---|---|
| Destructive or irreversible action | You confirm before it happens, always |
| Security risk or exposed secret | Never compressed, never silent |
| Failed, partial, or skipped work | Silence would read as success |
| A real error | The shortest decisive line, quoted exactly |
| Blocking ambiguity | One question, `a)` / `b)` |
| You asked a question | A question is not a work order |

It resumes the vow immediately afterward.

**The vow is about output, not effort.** It never shortens the work — no skipped validation, no skipped error handling, no dropped half of the request to keep the receipt short. A `✓` on unfinished work is the one unforgivable bug in this repo; report it as such.

Code, commits, PR bodies, and any document you asked for are still written normally and in full. The vow governs chat, not deliverables.

## Outside Claude Code

The vow is a prompt, not a program. The plugin only automates installing it.

**claude.ai, ChatGPT, or any chat window** — paste [`prompts/chat.md`](prompts/chat.md) into custom instructions, project instructions, or a system prompt. It is the conversational version of the same vow: no preamble, no restating your question, no closing recap, no "would you like me to..." — the answer starts on line one and stops when it is done.

In chat there are no files to list, so there is no receipt. The answer *is* the deliverable, and the vow simply deletes everything wrapped around it.

**Cursor, Codex, Cline, Copilot, or any agent that reads a rules file** — point it at [`AGENTS.md`](AGENTS.md), or drop that file in the repo root and most of them find it themselves.

## How it works

Two hooks, one skill file, about 130 lines of Node, no dependencies.

- `SessionStart` injects the ruleset from [`skills/trappist/SKILL.md`](skills/trappist/SKILL.md), filtered down to the active level. The other levels are pure context cost, so they never get sent.
- `UserPromptSubmit` parses `/trappist ...`, persists the level to `~/.claude/.trappist-mode`, and re-anchors a one-sentence reminder each turn.

That per-turn reminder is itself input cost — about 50 tokens. It is there because style instructions injected once at session start reliably decay over a long session, and 50 tokens is far cheaper than the paragraph it prevents. The flag file is read through a whitelist, so a tampered `.trappist-mode` can never inject text into the model's context.

## Honest numbers

There is no benchmark here yet.

The mechanism is not subtle and the direction is not in doubt, but I have not measured the size of the effect, so this README does not claim a percentage. Run `/cost` on a real build session with the vow on and off and compare. A PR with actual numbers is the most useful thing you could send.

## Pairs with

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
