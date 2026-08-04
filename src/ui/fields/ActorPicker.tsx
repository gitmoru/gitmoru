import { useTr } from '../../i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { GitHubClient } from '../../core/github'
import { Floating } from './Floating'

/**
 * 의심 계정 고르기.
 *
 * 직접 칠 수도 있지만, 조직 사람 목록을 미리 받아와서 **몇 글자만 치면 뜨게** 한다.
 * 계정 이름은 오타 나기 쉽고, 오타가 나면 조용히 0건이 나온다.
 * 사용자는 왜 안 나오는지 알 방법이 없다 - 그게 제일 나쁜 실패다.
 *
 * 목록은 아래 내용을 밀어내지 않고 화면 위에 떠서 스크롤한다.
 */

interface Props {
  value: string
  onChange: (v: string) => void
  gh: GitHubClient
  /** 지금 고른 범위. 여기 속한 사람들을 후보로 쓴다. */
  orgs: string[]
  repos: string[]
  onFocus?: () => void
  onBlur?: () => void
}

export function ActorPicker({ value, onChange, gh, orgs, repos, onFocus, onBlur }: Props) {
  const t = useTr()
  const [members, setMembers] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // 고른 범위의 소유자들에게서 사람을 모은다
  const owners = useMemo(() => {
    const fromRepos = repos.map((r) => r.split('/')[0]!).filter(Boolean)
    return [...new Set([...orgs, ...fromRepos])]
  }, [orgs, repos])

  useEffect(() => {
    if (owners.length === 0) {
      setMembers([])
      return
    }
    let alive = true
    setLoading(true)
    Promise.all(owners.map((o) => gh.listOrgMembers(o).catch(() => [])))
      .then((lists) => {
        if (alive) setMembers([...new Set(lists.flat())].sort())
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [gh, owners])

  const hits = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return members
    return members.filter((m) => m.toLowerCase().includes(q) && m !== value)
  }, [value, members])

  const pick = (m: string) => {
    onChange(m)
    setOpen(false)
    inputRef.current?.blur()
  }

  return (
    <div>
      <input
        ref={inputRef}
        className="field"
        value={value}
        placeholder={t.actorPicker.placeholder}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          setOpen(true)
          onFocus?.()
        }}
        onBlur={() => {
          // 목록을 누를 시간을 준다
          setTimeout(() => setOpen(false), 140)
          onBlur?.()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && hits[0]) {
            e.preventDefault()
            pick(hits[0])
          }
          if (e.key === 'Escape') setOpen(false)
        }}
      />

      <Floating anchor={inputRef.current} open={open && (hits.length > 0 || loading)}>
        {loading && members.length === 0 ? (
          <p className="px-2.5 py-2 text-[11px] text-[var(--color-faint)]">{t.actorPicker.searching}</p>
        ) : (
          <>
            <p className="px-2.5 pt-2 pb-1 text-[10px] text-[var(--color-faint)]">
              {t.actorPicker.summary(owners.join(', '), hits.length)}
            </p>
            {hits.map((m) => (
              <button
                key={m}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(m)}
                className="block w-full px-2.5 py-1.5 text-left font-mono text-[11px] text-[var(--color-muted)] hover:bg-[var(--color-moss)] hover:text-[#16241c]"
              >
                {m}
              </button>
            ))}
          </>
        )}
      </Floating>

      {!loading && members.length === 0 && owners.length > 0 && (
        <p className="mt-1 text-[10.5px] text-[var(--color-faint)]">
          {t.actorPicker.failed}
        </p>
      )}
    </div>
  )
}
