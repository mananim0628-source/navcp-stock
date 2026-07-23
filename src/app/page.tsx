import Link from 'next/link'
import { supabase, type StockScore } from '@/lib/supabase'
import { T, bgGradient, cardStyle, gradeColor, gradeLabel } from '@/lib/theme'
import CommunityChat from '@/components/CommunityChat'

export const dynamic = 'force-dynamic'

// 토스식 정보 허브 홈 — 시장 종합(지수·국면) + 오늘의 호재/악재(DART 공시) + 기관·외국인 플로우 + 팩터 등급 상위.
// "내 분석 화면 공개" 프레임(무료·매수권유 아님). 해외 개인 대시보드 공통요소 반영.
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
async function idx(sym: string) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=3mo&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 600 } })
    const j = await r.json()
    const c: number[] = (j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []).filter(Number.isFinite)
    if (c.length < 25) return null
    const last = c[c.length - 1], ma20 = mean(c.slice(-20)), prev = c[c.length - 2]
    return { last: +last.toFixed(2), chg: +(((last - prev) / prev) * 100).toFixed(2), trend: last > ma20 ? 'up' as const : 'down' as const }
  } catch { return null }
}

type Disc = { dt?: string; nm?: string }

export default async function Home() {
  const [{ data: allRows }, kospi, kosdaq, nasdaq, sp500, vix, usdkrw] = await Promise.all([
    supabase.from('stock_score_cache').select('symbol,name,scores,coverage,cached_at').order('cached_at', { ascending: false }).limit(120),
    idx('^KS11'), idx('^KQ11'), idx('^IXIC'), idx('^GSPC'), idx('^VIX'), idx('KRW=X'),
  ])
  const rows = (allRows || []) as StockScore[]
  const num = (v: unknown) => (v == null ? 0 : Number(v))

  const top = [...rows].sort((a, b) => num(b.scores?.total) - num(a.scores?.total)).slice(0, 6)
  // 기관·외국인 순매수 상위(수급 팩터 높고 방향 매수)
  const flow = [...rows]
    .filter(r => (r.scores as any)?.supply_dir === '순매수')
    .sort((a, b) => num(b.scores?.supply) - num(a.scores?.supply)).slice(0, 5)

  // 오늘의 호재/악재 — 전 종목 DART 공시명 집계
  type Feed = { symbol: string; name: string; d: Disc }
  const good: Feed[] = [], bad: Feed[] = []
  for (const r of rows) {
    const s = r.scores as any
    for (const d of (s?.ai_pos || []) as Disc[]) good.push({ symbol: r.symbol, name: r.name || r.symbol, d })
    for (const d of (s?.ai_neg || []) as Disc[]) bad.push({ symbol: r.symbol, name: r.name || r.symbol, d })
  }
  const byDt = (a: Feed, b: Feed) => String(b.d.dt || '').localeCompare(String(a.d.dt || ''))
  good.sort(byDt); bad.sort(byDt)

  // 오늘의 급등/급락 무버스 (일간 등락률)
  const moved = rows.filter(r => r.scores?.chg != null && Number(r.scores.chg) !== 0)
  const gainers = [...moved].sort((a, b) => num(b.scores?.chg) - num(a.scores?.chg)).slice(0, 5)
  const losers = [...moved].sort((a, b) => num(a.scores?.chg) - num(b.scores?.chg)).slice(0, 5)

  // 52주 신고가 근접 (현재가가 52주 고가의 97% 이상)
  const nearHigh = rows.filter(r => {
    const p = num(r.scores?.price), hi = num((r.scores as any)?.w52_high)
    return p > 0 && hi > 0 && p >= hi * 0.97
  }).sort((a, b) => num(b.scores?.total) - num(a.scores?.total)).slice(0, 6)

  // 업종(섹터) 흐름 — 업종별 평균 등락률·평균점수 집계
  const secMap = new Map<string, { chg: number[]; tot: number[] }>()
  for (const r of rows) {
    const sec = (r.scores as any)?.sector
    if (!sec || r.scores?.chg == null) continue
    if (!secMap.has(sec)) secMap.set(sec, { chg: [], tot: [] })
    const g = secMap.get(sec)!
    g.chg.push(num(r.scores.chg)); g.tot.push(num(r.scores?.total))
  }
  const sectors = [...secMap.entries()]
    .filter(([, g]) => g.chg.length >= 2)
    .map(([name, g]) => ({ name, chg: +mean(g.chg).toFixed(2), tot: Math.round(mean(g.tot)), n: g.chg.length }))
    .sort((a, b) => b.chg - a.chg).slice(0, 8)

  // 데이터 갱신 시각 ("N분 전")
  const latest = (rows[0] as any)?.cached_at as string | undefined
  let freshTxt = ''
  if (latest) {
    const mins = Math.max(0, Math.round((Date.now() - new Date(latest).getTime()) / 60000))
    freshTxt = mins < 60 ? `${mins}분 전 갱신` : mins < 1440 ? `${Math.round(mins / 60)}시간 전 갱신` : `${Math.round(mins / 1440)}일 전 갱신`
  }

  // 국면 판정 — 코스피 추세 + VIX
  let regime: { label: string; col: string; note: string } = { label: '중립', col: T.amber, note: '방향성 관망 구간' }
  if (kospi && vix) {
    if (kospi.trend === 'up' && vix.last < 20) regime = { label: '우호', col: T.green, note: '지수 20일선 위 · 변동성 안정' }
    else if (kospi.trend === 'down' && vix.last > 25) regime = { label: '경계', col: T.red, note: '지수 약세 · 변동성 확대' }
    else if (kospi.trend === 'down') regime = { label: '주의', col: T.amber, note: '지수 20일선 아래 · 신중 접근' }
    else regime = { label: '우호', col: T.green, note: '지수 상승 추세 유지' }
  }

  const fmtDt = (dt?: string) => dt && dt.length === 8 ? `${+dt.slice(4, 6)}/${+dt.slice(6, 8)}` : ''

  const IdxBox = ({ label, d, unit }: { label: string; d: Awaited<ReturnType<typeof idx>>; unit?: string }) => (
    <div style={{ ...cardStyle, borderRadius: 12, padding: '10px 12px', flex: 1, minWidth: 96 }}>
      <div style={{ fontSize: 11, color: T.muted }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>{d ? d.last.toLocaleString() : '—'}{unit}</div>
      {d && <div style={{ fontSize: 11, fontWeight: 700, color: d.chg > 0 ? T.green : d.chg < 0 ? T.red : T.muted }}>{d.chg > 0 ? '▲' : d.chg < 0 ? '▼' : ''}{Math.abs(d.chg)}%</div>}
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: bgGradient, color: T.text }}>
      <header style={{ borderBottom: `1px solid ${T.cardBr}`, position: 'sticky', top: 0, backdropFilter: 'blur(12px)', background: 'rgba(8,12,24,0.85)', zIndex: 20 }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 800, fontSize: 18 }}>🧭 투자나침반 <span style={{ color: T.teal }}>주식</span></span>
          <nav style={{ display: 'flex', gap: 18, fontSize: 14, alignItems: 'center' }}>
            {freshTxt && <span style={{ fontSize: 11, color: T.muted }}>🕐 {freshTxt}</span>}
            <Link href="/scores" style={{ color: T.teal, fontWeight: 700 }}>종목 점수</Link>
            <Link href="/method" style={{ color: T.muted }}>방법론</Link>
            <a href="https://navcp.xyz" style={{ color: T.muted }}>크립토 →</a>
          </nav>
        </div>
      </header>

      <div className="shell">
       <main className="shell-main">
        {/* 시장 국면 배너 */}
        <div style={{ ...cardStyle, borderRadius: 16, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 16, borderLeft: `4px solid ${regime.col}` }}>
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: T.muted, letterSpacing: 1 }}>오늘의 시장 국면</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: regime.col, marginTop: 2 }}>{regime.label}</div>
          </div>
          <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.5, borderLeft: `1px solid ${T.cardBr}`, paddingLeft: 16 }}>
            {regime.note}<br />
            <span style={{ fontSize: 12 }}>KOSPI·VIX 기반 자동 판정 · 매수/매도 신호 아님</span>
          </div>
        </div>

        {/* 지수 종합 */}
        <div style={{ fontSize: 12, color: T.muted, letterSpacing: 1, marginTop: 24, marginBottom: 8 }}>시장 종합</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <IdxBox label="KOSPI" d={kospi} />
          <IdxBox label="KOSDAQ" d={kosdaq} />
          <IdxBox label="나스닥" d={nasdaq} />
          <IdxBox label="S&P500" d={sp500} />
          <IdxBox label="VIX(공포)" d={vix} />
          <IdxBox label="원/달러" d={usdkrw} />
        </div>

        {/* 업종 흐름 히트맵 */}
        {sectors.length > 0 && (
          <>
            <div style={{ fontSize: 12, color: T.muted, letterSpacing: 1, marginTop: 26, marginBottom: 8 }}>업종 흐름 (오늘)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: 8 }}>
              {sectors.map(s => {
                const on = Math.min(1, Math.abs(s.chg) / 3)
                const bg = s.chg >= 0 ? `rgba(40,199,111,${0.12 + on * 0.4})` : `rgba(240,101,74,${0.12 + on * 0.4})`
                return (
                  <div key={s.name} style={{ borderRadius: 10, padding: '10px 12px', background: bg, border: `1px solid ${T.cardBr}` }}>
                    <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: s.chg >= 0 ? T.green : T.red, marginTop: 2 }}>{s.chg > 0 ? '+' : ''}{s.chg}%</div>
                    <div style={{ fontSize: 10, color: T.muted }}>{s.n}종목 · 평균 {s.tot}점</div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* 오늘의 호재 / 악재 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14, marginTop: 28 }}>
          <div style={{ ...cardStyle, borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.green, marginBottom: 10 }}>🟢 오늘의 호재 공시</div>
            {good.length ? good.slice(0, 6).map((f, i) => (
              <Link key={i} href={`/scores/${f.symbol}`} style={{ display: 'flex', gap: 8, padding: '7px 0', borderTop: i ? `1px solid ${T.cardBr}` : 'none', textDecoration: 'none', color: T.text }}>
                <span style={{ fontWeight: 700, fontSize: 13, minWidth: 66, flexShrink: 0 }}>{f.name}</span>
                <span style={{ fontSize: 13, color: T.muted, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.d.nm}</span>
                <span style={{ fontSize: 11, color: T.muted, flexShrink: 0 }}>{fmtDt(f.d.dt)}</span>
              </Link>
            )) : <div style={{ fontSize: 13, color: T.muted, padding: '8px 0' }}>집계된 호재 공시가 아직 없어요.</div>}
          </div>
          <div style={{ ...cardStyle, borderRadius: 14, padding: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.red, marginBottom: 10 }}>🔴 오늘의 악재 공시</div>
            {bad.length ? bad.slice(0, 6).map((f, i) => (
              <Link key={i} href={`/scores/${f.symbol}`} style={{ display: 'flex', gap: 8, padding: '7px 0', borderTop: i ? `1px solid ${T.cardBr}` : 'none', textDecoration: 'none', color: T.text }}>
                <span style={{ fontWeight: 700, fontSize: 13, minWidth: 66, flexShrink: 0 }}>{f.name}</span>
                <span style={{ fontSize: 13, color: T.muted, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.d.nm}</span>
                <span style={{ fontSize: 11, color: T.muted, flexShrink: 0 }}>{fmtDt(f.d.dt)}</span>
              </Link>
            )) : <div style={{ fontSize: 13, color: T.muted, padding: '8px 0' }}>집계된 악재 공시가 아직 없어요.</div>}
          </div>
        </div>
        <div style={{ fontSize: 11, color: T.muted, marginTop: 6 }}>※ DART 전자공시 기반 자동 분류. 공시 성격 참고용이며 주가 방향을 보장하지 않습니다.</div>

        {/* 오늘의 급등/급락 */}
        {moved.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14, marginTop: 28 }}>
            {[{ t: '📈 오늘의 급등', list: gainers, up: true }, { t: '📉 오늘의 급락', list: losers, up: false }].map(g => (
              <div key={g.t} style={{ ...cardStyle, borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: g.up ? T.green : T.red, marginBottom: 10 }}>{g.t}</div>
                {g.list.map((r, i) => {
                  const chg = num(r.scores?.chg)
                  const total = Math.round(num(r.scores?.total))
                  return (
                    <Link key={r.symbol} href={`/scores/${r.symbol}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: i ? `1px solid ${T.cardBr}` : 'none', textDecoration: 'none', color: T.text }}>
                      <span style={{ fontWeight: 700, fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name || r.symbol}</span>
                      <span style={{ fontSize: 12, color: gradeColor(total), fontWeight: 700 }}>{total}점</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: chg > 0 ? T.green : T.red, minWidth: 56, textAlign: 'right' }}>{chg > 0 ? '▲' : '▼'}{Math.abs(chg)}%</span>
                    </Link>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        {/* 오늘 점수 높은 종목 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 30 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>🔥 오늘 점수 높은 종목</h2>
          <Link href="/scores" style={{ color: T.teal, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>전체 보기 →</Link>
        </div>
        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          {top.map(r => {
            const total = Math.round(num(r.scores?.total))
            const col = gradeColor(total)
            const price = r.scores?.price != null ? Number(r.scores.price).toLocaleString('ko-KR') + '원' : null
            const chg = r.scores?.chg != null ? Number(r.scores.chg) : null
            const cov = r.coverage != null ? Math.round(Number(r.coverage) * 100) : null
            return (
              <Link key={r.symbol} href={`/scores/${r.symbol}`} style={{ ...cardStyle, borderRadius: 12, padding: 14, display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', color: T.text }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', border: `3px solid ${col}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, color: col, flexShrink: 0 }}>{total}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{r.name || r.symbol}</div>
                  <div style={{ fontSize: 12, marginTop: 2 }}><span style={{ color: col, fontWeight: 700 }}>{gradeLabel(total)}</span>{cov != null && <span style={{ color: T.muted, marginLeft: 8 }}>커버리지 {cov}%</span>}</div>
                </div>
                {price && <div style={{ textAlign: 'right', flexShrink: 0 }}><div style={{ fontSize: 14, fontWeight: 700 }}>{price}</div>{chg != null && chg !== 0 && <div style={{ fontSize: 12, fontWeight: 700, color: chg > 0 ? T.green : T.red }}>{chg > 0 ? '▲' : '▼'}{Math.abs(chg)}%</div>}</div>}
                <span style={{ color: T.muted, fontSize: 18, flexShrink: 0 }}>›</span>
              </Link>
            )
          })}
        </div>

        {/* 52주 신고가 근접 */}
        {nearHigh.length > 0 && (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginTop: 30 }}>🚀 52주 신고가 근접</h2>
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              {nearHigh.map(r => {
                const total = Math.round(num(r.scores?.total))
                const p = num(r.scores?.price), hi = num((r.scores as any)?.w52_high)
                const pct = hi > 0 ? Math.round((p / hi) * 100) : 0
                return (
                  <Link key={r.symbol} href={`/scores/${r.symbol}`} style={{ ...cardStyle, borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: T.text }}>
                    <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{r.name || r.symbol}</span>
                    <span style={{ fontSize: 12, color: T.teal, fontWeight: 700 }}>고점의 {pct}%</span>
                    <span style={{ fontSize: 12, color: gradeColor(total), fontWeight: 700 }}>{total}점</span>
                    <span style={{ color: T.muted, fontSize: 16 }}>›</span>
                  </Link>
                )
              })}
            </div>
          </>
        )}

        {/* 기관·외국인 순매수 상위 */}
        {flow.length > 0 && (
          <>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginTop: 30 }}>💰 기관·외국인 순매수 상위</h2>
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              {flow.map(r => {
                const days = (r.scores as any)?.supply_days
                const total = Math.round(num(r.scores?.total))
                return (
                  <Link key={r.symbol} href={`/scores/${r.symbol}`} style={{ ...cardStyle, borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: T.text }}>
                    <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{r.name || r.symbol}</span>
                    <span style={{ fontSize: 12, color: T.green, fontWeight: 700 }}>순매수{days ? ` ${days}일 지속` : ''}</span>
                    <span style={{ fontSize: 12, color: gradeColor(total), fontWeight: 700 }}>{total}점</span>
                    <span style={{ color: T.muted, fontSize: 16 }}>›</span>
                  </Link>
                )
              })}
            </div>
          </>
        )}

        {/* 소개 */}
        <div style={{ ...cardStyle, borderRadius: 14, padding: 18, marginTop: 30 }}>
          <div style={{ fontSize: 14, lineHeight: 1.8, color: T.muted }}>
            7팩터(거시·수급·재무·AI·공매도·기술·전략)로 국내 종목을 100점 스코어링하는 <b style={{ color: T.text }}>제 분석 화면을 무료로 공개</b>합니다.
            점수가 높다고 매수 신호가 아니라, 제가 시장을 어떻게 읽는지 투명하게 보여드리는 도구예요.
          </div>
        </div>

        <p style={{ fontSize: 12, color: T.muted, marginTop: 24, lineHeight: 1.7, borderTop: `1px solid ${T.cardBr}`, paddingTop: 14 }}>
          ⚠️ 정보 제공·분석·교육 목적입니다. 특정 종목의 매수·매도 권유가 아니며, 투자 판단과 책임은 본인에게 있습니다.
          운영자는 제도권 금융기관·투자자문업자가 아니며, 대가를 받는 투자자문·리딩·투자일임을 제공하지 않습니다.
        </p>
       </main>
       <aside className="chat-rail">
         <CommunityChat />
       </aside>
      </div>
    </div>
  )
}
