import Link from 'next/link'
import { supabase, type StockScore } from '@/lib/supabase'
import { T, bgGradient, cardStyle, gradeColor, gradeLabel } from '@/lib/theme'
import CommunityChat from '@/components/CommunityChat'
import RecentActivity from '@/components/RecentActivity'
import MarketClock from '@/components/MarketClock'
import FilingFeed from '@/components/FilingFeed'
import { trSector } from '@/lib/terms'
import { marketHours } from '@/lib/toss'
import { getLang, tr } from '@/lib/i18n'
import LangToggle from '@/components/LangToggle'

export const dynamic = 'force-dynamic'

// 메인 대시보드 — 국내·해외를 **동등한 두 축**으로 배치. 상세는 각 시장으로 드릴다운.
// "내 분석 화면 공개" 프레임(무료·매수권유 아님).
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
async function idx(sym: string) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=3mo&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 600 } })
    const res = (await r.json())?.chart?.result?.[0]
    const meta = res?.meta
    const c: number[] = (res?.indicators?.quote?.[0]?.close || []).filter(Number.isFinite)
    if (!meta || c.length < 25) return null
    // ⚠️ 장중엔 '오늘 봉'의 종가가 아직 비어(undefined) 필터에서 빠진다 → 그대로 두면 '어제 종가'가 찍힌다.
    //    실시간가는 meta.regularMarketPrice, 등락 기준은 전일 종가(chartPreviousClose)로 잡아야 오늘 변동이 맞다.
    const last = Number(meta.regularMarketPrice) || c[c.length - 1]
    const prevClose = Number(meta.chartPreviousClose) || Number(meta.previousClose) || c[c.length - 2]
    const ma20 = mean(c.slice(-20))
    return { last: +last.toFixed(2), chg: +(((last - prevClose) / prevClose) * 100).toFixed(2), trend: last > ma20 ? 'up' as const : 'down' as const }
  } catch { return null }
}
type Disc = { dt?: string; nm?: string }
const num = (v: unknown) => (v == null ? 0 : Number(v))

export default async function Home() {
  const lang = getLang(); const t = tr(lang); const isEn = lang === 'en'
  const [{ data: krData }, { data: usData }, hours, { data: hist }, { data: paperRows }, kospi, kosdaq, nasdaq, sp500, vix, usdkrw] = await Promise.all([
    supabase.from('stock_score_cache').select('symbol,name,scores,coverage,cached_at').eq('country', 'KR').limit(150),
    supabase.from('stock_score_cache').select('symbol,name,scores,coverage,cached_at').eq('country', 'US').limit(150),
    marketHours(),
    supabase.from('stock_score_history').select('d').order('d', { ascending: true }),
    supabase.from('stock_paper_trade').select('id,symbol,name,country,status,entry_date,entry_score,exit_date,exit_kind,pnl_pct,weight_pct,entry_price,rule').order('entry_date', { ascending: false }).limit(120),
    idx('^KS11'), idx('^KQ11'), idx('^IXIC'), idx('^GSPC'), idx('^VIX'), idx('KRW=X'),
  ])
  const kr = (krData || []) as StockScore[]
  const us = (usData || []) as StockScore[]

  // 모의매매 포트폴리오 요약 — 시드 대비 손익(엔진 SEED와 동일 1천만원 기준)
  const SEED = 10_000_000
  const paper = (paperRows || []) as any[]
  const priceMap = new Map<string, number>([...kr, ...us].map(r => [r.symbol, Number((r.scores as any)?.price)]))
  let unrealPct = 0, realizedPct = 0, investedPct = 0
  for (const p of paper) {
    if (p.rule !== 'context1' || p.status === 'canceled') continue
    const w = Number(p.weight_pct) || 0
    if (p.status === 'open' || p.status === 'pending') {
      investedPct += w   // 대기(pending)도 자본은 배정된 상태 → 투입에 포함
      // 평가손익은 실제 체결(open)된 것만. pending은 아직 안 샀으므로 0.
      if (p.status === 'open') {
        const cur = priceMap.get(p.symbol)
        if (cur && p.entry_price) unrealPct += ((cur - Number(p.entry_price)) / Number(p.entry_price)) * w
      }
    } else if (p.status === 'closed' && p.pnl_pct != null) {
      realizedPct += (Number(p.pnl_pct) / 100) * w
    }
  }
  const paperSummary = { seed: SEED, investedPct: +investedPct.toFixed(1), unrealPct: +unrealPct.toFixed(2), realizedPct: +realizedPct.toFixed(2) }

  // 커버리지는 하드코딩하지 않고 **실제 적재값 평균**으로 표기(표시와 데이터가 어긋나지 않게)
  const avgCov = (rows: StockScore[]) => {
    const v = rows.map(r => Number(r.coverage)).filter(Number.isFinite)
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) + '%' : '—'
  }
  const byTotal = (rows: StockScore[]) => [...rows].sort((a, b) => num(b.scores?.total) - num(a.scores?.total))
  const krTop = byTotal(kr).slice(0, 5), usTop = byTotal(us).slice(0, 5)
  const movers = (rows: StockScore[], up: boolean) => [...rows]
    .filter(r => r.scores?.chg != null && Number(r.scores.chg) !== 0)
    .sort((a, b) => up ? num(b.scores?.chg) - num(a.scores?.chg) : num(a.scores?.chg) - num(b.scores?.chg)).slice(0, 4)

  // 공시 피드 — 국내 DART + 미국 SEC 8-K 통합(국기로 구분)
  type Feed = { symbol: string; name: string; d: Disc; us: boolean }
  const good: Feed[] = [], bad: Feed[] = []
  for (const [rows, isUs] of [[kr, false], [us, true]] as const) {
    for (const r of rows) {
      const s = r.scores as any
      for (const d of (s?.ai_pos || []) as Disc[]) good.push({ symbol: r.symbol, name: r.name || r.symbol, d, us: isUs })
      for (const d of (s?.ai_neg || []) as Disc[]) bad.push({ symbol: r.symbol, name: r.name || r.symbol, d, us: isUs })
    }
  }
  const byDt = (a: Feed, b: Feed) => String(b.d.dt || '').localeCompare(String(a.d.dt || ''))
  good.sort(byDt); bad.sort(byDt)
  // 국내 공시가 훨씬 잦다 → 앞부분(접힌 상태에서 보이는 구간)에 미국이 반드시 들어가도록 교차 배치.
  // 뒤쪽은 날짜순 그대로 이어 붙여 '펼치기'에서 전체를 볼 수 있게 한다.
  const interleave = (list: Feed[], head = 6) => {
    const k = list.filter(x => !x.us), u = list.filter(x => x.us)
    const out: Feed[] = []
    for (let i = 0; out.length < head && (i < k.length || i < u.length); i++) {
      if (i < k.length) out.push(k[i])
      if (out.length < head && i < u.length) out.push(u[i])
    }
    const rest = list.filter(x => !out.includes(x)).sort(byDt)
    return [...out, ...rest]
  }
  const toItem = (f: Feed) => ({ symbol: f.symbol, name: f.name, nm: f.d.nm, dt: f.d.dt, us: f.us })
  const goodMix = interleave(good).map(toItem)
  const badMix = interleave(bad).map(toItem)

  // 기관·외국인 순매수 — 국내 전용(미국은 해당 개념 없음)
  const flow = [...kr].filter(r => (r.scores as any)?.supply_dir === '순매수')
    .sort((a, b) => num(b.scores?.supply) - num(a.scores?.supply)).slice(0, 5)

  // 업종 흐름 — 국내(KIS 업종) / 미국(SEC SIC 산업분류)
  const sectorsOf = (rows: StockScore[]) => {
    const m = new Map<string, { chg: number[]; tot: number[] }>()
    for (const r of rows) {
      const sec = (r.scores as any)?.sector
      if (!sec || r.scores?.chg == null) continue
      if (!m.has(sec)) m.set(sec, { chg: [], tot: [] })
      const g = m.get(sec)!; g.chg.push(num(r.scores.chg)); g.tot.push(num(r.scores?.total))
    }
    return [...m.entries()].filter(([, g]) => g.chg.length >= 2)
      .map(([name, g]) => ({ name, chg: +mean(g.chg).toFixed(2), tot: Math.round(mean(g.tot)), n: g.chg.length }))
      .sort((a, b) => b.chg - a.chg).slice(0, 8)
  }
  const sectors = sectorsOf(kr)
  const usSectors = sectorsOf(us)

  // 성과 기록 진행 — 표본이 충분해질 때까지 **수치를 만들어 보여주지 않는다**(§6 RAG)
  const days = [...new Set(((hist || []) as { d: string }[]).map(h => h.d))].sort()
  const NEEDED = 20
  const recDays = days.length, recFrom = days[0] ?? null
  const recPct = Math.min(100, Math.round((recDays / NEEDED) * 100))

  const latest = ([...kr, ...us].map(r => (r as any).cached_at).filter(Boolean).sort().pop()) as string | undefined
  let freshTxt = ''
  if (latest) {
    const mins = Math.max(0, Math.round((Date.now() - new Date(latest).getTime()) / 60000))
    freshTxt = mins < 60 ? `${mins}${t('updatedAgoMin')}` : mins < 1440 ? `${Math.round(mins / 60)}${t('updatedAgoHour')}` : `${Math.round(mins / 1440)}${t('updatedAgoDay')}`
  }

  const regimeOf = (ix: Awaited<ReturnType<typeof idx>>) => {
    if (!ix || !vix) return { label: t('gNeutral'), col: T.amber, note: t('regimeNoData') }
    if (ix.trend === 'up' && vix.last < 20) return { label: t('gFav'), col: T.green, note: t('regimeUpStable') }
    if (ix.trend === 'down' && vix.last > 25) return { label: t('gWarn'), col: T.red, note: t('regimeDownVol') }
    if (ix.trend === 'down') return { label: t('gCaution'), col: T.amber, note: t('regimeDown') }
    return { label: t('gFav'), col: T.green, note: t('regimeUp') }
  }
  const krRegime = regimeOf(kospi), usRegime = regimeOf(sp500)
  const fmtDt = (dt?: string) => dt && dt.length === 8 ? `${+dt.slice(4, 6)}/${+dt.slice(6, 8)}` : ''
  const priceTxt = (r: StockScore, us: boolean) => r.scores?.price == null ? null
    : us ? '$' + Number(r.scores.price).toLocaleString('en-US', { maximumFractionDigits: 2 })
         : Number(r.scores.price).toLocaleString('ko-KR') + '원'

  const IdxBox = ({ label, d }: { label: string; d: Awaited<ReturnType<typeof idx>> }) => (
    <div style={{ ...cardStyle, borderRadius: 12, padding: '10px 12px', flex: 1, minWidth: 96 }}>
      <div style={{ fontSize: 11, color: T.muted }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>{d ? d.last.toLocaleString() : '—'}</div>
      {d && <div style={{ fontSize: 11, fontWeight: 700, color: d.chg > 0 ? T.green : d.chg < 0 ? T.red : T.muted }}>{d.chg > 0 ? '▲' : d.chg < 0 ? '▼' : ''}{Math.abs(d.chg)}%</div>}
    </div>
  )
  // 국가 배지 — 국기 이모지는 Windows에서 'KR'/'US' 텍스트로 떨어져 구분이 안 된다 → 색 배지로 대체
  const Badge = ({ us }: { us: boolean }) => (
    <span style={{
      fontSize: 10.5, fontWeight: 900, letterSpacing: 0.5, padding: '2px 7px', borderRadius: 6,
      background: us ? T.us : T.kr, color: '#0b1020',
    }}>{us ? 'US' : 'KR'}</span>
  )
  const Regime = ({ us, title, r }: { us: boolean; title: string; r: ReturnType<typeof regimeOf> }) => (
    <div style={{
      ...cardStyle, borderRadius: 16, padding: '14px 16px', flex: 1, minWidth: 240,
      borderLeft: `4px solid ${us ? T.us : T.kr}`,                       // 좌측 = 국가색(어느 시장인지)
      background: `linear-gradient(90deg, ${us ? T.usSoft : T.krSoft}, ${T.cardBg} 55%)`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <Badge us={us} />
        <span style={{ fontSize: 11.5, color: T.muted, letterSpacing: 0.5 }}>{title} 국면</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: r.col, marginTop: 4 }}>{r.label}</div>
      <div style={{ fontSize: 12, color: T.muted, marginTop: 4, lineHeight: 1.5 }}>{r.note}<br /><span style={{ fontSize: 11 }}>{t('regimeNote')}</span></div>
    </div>
  )

  // 시장별 요약 카드 (메인의 두 축)
  const MarketPanel = ({ title, rows, top, isUs, cov }: { title: string; rows: StockScore[]; top: StockScore[]; isUs: boolean; cov: string }) => (
    <div style={{ ...cardStyle, borderRadius: 16, padding: 18, borderTop: `3px solid ${isUs ? T.us : T.kr}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Badge us={isUs} />
        <span style={{ fontSize: 17, fontWeight: 800 }}>{title}</span>
        <span style={{ fontSize: 11, color: T.muted }}>{rows.length} {t('stocksUnit')} · {t('coverage')} {cov}</span>
        <Link href={`/scores?country=${isUs ? 'US' : 'KR'}`} style={{ marginLeft: 'auto', color: T.teal, fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>{t('viewDetail')}</Link>
      </div>
      <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        {top.map(r => {
          const total = Math.round(num(r.scores?.total)), col = gradeColor(total)
          const chg = r.scores?.chg != null ? Number(r.scores.chg) : null
          return (
            <Link key={r.symbol} href={`/scores/${r.symbol}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', textDecoration: 'none', color: T.text }}>
              <span style={{ width: 36, height: 36, borderRadius: '50%', border: `2.5px solid ${col}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, color: col, flexShrink: 0 }}>{total}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name || r.symbol}</span>
                <span style={{ display: 'block', fontSize: 11, color: col, fontWeight: 700 }}>{gradeLabel(total, lang)}</span>
              </span>
              <span style={{ textAlign: 'right', flexShrink: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{priceTxt(r, isUs)}</span>
                {chg != null && chg !== 0 && <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: chg > 0 ? T.green : T.red }}>{chg > 0 ? '▲' : '▼'}{Math.abs(chg)}%</span>}
              </span>
            </Link>
          )
        })}
      </div>
      {/* 시장별 급등/급락 요약 */}
      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        {[{ t: t('surge'), list: movers(rows, true), c: T.green }, { t: t('plunge'), list: movers(rows, false), c: T.red }].map(g => (
          <div key={g.t} style={{ flex: 1, minWidth: 130 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: g.c, marginBottom: 4 }}>{g.t}</div>
            {g.list.map(r => (
              <Link key={r.symbol} href={`/scores/${r.symbol}`} style={{ display: 'flex', gap: 6, fontSize: 11.5, padding: '2px 0', textDecoration: 'none', color: T.muted }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name || r.symbol}</span>
                <span style={{ color: g.c, fontWeight: 700 }}>{num(r.scores?.chg) > 0 ? '+' : ''}{num(r.scores?.chg)}%</span>
              </Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: bgGradient, color: T.text }}>
      <header style={{ borderBottom: `1px solid ${T.cardBr}`, position: 'sticky', top: 0, backdropFilter: 'blur(12px)', background: 'rgba(8,12,24,0.85)', zIndex: 20 }}>
        <div className="topbar" style={{ maxWidth: 1360, margin: '0 auto', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" style={{ fontWeight: 800, fontSize: 18, color: T.text, whiteSpace: 'nowrap' }}>🧭 {isEn ? 'Investment Compass' : '투자나침반'} <span style={{ color: T.teal }}>{t('brandSuffix')}</span></Link>
          <nav className="topnav" style={{ display: 'flex', gap: 16, fontSize: 14, alignItems: 'center' }}>
            {freshTxt && <span style={{ fontSize: 11, color: T.muted }}>🕐 {freshTxt}</span>}
            <Link href="/scores?country=KR" style={{ color: T.teal, fontWeight: 700 }}>{t('navKR')}</Link>
            <Link href="/scores?country=US" style={{ color: T.teal, fontWeight: 700 }}>{t('navUS')}</Link>
            <Link href="/method" style={{ color: T.muted }}>{t('navMethod')}</Link>
            <Link href="/journal" style={{ color: T.muted }}>{isEn ? 'Validation' : '모의매매 검증'}</Link>
            <Link href="/plan" style={{ color: T.muted }}>{isEn ? 'My Trades' : '내 매매'}</Link>
            <Link href="/my" style={{ color: T.muted }}>{isEn ? 'My' : '내 정보'}</Link>
            <LangToggle lang={lang} />
          </nav>
        </div>
      </header>

      <div className="shell">
       <main className="shell-main">
        {/* 장 운영 상태 — 지금 거래 가능한지가 첫 정보 */}
        {hours.length > 0 && <div style={{ marginBottom: 12 }}><MarketClock markets={hours} /></div>}

        {/* 두 시장 국면 */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Regime us={false} title={isEn ? 'Korea' : '국내'} r={krRegime} />
          <Regime us={true} title={isEn ? 'US' : '미국'} r={usRegime} />
        </div>

        {/* 지수 종합 */}
        <div style={{ fontSize: 12, color: T.muted, letterSpacing: 1, marginTop: 22, marginBottom: 8 }}>{t("marketSummary")}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <IdxBox label="KOSPI" d={kospi} /><IdxBox label="KOSDAQ" d={kosdaq} />
          <IdxBox label="나스닥" d={nasdaq} /><IdxBox label="S&P500" d={sp500} />
          <IdxBox label="VIX(공포)" d={vix} /><IdxBox label="원/달러" d={usdkrw} />
        </div>

        {/* 메인 두 축 — 국내 / 미국 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 14, marginTop: 22 }}>
          <MarketPanel title={t("krStocks")} rows={kr} top={krTop} isUs={false} cov={avgCov(kr)} />
          <MarketPanel title={t("usStocks")} rows={us} top={usTop} isUs={true} cov={avgCov(us)} />
        </div>
        <div style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>
          {t('crossMarketWarn')}
        </div>

        {/* 공시 피드 (국내 DART + 미국 SEC 8-K) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14, marginTop: 26 }}>
          <FilingFeed title={t('goodNews')} items={goodMix} color={T.green} empty={t('noFilings')} lang={lang} />
          <FilingFeed title={t('badNews')} items={badMix} color={T.red} empty={t('noFilings')} lang={lang} />
        </div>
        <div style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>{t('filingSource')}</div>

        {/* 업종 흐름 — 국내 / 미국 */}
        {[{ list: sectors, us: false }, { list: usSectors, us: true }].map(g => g.list.length === 0 ? null : (
          <div key={g.us ? 'us' : 'kr'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 26, marginBottom: 8 }}>
              <Badge us={g.us} />
              <span style={{ fontSize: 12, color: T.muted, letterSpacing: 0.5 }}>
                {g.us ? (isEn ? 'US Sector Flow' : '미국 업종 흐름') : (isEn ? 'Korea Sector Flow' : '국내 업종 흐름')}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: 8 }}>
              {g.list.map(sc => {
                const on = Math.min(1, Math.abs(sc.chg) / 3)
                const bg = sc.chg >= 0 ? `rgba(40,199,111,${0.12 + on * 0.4})` : `rgba(240,101,74,${0.12 + on * 0.4})`
                return (
                  <div key={sc.name} style={{ borderRadius: 10, padding: '10px 12px', background: bg, border: `1px solid ${T.cardBr}`, gridColumn: `span ${Math.min(3, Math.max(1, Math.round(sc.n / 3)))}` }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={sc.name}>{trSector(sc.name, lang)}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: sc.chg >= 0 ? T.green : T.red, marginTop: 2 }}>{sc.chg > 0 ? '+' : ''}{sc.chg}%</div>
                    <div style={{ fontSize: 10, color: T.muted }}>{sc.n} {t('stocksUnit')} · {t('sectorAvg')} {sc.tot}{t('points')}</div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* 기관·외국인 순매수 (국내 전용) */}
        {flow.length > 0 && (
          <>
            <h2 style={{ fontSize: 17, fontWeight: 800, marginTop: 26 }}>{t('flowTitle')}</h2>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>{t('flowNote')}</div>
            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              {flow.map(r => {
                const total = Math.round(num(r.scores?.total))
                return (
                  <Link key={r.symbol} href={`/scores/${r.symbol}`} style={{ ...cardStyle, borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: T.text }}>
                    <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{r.name || r.symbol}</span>
                    <span style={{ fontSize: 12, color: T.green, fontWeight: 700 }}>{t('netBuy')} {(r.scores as any)?.supply_days ?? ''}{t('days')}</span>
                    <span style={{ fontSize: 12, color: gradeColor(total), fontWeight: 700 }}>{total}{t('points')}</span>
                    <span style={{ color: T.muted, fontSize: 16 }}>›</span>
                  </Link>
                )
              })}
            </div>
          </>
        )}

        {/* 성과 검증 — 등급별 실제 성과는 표본이 쌓인 뒤에만 공개 */}
        <div style={{ ...cardStyle, borderRadius: 16, padding: 18, marginTop: 26 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16, fontWeight: 800 }}>{t('perfTitle')}</span>
            <span style={{ fontSize: 12, color: T.muted }}>{t('perfSub')}</span>
          </div>
          <div style={{ marginTop: 12, height: 8, borderRadius: 5, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
            <div style={{ width: `${recPct}%`, height: '100%', background: T.teal }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6 }}>
            <span style={{ color: T.text, fontWeight: 700 }}>{t('perfDay')} {recDays}{t('perfOf')}</span>
            <span style={{ color: T.muted }}>{recFrom ? `${recFrom} ${t('perfStart')}` : ''}</span>
          </div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 10, lineHeight: 1.7 }}>
            {t('perfBody')}
          </div>
        </div>

        <div style={{ ...cardStyle, borderRadius: 14, padding: 18, marginTop: 14 }}>
          <div style={{ fontSize: 14, lineHeight: 1.8, color: T.muted }}>
            {t('introBody')} <Link href="/method" style={{ color: T.teal }}>{t('methodLink')}</Link>
          </div>
        </div>

        <p style={{ fontSize: 12, color: T.muted, marginTop: 22, lineHeight: 1.7, borderTop: `1px solid ${T.cardBr}`, paddingTop: 14 }}>
          {t('disclaimer')}
          <br /><Link href="/privacy" style={{ color: T.muted, textDecoration: 'underline' }}>{t('privacy')}</Link>
        </p>
       </main>
       <aside className="chat-rail" style={{ display: 'flex', flexDirection: 'column', gap: 12, height: 'auto', overflow: 'visible' }}>
         {/* 채팅을 위로 · 각 패널이 자기 높이를 관리해 레일 자체 스크롤바 없음 */}
         <div style={{ height: 420, flexShrink: 0 }}><CommunityChat lang={lang} /></div>
         <RecentActivity max={7} summary={paperSummary} trades={paper.filter(t => t.rule === 'context1' && t.status !== 'canceled').map((t: any) => ({
           id: t.id, symbol: t.symbol, name: t.name, country: t.country, status: t.status,
           entry_date: t.entry_date, entry_score: t.entry_score,
           exit_date: t.exit_date, exit_kind: t.exit_kind, pnl_pct: t.pnl_pct,
         }))} lang={lang} />
       </aside>
      </div>
    </div>
  )
}
