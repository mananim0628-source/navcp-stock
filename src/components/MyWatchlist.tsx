'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { T, cardStyle, gradeColor, gradeLabel } from '@/lib/theme'

type Row = { symbol: string; country: string; name?: string | null; total?: number | null; coverage?: number | null; price?: number | null; chg?: number | null }

export default function MyWatchlist({ lang = 'ko' }: { lang?: 'ko' | 'en' }) {
  const en = lang === 'en'
  const [rows, setRows] = useState<Row[] | null>(null)
  const [signedIn, setSignedIn] = useState<boolean | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      const { data: u } = await supabase.auth.getUser()
      if (!alive) return
      if (!u.user) { setSignedIn(false); setRows([]); return }
      setSignedIn(true)
      const { data: w } = await supabase.from('stock_watchlist').select('symbol,country')
      const syms = (w || []).map(x => x.symbol)
      if (!syms.length) { setRows([]); return }
      const { data: sc } = await supabase.from('stock_score_cache').select('symbol,name,scores,coverage').in('symbol', syms)
      const map = new Map((sc || []).map((s: any) => [s.symbol, s]))
      if (!alive) return
      setRows((w || []).map(x => {
        const s: any = map.get(x.symbol)
        return {
          symbol: x.symbol, country: x.country, name: s?.name,
          total: s?.scores?.total != null ? Math.round(Number(s.scores.total)) : null,
          coverage: s?.coverage, price: s?.scores?.price, chg: s?.scores?.chg,
        }
      }))
    }
    load()
    const { data: sub } = supabase.auth.onAuthStateChange(() => load())
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  async function remove(symbol: string) {
    const { data: u } = await supabase.auth.getUser()
    if (!u.user) return
    await supabase.from('stock_watchlist').delete().eq('user_id', u.user.id).eq('symbol', symbol)
    setRows(r => (r || []).filter(x => x.symbol !== symbol))
  }

  return (
    <div style={{ ...cardStyle, borderRadius: 14, padding: 18 }}>
      <div style={{ fontSize: 15, fontWeight: 800 }}>{en ? '★ Watchlist' : '★ 관심종목'}</div>
      {signedIn === false ? (
        <p style={{ fontSize: 12.5, color: T.muted, marginTop: 8 }}>
          {en ? 'Sign in above to save stocks you want to track.' : '위에서 로그인하면 관심종목을 저장할 수 있어요.'}
        </p>
      ) : rows == null ? (
        <p style={{ fontSize: 12.5, color: T.muted, marginTop: 8 }}>{en ? 'Loading…' : '불러오는 중…'}</p>
      ) : rows.length === 0 ? (
        <p style={{ fontSize: 12.5, color: T.muted, marginTop: 8 }}>
          {en ? 'No stocks yet — add one from any stock page.' : '아직 없습니다 — 종목 상세에서 ☆ 버튼으로 담아보세요.'}
        </p>
      ) : (
        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          {rows.map(r => {
            const col = r.total != null ? gradeColor(r.total) : T.muted
            const isUS = r.country === 'US'
            const price = r.price == null ? null
              : isUS ? '$' + Number(r.price).toLocaleString('en-US', { maximumFractionDigits: 2 })
              : Number(r.price).toLocaleString('ko-KR') + '원'
            return (
              <div key={r.symbol} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.cardBr}` }}>
                <span style={{ fontSize: 10, fontWeight: 900, padding: '2px 6px', borderRadius: 5, background: isUS ? T.us : T.kr, color: '#0b1020' }}>{isUS ? 'US' : 'KR'}</span>
                <Link href={`/scores/${r.symbol}`} style={{ flex: 1, minWidth: 0, color: T.text }}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name || r.symbol}</span>
                  {r.total != null && <span style={{ fontSize: 11, color: col, fontWeight: 700 }}>{r.total}{en ? 'pts' : '점'} · {gradeLabel(r.total, lang)}</span>}
                </Link>
                {price && <span style={{ fontSize: 12.5, fontWeight: 700 }}>{price}</span>}
                {r.chg != null && r.chg !== 0 && (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: Number(r.chg) > 0 ? T.green : T.red }}>
                    {Number(r.chg) > 0 ? '▲' : '▼'}{Math.abs(Number(r.chg))}%
                  </span>
                )}
                <button onClick={() => remove(r.symbol)} title={en ? 'Remove' : '삭제'}
                  style={{ background: 'none', border: 'none', color: T.muted, cursor: 'pointer', fontSize: 14 }}>✕</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
