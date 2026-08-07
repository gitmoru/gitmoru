<div align="center">

<img src="docs/assets/wordmark.svg" alt="gitmoru" width="300">

<br>
<br>

<img src="docs/assets/mole.svg" alt="Moru" width="120">

**A mole that digs through your repositories and tells you what happened**

For the morning you find out someone rewrote every branch overnight.<br>
It downloads nothing, and sends nothing off this machine.

[한국어](README.md) | **English** | [日本語](README.ja.md)

</div>

<br>

## What it is

When one account gets taken over, an entire org's branches can be overwritten in hours.
Three things matter at that moment.

1. **What got hit** - which repos, how many branches
2. **What came in** - what that file actually does
3. **Can it be undone** - is the pre-attack commit still on record

gitmoru does 1 and 3. It does not do 2.
**Instead it hands 2 to an AI that can.**

<br>

## Why it never gives a verdict

This tool does not say "compromised" or "clean". It says one thing.

> These files changed, in this window.

There is a reason.

Detection rules come from **attacks we have already seen**. A new technique is, by definition,
not in the rules. When rules produce verdicts, **whatever the rules miss shows up as "nothing found".**

That happened. A search by filename missed the same payload attached under a different name,
and the screen said "0 findings". That screen was reassuring for a while.

So when nothing matches, gitmoru says this instead:

```
No signals came up. Still worth skimming the 14 changed files.
```

<br>

## What it will not do

| Never | Why |
|---|---|
| `git clone` | Some payloads run the moment the folder is opened in an editor. **Downloading is already losing** |
| Run target code | No lint, no build, no install. It reads and explains, nothing more |
| Reach outside | A CSP on the renderer makes requesting an address found in a payload impossible |
| Store tokens | Borrowed from `gh`, never handed to the renderer |
| Give agents write access | Agents read attacker-authored text. It may contain instructions |

Details in [SAFETY.md](SAFETY.md).

<br>

## Getting started

You will need [Node 22+](https://nodejs.org), [pnpm](https://pnpm.io) and the [GitHub CLI](https://cli.github.com).

```bash
git clone https://github.com/gitmoru/gitmoru.git
cd gitmoru
gh auth login
pnpm install
pnpm app
```

Enter an org or repositories and a time window, then hit `Dig`.
It defaults to midnight through 7am today. That is when this usually happens.

There is no installer, and that is on purpose. This tool asks for access to your
repositories. An unsigned binary asking for exactly that is indistinguishable from
the attack it goes looking for. **Whoever runs this just got breached.** What you
hand someone on that day is source they can read.

The token is borrowed from `gh`. Nothing here ever writes one down.

<br>

## How it works

```
collect activity inside the window (pushes, and repositories made public)
        ↓
compare the pre-attack commit (payload.before) against the current tree
        ↓
collect every changed file, regardless of rules      ← this is the output
        ↓
detectors highlight what to read first               ← ordering, not judgment
        ↓
a human or an AI reads and decides
        ↓
a human presses restore, in the app
```

If a private repository went public in that window, it says so too, even when nothing was pushed.
That one is not undone by restoring, so what you do next is a different job.

Restore targets come from what GitHub remembers. Activity is kept for about 90 days,
so anything older cannot be rewound. The app says so.

<br>

## Connecting an AI

An MCP server ships with it. Once connected, an AI reads the results directly
and explains what a suspicious file does.

Claude Code, Codex CLI, Gemini CLI, Claude Desktop, Cursor, Windsurf, and VS Code are supported.
`Connect AI` in the app shows **the real config path on this machine**.

| Tool | When |
|---|---|
| `scan` | Start here. Returns a caseId |
| `triage` | What to look at first |
| `list_changes` | Every changed file |
| `diff_file` | Compare the file before and after the attack. **This is where judgment happens** |
| `read_file` | Read the whole file |
| `check_access` | Deploy keys, webhooks, pending invites. A standing checkup, not a time window |
| `preview_restore` | What would be rewound where (it does not execute) |
| `share_summary` | A summary for your team channel |

All read-only. [Why](docs/decisions/0005-mcp-is-read-only.md)

<br>

## Moru

<img src="docs/assets/mole.svg" alt="Moru" width="72" align="left" hspace="16">

A mole wearing a manhole cover. It burrows along the ground at the bottom of the window
and reports progress. It tunnels toward wherever your cursor stops, and falls asleep if left alone.

Every frame is a string grid. Movement comes from flipping between drawings,
not from stretching one with CSS. The app icon is baked from the same drawing.

Moru never says "you're safe".

<br clear="left">

<br>

## Language

Korean, English, and Japanese. It picks up your system language on first launch,
and you can change it from the title bar.

Each one is **written in that language**, not translated. None of them says "safe".

<br>

## Docs

| | |
|---|---|
| [SAFETY.md](SAFETY.md) | Rules that outrank features |
| [Architecture](docs/architecture.md) | Where everything lives |
| [Decisions](docs/decisions/README.md) | Why it was built this way |
| [Adding a language](docs/guides/adding-a-language.md) | Wording and new locales |
| [Contributing](CONTRIBUTING.md) | Before you start |
| [AGENTS.md](AGENTS.md) | Working on this with an AI |

<br>

## Why it exists

It was built while handling a real incident from the CLI.
Past 200 branches, typing commands by hand stopped being possible,
and worse, **a badly written command quietly returning "0" was terrifying.**

So this tool does not hide failure.
Whatever could not be checked gets counted and put somewhere you will see it.

<br>

---

<div align="center">
<sub>A personal tool. Please read <a href="SAFETY.md">SAFETY.md</a> before using it.</sub>
</div>
