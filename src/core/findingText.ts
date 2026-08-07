import { tr } from '../i18n'
import { roleOf } from './fileRole'
import type { Evidence, Finding } from './types'

/**
 * 신호를 사람 말로 바꾼다.
 *
 * 탐지기는 사실만 올리고, 문장은 여기서 그릴 때 만든다.
 * 그래야 사건을 한국어로 훑어놓고 나중에 영어로 열어도 신호가 같이 따라온다.
 *
 * 예전에는 탐지기가 `t.summaryGrown(...)` 을 불러서 완성된 문장을 사건에 박아 넣었다.
 * 사건이 메모리에만 있을 때는 티가 덜 났는데, 파일로 남기기 시작하면서
 * **처음 훑은 언어가 디스크에 영구히 굳는** 문제가 됐다.
 *
 * 여기서도 판정하지 않는다. 만드는 건 "무엇이 어떻게 바뀌었다" 까지고,
 * 그게 나쁜 건지는 읽는 사람이 정한다.
 */
export interface FindingText {
  title: string
  summary: string
  evidence: Evidence[]
}

/** 바이트를 사람이 읽는 크기로. `1,024B`, `12.3KB` */
function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

/**
 * 이 파일이 왜 자동으로 실행되는 자리인지.
 *
 * 경로로 역할을 알아내는 것이지 악성이라고 말하는 게 아니다
 * ([ADR 0008](../../docs/decisions/0008-detectors-never-judge-by-filename.md)).
 */
function whyItRuns(path: string): string {
  const t = tr().detectors.sizeJump.explain
  if (path.startsWith('.vscode/') || path.startsWith('.idea/')) return t.vscode
  if (/\.config\.(js|ts|cjs|mjs)$/.test(path)) return t.config
  if (/package\.json$/.test(path)) return t.packageJson
  if (roleOf(path) === 'gitHook') return t.husky
  return t.build
}

export function describeFinding(finding: Finding): FindingText {
  // v1 사건에는 재료가 안 남아 있다. 그때 문장을 그대로 보여준다.
  if (!finding.facts && finding.legacy) return finding.legacy

  const facts = finding.facts

  switch (facts.kind) {
    case 'size-jump': {
      const t = tr().detectors.sizeJump
      const isNew = facts.before === undefined
      return {
        title: isNew ? t.titleNew : t.titleGrown,
        summary: isNew
          ? t.summaryNew(facts.path, fmt(facts.after))
          : t.summaryGrown(facts.path, fmt(facts.before!), fmt(facts.after), facts.ratio ?? 0),
        evidence: [
          {
            label: isNew
              ? t.labelNew(fmt(facts.after))
              : t.labelGrown(fmt(facts.before!), fmt(facts.after), facts.ratio ?? 0),
          },
          { label: t.autoRunLabel, detail: whyItRuns(facts.path) },
          { label: t.openFile, href: facts.fileHref },
        ],
      }
    }

    case 'shared-blob': {
      const t = tr().detectors.sharedBlob
      return {
        title: t.title,
        summary: t.summary(facts.path, facts.repoCount),
        evidence: [
          { label: t.sameFile(facts.repoCount) },
          {
            label: t.whereLabel,
            detail: facts.places.map((p) => `${p.repo} -> ${p.path}`).join('\n'),
          },
          { label: t.openFile, href: facts.fileHref },
        ],
      }
    }

    case 'workflow-risk': {
      const t2 = tr().detectors.workflowRisk
      return {
        title: t2.title,
        summary: t2.summary(facts.path, facts.risks.length),
        evidence: [
          ...facts.risks.map((r) => ({ label: t2.risk[r].label, detail: t2.risk[r].detail })),
          // 줄 단위로 읽는다는 걸 화면에서도 말한다. 못 잡는 게 있다.
          { label: t2.limitLabel, detail: t2.limit },
          { label: t2.openFile, href: facts.fileHref },
        ],
      }
    }

    case 'pin-loosened': {
      const t = tr().detectors.pinLoosened
      return {
        title: t.title,
        summary: t.summary(facts.actions.length, facts.path),
        evidence: [
          ...facts.actions.map((a) => ({
            label: a.action,
            // 해시는 앞 12자만. 40자를 다 적으면 무엇이 무엇으로 바뀌었는지가 안 읽힌다.
            detail: t.change(a.before.slice(0, 12), a.after),
          })),
          { label: t.whyLabel, detail: t.why },
          { label: t.openFile, href: facts.fileHref },
        ],
      }
    }

    case 'signing-dropped': {
      const t = tr().detectors.signingDropped
      const bad = facts.badSignature > 0
      return {
        title: bad ? t.titleBad : t.titleDropped,
        summary: bad
          ? t.summaryBad(facts.badSignature, facts.seen)
          : t.summaryDropped(facts.unsigned, facts.seen),
        evidence: [
          bad ? { label: t.badLabel(facts.badSignature) } : { label: t.unsignedLabel(facts.unsigned) },
          // 기준점을 같이 적는다. 이게 없으면 위 숫자는 아무 뜻도 아니다.
          { label: facts.baseSigned ? t.baseSigned : t.baseUnknown },
          // 다 못 봤으면 그렇게 적는다. 본 것이 전부인 척하지 않는다.
          ...(facts.partial ? [{ label: t.partial(facts.seen) }] : []),
          { label: t.openCompare, href: facts.compareHref },
        ],
      }
    }

    case 'forged-commit': {
      const t = tr().detectors.forgedCommit
      const at = (iso: string, len: number) => iso.slice(0, len).replace('T', ' ')
      return {
        title: t.title,
        summary: t.summary(
          facts.authorName,
          at(facts.authorDate, 10),
          at(facts.committerDate, 16),
          facts.gapDays,
        ),
        evidence: [
          { label: `author: ${facts.authorName} / ${at(facts.authorDate, 19)}` },
          { label: `committer: ${facts.committerName} / ${at(facts.committerDate, 19)}` },
          { label: t.gapLabelShort(facts.gapDays), detail: t.gapDetail },
          { label: t.openCommit, href: facts.commitHref },
        ],
      }
    }

    case 'tool-marker': {
      const t = tr().detectors.toolMarker
      return {
        title: t.title,
        summary: t.summary(facts.path, facts.hits.length),
        evidence: [
          { label: t.foundLabel, detail: facts.hits.join('\n') },
          { label: t.whyLabel, detail: t.whyDetail },
          { label: t.openFile, href: facts.fileHref },
        ],
      }
    }
  }
}

/** 목록에서 한 줄로 쓸 때. 제목만 필요한 자리가 많다. */
export const titleOf = (finding: Finding) => describeFinding(finding).title

/** 공유문과 MCP 응답이 같은 한 문장을 쓰게 한다. */
export const summaryOf = (finding: Finding) => describeFinding(finding).summary
