import Link from 'next/link'
import { T, cardStyle, gradeColor } from '@/lib/theme'

// 최근 체결 미니창 — 좌우 여백에 붙는 요약 패널. 상세는 본문 카드에서 본다.
// ⚠️ §6: '매수/매도 신호'가 아니라 **규칙이 판정한 시뮬레이션 기록**임을 라벨로 명확히 한다.
export type Activity = {
  id: number; symbol: string; name: string | null; country: string
  status: string; entry_date: string; entry_score: number | null
  exit_date: string | null; exit_kind: string | null; pnl_pct: number | null
}

export type PortSummary = { seed: number; investedPct: number; unrealPct: number; realizedPct: number }

export default function RecentActivity({ trades, summary, lang = 'ko' }: { trades: Activity[]; summary?: PortSummary; lang?: 'ko' | 'en' }) {
  const en = lang === 'en'

  // 진입/청산을 한 줄씩 이벤트로 펼쳐 최신순 정렬
  type Ev = { key: string; kind: 'in' | 'out'; date: string; t: Activity }
  const evs: Ev[] = []
  for (const t of trades) {
    evs.push({ key: `in${t.id}`, kind: 'in', date: t.entry_date, t })
    if (t.exit_date) evs.push({ key: `out${t.id}`, kind: 'out', date: t.exit_date, t })
  }
  evs.sort((a, b) => b.date.localeCompare(a.date) || (a.kind === 'out' ? -1 : 1))
  const shown = evs.slice(0, 14)

  const KIND: Record<string, string> = en
    ? { target: 'target', stop: 'stop', grade_drop: 'grade↓', timeout: 'time' }
    : { target: '목표', stop: '손절', grade_drop: '등급↓', timeout: '만료' }

  return (
    <div style={{ ...cardStyle, borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 13.5, fontWeight: 800 }}>{en ? '🧾 Recent activity' : '🧾 최근 체결'}</div>
      <div style={{ fontSize: 10.5, color: T.muted, marginTop: 3, lineHeight: 1.5 }}>
        {en ? 'Simulated records — not buy/sell signals' : '시뮬레이션 기록 · 매수/매도 신호 아님'}
      </div>

      {summary && (() => {
        const total = summary.unrealPct + summary.realizedPct        // 시드 대비 총손익%
        const bal = summary.seed * (1 + total / 100)                 // 현재 평가 자본
        const up = total >= 0
        const won = (v: number) => Math.round(v).toLocaleString('ko-KR')
        return (
          <div style={{ marginTop: 10, padding: '10px 11px', borderRadius: 10, background: up ? 'rgba(40,199,111,0.10)' : 'rgba(240,101,74,0.10)', border: `1px solid ${T.cardBr}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 11, color: T.muted }}>{en ? 'Total P/L' : '총 손익'}</span>
              <span style={{ fontSize: 17, fontWeight: 900, color: up ? T.green : T.red }}>{up ? '+' : ''}{total.toFixed(2)}%</span>
              <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: up ? T.green : T.red, color: '#0b1020' }}>
                {up ? (en ? 'IN PROFIT' : '수익 중') : (en ? 'IN LOSS' : '손실 중')}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.muted, marginTop: 7 }}>
              <span>{en ? 'Balance' : '현재 자본'} <b style={{ color: T.text }}>{won(bal)}{en ? '' : '원'}</b></span>
              <span>{en ? 'of' : '/ 시드'} {won(summary.seed)}{en ? '' : '원'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: T.muted, marginTop: 4 }}>
              <span>{en ? 'Unrealized' : '평가손익'} <b style={{ color: summary.unrealPct >= 0 ? T.green : T.red }}>{summary.unrealPct >= 0 ? '+' : ''}{summary.unrealPct.toFixed(2)}%</b></span>
              <span>{en ? 'Realized' : '실현손익'} <b style={{ color: summary.realizedPct >= 0 ? T.green : T.red }}>{summary.realizedPct >= 0 ? '+' : ''}{summary.realizedPct.toFixed(2)}%</b></span>
              <span>{en ? 'Invested' : '투입'} {summary.investedPct.toFixed(0)}%</span>
            </div>
          </div>
        )
      })()}

      {shown.length === 0 ? (
        <div style={{ fontSize: 12, color: T.muted, marginTop: 12 }}>{en ? 'Nothing yet.' : '아직 기록이 없습니다.'}</div>
      ) : (
        <div style={{ marginTop: 10, display: 'grid', gap: 1 }}>
          {shown.map(e => {
            const t = e.t
            const isUS = t.country === 'US'
            const isIn = e.kind === 'in'
            const pnl = t.pnl_pct == null ? null : Number(t.pnl_pct)
            return (
              <Link key={e.key} href={`/scores/${t.symbol}`}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 0', borderTop: `1px solid ${T.cardBr}`, color: T.text }}>
                <span style={{
                  fontSize: 9.5, fontWeight: 900, padding: '2px 5px', borderRadius: 4, flexShrink: 0,
                  background: isIn ? 'rgba(25,194,176,0.18)' : 'rgba(255,255,255,0.07)',
                  color: isIn ? T.teal : T.muted,
                }}>{isIn ? (en ? 'IN' : '진입') : (en ? 'OUT' : '청산')}</span>
                <span style={{ fontSize: 9.5, fontWeight: 900, padding: '2px 5px', borderRadius: 4, background: isUS ? T.us : T.kr, color: '#0b1020', flexShrink: 0 }}>{isUS ? 'US' : 'KR'}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.name || t.symbol}
                </span>
                {isIn
                  ? t.entry_score != null && <span style={{ fontSize: 11, fontWeight: 800, color: gradeColor(t.entry_score) }}>{t.entry_score}</span>
                  : <>
                      {t.exit_kind && <span style={{ fontSize: 9.5, color: T.muted }}>{KIND[t.exit_kind] ?? ''}</span>}
                      {pnl != null && <span style={{ fontSize: 11.5, fontWeight: 800, color: pnl > 0 ? T.green : T.red }}>{pnl > 0 ? '+' : ''}{pnl}%</span>}
                    </>}
                <span style={{ fontSize: 9.5, color: T.muted, flexShrink: 0 }}>{e.date.slice(5).replace('-', '/')}</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
