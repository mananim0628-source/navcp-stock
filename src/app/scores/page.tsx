import Link from 'next/link'
import { supabase, type StockScore } from '@/lib/supabase'
import { T, bgGradient } from '@/lib/theme'
import ScoresList from '@/components/ScoresList'
import { getLang, tr } from '@/lib/i18n'
import LangToggle from '@/components/LangToggle'

export const dynamic = 'force-dynamic'

// 종목 점수판 — 등급 필터 바 + 리스트. "내 분석 화면 공개" 프레임. 매수 권유 아님.
// country 파라미터로 국내(KR)/미국(US) 전환. 미국은 측정 소스가 적어 커버리지가 낮게 표시된다(정직).
export default async function ScoresPage({ searchParams }: { searchParams?: { country?: string } }) {
  const lang = getLang(); const t = tr(lang); const isEn = lang === 'en'
  const country = searchParams?.country === 'US' ? 'US' : 'KR'
  const { data } = await supabase
    .from('stock_score_cache')
    .select('symbol,name,market,scores,coverage,cached_at')
    .eq('country', country)
    .order('scores->total', { ascending: false })
    .limit(300)
  const rows = (data || []) as StockScore[]
  const covList = rows.map(r => Number(r.coverage)).filter(Number.isFinite)
  const avgCov = covList.length ? Math.round((covList.reduce((a, b) => a + b, 0) / covList.length) * 100) : null

  return (
    <div style={{ minHeight: '100vh', background: bgGradient, color: T.text }}>
      <header style={{ borderBottom: `1px solid ${T.cardBr}`, position: 'sticky', top: 0, backdropFilter: 'blur(12px)', background: 'rgba(8,12,24,0.85)', zIndex: 20 }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" style={{ fontWeight: 800, fontSize: 18, textDecoration: 'none' }}>🧭 {isEn ? 'Investment Compass' : '투자나침반'} <span style={{ color: T.teal }}>{t('brandSuffix')}</span></Link>
          <nav style={{ display: 'flex', gap: 14, fontSize: 14, alignItems: 'center' }}>
            <Link href="/dashboard" style={{ color: T.muted }}>{lang === 'en' ? 'Dashboard' : '대시보드'}</Link>
            <Link href="/scores?country=KR" style={{ color: country === 'KR' ? T.teal : T.muted, fontWeight: country === 'KR' ? 700 : 400 }}>{t('navKR')}</Link>
            <Link href="/scores?country=US" style={{ color: country === 'US' ? T.teal : T.muted, fontWeight: country === 'US' ? 700 : 400 }}>{t('navUS')}</Link>
            <Link href="/method" style={{ color: T.muted }}>{t('navMethod')}</Link>
            <Link href="/journal" style={{ color: T.muted }}>{isEn ? 'Journal' : '매매일지'}</Link>
            <Link href="/plan" style={{ color: T.muted }}>{isEn ? 'Plan' : '계획서'}</Link>
            <Link href="/my" style={{ color: T.muted }}>{isEn ? 'My' : '내 정보'}</Link>
            <LangToggle lang={lang} />
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 20px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>{country === 'US' ? t('scoresTitleUS') : t('scoresTitleKR')}</h1>
        {country === 'US' && (
          <p style={{ fontSize: 12.5, color: T.amber, marginTop: 8, lineHeight: 1.6, border: `1px solid ${T.cardBr}`, borderRadius: 10, padding: 10 }}>
            ⓘ 미국판 평균 <b>커버리지 {avgCov ?? '—'}%</b>입니다. 수급 팩터(13점)는 미국에 <b>외국인·기관 순매수 구분 개념 자체가 없어</b> 비워두고,
            <b>측정된 팩터만으로 정규화</b>합니다. 공매도는 FINRA 기준이 국내와 달라(시장조성자 헤지 포함) <b>미국 유니버스 내 상대 순위</b>로 평가해요.
            국내 점수와 직접 비교하지 마세요.
          </p>
        )}
        <p style={{ fontSize: 13, color: T.muted, marginTop: 6, lineHeight: 1.6 }}>
          {t('scoresLead')}
        </p>

        <ScoresList rows={rows} lang={lang} isUS={country === 'US'} />

        <p style={{ fontSize: 12, color: T.muted, marginTop: 28, lineHeight: 1.7, borderTop: `1px solid ${T.cardBr}`, paddingTop: 14 }}>
          ⚠️ 정보 제공·분석·교육 목적. 특정 종목 매수·매도 권유가 아니며 투자 판단과 책임은 본인 몫입니다.
          운영자는 제도권 금융기관·투자자문업자가 아니며, 대가를 받는 자문·리딩·일임을 제공하지 않습니다.
          {rows.length > 0 && rows[0].cached_at && <><br />업데이트: {new Date(rows[0].cached_at).toLocaleString('ko-KR')}</>}
        </p>
      </main>
    </div>
  )
}
