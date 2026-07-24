import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { T, bgGradient, cardStyle, gradeColor } from '@/lib/theme'
import { getLang } from '@/lib/i18n'
import LangToggle from '@/components/LangToggle'
import JournalNote from '@/components/JournalNote'
import TradeCalendar from '@/components/TradeCalendar'
import RecentActivity from '@/components/RecentActivity'
import TradeStats from '@/components/TradeStats'

export const dynamic = 'force-dynamic'
export const metadata = { title: '매매일지 — 투자나침반 주식' }

// 자동 모의매매 기록(매매일지).
// ⚠️ §6 프레임: '진입 신호'가 아니라 **규칙이 이렇게 판정했다는 기록**이다.
//    실제 주문은 내지 않으며, 매매는 이용자가 직접 판단해 수행한다(투자일임 아님).
type Trade = {
  id: number; symbol: string; country: string; name: string | null
  status: string; entry_date: string; entry_price: number; entry_score: number | null
  entry_grade: string | null; entry_reason: string | null
  stop_price: number | null; target_price: number | null
  exit_date: string | null; exit_price: number | null; exit_kind: string | null
  exit_reason: string | null; pnl_pct: number | null; holding_days: number | null
  session: string | null; weight_pct: number | null; risk_pct: number | null
  r_multiple: number | null; mae_pct: number | null; mfe_pct: number | null
}

export default async function Journal() {
  const lang = getLang()
  const en = lang === 'en'
  const { data } = await supabase.from('stock_paper_trade').select('*').order('entry_date', { ascending: false }).limit(120)
  const trades = (data || []) as Trade[]
  const open = trades.filter(t => t.status === 'open')
  const closed = trades.filter(t => t.status === 'closed')

  // 보유 포지션 평가손익 — 현재가(score_cache) 대비 진입가
  const openSyms = open.map(t => t.symbol)
  const { data: priceRows } = openSyms.length
    ? await supabase.from('stock_score_cache').select('symbol,scores').in('symbol', openSyms)
    : { data: [] as any[] }
  const priceOf = new Map((priceRows || []).map((r: any) => [r.symbol, Number(r.scores?.price)]))
  const openPos = open.map(t => {
    const cur = priceOf.get(t.symbol)
    const un = cur && t.entry_price ? ((cur - Number(t.entry_price)) / Number(t.entry_price)) * 100 : null
    return { weight_pct: t.weight_pct, unrealized_pct: un != null ? +un.toFixed(2) : null }
  })

  // 집계는 **종료된 기록만**. 표본이 적으면 수치를 앞세우지 않는다.
  const wins = closed.filter(t => Number(t.pnl_pct) > 0).length
  const enough = closed.length >= 20
  const winRate = closed.length ? Math.round((wins / closed.length) * 100) : null
  const avgPnl = closed.length ? +(closed.reduce((a, t) => a + Number(t.pnl_pct || 0), 0) / closed.length).toFixed(2) : null

  const money = (v: number | null | undefined, us: boolean) =>
    v == null ? '—' : us ? '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }) : Number(v).toLocaleString('ko-KR') + '원'
  const KIND: Record<string, string> = en
    ? { target: 'Target hit', stop: 'Stop hit', grade_drop: 'Grade dropped', timeout: 'Time limit' }
    : { target: '목표 도달', stop: '손절', grade_drop: '등급 하락', timeout: '보유기간 만료' }

  const Card = ({ t }: { t: Trade }) => {
    const isUS = t.country === 'US'
    const pnl = t.pnl_pct == null ? null : Number(t.pnl_pct)
    const col = pnl == null ? T.muted : pnl > 0 ? T.green : T.red
    return (
      <div style={{ ...cardStyle, borderRadius: 14, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 900, padding: '2px 6px', borderRadius: 5, background: isUS ? T.us : T.kr, color: '#0b1020' }}>{isUS ? 'US' : 'KR'}</span>
          <Link href={`/scores/${t.symbol}`} style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{t.name || t.symbol}</Link>
          {t.entry_score != null && (
            <span style={{ fontSize: 11.5, fontWeight: 700, color: gradeColor(t.entry_score) }}>
              {en ? 'Entry' : '진입'} {t.entry_score}{en ? 'pts' : '점'}
            </span>
          )}
          {t.session && <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 5, background: 'rgba(25,194,176,0.15)', color: T.teal }}>{t.session === 'close' ? (en ? 'CLOSE' : '종가') : (en ? 'PRE' : '장전')}</span>}
          {t.weight_pct != null && <span style={{ fontSize: 11, color: T.muted }}>{en ? 'weight' : '비중'} <b style={{ color: T.text }}>{t.weight_pct}%</b></span>}
          <span style={{ marginLeft: 'auto', fontSize: 11.5, color: T.muted }}>
            {t.entry_date}{t.exit_date ? ` → ${t.exit_date}` : ` · ${en ? 'holding' : '보유 중'}`}
          </span>
          {pnl != null && <span style={{ fontSize: 15, fontWeight: 900, color: col }}>{pnl > 0 ? '+' : ''}{pnl}%</span>}
        </div>

        <div style={{ display: 'flex', gap: 14, marginTop: 10, flexWrap: 'wrap', fontSize: 12, color: T.muted }}>
          <span>{en ? 'Entry' : '진입가'} <b style={{ color: T.text }}>{money(t.entry_price, isUS)}</b></span>
          {t.stop_price != null && <span>{en ? 'Stop' : '손절'} <b style={{ color: T.red }}>{money(t.stop_price, isUS)}</b></span>}
          {t.target_price != null && <span>{en ? 'Target' : '목표'} <b style={{ color: T.green }}>{money(t.target_price, isUS)}</b></span>}
          {t.exit_price != null && <span>{en ? 'Exit' : '청산가'} <b style={{ color: T.text }}>{money(t.exit_price, isUS)}</b></span>}
          {t.exit_kind && <span style={{ color: T.amber }}>{KIND[t.exit_kind] ?? t.exit_kind}</span>}
          {t.holding_days != null && <span>{t.holding_days}{en ? 'd held' : '거래일 보유'}</span>}
          {t.risk_pct != null && <span>{en ? 'risk' : '위험'} {t.risk_pct}%</span>}
          {t.r_multiple != null && <span style={{ color: Number(t.r_multiple) > 0 ? T.green : T.red, fontWeight: 700 }}>{Number(t.r_multiple) > 0 ? '+' : ''}{t.r_multiple}R</span>}
          {t.mae_pct != null && <span>MAE {t.mae_pct}%</span>}
          {t.mfe_pct != null && <span>MFE +{t.mfe_pct}%</span>}
        </div>

        {t.entry_reason && (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.cardBr}` }}>
            <div style={{ fontSize: 11, color: T.teal, fontWeight: 800, marginBottom: 4 }}>{en ? 'WHY IT ENTERED' : '진입 근거'}</div>
            <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.7 }}>{t.entry_reason}</div>
          </div>
        )}
        {t.exit_reason && (
          <div style={{ marginTop: 8, padding: 10, borderRadius: 9, background: 'rgba(255,255,255,0.03)', border: `1px solid ${T.cardBr}` }}>
            <div style={{ fontSize: 11, color: T.amber, fontWeight: 800, marginBottom: 4 }}>{en ? 'WHY IT EXITED' : '청산 근거'}</div>
            <div style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.7 }}>{t.exit_reason}</div>
          </div>
        )}

        <JournalNote tradeId={t.id} symbol={t.symbol} lang={lang} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: bgGradient, color: T.text }}>
      <header style={{ borderBottom: `1px solid ${T.cardBr}`, position: 'sticky', top: 0, backdropFilter: 'blur(12px)', background: 'rgba(8,12,24,0.85)', zIndex: 20 }}>
        <div style={{ maxWidth: 1360, margin: '0 auto', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" style={{ fontWeight: 800, fontSize: 18, color: T.text }}>🧭 {en ? 'Investment Compass' : '투자나침반'} <span style={{ color: T.teal }}>{en ? 'Stocks' : '주식'}</span></Link>
          <nav style={{ display: 'flex', gap: 14, fontSize: 14, alignItems: 'center' }}>
            <Link href="/dashboard" style={{ color: T.muted }}>{en ? 'Dashboard' : '대시보드'}</Link>
            <Link href="/journal" style={{ color: T.teal, fontWeight: 700 }}>{en ? 'Journal' : '매매일지'}</Link>
            <Link href="/my" style={{ color: T.muted }}>{en ? 'My' : '내 정보'}</Link>
            <LangToggle lang={lang} />
          </nav>
        </div>
      </header>

      <div className="shell">
       <main className="shell-main">
        <h1 style={{ fontSize: 23, fontWeight: 900 }}>{en ? 'Simulated Trade Journal' : '모의매매 일지'}</h1>

        {/* 프레임 고지 — 가장 먼저 읽히게 */}
        <div style={{ ...cardStyle, borderRadius: 12, padding: 14, marginTop: 12, borderLeft: `3px solid ${T.amber}` }}>
          <p style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.8, margin: 0 }}>
            {en
              ? <>These are <b style={{ color: T.text }}>simulated records</b>: the rule bought and sold on paper so we can measure whether the score actually works. <b style={{ color: T.text }}>No real orders are placed and this is not a buy or sell signal.</b> Entry uses the closing price on the day the rule triggered; exits are judged only from candles after entry, so nothing is decided with hindsight.</>
              : <>이 화면은 <b style={{ color: T.text }}>시뮬레이션 기록</b>입니다. 우리 점수가 실제로 유효한지 측정하려고 규칙이 가상으로 사고팔았을 뿐입니다. <b style={{ color: T.text }}>실제 주문은 내지 않으며 매수·매도 신호가 아닙니다.</b> 진입가는 판정일 종가를 쓰고, 청산은 진입 이후 실제 캔들로만 판정합니다 — 결과를 미리 알고 유리하게 고르지 않습니다.</>}
          </p>
        </div>

        {/* 손익 달력 — 상단 배치(가장 먼저 보이는 자리) */}
        <div style={{ marginTop: 14 }}>
          <TradeCalendar trades={closed.map(t => ({ symbol: t.symbol, name: t.name, exit_date: t.exit_date, pnl_pct: t.pnl_pct, country: t.country, weight_pct: t.weight_pct }))} openPos={openPos} lang={lang} />
        </div>

        {/* 성과 분석 (해외 매매일지 표준 지표) */}
        <div style={{ marginTop: 14 }}>
          <TradeStats closed={closed.map(t => ({
            pnl_pct: t.pnl_pct, r_multiple: t.r_multiple, mae_pct: t.mae_pct, mfe_pct: t.mfe_pct,
            exit_kind: t.exit_kind, session: t.session, country: t.country, holding_days: t.holding_days,
          }))} lang={lang} />
        </div>

        {/* 집계 — 표본 부족이면 수치를 앞세우지 않는다 */}
        <div style={{ ...cardStyle, borderRadius: 14, padding: 16, marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <span style={{ fontSize: 13, color: T.muted }}>{en ? 'Closed' : '종료'} <b style={{ color: T.text, fontSize: 17 }}>{closed.length}</b></span>
            <span style={{ fontSize: 13, color: T.muted }}>{en ? 'Open' : '보유 중'} <b style={{ color: T.text, fontSize: 17 }}>{open.length}</b></span>
            {enough && winRate != null && <span style={{ fontSize: 13, color: T.muted }}>{en ? 'Win rate' : '승률'} <b style={{ color: T.text, fontSize: 17 }}>{winRate}%</b></span>}
            {enough && avgPnl != null && <span style={{ fontSize: 13, color: T.muted }}>{en ? 'Avg P/L' : '평균 손익'} <b style={{ color: avgPnl > 0 ? T.green : T.red, fontSize: 17 }}>{avgPnl > 0 ? '+' : ''}{avgPnl}%</b></span>}
          </div>
          {!enough && (
            <p style={{ fontSize: 12, color: T.amber, marginTop: 10, lineHeight: 1.7 }}>
              {en
                ? `Win rate and average P/L are hidden until at least 20 trades close (currently ${closed.length}). A number from a handful of trades is noise, not a track record.`
                : `승률·평균 손익은 종료 기록이 20건 이상 쌓인 뒤에 공개합니다(현재 ${closed.length}건). 몇 건으로 낸 수치는 성과가 아니라 소음이니까요.`}
            </p>
          )}
        </div>

        {open.length > 0 && (
          <>
            <h2 style={{ fontSize: 17, fontWeight: 800, marginTop: 26 }}>{en ? 'Open' : '보유 중'}</h2>
            <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>{open.map(t => <Card key={t.id} t={t} />)}</div>
          </>
        )}

        <h2 style={{ fontSize: 17, fontWeight: 800, marginTop: 26 }}>{en ? 'Closed' : '종료된 기록'}</h2>
        {closed.length === 0 ? (
          <div style={{ ...cardStyle, borderRadius: 14, padding: 20, marginTop: 12, color: T.muted, fontSize: 13 }}>
            {en ? 'No closed records yet — they appear as positions exit.' : '아직 종료된 기록이 없습니다 — 청산이 발생하면 여기에 쌓입니다.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>{closed.map(t => <Card key={t.id} t={t} />)}</div>
        )}

        <p style={{ fontSize: 12, color: T.muted, marginTop: 28, lineHeight: 1.7, borderTop: `1px solid ${T.cardBr}`, paddingTop: 14 }}>
          {en
            ? '⚠️ For information, analysis and education only. Simulated records do not represent actual trading results and do not guarantee future returns. All investment decisions and their consequences are your own. The operator provides no paid advisory, signal-calling or discretionary management services.'
            : '⚠️ 정보 제공·분석·교육 목적입니다. 모의 기록은 실제 매매 결과가 아니며 미래 수익을 보장하지 않습니다. 투자 판단과 책임은 본인에게 있습니다. 운영자는 대가를 받는 투자자문·리딩·투자일임을 제공하지 않습니다.'}
        </p>
       </main>
       <aside className="chat-rail rail-auto">
         <RecentActivity trades={trades.map(t => ({
           id: t.id, symbol: t.symbol, name: t.name, country: t.country, status: t.status,
           entry_date: t.entry_date, entry_score: t.entry_score,
           exit_date: t.exit_date, exit_kind: t.exit_kind, pnl_pct: t.pnl_pct,
         }))} lang={lang} />
       </aside>
      </div>
    </div>
  )
}
