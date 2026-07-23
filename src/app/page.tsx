import Link from 'next/link'
import { supabase, type StockScore } from '@/lib/supabase'
import { T, bgGradient, cardStyle, gradeColor, gradeLabel } from '@/lib/theme'

export const dynamic = 'force-dynamic'

// 토스식 홈 — 상단 지수·국면 요약 + 오늘의 상위 종목. "내 분석 화면 공개" 프레임(무료·매수권유 아님).
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
async function idx(sym: string) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=3mo&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 600 } })
    const j = await r.json()
    const c: number[] = (j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []).filter(Number.isFinite)
    if (c.length < 25) return null
    const last = c[c.length - 1], ma20 = mean(c.slice(-20)), prev = c[c.length - 2]
    return { last: +last.toFixed(2), chg: +(((last - prev) / prev) * 100).toFixed(2), trend: last > ma20 ? 'up' : 'down' as const }
  } catch { return null }
}

export default async function Home() {
  const [{ data }, kospi, kosdaq] = await Promise.all([
    supabase.from('stock_score_cache').select('symbol,name,scores,coverage').order('scores->total', { ascending: false }).limit(6),
    idx('^KS11'), idx('^KQ11'),
  ])
  const top = (data || []) as StockScore[]
  const num = (v: unknown) => (v == null ? 0 : Number(v))

  const IdxBox = ({ label, d }: { label: string; d: Awaited<ReturnType<typeof idx>> }) => (
    <div style={{ ...cardStyle, borderRadius: 14, padding: 16, flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 13, color: T.muted }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{d ? d.last.toLocaleString() : '—'}</div>
      {d && <div style={{ fontSize: 13, fontWeight: 700, color: d.chg > 0 ? T.green : d.chg < 0 ? T.red : T.muted }}>{d.chg > 0 ? '▲' : d.chg < 0 ? '▼' : ''} {Math.abs(d.chg)}% · {d.trend === 'up' ? '상승 추세' : '하락 추세'}</div>}
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: bgGradient, color: T.text }}>
      <header style={{ borderBottom: `1px solid ${T.cardBr}`, position: 'sticky', top: 0, backdropFilter: 'blur(12px)', background: 'rgba(8,12,24,0.85)', zIndex: 20 }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 800, fontSize: 18 }}>🧭 투자나침반 <span style={{ color: T.teal }}>주식</span></span>
          <nav style={{ display: 'flex', gap: 18, fontSize: 14 }}>
            <Link href="/scores" style={{ color: T.teal, fontWeight: 700 }}>종목 점수</Link>
            <a href="https://navcp.xyz" style={{ color: T.muted }}>크립토 →</a>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '28px 20px 60px' }}>
        {/* 지수 요약 */}
        <div style={{ fontSize: 12, color: T.muted, letterSpacing: 1 }}>오늘의 국내 증시</div>
        <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
          <IdxBox label="KOSPI" d={kospi} />
          <IdxBox label="KOSDAQ" d={kosdaq} />
        </div>

        {/* 오늘의 상위 종목 */}
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

        {/* 소개 */}
        <div style={{ ...cardStyle, borderRadius: 14, padding: 18, marginTop: 26 }}>
          <div style={{ fontSize: 14, lineHeight: 1.8, color: T.muted }}>
            7팩터(거시·수급·재무·AI·공매도·기술·전략)로 국내 종목을 100점 스코어링한 <b style={{ color: T.text }}>제 분석 화면을 무료로 공개</b>합니다.
            점수가 높다고 매수 신호가 아니라, 제가 시장을 어떻게 읽는지 투명하게 보여드리는 도구예요.
          </div>
        </div>

        <p style={{ fontSize: 12, color: T.muted, marginTop: 24, lineHeight: 1.7, borderTop: `1px solid ${T.cardBr}`, paddingTop: 14 }}>
          ⚠️ 정보 제공·분석·교육 목적입니다. 특정 종목의 매수·매도 권유가 아니며, 투자 판단과 책임은 본인에게 있습니다.
          운영자는 제도권 금융기관·투자자문업자가 아니며, 대가를 받는 투자자문·리딩·투자일임을 제공하지 않습니다.
        </p>
      </main>
    </div>
  )
}
