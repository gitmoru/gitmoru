import { useTr } from '../../i18n'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import type { ScanProgress } from '../../core/scan'
import type { BranchState, CaseFile, Finding } from '../../core/types'
import { Sky } from './Sky'

import { PixelArt, PIXEL } from './PixelArt'
import { PALETTE, SEQ_MOUND } from './sprites'

/**
 * 바깥 풍경.
 *
 * 위는 하늘, 아래는 땅. 모루가 서 있는 곳이 땅이다.
 * 저장소는 땅 위에 흙더미로 놓인다 - 모루가 파러 다니는 자리다.
 *
 * 흙더미 색은 사실이다. 특히 '못 판 곳'을 다른 색으로 접지 않는다 (SAFETY.md 0번).
 */

/**
 * 지표면 두께.
 *
 * 얇은 막이면 된다. 두꺼운 흙 띠를 깔면 하늘이 좁아지고
 * 모루가 흙에 파묻힌 것처럼 보인다. 여긴 '선'이지 '땅덩어리'가 아니다.
 */
export const GROUND_H = 12



const DOT: Record<BranchState['status'], string> = {
  changed: 'var(--color-apricot)',
  reverted: 'var(--color-moss)',
  untouched: 'var(--color-faint)',
  unknown: 'var(--color-sand)',
}

/** 파는 순서 */
const PHASES = ['repos', 'events', 'branches', 'changes', 'detect'] as const

interface Props {
  caseFile: CaseFile | null
  scanning: boolean
  progress: ScanProgress | null
  selectedRepo: string | null
  onSelectRepo: (repo: string) => void
  onSelectFinding: (f: Finding) => void
}

export function Ground({
  caseFile,
  scanning,
  progress,
  selectedRepo,
  onSelectRepo,
  onSelectFinding,
}: Props) {
  const t = useTr()
  /** 저장소별로 묶는다. 손봐야 할 게 많은 곳이 앞으로 온다. */
  const piles = useMemo(() => {
    if (!caseFile) return []
    const byRepo = new Map<string, BranchState[]>()
    for (const b of caseFile.branches) {
      const list = byRepo.get(b.repo) ?? []
      list.push(b)
      byRepo.set(b.repo, list)
    }
    return [...byRepo.entries()]
      .map(([repo, branches]) => ({
        repo,
        branches,
        changed: branches.filter((b) => b.status === 'changed').length,
        unknown: branches.filter((b) => b.status === 'unknown').length,
        reverted: branches.filter((b) => b.status === 'reverted').length,
      }))
      .sort((a, b) => b.unknown * 2 + b.changed - (a.unknown * 2 + a.changed))
  }, [caseFile])

  const atPhase = PHASES.findIndex((phase) => phase === progress?.phase)

  return (
    <div className="relative h-full overflow-hidden">
      <Sky />

      {/* 파는 동안 - 하늘에 글자만 띄우면 우리 화면 같지가 않다. 패널로 앉힌다. */}
      {scanning && (
        <div className="absolute top-5 left-5 w-[340px] bg-[var(--color-panel)]/92 p-3.5 backdrop-blur-sm"
          style={{
            boxShadow:
              '0 -3px 0 var(--color-edge), 0 3px 0 var(--color-edge), -3px 0 0 var(--color-edge), 3px 0 0 var(--color-edge)',
          }}
        >
          <p className="mb-3 text-[11.5px] font-semibold">{t.scene.digging}</p>

          <ul className="space-y-2">
            {PHASES.map((phase, i) => {
              const done = atPhase > i
              const now = atPhase === i
              return (
                <li key={phase}>
                  <div className="flex items-center gap-2">
                    {/* 다 판 층은 꽉 찬 네모, 지금 층은 살구색, 아직은 빈 테두리 */}
                    <span
                      className="shrink-0"
                      style={{
                        width: 7,
                        height: 7,
                        background: done
                          ? 'var(--color-moss)'
                          : now
                            ? 'var(--color-apricot)'
                            : 'transparent',
                        boxShadow: done || now ? undefined : 'inset 0 0 0 2px var(--color-edge)',
                      }}
                    />
                    <span
                      className="text-[11.5px]"
                      style={{
                        color: done
                          ? 'var(--color-muted)'
                          : now
                            ? 'var(--color-text)'
                            : 'var(--color-faint)',
                      }}
                    >
                      {t.scene.phases[phase]}
                    </span>
                    {done && (
                      <span className="ml-auto text-[10px] text-[var(--color-moss)]">
                        {t.scene.doneLayer}
                      </span>
                    )}
                  </div>

                  {/* 지금 파는 층만 자세히 */}
                  {now && progress && (
                    <div className="mt-1.5 pl-[15px]">
                      <p className="mb-1 truncate font-mono text-[10px] text-[var(--color-muted)]">
                        {progress.message}
                      </p>
                      {progress.total > 1 && (
                        <div className="flex items-center gap-2">
                          <div className="dots">
                            {Array.from({ length: 14 }, (_, k) => (
                              <span
                                key={k}
                                className={
                                  k < Math.round((progress.current / progress.total) * 14)
                                    ? 'dot dot-on'
                                    : 'dot'
                                }
                              />
                            ))}
                          </div>
                          <span className="font-mono text-[9.5px] text-[var(--color-faint)]">
                            {progress.current}/{progress.total}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* 다 판 뒤 - 저장소가 흙더미로 땅 위에 놓인다 */}
      {!scanning && caseFile && piles.length > 0 && (
        <div
          className="absolute inset-x-0 flex items-end gap-5 overflow-x-auto px-5"
          style={{ bottom: GROUND_H }}
        >
          {piles.map((p) => (
            <Pile
              key={p.repo}
              repo={p.repo}
              total={p.branches.length}
              changed={p.changed}
              unknown={p.unknown}
              reverted={p.reverted}
              selected={selectedRepo === p.repo}
              onClick={() => onSelectRepo(p.repo)}
              signal={caseFile.findings.find((f) => f.repo === p.repo && f.attention === 'first')}
              onSignal={onSelectFinding}
            />
          ))}
        </div>
      )}

      {/* 지표면 - 얇은 막 한 줄 */}
      <div className="absolute inset-x-0 bottom-0" style={{ height: GROUND_H }}>
        <div style={{ height: PIXEL, background: '#7d5f43' }} />
        <div style={{ height: GROUND_H - PIXEL, background: '#4a3626' }} />
      </div>
    </div>
  )
}

/** 저장소 하나 = 흙더미 하나 */
function Pile({
  repo,
  total,
  changed,
  unknown,
  reverted,
  selected,
  onClick,
  signal,
  onSignal,
}: {
  repo: string
  total: number
  changed: number
  unknown: number
  reverted: number
  selected: boolean
  onClick: () => void
  signal?: Finding
  onSignal: (f: Finding) => void
}) {
  const t = useTr()
  const name = repo.split('/').pop() ?? repo

  /*
    라벨은 '무슨 일이 있었는지'를 말해야 한다.
    그냥 `7개` 는 아무 뜻이 없고, 초록으로 칠하면 "확인했으니 안전"으로 읽힌다.
    우리는 안전을 주장하지 않으므로 아무 일 없던 곳은 조용히 물러나게 둔다.
  */
  const state =
    unknown > 0
      ? { text: t.scene.mound.unknown(unknown), tint: DOT.unknown, quiet: false }
      : changed > 0
        ? { text: t.scene.mound.changed(changed), tint: DOT.changed, quiet: false }
        : reverted > 0
          ? { text: t.scene.mound.reverted(reverted), tint: DOT.reverted, quiet: false }
          : { text: t.scene.mound.untouched(total), tint: DOT.untouched, quiet: true }

  const tint = state.tint
  const mound = SEQ_MOUND[0]!

  return (
    <div
      className="flex shrink-0 flex-col items-center gap-1"
      style={{ opacity: state.quiet ? 0.45 : 1 }}
    >
      {/* 먼저 볼 게 있으면 흙더미 위에 깃발처럼 */}
      {signal && (
        <motion.button
          type="button"
          onClick={() => onSignal(signal)}
          className="max-w-[150px] truncate bg-[var(--color-panel)] px-1.5 py-0.5 text-[10px] text-[var(--color-apricot)]"
          style={{ boxShadow: '0 -2px 0 var(--color-apricot), 0 2px 0 var(--color-apricot)' }}
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          {signal.title}
        </motion.button>
      )}

      <button type="button" onClick={onClick} className="flex flex-col items-center gap-1">
        <span
          className="max-w-[130px] truncate font-mono text-[10.5px]"
          style={{ color: selected ? '#fff' : 'rgb(233 237 247 / 0.72)' }}
        >
          {name}
        </span>
        <span className="flex items-center gap-1 text-[9.5px] text-[rgb(233_237_247/0.55)]">
          <span style={{ width: 5, height: 5, background: tint }} />
          {state.text}
        </span>

        <PixelArt
          rows={mound}
          fill={PALETTE['9']}
          style={{ filter: selected ? 'brightness(1.35)' : undefined }}
        >
          {/* 상태 깃대 - 눈에 띄는 게 있으면 펄럭인다 */}
          <rect x={7} y={4} width={1} height={4} fill={tint} />
          {signal ? (
            <>
              <rect x={8} y={4} width={3} height={2} fill={tint}>
                <animate attributeName="width" values="3;2;3" dur="0.6s" repeatCount="indefinite" />
              </rect>
              <rect x={8} y={3} width={1} height={1} fill={tint}>
                <animate attributeName="y" values="3;4;3" dur="0.6s" repeatCount="indefinite" />
              </rect>
            </>
          ) : (
            <rect x={8} y={4} width={3} height={2} fill={tint} />
          )}
        </PixelArt>
      </button>
    </div>
  )
}
