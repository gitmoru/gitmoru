# Reporting a hole in gitmoru

People reach for this tool on a bad day, pointed at a repository that is already
compromised. A hole in here lands on someone who is already down. Tell us quietly first.

**[Open a private advisory](https://github.com/gitmoru/gitmoru/security/advisories/new)**

Not a public issue. The whole point of the private channel is that the fix ships
before the write-up does.

We read it within a few days. It is a small project, so that is a habit, not a contract.

## What we want to hear about

The rules in [SAFETY.md](SAFETY.md) are the surface. Anything that gets around one of them
is a report, even if you could not finish the exploit.

- **The screen reaches the network.** A payload carries URLs. If a repository under
  investigation can make the renderer send a request anywhere, that is the big one (rules 4, 6)
- **The token gets out.** Anything that puts the GitHub token into the renderer, into a
  file, into a log, or into an MCP response (rule 5)
- **Something from the repository runs.** Content we fetched being evaluated, resolved,
  or handed to a shell (rules 2, 3)
- **The agent gets a way to write.** An MCP tool that changes anything on GitHub (rule 9)
- **Restore points somewhere else.** A commit or branch reference that ends up moving a ref
  the person never chose (rule 10)
- **The local server answers a stranger.** Anything reachable from another machine, or from
  a web page open in the same browser (rule 6)

## What is not a report here

- **Malicious code in your own repository.** That is the thing this tool is for.
  If gitmoru walked past it, that is an
  [issue](https://github.com/gitmoru/gitmoru/issues/new/choose), and a welcome one.
- **A finding from a scanner with nothing behind it.** Say what an attacker gets.
- **Anything that needs the person to already be running attacker code locally.**
  At that point the machine is gone and we are not the layer that helps.

## Versions

The latest release, and nothing else. We are on 0.x, so fixes go forward, never backward.

Check what you are on:

```bash
npx gitmoru --version
```

## No bounty

There is no money here. There is a credit in the advisory and in the release notes,
under whatever name you want, or none.
