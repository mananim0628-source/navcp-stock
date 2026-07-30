import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { T, bgGradient } from '@/lib/theme'
import { getLang } from '@/lib/i18n'
import LangToggle from '@/components/LangToggle'
import PlanBuilder, { type StockLite } from '@/components/PlanBuilder'

export const dynamic = 'force-dynamic'
export const metadata = { title: '매매 계획서 — 투자나침반 주식' }

// 매매 계획서 — 진입 전 계획을 우리 점수·ATR로 프리필해 계산+공유 카드.
// ⚠️ §6: 계산 도구(사용자 계획)이며 매수·매도 신호가 아니다.
export default async function PlanPage() {
  const lang = getLang()
  const en = lang === 'en'
  const { data } = await supabase.from('stock_score_cache').select('symbol,name,country,scores').limit(300)
  const stocks: StockLite[] = (data || []).map((r: any) => {
    const sc = r.scores || {}
    return {
      symbol: r.symbol, name: r.name, country: r.country,
      price: sc.price != null ? Number(sc.price) : null,
      atr14: sc.atr14 != null ? Number(sc.atr14) : null,
      total: sc.total != null ? Number(sc.total) : null,
      grade: sc.grade ?? null,
      reason: sc.supply_dir ? `${sc.grade || ''} · 수급 ${sc.supply_dir}${sc.rsi != null ? ` · RSI ${sc.rsi}` : ''}` : null,
    }
  }).filter(s => s.total != null).sort((a, b) => Number(b.total) - Number(a.total))

  return (
    <div style={{ minHeight: '100vh', background: bgGradient, color: T.text }}>
      <header style={{ borderBottom: `1px solid ${T.cardBr}`, position: 'sticky', top: 0, backdropFilter: 'blur(12px)', background: 'rgba(8,12,24,0.85)', zIndex: 20 }}>
        <div className="topbar" style={{ maxWidth: 1000, margin: '0 auto', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/" style={{ fontWeight: 800, fontSize: 18, color: T.text, whiteSpace: 'nowrap' }}>🧭 {en ? 'Investment Compass' : '투자나침반'} <span style={{ color: T.teal }}>{en ? 'Stocks' : '주식'}</span></Link>
          <nav className="topnav" style={{ display: 'flex', gap: 14, fontSize: 14, alignItems: 'center' }}>
            <Link href="/dashboard" style={{ color: T.muted }}>{en ? 'Dashboard' : '대시보드'}</Link>
            <Link href="/journal" style={{ color: T.muted }}>{en ? 'Validation' : '모의매매 검증'}</Link>
            <Link href="/plan" style={{ color: T.teal, fontWeight: 700 }}>{en ? 'My Trades' : '내 매매'}</Link>
            <LangToggle lang={lang} />
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 20px 60px' }}>
        <div style={{ fontSize: 12, color: T.teal, fontWeight: 800, letterSpacing: 0.5 }}>{en ? 'MY TRADES' : '내 매매'}</div>
        <h1 style={{ fontSize: 23, fontWeight: 900, marginTop: 4 }}>{en ? 'Trade Plan' : '매매 계획서'}</h1>
        <p style={{ fontSize: 13, color: T.muted, marginTop: 8, lineHeight: 1.7 }}>
          {en
            ? 'Plan before you enter — pick a stock and your score/ATR-based stop are prefilled. It computes your average price, risk/reward and breakeven win rate. This is a calculator for your own plan, not a buy/sell signal.'
            : '진입 전에 계획을 세우세요. 종목을 고르면 점수·ATR 기반 손절이 자동으로 채워지고, 평단·손익비·본전 승률을 계산합니다. 빈 계산기가 아니라 분석된 종목 위에서 짜는 계획서예요. 매수·매도 신호가 아닙니다.'}
        </p>
        <div style={{ marginTop: 18 }}>
          <PlanBuilder stocks={stocks} lang={lang} />
        </div>
        <div style={{ marginTop: 16, fontSize: 12.5, color: T.muted }}>
          {en ? '→ After you trade, log actual fills in ' : '→ 실제로 매매한 뒤엔 '}
          <Link href="/my" style={{ color: T.teal }}>{en ? 'My Account' : '내 정보 · 매매기록'}</Link>
          {en ? ' to track cost basis.' : ' 에서 취득가액을 기록하세요.'}
        </div>
      </main>
    </div>
  )
}
