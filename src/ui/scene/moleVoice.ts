import { tr } from '../../i18n'
import type { MoleMood } from './Mole'
import type { ScanProgress } from '../../core/scan'

/**
 * 모루가 하는 말.
 *
 * 한 군데 모아둔 이유 - 여기저기서 말하게 두면 금세 말투가 흐트러지고,
 * 무엇보다 **하면 안 되는 말**이 새어 나간다.
 *
 * 말투 규칙
 *   - 짧게. 한 줄 넘기지 않는다
 *   - 설명하지 않는다. 모루는 옆에 있는 친구지 안내문이 아니다
 *   - **"안전해요", "문제 없어요" 는 절대 안 한다.**
 *     우리가 아는 건 "안 나왔다"이지 "없다"가 아니다
 */

export interface VoiceContext {
  scanning: boolean
  progress: ScanProgress | null
  hasCase: boolean
  changed: number
  unknown: number
  unreviewed: number
  focusedField: string | null
  reading: boolean
  idleMs: number
  error: string | null
}

export interface Line {
  mood: MoleMood
  say: string
}

export function moleVoice(ctx: VoiceContext): Line {
  const t = tr().mole

  if (ctx.error) return { mood: 'lost', say: t.error }

  if (ctx.scanning) {
    return { mood: 'digging', say: ctx.progress ? t.phases[ctx.progress.phase] : t.digging }
  }

  // 뭔가 읽고 있으면 방해 안 하고 같이 본다
  if (ctx.reading) return { mood: 'curious', say: t.reading }

  if (ctx.focusedField) {
    const hint = t.fields[ctx.focusedField as keyof typeof t.fields]
    if (hint) return { mood: 'peek', say: hint }
  }

  if (ctx.hasCase) {
    // 못 판 곳이 있으면 그것부터 말한다
    if (ctx.unknown > 0) return { mood: 'lost', say: t.unknown(ctx.unknown) }
    if (ctx.unreviewed > 0) return { mood: 'found', say: t.unreviewed(ctx.unreviewed) }
    if (ctx.changed > 0) return { mood: 'found', say: t.changed(ctx.changed) }
    // 안 나왔다고 안전하다고는 안 한다
    return { mood: 'cheer', say: t.nothing }
  }

  if (ctx.idleMs > 45_000) return { mood: 'sleep', say: '' }

  const i = Math.floor(ctx.idleMs / 9000) % t.chatter.length
  return { mood: 'idle', say: t.chatter[i]! }
}
