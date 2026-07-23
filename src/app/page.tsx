import Link from 'next/link'
import { T, bgGradient, cardStyle } from '@/lib/theme'

// 랜딩 — "내가 만든 7팩터 프로그램으로 국내 증시를 읽는다. 그 화면을 무료로 공개한다."
// §1 리딩 아님·투명. 무료 공개 도구(유사투자자문 신고 대상 아님 — 대가 미수령).
export default function Home() {
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

      <main style={{ maxWidth: 820, margin: '0 auto', padding: '56px 20px' }}>
        <h1 style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.3 }}>
          국내 증시를 <span style={{ color: T.teal }}>7가지 관점</span>으로 읽습니다
        </h1>
        <p style={{ fontSize: 16, color: T.muted, marginTop: 14, lineHeight: 1.7 }}>
          거시·수급·재무·기술 등 7팩터로 국내 종목을 100점으로 점수화한 <b style={{ color: T.text }}>제 분석 화면을 그대로 무료 공개</b>합니다.
          종목을 &quot;사라&quot;고 권하는 게 아니라, 제가 시장을 어떻게 읽는지를 투명하게 보여드리는 도구예요.
        </p>

        <div style={{ display: 'flex', gap: 12, marginTop: 26 }}>
          <Link href="/scores" style={{ background: T.teal, color: T.onTeal, padding: '12px 26px', borderRadius: 12, fontWeight: 700, textDecoration: 'none' }}>
            종목 점수 보기 →
          </Link>
        </div>

        <div style={{ ...cardStyle, borderRadius: 16, padding: 22, marginTop: 40 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>어떤 프로젝트인가요?</div>
          <ul style={{ fontSize: 14, color: T.muted, lineHeight: 1.9, paddingLeft: 18 }}>
            <li>7팩터(거시·수급·재무·AI·파생·기술·전략) 100점 스코어링</li>
            <li>&quot;점수 높은 종목 = 사라&quot;가 아니라, <b style={{ color: T.text }}>측정 충실도(커버리지)까지 정직하게</b> 공개</li>
            <li><b style={{ color: T.text }}>완전 무료</b> · 유료 상담·리딩·자동매매 없음</li>
          </ul>
        </div>

        <p style={{ fontSize: 12, color: T.muted, marginTop: 34, lineHeight: 1.7, borderTop: `1px solid ${T.cardBr}`, paddingTop: 16 }}>
          ⚠️ 정보 제공·분석·교육 목적입니다. 특정 종목의 매수·매도 권유가 아니며, 투자 판단과 책임은 본인에게 있습니다.
          운영자는 제도권 금융기관·투자자문업자가 아니며, 대가를 받는 투자자문·리딩·투자일임을 제공하지 않습니다.
        </p>
      </main>
    </div>
  )
}
