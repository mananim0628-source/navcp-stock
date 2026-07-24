'use client'

import { useState } from 'react'
import Link from 'next/link'
import { type StockScore } from '@/lib/supabase'
import { T, cardStyle, gradeColor, gradeLabel } from '@/lib/theme'

// 등급 필터 바 + 종목 카드 리스트. 강한우호/우호/중립/주의/경계.
const BANDS: { key: string; label: string; test: (t: number) => boolean }[] = [
  { key: 'all', label: '전체', test: () => true },
  { key: 's', label: '강한 우호', test: t => t >= 78 },
  { key: 'f', label: '우호', test: t => t >= 66 && t < 78 },
  { key: 'n', label: '중립', test: t => t >= 56 && t < 66 },
  { key: 'c', label: '주의', test: t => t >= 48 && t < 56 },
  { key: 'w', label: '경계', test: t => t < 48 },
]

export default function ScoresList({ rows }: { rows: StockScore[] }) {
  const [band, setBand] = useState('all')
  const [q, setQ] = useState('')
  const num = (v: unknown) => (v == null ? 0 : Number(v))
  const active = BANDS.find(b => b.key === band)!
  const query = q.trim().toLowerCase()
  const filtered = rows
    .filter(r => active.test(Math.round(num(r.scores?.total))))
    .filter(r => !query || (r.name || '').toLowerCase().includes(query) || (r.symbol || '').includes(query))
  const count = (b: typeof BANDS[number]) => rows.filter(r => b.test(Math.round(num(r.scores?.total)))).length
  // 퍼센타일(유니버스 대비 상위 %) — Stockopedia StockRank 방식
  const totals = rows.map(r => Math.round(num(r.scores?.total))).filter(Number.isFinite)
  const topPct = (t: number) => totals.length > 1
    ? Math.max(1, 100 - Math.round((totals.filter(x => x < t).length / totals.length) * 100)) : null

  return (
    <>
      {/* 검색 */}
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="종목명 · 코드 검색"
        style={{ width: '100%', marginTop: 18, padding: '11px 14px', borderRadius: 12, fontSize: 14,
          background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.cardBr}`, color: T.text, outline: 'none' }} />
      {/* 필터 바 */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {BANDS.map(b => {
          const on = band === b.key
          const c = b.key === 's' || b.key === 'f' ? T.green : b.key === 'n' || b.key === 'c' ? T.amber : b.key === 'w' ? T.red : T.teal
          return (
            <button key={b.key} onClick={() => setBand(b.key)}
              style={{ padding: '7px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                background: on ? c : 'transparent', color: on ? T.onTeal : T.muted, border: `1px solid ${on ? c : T.cardBr}` }}>
              {b.label} <span style={{ opacity: 0.7, fontSize: 11 }}>{count(b)}</span>
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <div style={{ ...cardStyle, borderRadius: 14, padding: 24, marginTop: 16, textAlign: 'center', color: T.muted }}>이 등급의 종목이 없어요.</div>
      ) : (
        <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
          {filtered.map(r => {
            const total = Math.round(num(r.scores?.total))
            const cov = r.coverage != null ? Math.round(Number(r.coverage) * 100) : null
            const low = cov != null && cov < 85
            const col = gradeColor(total)
            const price = r.scores?.price != null ? Number(r.scores.price).toLocaleString('ko-KR') + '원' : null
            const chg = r.scores?.chg != null ? Number(r.scores.chg) : null
            return (
              <Link key={r.symbol} href={`/scores/${r.symbol}`} style={{ ...cardStyle, borderRadius: 12, padding: 14, display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', color: T.text }}>
                <div style={{ width: 46, height: 46, borderRadius: '50%', border: `3px solid ${col}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: col, flexShrink: 0 }}>{total}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{r.name || r.symbol} <span style={{ color: T.muted, fontSize: 12 }}>{r.symbol}</span></div>
                  <div style={{ fontSize: 12, marginTop: 2 }}>
                    <span style={{ color: col, fontWeight: 700 }}>{gradeLabel(total)}</span>
                    {topPct(total) != null && <span style={{ color: T.teal, marginLeft: 8, fontWeight: 700 }}>상위 {topPct(total)}%</span>}
                    {cov != null && <span style={{ color: low ? T.red : T.muted, marginLeft: 8 }}>커버리지 {cov}%{low ? ' ⚠️' : ''}</span>}
                  </div>
                </div>
                {price && (
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{price}</div>
                    {chg != null && chg !== 0 && <div style={{ fontSize: 12, fontWeight: 700, color: chg > 0 ? T.green : T.red }}>{chg > 0 ? '▲' : '▼'}{Math.abs(chg)}%</div>}
                  </div>
                )}
                <span style={{ color: T.muted, fontSize: 18, flexShrink: 0 }}>›</span>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
