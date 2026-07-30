import Link from 'next/link'
import { T, cardStyle, gradeColor } from '@/lib/theme'

// 내 매매 요약 카드 — 대시보드 우측 레일. 저널 히어로의 미니 버전(한눈 상황 + 자세히 링크).
// ⚠️ §6: '매수/매도 신호'가 아니라 **규칙이 판정한 시뮬레이션 기록**임을 라벨로 명확히 한다.
export type Activity = {
  id: number; symbol: string; name: string | null; country: string
  status: string; entry_date: string; entry_score: number | null
  exit_date: string | null; exit_kind: string | null; pnl_pct: number | null
}

export type PortSummary = { seed: number; investedPct: number; unrealPct: number; realizedPct: number }

export default function RecentActivity({ trades, summary, lang = 'ko', max = 3 }: { trades: Activity[]; summary?: PortSummary; lang?: 'ko' | 'en'; max?: number }) {
  const en = lang === 'en'
  const wonS = (v: number) => (v >= 0 ? '+' : '−') + Math.abs(Math.round(v)).toLocaleString('ko-KR') + (en ? '' : '원')
  const won = (v: number) => Math.round(v).toLocaleString('ko-KR') + (en ? '' : '원')
  const heldN = trades.filter(t => t.status === 'open' || t.status === 'pending').length

  // 최근 움직임 — 진입/청산 이벤트 최신순, 소수만
  type Ev = { key: string; kind: 'in' | 'out'; date: string; t: Activity }
  const evs: Ev[] = []
  for (const t of trades) {
    evs.push({ key: `in${t.id}`, kind: 'in', date: t.entry_date, t })
    if (t.exit_date) evs.push({ key: `out${t.id}`, kind: 'out', date: t.exit_date, t })
  }
  evs.sort((a, b) => b.date.localeCompare(a.date) || (a.kind === 'out' ? -1 : 1))
  const shown = evs.slice(0, max)

  return (
    <div style={{ ...cardStyle, borderRadius: 16, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em' }}>{en ? 'My trades' : '내 매매 요약'}</span>
        <Link href="/journal" style={{ fontSize: 11.5, fontWeight: 700, color: T.teal }}>{en ? 'Details →' : '자세히 →'}</Link>
      </div>
      <div style={{ fontSize: 10.5, color: T.muted, marginTop: 3 }}>{en ? 'Simulation · not a signal' : '시뮬레이션 기록 · 매수/매도 신호 아님'}</div>

      {summary && (() => {
        const total = summary.unrealPct + summary.realizedPct
        const bal = summary.seed * (1 + total / 100)
        const totalWon = bal - summary.seed
        const up = total >= 0
        const pc = up ? T.green : T.red
        return (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.02em', color: pc, lineHeight: 1 }}>{wonS(totalWon)}</span>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: pc, padding: '2px 7px', borderRadius: 7, background: pc + '20' }}>{up ? '+' : ''}{total.toFixed(2)}%</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '9px 12px', marginTop: 13, paddingTop: 12, borderTop: `1px solid ${T.cardBr}` }}>
              <Stat label={en ? 'Balance' : '현재 자본'} value={won(bal)} />
              <Stat label={en ? 'Holding' : '보유'} value={`${heldN}${en ? '' : '종목'}`} />
              <Stat label={en ? 'Unrealized' : '평가손익'} value={`${summary.unrealPct >= 0 ? '+' : ''}${summary.unrealPct.toFixed(2)}%`} color={summary.unrealPct >= 0 ? T.green : T.red} />
              <Stat label={en ? 'Realized' : '실현손익'} value={`${summary.realizedPct >= 0 ? '+' : ''}${summary.realizedPct.toFixed(2)}%`} color={summary.realizedPct >= 0 ? T.green : T.red} />
              <Stat label={en ? 'Invested / Cash' : '투입 / 현금'} value={`${summary.investedPct.toFixed(0)}% / ${(100 - summary.investedPct).toFixed(0)}%`} />
            </div>
          </div>
        )
      })()}

      {shown.length > 0 && (
        <div style={{ marginTop: 13, paddingTop: 12, borderTop: `1px solid ${T.cardBr}` }}>
          <div style={{ fontSize: 10.5, color: T.muted, marginBottom: 6 }}>{en ? 'Recent activity' : '최근 움직임'}</div>
          <div style={{ display: 'grid', gap: 7 }}>
            {shown.map(e => {
              const t = e.t, isUS = t.country === 'US', isIn = e.kind === 'in'
              const pnl = t.pnl_pct == null ? null : Number(t.pnl_pct)
              return (
                <Link key={e.key} href={`/scores/${t.symbol}`} style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.text }}>
                  <span style={{
                    fontSize: 9.5, fontWeight: 900, padding: '2px 5px', borderRadius: 4, flexShrink: 0,
                    background: isIn ? (t.status === 'pending' ? T.amber + '22' : T.teal + '22') : 'rgba(255,255,255,0.06)',
                    color: isIn ? (t.status === 'pending' ? T.amber : T.teal) : T.muted,
                  }}>{isIn ? (t.status === 'pending' ? (en ? 'WAIT' : '대기') : (en ? 'IN' : '진입')) : (en ? 'OUT' : '청산')}</span>
                  <span style={{ fontSize: 9.5, fontWeight: 900, padding: '2px 5px', borderRadius: 4, background: isUS ? T.us : T.kr, color: '#0b1020', flexShrink: 0 }}>{isUS ? 'US' : 'KR'}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name || t.symbol}</span>
                  {isIn
                    ? t.entry_score != null && <span style={{ fontSize: 11, fontWeight: 800, color: gradeColor(t.entry_score) }}>{t.entry_score}</span>
                    : pnl != null && <span style={{ fontSize: 11.5, fontWeight: 800, color: pnl > 0 ? T.green : T.red }}>{pnl > 0 ? '+' : ''}{pnl}%</span>}
                  <span style={{ fontSize: 9.5, color: T.muted, flexShrink: 0 }}>{e.date.slice(5).replace('-', '/')}</span>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: T.muted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: color || T.text }}>{value}</div>
    </div>
  )
}
