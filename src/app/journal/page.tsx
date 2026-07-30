import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { T, bgGradient, cardStyle, gradeColor } from '@/lib/theme'
import { getLang } from '@/lib/i18n'
import LangToggle from '@/components/LangToggle'
import JournalNote from '@/components/JournalNote'
import TradeCalendar from '@/components/TradeCalendar'
import TradeStats from '@/components/TradeStats'
import PortfolioComposition from '@/components/PortfolioComposition'

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
  session: string | null; weight_pct: number | null; risk_pct: number | null; tier: string | null
  r_multiple: number | null; mae_pct: number | null; mfe_pct: number | null
}

export default async function Journal() {
  const lang = getLang()
  const en = lang === 'en'
  const { data } = await supabase.from('stock_paper_trade').select('*').eq('rule', 'context1').neq('status','canceled').order('entry_date', { ascending: false }).limit(120)
  const trades = (data || []) as Trade[]
  const held = trades.filter(t => t.status === 'open' || t.status === 'pending')   // 보유 + 대기(체결예정)
  const open = held   // 포트/달력/평가손익은 committed 자본 기준(대기 포함)
  const closed = trades.filter(t => t.status === 'closed')

  // 보유 포지션 평가손익 — 현재가(score_cache) 대비 진입가
  const openSyms = held.map(t => t.symbol)
  const { data: priceRows } = openSyms.length
    ? await supabase.from('stock_score_cache').select('symbol,scores').in('symbol', openSyms)
    : { data: [] as any[] }
  const scMap = new Map((priceRows || []).map((r: any) => [r.symbol, r.scores]))
  const openPos = open.map(t => {
    const sc: any = scMap.get(t.symbol)
    const cur = Number(sc?.price)
    const un = cur && t.entry_price ? ((cur - Number(t.entry_price)) / Number(t.entry_price)) * 100 : null
    return { weight_pct: t.weight_pct, unrealized_pct: un != null ? +un.toFixed(2) : null }
  })
  const composition = open.map(t => {
    const sc: any = scMap.get(t.symbol)
    const cur = Number(sc?.price)
    const un = cur && t.entry_price ? ((cur - Number(t.entry_price)) / Number(t.entry_price)) * 100 : null
    return { symbol: t.symbol, name: t.name, country: t.country, weight_pct: t.weight_pct, tier: t.tier, sector: sc?.sector ?? null, unrealized_pct: un != null ? +un.toFixed(2) : null }
  })
  const investedPct = composition.reduce((a, p) => a + (Number(p.weight_pct) || 0), 0)

  // ── 히어로 집계 — 시드 대비 ₩ 손익(로빈후드式 '큰 숫자 하나'). 모의 시뮬레이션 기준.
  const SEED = 10_000_000
  const curOf = (sym: string) => Number((scMap.get(sym) as any)?.price) || null
  let unrealWon = 0, realizedWon = 0
  for (const t of held) {
    if (t.status !== 'open') continue
    const cur = curOf(t.symbol), w = Number(t.weight_pct) || 0
    if (cur && t.entry_price) unrealWon += (SEED * w / 100) * ((cur - Number(t.entry_price)) / Number(t.entry_price))
  }
  for (const t of closed) {
    const w = Number(t.weight_pct) || 0
    if (t.pnl_pct != null) realizedWon += (SEED * w / 100) * (Number(t.pnl_pct) / 100)
  }
  const totalWon = Math.round(unrealWon + realizedWon)
  const totalPct = +((totalWon / SEED) * 100).toFixed(2)
  const won = (v: number) => (v >= 0 ? '+' : '−') + Math.abs(Math.round(v)).toLocaleString('ko-KR') + '원'

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

  // 청산 종류별 배지(색·라벨)
  const kindBadge = (k: string | null) => {
    if (k === 'target') return { txt: en ? 'TARGET' : '익절', c: T.green }
    if (k === 'stop') return { txt: en ? 'STOP' : '손절', c: T.red }
    if (k === 'grade_drop') return { txt: en ? 'GRADE↓' : '등급하락', c: T.amber }
    if (k === 'timeout') return { txt: en ? 'TIMEOUT' : '기간만료', c: T.muted }
    return { txt: k ?? '', c: T.muted }
  }
  // 진입 근거를 '한 줄'로 — 기술적 접두([...])·부가정보(||) 제거하고 사유만
  const oneLineReason = (s: string | null) => s ? s.replace(/^\[[^\]]*\]\s*/, '').split('||')[0].trim() : ''

  const Card = ({ t }: { t: Trade }) => {
    const isUS = t.country === 'US'
    const isOpen = t.status === 'open', isPending = t.status === 'pending'
    const cur = curOf(t.symbol)
    // 표시 손익: 보유=미실현(현재가 대비), 종료=확정 pnl
    const pnl = isOpen && cur && t.entry_price ? +(((cur - Number(t.entry_price)) / Number(t.entry_price)) * 100).toFixed(2)
      : t.pnl_pct != null ? Number(t.pnl_pct) : null
    const wSeed = SEED * (Number(t.weight_pct) || 0) / 100
    const pnlWon = pnl != null ? Math.round(wSeed * pnl / 100) : null
    const col = pnl == null ? T.muted : pnl > 0 ? T.green : pnl < 0 ? T.red : T.muted
    // 진행 바 — 손절 ●───◐(현재)───● 목표
    const stop = t.stop_price != null ? Number(t.stop_price) : null
    const tgt = t.target_price != null ? Number(t.target_price) : null
    const ref = isOpen ? cur : t.exit_price != null ? Number(t.exit_price) : cur
    const frac = stop != null && tgt != null && ref != null && tgt > stop ? Math.max(0, Math.min(1, (ref - stop) / (tgt - stop))) : null
    const badge = isPending ? { txt: en ? 'PENDING' : '대기', c: T.amber }
      : isOpen ? { txt: en ? 'HOLDING' : '보유중', c: T.teal } : kindBadge(t.exit_kind)

    const tint = pnl == null || pnl === 0 ? (cardStyle as any).background : `linear-gradient(180deg, ${col}12, ${col}04), ${(cardStyle as any).background}`
    return (
      <div style={{ ...cardStyle, borderRadius: 14, padding: 16, background: tint }}>
        {/* 상단 — 종목 + 상태배지 (좌) · 큰 손익 %/₩ (우, 초록/빨강) */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, fontWeight: 900, padding: '2px 6px', borderRadius: 5, background: isUS ? T.us : T.kr, color: '#0b1020' }}>{isUS ? 'US' : 'KR'}</span>
              <Link href={`/scores/${t.symbol}`} style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{t.name || t.symbol}</Link>
              <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 20, background: badge.c + '26', color: badge.c }}>{badge.txt}</span>
            </div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>
              {isPending
                ? (en ? 'awaiting next open' : '다음 시가 체결 예정')
                : <>{money(t.entry_price, isUS)} <span style={{ opacity: 0.6 }}>→</span> <b style={{ color: T.text }}>{money(ref, isUS)}</b> {isOpen ? (en ? 'now' : '현재') : (en ? 'exit' : '청산')}</>}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: col, lineHeight: 1.1 }}>{pnl == null ? '—' : `${pnl > 0 ? '+' : ''}${pnl}%`}</div>
            {pnlWon != null && <div style={{ fontSize: 12.5, fontWeight: 700, color: col }}>{won(pnlWon)}</div>}
          </div>
        </div>

        {/* 진행 바 — 손절 ↔ 목표 사이 지금 위치가 한눈에 */}
        {frac != null && (
          <div style={{ marginTop: 12 }}>
            <div style={{ position: 'relative', height: 7, borderRadius: 5, background: `linear-gradient(90deg, ${T.red}66, ${T.muted}33 50%, ${T.green}66)` }}>
              <div style={{ position: 'absolute', top: -3.5, left: `calc(${(frac * 100).toFixed(1)}% - 7px)`, width: 14, height: 14, borderRadius: '50%', background: col, border: '2.5px solid #0b1020', boxShadow: `0 0 0 3px ${col}33` }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: T.muted, marginTop: 4 }}>
              <span style={{ color: T.red }}>{en ? 'Stop' : '손절'} {money(stop, isUS)}</span>
              <span style={{ color: T.green }}>{en ? 'Target' : '목표'} {money(tgt, isUS)}</span>
            </div>
          </div>
        )}

        {/* 한 줄 '왜' + 보조 지표(최소) */}
        <div style={{ marginTop: 11, fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
          {!isPending && t.exit_reason
            ? <><b style={{ color: badge.c }}>{en ? 'Why' : '왜'}:</b> {oneLineReason(t.exit_reason)}</>
            : t.entry_reason && <><b style={{ color: T.teal }}>{en ? 'Why' : '왜'}:</b> {oneLineReason(t.entry_reason)}</>}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap', fontSize: 11, color: T.muted }}>
          {t.entry_score != null && <span>{en ? 'entry' : '진입'} {t.entry_score}{en ? '' : '점'}</span>}
          {t.weight_pct != null && <span>{en ? 'weight' : '비중'} {t.weight_pct}%</span>}
          {t.r_multiple != null && <span style={{ color: Number(t.r_multiple) > 0 ? T.green : T.red, fontWeight: 700 }}>{Number(t.r_multiple) > 0 ? '+' : ''}{t.r_multiple}R</span>}
          {t.holding_days != null && <span>{t.holding_days}{en ? 'd' : '일'}</span>}
          <span style={{ marginLeft: 'auto' }}>{t.entry_date}{t.exit_date ? ` → ${t.exit_date}` : ''}</span>
        </div>

        <JournalNote tradeId={t.id} symbol={t.symbol} lang={lang} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: bgGradient, color: T.text }}>
      <header style={{ borderBottom: `1px solid ${T.cardBr}`, position: 'sticky', top: 0, backdropFilter: 'blur(12px)', background: 'rgba(8,12,24,0.85)', zIndex: 20 }}>
        <div className="topbar" style={{ maxWidth: 1360, margin: '0 auto', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" style={{ fontWeight: 800, fontSize: 18, color: T.text, whiteSpace: 'nowrap' }}>🧭 {en ? 'Investment Compass' : '투자나침반'} <span style={{ color: T.teal }}>{en ? 'Stocks' : '주식'}</span></Link>
          <nav className="topnav" style={{ display: 'flex', gap: 14, fontSize: 14, alignItems: 'center' }}>
            <Link href="/dashboard" style={{ color: T.muted }}>{en ? 'Dashboard' : '대시보드'}</Link>
            <Link href="/journal" style={{ color: T.teal, fontWeight: 700 }}>{en ? 'Validation' : '모의매매 검증'}</Link>
            <Link href="/plan" style={{ color: T.muted }}>{en ? 'My Trades' : '내 매매'}</Link>
            <Link href="/my" style={{ color: T.muted }}>{en ? 'My' : '내 정보'}</Link>
            <LangToggle lang={lang} />
          </nav>
        </div>
      </header>

      <div className="shell">
       <main className="shell-main">
        <h1 style={{ fontSize: 23, fontWeight: 900 }}>{en ? 'Rule Validation (auto-simulated)' : '모의매매 검증 (규칙 자동)'}</h1>

        {/* 프레임 고지 — 가장 먼저 읽히게 */}
        <div style={{ ...cardStyle, borderRadius: 12, padding: '12px 14px', marginTop: 12 }}>
          <p style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.8, margin: 0 }}>
            {en
              ? <>These are <b style={{ color: T.text }}>simulated records</b>: the rule bought and sold on paper so we can measure whether the score actually works. <b style={{ color: T.text }}>No real orders are placed and this is not a buy or sell signal.</b> Entry uses the closing price on the day the rule triggered; exits are judged only from candles after entry, so nothing is decided with hindsight.</>
              : <>이 화면은 <b style={{ color: T.text }}>시뮬레이션 기록</b>입니다. 우리 점수가 실제로 유효한지 측정하려고 규칙이 가상으로 사고팔았을 뿐입니다. <b style={{ color: T.text }}>실제 주문은 내지 않으며 매수·매도 신호가 아닙니다.</b> 진입가는 판정일 종가를 쓰고, 청산은 진입 이후 실제 캔들로만 판정합니다 — 결과를 미리 알고 유리하게 고르지 않습니다.</>}
          </p>
        </div>

        {/* ① 히어로 — focal point. 큰 숫자 하나 + 색, 나머지는 위계로 눌러 정돈 */}
        <div style={{ borderRadius: 18, padding: '22px 20px', marginTop: 16, background: `radial-gradient(120% 140% at 0% 0%, ${(totalWon >= 0 ? T.green : T.red)}14, rgba(255,255,255,0.03) 42%), rgba(255,255,255,0.02)`, border: `1px solid ${T.cardBr}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: T.muted, letterSpacing: '0.01em' }}>{en ? 'My validation P/L' : '내 모의 검증 성적'}</span>
            <span style={{ fontSize: 11, color: T.muted }}>{en ? `seed ${SEED.toLocaleString()}` : `시드 ${SEED.toLocaleString('ko-KR')}원`}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-0.02em', color: totalWon >= 0 ? T.green : T.red, lineHeight: 1 }}>{won(totalWon)}</span>
            <span style={{ fontSize: 14, fontWeight: 800, color: totalWon >= 0 ? T.green : T.red, padding: '3px 9px', borderRadius: 8, background: (totalWon >= 0 ? T.green : T.red) + '20' }}>{totalPct >= 0 ? '+' : ''}{totalPct}%</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', marginTop: 18, borderTop: `1px solid ${T.cardBr}`, paddingTop: 14, gap: 12 }}>
            <div>
              <div style={{ fontSize: 10.5, color: T.muted, marginBottom: 3 }}>{en ? 'Unrealized' : '평가손익 (보유)'}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: unrealWon >= 0 ? T.green : T.red }}>{won(unrealWon)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: T.muted, marginBottom: 3 }}>{en ? 'Realized' : '실현손익 (종료)'}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: realizedWon >= 0 ? T.green : T.red }}>{won(realizedWon)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: T.muted, marginBottom: 3 }}>{en ? 'Invested / Cash' : '투입 / 현금'}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{investedPct.toFixed(0)}% <span style={{ color: T.muted, fontWeight: 600 }}>/ {(100 - investedPct).toFixed(0)}%</span></div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, color: T.muted, marginBottom: 3 }}>{en ? 'Holding' : '보유'}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{held.length}<span style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>{en ? '' : '종목'}</span></div>
            </div>
          </div>
          <div style={{ fontSize: 10.5, color: T.muted, marginTop: 12 }}>{en ? 'Simulation · not actual results' : '모의 시뮬레이션 · 실제 매매 결과 아님'}</div>
        </div>

        {/* 포트폴리오 구성 — 보유는 우측 사이드로 이동. 메인은 포트구성 → 달력 → 그래프 */}
        <div style={{ marginTop: 22 }}>
          <PortfolioComposition positions={composition} cashPct={100 - investedPct} lang={lang} />
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

        <h2 style={{ fontSize: 17, fontWeight: 800, marginTop: 30, letterSpacing: '-0.01em' }}>{en ? 'Closed' : '종료된 기록'} <span style={{ fontSize: 14, fontWeight: 700, color: T.muted }}>{closed.length}</span></h2>
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
       <aside className="chat-rail" style={{ height: 'auto', overflow: 'visible' }}>
         <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 12 }}>{en ? 'Holdings' : '현 보유'} <span style={{ fontSize: 13, fontWeight: 700, color: T.muted }}>{open.length}</span></div>
         {open.length > 0
           ? <div style={{ display: 'grid', gap: 12 }}>{open.map(t => <Card key={t.id} t={t} />)}</div>
           : <div style={{ ...cardStyle, borderRadius: 14, padding: 18, color: T.muted, fontSize: 13 }}>{en ? 'No open positions.' : '보유 중인 포지션이 없습니다.'}</div>}
       </aside>
      </div>
    </div>
  )
}
