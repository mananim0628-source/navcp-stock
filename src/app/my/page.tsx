import Link from 'next/link'
import { T, bgGradient, cardStyle } from '@/lib/theme'
import { getLang } from '@/lib/i18n'
import LangToggle from '@/components/LangToggle'
import AuthPanel from '@/components/AuthPanel'
import MyWatchlist from '@/components/MyWatchlist'
import AlertPrefs from '@/components/AlertPrefs'
import TradeLog from '@/components/TradeLog'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const metadata = { title: '내 정보 — 투자나침반 주식' }

// 회원 영역 — 로그인(매직링크) · 관심종목 · 알림 설정 · 소통방/자료방.
// 회원가입은 **선택**이며, 비회원도 모든 점수·분석을 무료로 볼 수 있다(최소수집 원칙).
export default async function MyPage() {
  const lang = getLang()
  const en = lang === 'en'
  const { data: rooms } = await supabase.from('stock_room').select('*').order('sort')

  return (
    <div style={{ minHeight: '100vh', background: bgGradient, color: T.text }}>
      <header style={{ borderBottom: `1px solid ${T.cardBr}`, position: 'sticky', top: 0, backdropFilter: 'blur(12px)', background: 'rgba(8,12,24,0.85)', zIndex: 20 }}>
        <div className="topbar" style={{ maxWidth: 780, margin: '0 auto', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" style={{ fontWeight: 800, fontSize: 18, color: T.text, whiteSpace: 'nowrap' }}>🧭 {en ? 'Investment Compass' : '투자나침반'} <span style={{ color: T.teal }}>{en ? 'Stocks' : '주식'}</span></Link>
          <nav className="topnav" style={{ display: 'flex', gap: 14, fontSize: 14, alignItems: 'center' }}>
            <Link href="/dashboard" style={{ color: T.muted }}>{lang === 'en' ? 'Dashboard' : '대시보드'}</Link>
            <Link href="/scores?country=KR" style={{ color: T.muted }}>{en ? 'Korea' : '국내'}</Link>
            <Link href="/scores?country=US" style={{ color: T.muted }}>{en ? 'US' : '미국'}</Link>
            <Link href="/journal" style={{ color: T.muted }}>{en ? 'Validation' : '모의매매 검증'}</Link>
            <Link href="/plan" style={{ color: T.muted }}>{en ? 'My Trades' : '내 매매'}</Link>
            <LangToggle lang={lang} />
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 780, margin: '0 auto', padding: '28px 20px 60px', display: 'grid', gap: 16 }}>
        <h1 style={{ fontSize: 23, fontWeight: 900 }}>{en ? 'My Account' : '내 정보'}</h1>

        <AuthPanel lang={lang} />
        <MyWatchlist lang={lang} />
        <TradeLog lang={lang} />
        <AlertPrefs lang={lang} />

        {/* 소통방 / 자료방 — 자리만 잡아두고 채널은 추후 연결 */}
        <div style={{ ...cardStyle, borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{en ? 'Community & Archive' : '소통방 · 자료방'}</div>
          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
            {(rooms || []).map((r: any) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 10, border: `1px solid ${T.cardBr}` }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{r.name}</span>
                <span style={{ fontSize: 11.5, color: T.muted, flex: 1 }}>{r.description}</span>
                {r.url
                  ? <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 700, color: T.teal }}>{en ? 'Join →' : '입장 →'}</a>
                  : <span style={{ fontSize: 11.5, color: T.muted, border: `1px solid ${T.cardBr}`, borderRadius: 7, padding: '3px 8px' }}>{en ? 'Coming soon' : '준비 중'}</span>}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: T.muted, marginTop: 10, lineHeight: 1.6 }}>
            {en
              ? '※ Community channels are for discussion and study materials. No paid advisory, signal-calling or discretionary management is provided.'
              : '※ 소통·자료 공유용 채널입니다. 대가를 받는 투자자문·리딩·일임은 제공하지 않습니다.'}
          </p>
        </div>

        <p style={{ fontSize: 12, color: T.muted, lineHeight: 1.7, borderTop: `1px solid ${T.cardBr}`, paddingTop: 14 }}>
          {en
            ? '⚠️ Sign-up is optional and free. All scores and analysis are available without an account. See the '
            : '⚠️ 회원가입은 선택이며 무료입니다. 계정 없이도 모든 점수·분석을 보실 수 있습니다. '}
          <Link href="/privacy" style={{ color: T.teal }}>{en ? 'Privacy Policy' : '개인정보 처리방침'}</Link>
        </p>
      </main>
    </div>
  )
}
