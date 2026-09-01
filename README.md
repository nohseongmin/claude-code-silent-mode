# trappist

**Vow of silence for Claude Code.** The agent does the work and stops talking — no
preamble, no narration between tool calls, no closing summary. One receipt line
instead of a conversation.

```
✓ rate limit on POST /login · 2 files · 8/8 tests
next: npm test
```

That is the entire turn.

## The problem

Ask an agent to build something and roughly half of what comes back is not the
build. It is *talk about* the build:

> I'll help you set that up! Let me start by looking at the existing structure...
>
> *[reads a file]*
>
> Now that I understand the layout, I'll create the config module. This will
> handle loading environment variables with sensible defaults...
>
> *[writes a file]*
>
> I've created `config.js`. Here's what it does:
> 1. Loads `.env` via dotenv
> 2. Validates required keys at startup
> ...
>
> Let me know if you'd like me to add anything else!

Every line of that is output tokens, and output is the expensive direction. Worse,
it compounds: each assistant message is replayed as *input* on every following
turn of the session. A long build session pays for its own narration over and
over, and none of it changes a single file.

## The contract

> **Silence means success. Any prose means you have to do something.**

The vow only works if it is never used to hide problems. Failure, partial work,
and skipped scope always break silence. A `✓` on unfinished work would make the
whole mode worthless, so trappist treats that as the one unforgivable bug.

Silence is about output, not effort. It never shortens the work — no skipped
validation, no skipped error handling, no skipped tests to keep the receipt short.

## Install

```bash
claude plugin marketplace add nohseongmin/trappist
```

```bash
claude plugin install trappist@trappist
```

Active from the next session start. No config needed.

## Use

| Command | Effect |
|---|---|
| `/trappist` | Take the vow at **full** |
| `/trappist lite` | Receipt plus up to two lines of why |
| `/trappist ultra` | One line. `✓ <what> · <check>` |
| `/trappist off` | End the vow |

Plain English works too: "silent mode", "stop narrating", "normal mode".
The level persists across sessions. `TRAPPIST_MODE=off` opts out globally.

## When it speaks anyway

| Trigger | Why |
|---|---|
| Destructive or irreversible action | You confirm before it happens, always |
| Security risk or exposed secret | Never compressed, never silent |
| Failed, partial, or skipped work | Silence would read as success |
| A real error | Shortest decisive line, quoted exactly |
| Blocking ambiguity | One question, `a)` / `b)` |
| You asked a question | A question is not a work order |

It resumes the vow immediately afterward.

Code, commits, PR bodies, and any document you asked for are still written
normally and in full. The vow governs chat, not deliverables.

## How it works

Two hooks and one skill file, about 130 lines of Node with no dependencies:

- `SessionStart` injects the ruleset from `skills/trappist/SKILL.md`, filtered
  down to the active level.
- `UserPromptSubmit` parses `/trappist ...`, persists the level to
  `~/.claude/.trappist-mode`, and re-anchors a one-sentence reminder each turn.

The per-turn reminder is itself input cost — about 50 tokens. It is there because
style instructions injected once at session start reliably decay, and 50 tokens is
much cheaper than the paragraph it prevents. The flag file is read through a
whitelist, so a tampered `.trappist-mode` can never inject text into context.

## Honest numbers

There is no benchmark here yet. The mechanism is obvious and the direction is not
in doubt, but I have not measured the size of the effect, so this README does not
claim a percentage. Run `/cost` on a build session with the vow on and off and
compare — a PR with real numbers is the most useful thing you could send.

## Pairs with

- [caveman](https://github.com/JuliusBrussee/caveman) — compresses the prose you keep
- [ponytail](https://github.com/DietrichGebert/ponytail) — compresses the code you write
- **trappist** — deletes the prose you never needed

Stack all three and the only thing left is the diff.

## Develop

```bash
node --test test/trappist.test.js
```

MIT.
