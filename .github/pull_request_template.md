<!--
  The title of this pull request becomes the commit, and the commit decides the
  next version and what the changelog says. So the title is not a label, it is a lever.

    fix: ...    0.1.0 -> 0.1.1
    feat: ...   0.1.0 -> 0.2.0
    feat!: ...  0.1.0 -> 1.0.0   and say what breaks, in the body

    docs: refactor: test: build: chore:   nothing ships

  English, lower case, one sentence, no full stop.
-->

## What changed

<!-- Two sentences. Whoever hits merge reads this and nothing else. -->

## Why

<!-- What went wrong, or what was not there. If an issue exists: Closes #12 -->

## What you actually ran

<!--
  Not "works fine". What you did, and what you saw.

  If you touched restore or the proxy, this part is not optional.
  Those two are where a mistake lands on somebody else's repository.
-->

- [ ] `pnpm check` passes

## Does this cross SAFETY.md?

<!--
  Tick what this pull request does. Nothing ticked is the normal answer,
  and it is an answer, not a section you skipped.
-->

- [ ] Downloads or runs something from the repository being looked at (rules 2, 3)
- [ ] Opens a way out of the screen (rules 4, 6)
- [ ] Lets the token reach the screen (rule 5)
- [ ] Hands the agent something that writes (rule 9)
- [ ] Ends in a verdict, in any language, in any wording (rule 1)
- [ ] Can fail without saying so (rule 11)

<!--
  Ticked one? Link the ADR that allows it. If there is no ADR yet, that is the
  pull request to open first. These rules were not written to be convenient.
-->

## Text

<!-- Delete this whole section if you did not touch any wording. -->

- [ ] `ko`, `en` and `ja` are all updated
- [ ] Nothing new says safe, clean, or nothing found
