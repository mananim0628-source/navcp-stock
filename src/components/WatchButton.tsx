'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { T } from '@/lib/theme'

// 관심종목 토글 — 로그인 상태에서만 동작. 비로그인 시 안내만 하고 개인정보를 요구하지 않는다.
export default function WatchButton({ symbol, country = 'KR', lang = 'ko' }: { symbol: string; country?: string; lang?: 'ko' | 'en' }) {
  const en = lang === 'en'
  const [uid, setUid] = useState<string | null>(null)
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let alive = true
    supabase.auth.getUser().then(async ({ data }) => {
      if (!alive) return
      const id = data.user?.id ?? null
      setUid(id)
      if (!id) return
      const { data: w } = await supabase.from('stock_watchlist').select('symbol').eq('symbol', symbol).maybeSingle()
      if (alive) setOn(!!w)
    })
    return () => { alive = false }
  }, [symbol])

  async function toggle() {
    if (!uid) { setMsg(en ? 'Sign in to save (free).' : '저장하려면 로그인이 필요해요 (무료).'); return }
    setBusy(true); setMsg('')
    if (on) {
      await supabase.from('stock_watchlist').delete().eq('user_id', uid).eq('symbol', symbol)
      setOn(false)
    } else {
      const { error } = await supabase.from('stock_watchlist').insert({ user_id: uid, symbol, country })
      if (!error) setOn(true)
    }
    setBusy(false)
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
      <button onClick={toggle} disabled={busy} aria-pressed={on}
        style={{
          padding: '7px 13px', borderRadius: 9, fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
          background: on ? T.gold : 'transparent', color: on ? '#0b1020' : T.muted,
          border: `1px solid ${on ? T.gold : T.cardBr}`, whiteSpace: 'nowrap',
        }}>
        {on ? (en ? '★ Watching' : '★ 관심종목') : (en ? '☆ Add to watchlist' : '☆ 관심종목 담기')}
      </button>
      {msg && <span style={{ fontSize: 10.5, color: T.muted }}>{msg}</span>}
    </span>
  )
}
