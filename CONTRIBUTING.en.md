# Contributing

[한국어](CONTRIBUTING.md) | **English** | [日本語](CONTRIBUTING.ja.md)

## First

Read [SAFETY.md](SAFETY.md). Those rules come before features.
If you have found a reason to break one, that reason belongs in an
[ADR](docs/decisions/README.md) before it belongs in code.

## Getting it running

```bash
pnpm install
pnpm app
```

More in [running locally](docs/guides/running-locally.md).

## Where to look

| What you want to do | Read |
|---|---|
| Add a detector | [adding a detector](docs/guides/adding-a-detector.md) |
| Add an MCP tool | [connecting agents](docs/guides/connecting-agents.md) |
| Touch restore | [restoring branches](docs/guides/restoring-branches.md) |
| Change screen text, add a language | [adding a language](docs/guides/adding-a-language.md) |
| Find your way around | [architecture](docs/architecture.md) |

## Code

**Comments say why.** The code already says what.
Write down the reason, and especially **what went wrong when it was done another way**.
Most of the comments in here are that kind of record.

**Names you can read.** `stats`, `caseFile`, `finding`, not `s`, `c`, `f`.

**Past 300 lines, look for a seam.** The line count is not the problem.
It is a sign that one file is doing several jobs.

**Dependencies point one way.** `ui` → `core` → `platform` → `server`.
An import of `../ui` from inside `core` gets stopped in review.

## Writing

Strings that reach the screen do not go in the code. They go in `src/i18n/locales/`.
All three of 한국어, English, 日本語 have to be there or the build fails.

The README is three files, and so is this one.
GitHub does not pick by the reader's language, so they link to each other on the first line.
Change one, change all three. `pnpm style` catches the ones you forgot.

This applies to screen text and comments alike.

- Short sentences
- No double negatives
- No em dash (—), no interpunct (·), no ellipsis (…). Use `-`, `,`, `...`
- No real organization or repository names
- **Never say it is safe.** What we know is that no signal came up, not that nothing is there

## Issues

There are [four forms](https://github.com/gitmoru/gitmoru/issues/new/choose).

| Form | When |
|---|---|
| It showed nothing, but something was there | The screen was quiet and the repository was compromised anyway. **This is the one we want most** |
| Something broke | A crash, a blank screen, a number that does not add up |
| A signal worth catching | An idea is fine, an idea with a real incident under it is much better |
| The wording reads wrong | One of the three languages does not read like that language |

The forms are in English, but **write the body in whatever language you think in.**
Only the field labels are English.

**Leave out:**

- Real organization and repository names. `someorg/somerepo` is enough
- Payloads that still run. Describe the shape, or strip the URLs and keys
- Tokens in logs. Logs from this tool carry **your GitHub token**

Blank issues are turned off. Those three lines sit at the top of every form,
and a blank issue opens without anyone reading them.

A hole in **gitmoru itself** is not an issue. It goes to [SECURITY.md](SECURITY.md).

## Nothing goes straight to main

Open an issue, cut a branch, merge through a pull request. Same on a repository with one person on it.

```bash
git switch -c fix/what-you-are-fixing
```

Pushing straight to main is faster. What it costs is the record. What changed and why
ends up in one commit line and nowhere else. This tool holds repository permissions,
and a restore cannot be taken back. **We decided not to leave a door where that kind of
code walks in unrecorded.**

Release pull requests get no checks. A pull request opened by a robot does not wake other
workflows. Nothing ships unchecked anyway, because the publish job has to pass `pnpm check`
before it reaches npm.

## The pull request title picks the version

We use conventional commits, and not as a matter of taste.
On merge, **the title becomes the commit**, and the commit decides the next version.

| Title | What happens |
|---|---|
| `fix: ...` | 0.1.0 → 0.1.1 |
| `feat: ...` | 0.1.0 → 0.2.0 |
| `feat!: ...` | 0.1.0 → 1.0.0, and say what breaks in the body |
| `docs:` `refactor:` `test:` `build:` `chore:` | nothing ships |

**English, lower case, one sentence, no full stop.** One thing per title.

```
feat: add blob hash comparison to the detector
fix: stop the first screen from swallowing clicks
docs: write down how to add an MCP tool
```

Nobody edits the version by hand. A `feat:` or a `fix:` makes a robot open a
"bump the version" pull request, and merging that one publishes to npm.
So **a lazy title means the fix does not ship.**

## Tests

Pure logic gets tests. They live in `src/core/__tests__/`.

```bash
pnpm test
pnpm test:watch
```

Nothing that touches the network. GitHub calls are stubbed.
A test that reaches into somebody's repository cannot run in CI.

**Most of the cases in there are things that were actually wrong once.**
When you write a new rule and think "this obviously works", that is the moment to write a test.
That instinct has been wrong three times in this repository.

## Before you open the pull request

```bash
pnpm check
```

Types, writing rules, tests, sprite behaviour, build. CI runs the same thing.

The form asks at the end whether this **crosses SAFETY.md**.
Nothing ticked is the usual answer, and an empty list is an answer, not a skipped section.
If you did tick one, link the ADR that allows it. If no ADR exists, that is the pull request to open first.

If you touched restore or the proxy, write down what you tested.
Those two are where a mistake lands on somebody else's repository.
