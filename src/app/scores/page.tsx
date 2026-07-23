import Link from 'next/link'
import { supabase, type StockScore } from '@/lib/supabase'
import { T, bgGradient, cardStyle, gradeColor, gradeLabel } from '@/lib/theme'

export const revalidate = 300 // 5분

// 종목 점수판 — stock_score_cache 읽어 등급별 렌더. "내 분석 화면 공개" 프레임.
// 커버리지 낮은 종목은 경고 표기(뻥튀기 방지, 크립토 교훈). 매수 권유 아님.
export default async function ScoresPage() {
  const { data } = await supabase
    .from('stock_score_cache')
    .select('symbol,name,market,scores,coverage,cached_at')
    .order('scores->total', { ascending: false })
    .limit(60)

  const rows = (data || []) as StockScore[]
  const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0)

  return (
    <div style={{ minHeight: '100vh', background: bgGradient, color: T.text }}>
      <header style={{ borderBottom: `1px solid ${T.cardBr}`, position: 'sticky', top: 0, backdropFilter: 'blur(12px)', background: 'rgba(8,12,24,0.85)', zIndex: 20 }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" style={{ fontWeight: 800, fontSize: 18, textDecoration: 'none' }}>🧭 투자나침반 <span style={{ color: T.teal }}>주식</span></Link>
          <a href="https://navcp.xyz" style={{ color: T.muted, fontSize: 14 }}>크립토 →</a>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 20px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>국내 종목 7팩터 점수</h1>
        <p style={{ fontSize: 13, color: T.muted, marginTop: 6, lineHeight: 1.6 }}>
          제가 시장을 읽는 화면을 그대로 공개합니다. 점수가 높다고 매수 신호가 아니며, <b style={{ color: T.text }}>커버리지(측정 충실도)</b>를 함께 보세요.
        </p>

        {rows.length === 0 ? (
          <div style={{ ...cardStyle, borderRadius: 14, padding: 28, marginTop: 22, textAlign: 'center', color: T.muted }}>
            아직 점수 데이터가 없어요. 스코어링 엔진이 종목을 채우는 중입니다.
          </div>
        ) : (
          <div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
            {rows.map(r => {
              const total = Math.round(num(r.scores?.total))
              const cov = r.coverage != null ? Math.round(Number(r.coverage) * 100) : null
              const low = cov != null && cov < 85
              const col = gradeColor(total)
              return (
                <div key={r.symbol} style={{ ...cardStyle, borderRadius: 12, padding: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', border: `3px solid ${col}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, color: col, flexShrink: 0 }}>
                    {total}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{r.name || r.symbol} <span style={{ color: T.muted, fontSize: 12 }}>{r.symbol} · {r.market}</span></div>
                    <div style={{ fontSize: 12, marginTop: 2 }}>
                      <span style={{ color: col, fontWeight: 700 }}>{gradeLabel(total)}</span>
                      {cov != null && <span style={{ color: low ? T.red : T.muted, marginLeft: 8 }}>커버리지 {cov}%{low ? ' ⚠️' : ''}</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <p style={{ fontSize: 12, color: T.muted, marginTop: 28, lineHeight: 1.7, borderTop: `1px solid ${T.cardBr}`, paddingTop: 14 }}>
          ⚠️ 정보 제공·분석·교육 목적. 특정 종목 매수·매도 권유가 아니며 투자 판단과 책임은 본인 몫입니다.
          운영자는 제도권 금융기관·투자자문업자가 아니며, 대가를 받는 자문·리딩·일임을 제공하지 않습니다.
          {rows.length > 0 && rows[0].cached_at && <><br />업데이트: {new Date(rows[0].cached_at).toLocaleString('ko-KR')}</>}
        </p>
      </main>
    </div>
  )
}
