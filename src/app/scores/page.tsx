import Link from 'next/link'
import { supabase, type StockScore } from '@/lib/supabase'
import { T, bgGradient } from '@/lib/theme'
import ScoresList from '@/components/ScoresList'

export const dynamic = 'force-dynamic'

// 종목 점수판 — 등급 필터 바 + 리스트. "내 분석 화면 공개" 프레임. 매수 권유 아님.
export default async function ScoresPage() {
  const { data } = await supabase
    .from('stock_score_cache')
    .select('symbol,name,market,scores,coverage,cached_at')
    .order('scores->total', { ascending: false })
    .limit(300)
  const rows = (data || []) as StockScore[]

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

        <ScoresList rows={rows} />

        <p style={{ fontSize: 12, color: T.muted, marginTop: 28, lineHeight: 1.7, borderTop: `1px solid ${T.cardBr}`, paddingTop: 14 }}>
          ⚠️ 정보 제공·분석·교육 목적. 특정 종목 매수·매도 권유가 아니며 투자 판단과 책임은 본인 몫입니다.
          운영자는 제도권 금융기관·투자자문업자가 아니며, 대가를 받는 자문·리딩·일임을 제공하지 않습니다.
          {rows.length > 0 && rows[0].cached_at && <><br />업데이트: {new Date(rows[0].cached_at).toLocaleString('ko-KR')}</>}
        </p>
      </main>
    </div>
  )
}
