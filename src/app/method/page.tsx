import Link from 'next/link'
import { T, bgGradient, cardStyle } from '@/lib/theme'

export const metadata = { title: '방법론 — 투자나침반 주식' }

// 방법론(교육) 페이지 — 7팩터 정의·가중치·등급 기준·커버리지·데이터 출처.
// "제가 어떻게 시장을 읽는지" 투명 공개 = 유사투자자문(대가 받는 자문) 아님, 교육/정보 프레임.
const FACTORS = [
  { key: '거시', w: 12, color: T.blue, desc: '시장 전체 국면(지수 추세·금리·환율·변동성)을 z-score로 환산. 개별 종목이 아니라 시장 바닥의 우호/역풍을 본다.', how: 'macro_daily 지표 표준화' },
  { key: '수급', w: 13, color: T.teal, desc: '외국인·기관의 최근 20일 순매수 일관성. 며칠 연속 사들이는지(지속성)를 점수화. 세력의 발자국.', how: 'KIS 투자자별 매매동향' },
  { key: '재무', w: 20, color: T.green, desc: '성장률·ROE·부채비율·밸류에이션(PER/PBR). 회사가 실제로 돈을 잘 버는지, 지금 가격이 비싼지 싼지.', how: 'KIS 재무비율 + 현재가' },
  { key: 'AI(공시)', w: 15, color: T.gold, desc: 'DART 전자공시를 호재(자사주·수주·배당)·악재(유상증자·소송·감자)로 자동 분류. 실제 공시라 종목 귀속이 정확.', how: 'DART Open API 공시 분류' },
  { key: '공매도', w: 15, color: T.amber, desc: '공매도 비중이 낮고 줄어드는지. 하락에 베팅하는 물량이 적을수록 우호적으로 해석.', how: 'KIS 공매도 일별추이' },
  { key: '기술', w: 20, color: T.red, desc: 'RSI·이동평균·가격 위치·거래량. 추세와 과열/침체를 기술적 지표로 판단. 지지·저항선도 여기서 산출.', how: 'KIS 일봉 100일' },
  { key: '전략', w: 5, color: T.muted, desc: '위 팩터들의 조합 정합성(예: 수급+기술 동반 개선)에 주는 보정 점수.', how: '팩터 결합 룰' },
]
const GRADES = [
  { label: '강한 우호', range: '78점 이상', color: T.green, note: '조건이 가장 많이 모인 구간(살 때가 아니라 "읽을 만큼" 모인 때)' },
  { label: '우호', range: '66~77점', color: T.green, note: '전반적으로 우호적, 세부 확인 권장' },
  { label: '중립', range: '56~65점', color: T.amber, note: '방향성 불분명, 관망' },
  { label: '주의', range: '48~55점', color: T.amber, note: '역풍 우세, 신중' },
  { label: '경계', range: '48점 미만', color: T.red, note: '리스크 큼' },
]

export default function Method() {
  return (
    <div style={{ minHeight: '100vh', background: bgGradient, color: T.text }}>
      <header style={{ borderBottom: `1px solid ${T.cardBr}`, position: 'sticky', top: 0, backdropFilter: 'blur(12px)', background: 'rgba(8,12,24,0.85)', zIndex: 20 }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" style={{ fontWeight: 800, fontSize: 18, color: T.text, textDecoration: 'none' }}>🧭 투자나침반 <span style={{ color: T.teal }}>주식</span></Link>
          <nav style={{ display: 'flex', gap: 18, fontSize: 14 }}>
            <Link href="/scores" style={{ color: T.muted }}>종목 점수</Link>
            <Link href="/method" style={{ color: T.teal, fontWeight: 700 }}>방법론</Link>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 860, margin: '0 auto', padding: '32px 20px 60px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 900 }}>어떻게 점수를 매기나요?</h1>
        <p style={{ fontSize: 15, color: T.muted, lineHeight: 1.8, marginTop: 10 }}>
          국내 종목을 <b style={{ color: T.text }}>7개 팩터, 합계 100점</b>으로 스코어링합니다.
          제가 시장을 읽는 관점을 코드로 고정해 투명하게 공개하는 도구예요. <b style={{ color: T.text }}>점수가 높다고 매수 신호가 아닙니다.</b>
        </p>

        {/* 팩터 */}
        <h2 style={{ fontSize: 19, fontWeight: 800, marginTop: 34 }}>7팩터 구성</h2>
        <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
          {FACTORS.map(f => (
            <div key={f.key} style={{ ...cardStyle, borderRadius: 14, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontWeight: 800, fontSize: 16, color: f.color }}>{f.key}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.muted }}>{f.w}점</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: T.muted }}>{f.how}</span>
              </div>
              <div style={{ marginTop: 6, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${(f.w / 20) * 100}%`, height: '100%', background: f.color, opacity: 0.8 }} />
              </div>
              <p style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.7, marginTop: 8 }}>{f.desc}</p>
            </div>
          ))}
        </div>

        {/* 등급 */}
        <h2 style={{ fontSize: 19, fontWeight: 800, marginTop: 34 }}>등급 기준</h2>
        <div style={{ ...cardStyle, borderRadius: 14, padding: 8, marginTop: 14 }}>
          {GRADES.map((g, i) => (
            <div key={g.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px', borderTop: i ? `1px solid ${T.cardBr}` : 'none' }}>
              <span style={{ width: 74, fontWeight: 800, color: g.color, fontSize: 14, flexShrink: 0 }}>{g.label}</span>
              <span style={{ width: 92, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{g.range}</span>
              <span style={{ fontSize: 13, color: T.muted, lineHeight: 1.5 }}>{g.note}</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: T.muted, marginTop: 8 }}>※ 주식판 임계선은 KIS 데이터 백테스트로 재보정 예정(현재 크립토 기준 임시 적용).</p>

        {/* 커버리지 */}
        <h2 style={{ fontSize: 19, fontWeight: 800, marginTop: 34 }}>커버리지 — 왜 표시하나요?</h2>
        <div style={{ ...cardStyle, borderRadius: 14, padding: 16, marginTop: 14 }}>
          <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.8 }}>
            모든 팩터를 항상 측정할 수 있는 건 아닙니다(공시 없음, 장 마감 후 일부 데이터 등).
            그래서 <b style={{ color: T.text }}>실제 측정된 팩터의 배점만으로 정규화</b>하고, 몇 %가 측정됐는지 <b style={{ color: T.text }}>커버리지</b>로 함께 보여줍니다.
            커버리지가 낮으면 점수를 그만큼 <b style={{ color: T.text }}>덜 신뢰</b>하시라는 뜻이에요. 점수를 부풀리지 않으려는 장치입니다.
          </p>
        </div>

        {/* 데이터 출처 */}
        <h2 style={{ fontSize: 19, fontWeight: 800, marginTop: 34 }}>데이터 출처</h2>
        <div style={{ ...cardStyle, borderRadius: 14, padding: 16, marginTop: 14, fontSize: 14, color: T.muted, lineHeight: 1.9 }}>
          한국투자증권(KIS) Open API — 시세·재무·수급·공매도·일봉<br />
          금융감독원 DART Open API — 전자공시<br />
          Yahoo Finance — 지수(KOSPI·나스닥·VIX·환율)<br />
          <span style={{ fontSize: 12 }}>유니버스: 시가총액 상위 종목(우선주·ETF·리츠·스팩 제외), 자동 갱신.</span>
        </div>

        <p style={{ fontSize: 12, color: T.muted, marginTop: 30, lineHeight: 1.7, borderTop: `1px solid ${T.cardBr}`, paddingTop: 14 }}>
          ⚠️ 정보 제공·분석·교육 목적입니다. 특정 종목의 매수·매도 권유가 아니며, 투자 판단과 책임은 본인에게 있습니다.
          운영자는 제도권 금융기관·투자자문업자가 아니며, 대가를 받는 투자자문·리딩·투자일임을 제공하지 않습니다.
          과거 성과가 미래 수익을 보장하지 않습니다.
        </p>
      </main>
    </div>
  )
}
