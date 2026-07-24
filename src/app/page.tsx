import Link from 'next/link'
import { supabase, type StockScore } from '@/lib/supabase'
import { T, bgGradient, cardStyle, gradeColor, gradeLabel } from '@/lib/theme'
import { getLang } from '@/lib/i18n'
import LangToggle from '@/components/LangToggle'
import AuthPanel from '@/components/AuthPanel'

export const dynamic = 'force-dynamic'

// 랜딩 — 처음 온 사람에게 '이게 뭔지'를 먼저 설명한다.
// ⚠️ 콘텐츠는 로그인으로 막지 않는다: (1) "누구나 무료로 같은 정보" 프레임이 규제 방어선이고
//    (2) 검색 유입·공유가 죽으면 성장이 막히고 (3) 투명성이 리딩방과의 차별점이기 때문.
//    로그인은 개인화 기능(관심종목·알림)에만 쓴다.

export default async function Landing() {
  const lang = getLang()
  const en = lang === 'en'

  const [{ data: krTop }, { data: usTop }, { data: hist }] = await Promise.all([
    supabase.from('stock_score_cache').select('symbol,name,scores,coverage').eq('country', 'KR').order('scores->total', { ascending: false }).limit(3),
    supabase.from('stock_score_cache').select('symbol,name,scores,coverage').eq('country', 'US').order('scores->total', { ascending: false }).limit(3),
    supabase.from('stock_score_history').select('d'),
  ])
  const kr = (krTop || []) as StockScore[]
  const us = (usTop || []) as StockScore[]
  const recDays = [...new Set(((hist || []) as { d: string }[]).map(h => h.d))].length

  const FACTORS = en
    ? ['Macro 12', 'Flows 13', 'Financials 20', 'Filings 15', 'Short interest 15', 'Technicals 20', 'Strategy 5']
    : ['거시 12', '수급 13', '재무 20', '공시 15', '공매도 15', '기술 20', '전략 5']

  const HOW = en ? [
    { t: 'Scored, not recommended', d: 'Korean and US stocks are scored out of 100 across 7 factors every trading day. A high score is not a buy signal — it tells you how many conditions lined up.' },
    { t: 'Coverage is always shown', d: 'When a factor cannot be measured we leave it empty and normalize over what was measured, then show you the coverage. Scores are never padded to look better.' },
    { t: 'Official sources only', d: 'KIS and Toss for prices and flows, DART and SEC EDGAR for filings, FINRA for short interest. No opinions inserted, no numbers invented.' },
  ] : [
    { t: '점수는 매기지만, 추천하지 않습니다', d: '국내·미국 종목을 매 거래일 7팩터 100점으로 스코어링합니다. 점수가 높다는 건 매수 신호가 아니라 조건이 얼마나 모였는지를 뜻합니다.' },
    { t: '커버리지를 항상 함께 보여줍니다', d: '측정 못 한 팩터는 비워두고 측정된 배점만으로 정규화한 뒤, 몇 %를 측정했는지 표시합니다. 점수를 좋아 보이게 부풀리지 않습니다.' },
    { t: '공식 출처만 씁니다', d: '시세·수급은 한국투자증권·토스증권, 공시는 DART·SEC EDGAR, 공매도는 FINRA. 의견을 끼워넣거나 숫자를 지어내지 않습니다.' },
  ]

  const Preview = ({ rows, us: isUs }: { rows: StockScore[]; us: boolean }) => (
    <div style={{ ...cardStyle, borderRadius: 14, padding: 14, flex: 1, minWidth: 240 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 900, padding: '2px 6px', borderRadius: 5, background: isUs ? T.us : T.kr, color: '#0b1020' }}>{isUs ? 'US' : 'KR'}</span>
        <span style={{ fontSize: 13, fontWeight: 800 }}>{isUs ? (en ? 'US' : '미국') : (en ? 'Korea' : '국내')}</span>
      </div>
      {rows.map(r => {
        const total = Math.round(Number(r.scores?.total) || 0)
        const col = gradeColor(total)
        return (
          <div key={r.symbol} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
            <span style={{ width: 32, height: 32, borderRadius: '50%', border: `2.5px solid ${col}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: col, flexShrink: 0 }}>{total}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name || r.symbol}</span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: col }}>{gradeLabel(total, lang)}</span>
          </div>
        )
      })}
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: bgGradient, color: T.text }}>
      <header style={{ borderBottom: `1px solid ${T.cardBr}`, position: 'sticky', top: 0, backdropFilter: 'blur(12px)', background: 'rgba(8,12,24,0.85)', zIndex: 20 }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 800, fontSize: 18 }}>🧭 {en ? 'Investment Compass' : '투자나침반'} <span style={{ color: T.teal }}>{en ? 'Stocks' : '주식'}</span></span>
          <nav style={{ display: 'flex', gap: 15, fontSize: 14, alignItems: 'center' }}>
            <Link href="/dashboard" style={{ color: T.teal, fontWeight: 700 }}>{en ? 'Dashboard' : '대시보드'}</Link>
            <Link href="/method" style={{ color: T.muted }}>{en ? 'Method' : '방법론'}</Link>
            <Link href="/journal" style={{ color: T.muted }}>{en ? 'Journal' : '매매일지'}</Link>
            <Link href="/my" style={{ color: T.muted }}>{en ? 'My' : '내 정보'}</Link>
            <LangToggle lang={lang} />
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '48px 20px 60px' }}>
        {/* 히어로 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 32, alignItems: 'start' }}>
          <div>
            <div style={{ fontSize: 12, color: T.teal, fontWeight: 800, letterSpacing: 1 }}>
              {en ? 'FREE · NO ACCOUNT NEEDED' : '무료 · 회원가입 없이 열람'}
            </div>
            <h1 style={{ fontSize: 34, fontWeight: 900, lineHeight: 1.25, marginTop: 10 }}>
              {en ? <>The screen I actually<br />read the market with.</> : <>제가 시장을 읽는<br />화면을 그대로 공개합니다.</>}
            </h1>
            <p style={{ fontSize: 15, color: T.muted, lineHeight: 1.8, marginTop: 14 }}>
              {en
                ? 'Korean and US stocks scored out of 100 across 7 factors, updated every trading day. It is an analysis tool for study — not stock picks, not a paid advisory service.'
                : '국내·미국 종목을 7팩터 100점으로 스코어링해 매 거래일 갱신합니다. 종목 추천이 아니라 공부용 분석 도구이고, 대가를 받는 자문 서비스가 아닙니다.'}
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
              <Link href="/dashboard" style={{ padding: '13px 22px', borderRadius: 11, background: T.teal, color: T.onTeal, fontWeight: 800, fontSize: 14.5 }}>
                {en ? 'Open the dashboard →' : '대시보드 둘러보기 →'}
              </Link>
              <Link href="/method" style={{ padding: '13px 22px', borderRadius: 11, border: `1px solid ${T.cardBr}`, color: T.text, fontWeight: 700, fontSize: 14.5 }}>
                {en ? 'How scoring works' : '점수 산정 방법'}
              </Link>
            </div>
            <div style={{ fontSize: 12, color: T.muted, marginTop: 14, lineHeight: 1.7 }}>
              {en
                ? 'Sign up only if you want a watchlist or alerts. Everything else is open.'
                : '관심종목·알림이 필요할 때만 가입하시면 됩니다. 그 외 모든 정보는 열려 있습니다.'}
            </div>
          </div>

          {/* 가입 (선택) */}
          <div>
            <AuthPanel lang={lang} />
          </div>
        </div>

        {/* 실시간 미리보기 — 가리지 않고 바로 보여준다 */}
        <div style={{ marginTop: 44 }}>
          <div style={{ fontSize: 12, color: T.muted, letterSpacing: 1, marginBottom: 10 }}>
            {en ? "TODAY'S TOP SCORES (LIVE)" : '오늘 점수 상위 (실시간)'}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Preview rows={kr} us={false} />
            <Preview rows={us} us={true} />
          </div>
          <Link href="/dashboard" style={{ display: 'inline-block', marginTop: 12, fontSize: 13, color: T.teal, fontWeight: 700 }}>
            {en ? 'See all stocks, sectors and filings →' : '전 종목·업종·공시 전체 보기 →'}
          </Link>
        </div>

        {/* 7팩터 */}
        <div style={{ marginTop: 44 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>{en ? '7 factors, 100 points' : '7팩터 · 합계 100점'}</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
            {FACTORS.map(f => (
              <span key={f} style={{ padding: '8px 13px', borderRadius: 9, border: `1px solid ${T.cardBr}`, fontSize: 13, fontWeight: 700, background: 'rgba(255,255,255,0.03)' }}>{f}</span>
            ))}
          </div>
        </div>

        {/* 원칙 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14, marginTop: 26 }}>
          {HOW.map(h => (
            <div key={h.t} style={{ ...cardStyle, borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 14.5, fontWeight: 800 }}>{h.t}</div>
              <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.75, marginTop: 8 }}>{h.d}</p>
            </div>
          ))}
        </div>

        {/* 성과 검증 — 지금은 수치 없음을 먼저 밝힌다 */}
        <div style={{ ...cardStyle, borderRadius: 14, padding: 18, marginTop: 26, borderLeft: `3px solid ${T.teal}` }}>
          <div style={{ fontSize: 14.5, fontWeight: 800 }}>{en ? 'Track record: recording, not claiming' : '성과 검증: 지금은 기록 중입니다'}</div>
          <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.75, marginTop: 8 }}>
            {en
              ? `Scores are snapshotted daily (day ${recDays} so far). Until at least 20 trading days accumulate, no win rate or return is shown — a number from a few days is noise, and presenting it as a track record would be dishonest. When the sample is there, the measured return for each grade goes up publicly.`
              : `매일 전 종목 점수를 스냅샷으로 저장하고 있습니다(현재 ${recDays}일차). 최소 20거래일이 쌓이기 전까지 승률·수익률을 표시하지 않습니다 — 며칠치 숫자는 통계가 아니라 소음이고, 그걸 성과처럼 보여주는 건 정직하지 않으니까요. 표본이 모이면 등급별 실측 수익률을 그대로 공개합니다.`}
          </p>
        </div>

        <p style={{ fontSize: 12, color: T.muted, marginTop: 34, lineHeight: 1.7, borderTop: `1px solid ${T.cardBr}`, paddingTop: 16 }}>
          {en
            ? '⚠️ For information, analysis and education only. Not a solicitation to buy or sell any security; all investment decisions and their consequences are your own. The operator is not a licensed financial institution or investment adviser and provides no paid advisory, signal-calling or discretionary management services. Past results do not guarantee future returns.'
            : '⚠️ 정보 제공·분석·교육 목적입니다. 특정 종목의 매수·매도 권유가 아니며, 투자 판단과 책임은 본인에게 있습니다. 운영자는 제도권 금융기관·투자자문업자가 아니며, 대가를 받는 투자자문·리딩·투자일임을 제공하지 않습니다. 과거 성과가 미래 수익을 보장하지 않습니다.'}
          <br />
          <Link href="/privacy" style={{ color: T.muted, textDecoration: 'underline' }}>{en ? 'Privacy Policy' : '개인정보 처리방침'}</Link>
        </p>
      </main>
    </div>
  )
}
