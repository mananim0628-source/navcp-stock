'use client'

import { useState } from 'react'
import Link from 'next/link'
import { type StockScore } from '@/lib/supabase'
import { T, cardStyle, gradeColor, gradeLabel } from '@/lib/theme'


// 다중 조건 필터(Finviz 방식). 밸류·공매도는 절대값이 아니라 **유니버스 상대 백분위**로 판정 —
// 시장 전체가 고평가/저평가로 이동해도 필터가 무의미해지지 않게(고정 임계 하드코딩 회피).
function pctThreshold(vals: number[], p: number): number | null {
  const v = vals.filter(x => Number.isFinite(x) && x > 0).sort((a, b) => a - b)
  if (v.length < 4) return null
  return v[Math.min(v.length - 1, Math.floor(v.length * p))]
}

export default function ScoresList({ rows, lang = 'ko', isUS = false }: { rows: StockScore[]; lang?: 'ko' | 'en'; isUS?: boolean }) {
  const en = lang === 'en'
  // 등급 필터 바 (라벨은 언어별)
  const BANDS: { key: string; label: string; test: (t: number) => boolean }[] = [
    { key: 'all', label: en ? 'All' : '전체', test: () => true },
    { key: 's', label: en ? 'Strongly Favorable' : '강한 우호', test: t => t >= 78 },
    { key: 'f', label: en ? 'Favorable' : '우호', test: t => t >= 66 && t < 78 },
    { key: 'n', label: en ? 'Neutral' : '중립', test: t => t >= 56 && t < 66 },
    { key: 'c', label: en ? 'Caution' : '주의', test: t => t >= 48 && t < 56 },
    { key: 'w', label: en ? 'Warning' : '경계', test: t => t < 48 },
  ]
  const [band, setBand] = useState('all')
  const [q, setQ] = useState('')
  const [on, setOn] = useState<string[]>([])
  const num = (v: unknown) => (v == null ? 0 : Number(v))
  const active = BANDS.find(b => b.key === band)!
  const query = q.trim().toLowerCase()
  const toggle = (k: string) => setOn(o => (o.includes(k) ? o.filter(x => x !== k) : [...o, k]))

  // 유니버스 분포에서 임계 산출(하위/상위 30%)
  const perCut = pctThreshold(rows.map(r => Number(r.scores?.per)), 0.3)
  const shortCut = pctThreshold(rows.map(r => Number(r.scores?.short_ratio)), 0.3)
  const roeCut = pctThreshold(rows.map(r => Number(r.scores?.roe)), 0.7)
  const FILTERS: { key: string; label: string; test: (s: any) => boolean }[] = [
    { key: 'buy', label: en ? 'Institutional net buying' : '기관·외국인 순매수', test: s => s?.supply_dir === '순매수' },
    { key: 'per', label: perCut ? en ? `Low PER (≤${Math.round(perCut)})` : `저PER (${Math.round(perCut)} 이하)` : en ? 'Low PER' : '저PER', test: s => perCut != null && Number(s?.per) > 0 && Number(s?.per) <= perCut },
    { key: 'roe', label: roeCut ? en ? `High ROE (≥${Math.round(roeCut)}%)` : `고ROE (${Math.round(roeCut)}% 이상)` : en ? 'High ROE' : '고ROE', test: s => roeCut != null && Number(s?.roe) >= roeCut },
    { key: 'short', label: shortCut ? en ? `Low short (<${shortCut.toFixed(1)}%)` : `공매도 낮음 (${shortCut.toFixed(1)}% 미만)` : en ? 'Low short' : '공매도 낮음', test: s => shortCut != null && Number(s?.short_ratio) < shortCut },
    { key: 'up', label: en ? 'Above 20D MA' : '20일선 위', test: s => Number(s?.price) > Number(s?.ma20) },
    { key: 'cov', label: en ? 'Coverage 90%+' : '커버리지 90%+', test: s => Number(s?.coverage) >= 0.9 },
  ]
  const filtered = rows
    .filter(r => active.test(Math.round(num(r.scores?.total))))
    .filter(r => !query || (r.name || '').toLowerCase().includes(query) || (r.symbol || '').includes(query))
    .filter(r => on.every(k => FILTERS.find(f => f.key === k)!.test({ ...r.scores, coverage: r.coverage })))
  const count = (b: { test: (t: number) => boolean }) => rows.filter(r => b.test(Math.round(num(r.scores?.total)))).length
  // 퍼센타일(유니버스 대비 상위 %) — Stockopedia StockRank 방식
  const totals = rows.map(r => Math.round(num(r.scores?.total))).filter(Number.isFinite)
  const topPct = (t: number) => totals.length > 1
    ? Math.max(1, 100 - Math.round((totals.filter(x => x < t).length / totals.length) * 100)) : null

  return (
    <>
      {/* 검색 */}
      <input value={q} onChange={e => setQ(e.target.value)} placeholder={en ? "Search name or symbol" : "종목명 · 코드 검색"}
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

      {/* 다중 조건 필터 */}
      <div style={{ display: 'flex', gap: 7, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11.5, color: T.muted }}>{en ? 'Filters' : '조건'}</span>
        {FILTERS.map(f => {
          const sel = on.includes(f.key)
          return (
            <button key={f.key} onClick={() => toggle(f.key)}
              style={{ padding: '5px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                background: sel ? T.teal : 'transparent', color: sel ? T.onTeal : T.muted, border: `1px solid ${sel ? T.teal : T.cardBr}` }}>
              {f.label}
            </button>
          )
        })}
        {on.length > 0 && <button onClick={() => setOn([])} style={{ background: 'none', border: 'none', color: T.red, fontSize: 11.5, cursor: 'pointer', fontWeight: 700 }}>{en ? 'Reset' : '초기화'}</button>}
      </div>
      <div style={{ fontSize: 12, color: T.muted, marginTop: 10 }}>{filtered.length} {en ? 'stocks' : '종목'}</div>

      {filtered.length === 0 ? (
        <div style={{ ...cardStyle, borderRadius: 14, padding: 24, marginTop: 16, textAlign: 'center', color: T.muted }}>{en ? 'No stocks in this grade.' : '이 등급의 종목이 없어요.'}</div>
      ) : (
        <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
          {filtered.map(r => {
            const total = Math.round(num(r.scores?.total))
            const cov = r.coverage != null ? Math.round(Number(r.coverage) * 100) : null
            const low = cov != null && cov < 85
            const col = gradeColor(total)
            const price = r.scores?.price == null ? null
              : isUS ? '$' + Number(r.scores.price).toLocaleString('en-US', { maximumFractionDigits: 2 })
              : Number(r.scores.price).toLocaleString('ko-KR') + '원'
            const chg = r.scores?.chg != null ? Number(r.scores.chg) : null
            return (
              <Link key={r.symbol} href={`/scores/${r.symbol}`} style={{ ...cardStyle, borderRadius: 12, padding: 14, display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', color: T.text }}>
                <div style={{ width: 46, height: 46, borderRadius: '50%', border: `3px solid ${col}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: col, flexShrink: 0 }}>{total}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{r.name || r.symbol} <span style={{ color: T.muted, fontSize: 12 }}>{r.symbol}</span></div>
                  <div style={{ fontSize: 12, marginTop: 2 }}>
                    <span style={{ color: col, fontWeight: 700 }}>{gradeLabel(total, lang)}</span>
                    {topPct(total) != null && <span style={{ color: T.teal, marginLeft: 8, fontWeight: 700 }}>{en ? 'Top' : '상위'} {topPct(total)}%</span>}
                    {cov != null && <span style={{ color: low ? T.red : T.muted, marginLeft: 8 }}>{en ? 'Cov' : '커버리지'} {cov}%{low ? ' ⚠️' : ''}</span>}
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
