import { useTr } from '../../i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { GitHubClient } from '../../core/github'
import { Floating } from './Floating'

/**
 * 어디를 팔지 정하기.
 *
 * **검색부터 시작한다.** 조직 → 저장소 순서로 고르게 하는 건 우리 머릿속 구조지
 * 쓰는 사람 머릿속 구조가 아니다. 보통은 저장소 이름부터 떠올린다.
 *
 * 그리고 목록은 조직 저장소 + **개인 저장소**를 다 담는다.
 * 조직 목록만 쓰면 `내계정/무언가` 를 아예 못 고른다 - 개인용 도구인데 그럼 안 된다.
 *
 * 고른 게 저장소 하나면 브랜치까지 좁힐 수 있다. 좁힐수록 검사가 빨라진다.
 */

export interface Scope {
  orgs: string[]
  /** `owner/repo`. 비어 있으면 조직 전체 */
  repos: string[]
  /** `owner/repo@branch`. 비어 있으면 저장소 전체 */
  branches: string[]
}

interface Props {
  gh: GitHubClient
  value: Scope
  onChange: (s: Scope) => void
  onFocus?: () => void
  onBlur?: () => void
}

export function ScopePicker({ gh, value, onChange, onFocus, onBlur }: Props) {
  const t = useTr()
  const [all, setAll] = useState<string[]>([])
  const [owners, setOwners] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const [branches, setBranches] = useState<string[]>([])
  const [branchesLoading, setBranchesLoading] = useState(false)

  useEffect(() => {
    gh.listAccessibleRepos()
      .then((repos) => {
        setAll(repos.map((r) => r.fullName))
        // 최근 푸시 순으로 오므로 그 순서대로 소유자를 모은다
        setOwners([...new Set(repos.map((r) => r.owner))])
      })
      .catch(() => {
        setAll([])
        setOwners([])
      })
      .finally(() => setLoading(false))
  }, [gh])

  // 저장소를 딱 하나 골랐을 때만 브랜치를 보여준다
  const soleRepo = value.repos.length === 1 ? value.repos[0]! : null
  useEffect(() => {
    if (!soleRepo) {
      setBranches([])
      return
    }
    setBranchesLoading(true)
    gh.listBranches(soleRepo)
      .then((b) => setBranches(b.map((x) => x.branch)))
      .catch(() => setBranches([]))
      .finally(() => setBranchesLoading(false))
  }, [gh, soleRepo])

  /**
   * 후보 목록.
   *
   * 아무것도 안 쳤을 때도 보여준다 - 쳐야만 나오면 여기서 뭘 할 수 있는지 모른다.
   * 목록은 최근 푸시 순으로 오니, 그냥 열기만 해도 최근에 건드린 곳이 위에 온다.
   * 사고를 쫓을 땐 대개 그중 하나다.
   */
  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const pool = all.filter((r) => !value.repos.includes(r))
    if (!needle) return pool.slice(0, 40)
    return pool.filter((r) => r.toLowerCase().includes(needle)).slice(0, 40)
  }, [q, all, value.repos])

  /**
   * 저장소를 담고 뺀다.
   *
   * 조직은 건드리지 않는다. 저장소를 담으면서 소유자를 조직 목록에도 넣으면
   * 같은 선택이 화면 두 곳에 뜨게 되고, 사용자는 무엇이 범위인지 헷갈린다.
   */
  const pickRepo = (full: string) => {
    const already = value.repos.includes(full)
    onChange({
      orgs: [],
      repos: already ? value.repos.filter((r) => r !== full) : [...value.repos, full],
      branches: [],
    })
    setQ('')
  }

  /** 통째로 파기. 저장소를 골라둔 게 있으면 비운다 - 둘은 동시에 성립하지 않는다. */
  const pickOwner = (owner: string) => {
    const on = value.orgs.includes(owner)
    onChange({
      orgs: on ? value.orgs.filter((o) => o !== owner) : [...value.orgs, owner],
      repos: [],
      branches: [],
    })
  }

  const toggleBranch = (b: string) => {
    const key = `${soleRepo}@${b}`
    onChange({
      ...value,
      branches: value.branches.includes(key)
        ? value.branches.filter((v) => v !== key)
        : [...value.branches, key],
    })
  }

  return (
    <div>
      <input
        ref={searchRef}
        className="field"
        value={q}
        placeholder={loading ? t.scopePicker.loadingList : t.scopePicker.searchPlaceholder}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          setOpen(true)
          onFocus?.()
        }}
        onBlur={() => {
          setTimeout(() => setOpen(false), 140)
          onBlur?.()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && hits[0]) {
            e.preventDefault()
            pickRepo(hits[0])
            setOpen(false)
          }
          if (e.key === 'Escape') setOpen(false)
        }}
      />

      {/* 검색 결과 - 아래를 밀어내지 않고 떠서 스크롤한다 */}
      <Floating anchor={searchRef.current} open={open && !loading}>
        {hits.length === 0 ? (
          <p className="px-2.5 py-2 text-[11px] text-[var(--color-faint)]">
            {q.trim() ? t.scopePicker.noMatch : t.scopePicker.noneAvailable}
          </p>
        ) : (
          <>
            <p className="px-2.5 pt-2 pb-1 text-[10px] text-[var(--color-faint)]">
              {q.trim() ? t.scopePicker.hitCount(hits.length) : t.scopePicker.recentOrder}
            </p>
            {hits.map((h) => (
              <button
                key={h}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  pickRepo(h)
                  setOpen(false)
                }}
                className="group block w-full px-2.5 py-1.5 text-left font-mono text-[11px] hover:bg-[var(--color-moss)] hover:text-[#16241c]"
              >
                <span className="text-[var(--color-faint)] group-hover:text-[#2c4a38]">
                  {h.split('/')[0]}/
                </span>
                <span className="text-[var(--color-text)] group-hover:text-[#16241c]">
                  {h.split('/')[1]}
                </span>
              </button>
            ))}
          </>
        )}
      </Floating>

      {/* 고른 저장소 - 검색으로만 담기니 여기에만 둔다 */}
      {value.repos.length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5">
          {value.repos.map((r) => (
            <li key={r}>
              <button
                type="button"
                onClick={() => pickRepo(r)}
                className="flex w-full items-center gap-2 bg-[var(--color-moss)] px-2 py-1 text-left font-mono text-[11px] text-[#16241c] hover:brightness-105"
              >
                <span className="min-w-0 flex-1 truncate">{r}</span>
                <span className="opacity-55">✕</span>
              </button>
            </li>
          ))}
        </ul>
      )}


      {/* 검색 안 할 땐 통째로 팔 곳을 보여준다 */}
      {!q.trim() && !loading && owners.length > 0 && value.repos.length === 0 && (
        <div className="mt-2">
          <p className="mb-1.5 text-[10.5px] text-[var(--color-faint)]">{t.scopePicker.wholeOrg}</p>
          <div className="flex flex-wrap gap-1.5">
            {owners.slice(0, 7).map((o) => (
              <Chip key={o} on={value.orgs.includes(o)} onClick={() => pickOwner(o)}>
                {o}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* 저장소 하나면 브랜치까지 좁힐 수 있다 */}
      {soleRepo && (
        <BranchNarrow
          loading={branchesLoading}
          branches={branches}
          chosen={value.branches}
          repo={soleRepo}
          onToggle={toggleBranch}
        />
      )}
    </div>
  )
}

function BranchNarrow({
  loading,
  branches,
  chosen,
  repo,
  onToggle,
}: {
  loading: boolean
  branches: string[]
  chosen: string[]
  repo: string
  onToggle: (b: string) => void
}) {
  const t = useTr()
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between py-1 text-[11px] text-[var(--color-muted)] hover:text-[var(--color-text)]"
      >
        <span>
          {t.scopePicker.branches}{' '}
          <span className="text-[var(--color-faint)]">
            {chosen.length ? t.scopePicker.branchesPicked(chosen.length) : t.scopePicker.branchesAll}
          </span>
        </span>
        <span className="text-[var(--color-faint)]">
          {open ? t.common.collapse : t.scopePicker.narrow}
        </span>
      </button>

      {open && (
        <div className="animate-rise mt-1 max-h-40 overflow-y-auto">
          {loading ? (
            <p className="py-1 text-[11px] text-[var(--color-faint)]">{t.common.loading}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5 py-1">
              {branches.map((b) => (
                <Chip key={b} on={chosen.includes(`${repo}@${b}`)} onClick={() => onToggle(b)}>
                  {b}
                </Chip>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  const c = on ? 'var(--color-moss)' : 'var(--color-edge)'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="px-2 py-1 text-[11px] hover:brightness-125"
      style={{
        background: on ? 'var(--color-moss)' : 'transparent',
        color: on ? '#16241c' : 'var(--color-muted)',
        boxShadow: `0 -2px 0 ${c}, 0 2px 0 ${c}, -2px 0 0 ${c}, 2px 0 0 ${c}`,
      }}
    >
      {children}
    </button>
  )
}
