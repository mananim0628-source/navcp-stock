'use client'

import { useEffect, useMemo, useState } from 'react'
import { T, cardStyle } from '@/lib/theme'

// 모의매매 손익 달력 — 시작 금액을 기준으로 일별 손익을 환산해 달력에 찍고 주/월 합산을 낸다.
// ⚠️ 시뮬레이션 가정을 숨기지 않는다:
//    ① 동일 비중(자본 ÷ 동시보유 상한)으로 1종목씩 담았다고 가정
//    ② 손익은 **청산일**에 반영
//    ③ 수수료·거래세·슬리피지 **미반영** → 실제 수익률은 이보다 낮다
export type ClosedTrade = { symbol: string; name: string | null; exit_date: string | null; pnl_pct: number | null; country: string; weight_pct?: number | null }
export type OpenPos = { weight_pct: number | null; unrealized_pct: number | null }

const MAX_SLOTS = 12          // paper_trade.mjs 의 MAX_OPEN 과 동일
const CAP_KEY = 'navcp_start_capital'

const won = (v: number) => (v >= 0 ? '+' : '−') + Math.abs(Math.round(v)).toLocaleString('ko-KR')

export default function TradeCalendar({ trades, openPos = [], lang = 'ko' }: { trades: ClosedTrade[]; openPos?: OpenPos[]; lang?: 'ko' | 'en' }) {
  const en = lang === 'en'
  const [capital, setCapital] = useState(1_000_000)
  const [ym, setYm] = useState<string>('')     // 'YYYY-MM'

  // ⚠️ 시작금액은 마운트 시 1회만 로드(trades 변경마다 덮어쓰지 않게 — 초기화 버그 방지)
  useEffect(() => {
    const v = Number(localStorage.getItem(CAP_KEY))
    if (Number.isFinite(v) && v > 0) setCapital(v)
  }, [])
  useEffect(() => {
    if (ym) return
    const latest = trades.map(t => t.exit_date).filter(Boolean).sort().pop()
    setYm((latest || new Date().toISOString()).slice(0, 7))
  }, [trades, ym])

  const slot = capital / MAX_SLOTS   // 1종목당 투입 가정액(비중 없는 옛 기록용)

  // 현재 투입 비중·평가손익(보유 중 포지션)
  const investedPct = openPos.reduce((a, p) => a + (Number(p.weight_pct) || 0), 0)
  const unreal = openPos.reduce((a, p) => a + ((Number(p.unrealized_pct) || 0) / 100) * capital * ((Number(p.weight_pct) || 0) / 100), 0)

  // 날짜별 손익(원) 집계
  const byDay = useMemo(() => {
    const m = new Map<string, { pnl: number; n: number }>()
    for (const t of trades) {
      if (!t.exit_date || t.pnl_pct == null) continue
      const g = m.get(t.exit_date) || { pnl: 0, n: 0 }
      // 실제 리스크 비중이 있으면 그 비중으로, 없으면 균등(자본÷12)으로 환산
      const invested = t.weight_pct != null ? capital * (Number(t.weight_pct) / 100) : slot
      g.pnl += (Number(t.pnl_pct) / 100) * invested
      g.n += 1
      m.set(t.exit_date, g)
    }
    return m
  }, [trades, slot, capital])

  if (!ym) return null

  const [y, mo] = ym.split('-').map(Number)
  const first = new Date(Date.UTC(y, mo - 1, 1))
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  const lead = first.getUTCDay()                       // 0=일
  const cells: (string | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`),
  ]
  while (cells.length % 7) cells.push(null)

  const monthPnl = [...byDay.entries()].filter(([d]) => d.startsWith(ym)).reduce((a, [, g]) => a + g.pnl, 0)
  const monthN = [...byDay.entries()].filter(([d]) => d.startsWith(ym)).reduce((a, [, g]) => a + g.n, 0)

  // 주별 합산(달력 행 기준)
  const weeks: { pnl: number; n: number }[] = []
  for (let i = 0; i < cells.length; i += 7) {
    let pnl = 0, n = 0
    for (const d of cells.slice(i, i + 7)) {
      if (!d) continue
      const g = byDay.get(d); if (g) { pnl += g.pnl; n += g.n }
    }
    weeks.push({ pnl, n })
  }

  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(y, mo - 1 + delta, 1))
    setYm(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  const DOW = en ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['일', '월', '화', '수', '목', '금', '토']

  return (
    <div style={{ ...cardStyle, borderRadius: 16, padding: 18 }}>
      {/* 시작 금액 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 800 }}>{en ? '📅 P/L Calendar' : '📅 손익 달력'}</span>
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: T.muted }}>
          {en ? 'Start capital' : '시작 금액'}
          <input
            value={capital.toLocaleString('ko-KR')}
            onChange={e => {
              const v = Number(e.target.value.replace(/[^\d]/g, '')) || 0
              setCapital(v); if (v > 0) localStorage.setItem(CAP_KEY, String(v))
            }}
            inputMode="numeric"
            style={{ width: 118, padding: '6px 9px', borderRadius: 8, fontSize: 12.5, textAlign: 'right',
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.cardBr}`, color: T.text, outline: 'none' }} />
          {en ? 'KRW' : '원'}
        </label>
      </div>

      {/* 현재 투입 비중 · 평가손익 */}
      <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap', alignItems: 'center',
        padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.cardBr}` }}>
        <span style={{ fontSize: 12, color: T.muted }}>{en ? 'Invested' : '현재 투입'}
          <b style={{ color: T.text, fontSize: 15, marginLeft: 5 }}>{investedPct.toFixed(1)}%</b>
          <span style={{ color: T.muted, marginLeft: 4 }}>/ {en ? 'cash' : '현금'} {(100 - investedPct).toFixed(1)}%</span>
        </span>
        <span style={{ fontSize: 12, color: T.muted }}>{en ? 'Open positions' : '보유'}
          <b style={{ color: T.text, fontSize: 15, marginLeft: 5 }}>{openPos.length}</b>
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: T.muted }}>{en ? 'Unrealized' : '평가손익'}
          <b style={{ fontSize: 15, marginLeft: 5, color: unreal > 0 ? T.green : unreal < 0 ? T.red : T.muted }}>{won(unreal)}</b>
          <span style={{ marginLeft: 4 }}>({capital > 0 ? ((unreal / capital) * 100).toFixed(2) : '0.00'}%)</span>
        </span>
      </div>

      {/* 투입 비중 게이지 */}
      <div style={{ height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', marginTop: 8 }}>
        <div style={{ width: `${Math.min(100, investedPct)}%`, height: '100%', background: investedPct > 80 ? T.amber : T.teal }} />
      </div>

      {/* 월 이동 + 월 합산 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
        <button onClick={() => shiftMonth(-1)} style={navBtn}>‹</button>
        <span style={{ fontSize: 14, fontWeight: 800, minWidth: 88, textAlign: 'center' }}>{y}.{String(mo).padStart(2, '0')}</span>
        <button onClick={() => shiftMonth(1)} style={navBtn}>›</button>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: T.muted }}>
          {en ? 'Month' : '월 합산'}{' '}
          <b style={{ fontSize: 16, color: monthPnl > 0 ? T.green : monthPnl < 0 ? T.red : T.muted }}>{won(monthPnl)}</b>
          <span style={{ marginLeft: 6 }}>
            ({capital > 0 ? ((monthPnl / capital) * 100).toFixed(2) : '0.00'}% · {monthN}{en ? ' trades' : '건'})
          </span>
        </span>
      </div>

      {/* 달력 */}
      <div className="hscroll" style={{ marginTop: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(40px,1fr)) 56px', gap: 4, minWidth: 430 }}>
        {DOW.map((d, i) => (
          <div key={i} style={{ fontSize: 10.5, color: i === 0 ? T.red : i === 6 ? T.blue : T.muted, textAlign: 'center', padding: '2px 0' }}>{d}</div>
        ))}
        <div style={{ fontSize: 10.5, color: T.muted, textAlign: 'center' }}>{en ? 'Week' : '주'}</div>

        {cells.map((d, i) => {
          const rowEnd = i % 7 === 6
          const g = d ? byDay.get(d) : null
          const pnl = g?.pnl ?? 0
          const bg = !g ? 'transparent'
            : pnl > 0 ? `rgba(40,199,111,${Math.min(0.45, 0.12 + Math.abs(pnl) / (slot * 2))})`
            : `rgba(240,101,74,${Math.min(0.45, 0.12 + Math.abs(pnl) / (slot * 2))})`
          return (
            <>
              <div key={d || `e${i}`} style={{
                minHeight: 46, borderRadius: 7, padding: '4px 5px', background: bg,
                border: `1px solid ${d ? T.cardBr : 'transparent'}`,
              }}>
                {d && <>
                  <div style={{ fontSize: 10, color: T.muted }}>{Number(d.slice(-2))}</div>
                  {g && <div style={{ fontSize: 11, fontWeight: 800, color: pnl > 0 ? T.green : T.red, marginTop: 1 }}>{won(pnl)}</div>}
                  {g && <div style={{ fontSize: 9, color: T.muted }}>{g.n}{en ? '' : '건'}</div>}
                </>}
              </div>
              {rowEnd && (() => {
                const w = weeks[Math.floor(i / 7)]
                return (
                  <div key={`w${i}`} style={{ minHeight: 46, borderRadius: 7, padding: '4px 5px', border: `1px dashed ${T.cardBr}`, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    {w && w.n > 0
                      ? <><span style={{ fontSize: 11, fontWeight: 800, color: w.pnl > 0 ? T.green : T.red }}>{won(w.pnl)}</span>
                         <span style={{ fontSize: 9, color: T.muted }}>{w.n}{en ? '' : '건'}</span></>
                      : <span style={{ fontSize: 10, color: T.muted }}>—</span>}
                  </div>
                )
              })()}
            </>
          )
        })}
      </div>
      </div>

      <p style={{ fontSize: 10.5, color: T.muted, marginTop: 12, lineHeight: 1.7 }}>
        {en
          ? `※ Simulation: each position sized by risk (smaller when more volatile), P/L booked on the exit date. Commissions, taxes and slippage are NOT included — real returns would be lower.`
          : `※ 시뮬레이션: 각 종목을 리스크 기반 비중(변동성 클수록 작게)으로 담았다고 계산하고, 손익은 청산일에 반영합니다. 수수료·거래세·슬리피지는 반영하지 않아 실제 수익률은 이보다 낮습니다.`}
      </p>
    </div>
  )
}

const navBtn: React.CSSProperties = {
  width: 26, height: 26, borderRadius: 7, cursor: 'pointer',
  background: 'transparent', border: `1px solid rgba(120,150,220,0.14)`, color: '#8A93B5', fontSize: 14, lineHeight: 1,
}
