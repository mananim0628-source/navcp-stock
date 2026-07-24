import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabase, type StockScore } from '@/lib/supabase'
import { T, bgGradient, cardStyle, gradeColor, gradeLabel } from '@/lib/theme'
import CandleChart from '@/components/CandleChart'
import CommunityChat from '@/components/CommunityChat'

export const dynamic = 'force-dynamic'

// 종목 상세 (토스 스타일: 한 화면 · 큰 숫자 · 체계적). 7팩터 + 지지/저항 + 트레이딩뷰.
// §1 교육·분석 도구. 종목 추천 아님.

const FACTORS: { key: string; label: string; cap: number; hint: string }[] = [
  { key: 'macro', label: '거시', cap: 12, hint: '금리·달러 등 시장 환경' },
  { key: 'supply', label: '수급', cap: 13, hint: '외국인·기관 순매수' },
  { key: 'financial', label: '재무·밸류', cap: 20, hint: 'PER·PBR 등 가치' },
  { key: 'ai', label: 'AI·재료', cap: 15, hint: '뉴스·공시' },
  { key: 'derivative', label: '파생·공매도', cap: 15, hint: '공매도·선물' },
  { key: 'technical', label: '기술', cap: 20, hint: 'RSI·이평·추세' },
  { key: 'strategy', label: '전략', cap: 5, hint: '축 정렬' },
]

const won = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('ko-KR') + '원')

export default async function StockDetail({ params }: { params: { symbol: string } }) {
  const [{ data }, { data: peers }, { data: sent }] = await Promise.all([
    supabase.from('stock_score_cache').select('*').eq('symbol', params.symbol).limit(1).single(),
    supabase.from('stock_score_cache').select('scores'),                       // 퍼센타일 계산용 유니버스
    supabase.from('stock_chat_sentiment').select('*').eq('symbol', params.symbol).maybeSingle(),
  ])
  if (!data) return notFound()
  const r = data as StockScore
  const sc = r.scores as Record<string, number | string | null>
  const num = (v: unknown) => (v == null ? null : Number(v))
  const total = Math.round(num(sc.total) || 0)
  const col = gradeColor(total)
  const cov = r.coverage != null ? Math.round(Number(r.coverage) * 100) : null
  const price = num(sc.price), chg = num(sc.chg)
  const support = num(sc.support), resistance = num(sc.resistance)
  const rsi = num(sc.rsi), ma20 = num(sc.ma20), ma60 = num(sc.ma60)

  // 퍼센타일 — 유니버스 대비 상위 몇 %인지 (Stockopedia 방식)
  const allTotals = ((peers || []) as { scores: Record<string, number> }[])
    .map(p => Number(p?.scores?.total)).filter(Number.isFinite)
  const below = allTotals.filter(t => t < total).length
  const pctile = allTotals.length > 1 ? Math.round((below / allTotals.length) * 100) : null
  const topPct = pctile != null ? Math.max(1, 100 - pctile) : null

  // 커뮤니티 센티먼트(최근 7일 강세/약세 태그)
  const s = sent as { bull: number; bear: number; msgs: number } | null
  const votes = s ? Number(s.bull) + Number(s.bear) : 0
  const bullPct = votes > 0 ? Math.round((Number(s!.bull) / votes) * 100) : null

  const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div style={{ ...cardStyle, borderRadius: 14, padding: 14, flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 12, color: T.muted }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: bgGradient, color: T.text }}>
      <header style={{ borderBottom: `1px solid ${T.cardBr}`, position: 'sticky', top: 0, backdropFilter: 'blur(12px)', background: 'rgba(8,12,24,0.85)', zIndex: 20 }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/scores" style={{ color: T.muted, textDecoration: 'none', fontSize: 20 }}>←</Link>
          <span style={{ fontWeight: 800, fontSize: 17 }}>{r.name} <span style={{ color: T.muted, fontSize: 13, fontWeight: 400 }}>{r.symbol} · {r.market}</span></span>
        </div>
      </header>

      <main style={{ maxWidth: 820, margin: '0 auto', padding: '24px 20px 60px' }}>
        {/* 히어로 — 큰 점수 링 + 현재가 (토스식 큰 숫자) */}
        <div style={{ ...cardStyle, borderRadius: 20, padding: 24, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ width: 108, height: 108, borderRadius: '50%', border: `7px solid ${col}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 0 24px ${col}44` }}>
            <div style={{ fontSize: 34, fontWeight: 800, color: col, lineHeight: 1 }}>{total}</div>
            <div style={{ fontSize: 11, color: T.muted }}>/ 100</div>
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: col }}>
              {gradeLabel(total)}
              {topPct != null && <span style={{ fontSize: 12, fontWeight: 700, color: T.teal, marginLeft: 8 }}>유니버스 상위 {topPct}%</span>}
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, marginTop: 6 }}>{won(price)}</div>
            {chg != null && <div style={{ fontSize: 15, fontWeight: 700, color: chg > 0 ? T.green : chg < 0 ? T.red : T.muted }}>{chg > 0 ? '▲' : chg < 0 ? '▼' : ''} {Math.abs(chg)}%</div>}
            {cov != null && <div style={{ fontSize: 12, color: cov < 85 ? T.red : T.muted, marginTop: 6 }}>측정 커버리지 {cov}%{cov < 85 ? ' — 일부 팩터는 아직 측정 전' : ''}</div>}
          </div>
        </div>

        {/* 지지/저항·핵심 지표 */}
        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <Stat label="지지 (최근 저점)" value={won(support)} sub="30일 스윙" />
          <Stat label="저항 (최근 고점)" value={won(resistance)} sub="30일 스윙" />
          <Stat label="RSI(14)" value={rsi != null ? String(rsi) : '—'} sub={rsi != null ? (rsi >= 70 ? '과열권' : rsi >= 55 ? '강세' : rsi >= 45 ? '중립' : '약세') : ''} />
          <Stat label="이평 20 / 60" value={ma20 != null ? `${ma20?.toLocaleString()} / ${ma60?.toLocaleString?.() ?? '—'}` : '—'} />
        </div>

        {/* 7팩터 */}
        <div style={{ ...cardStyle, borderRadius: 16, padding: 20, marginTop: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>7팩터 점수</div>
          <div style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>점수가 높다고 매수 신호가 아니에요. 각 관점을 참고용으로 보세요.</div>
          {FACTORS.map(f => {
            const v = num(sc[f.key])
            const measured = v != null
            const pct = measured ? Math.round((v! / f.cap) * 100) : 0
            return (
              <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 88, flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{f.label}</div>
                  <div style={{ fontSize: 10, color: T.muted }}>{f.hint}</div>
                </div>
                <div style={{ flex: 1, height: 12, borderRadius: 6, background: 'rgba(120,150,220,0.12)', overflow: 'hidden' }}>
                  {measured && <div style={{ width: `${pct}%`, height: '100%', background: col, borderRadius: 6 }} />}
                </div>
                <div style={{ width: 68, textAlign: 'right', fontSize: 13, fontWeight: 700, color: measured ? T.text : T.muted }}>
                  {measured ? <>{v}<span style={{ color: T.muted, fontSize: 11 }}>/{f.cap}</span></> : <span style={{ fontSize: 11, color: T.muted }}>측정 전</span>}
                </div>
              </div>
            )
          })}
          {sc.supply_dir && <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>수급: 20일 중 {sc.supply_days}일 순매수 · 방향 {String(sc.supply_dir)}</div>}
        </div>

        {/* 캔들차트 (KIS 일봉 · 이평·지지/저항) */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 8 }}>📈 차트 <span style={{ fontSize: 12, color: T.muted, fontWeight: 400 }}>· 일봉 + 20/60일선 + 지지/저항</span></div>
          <CandleChart candles={(sc.candles as unknown as [string, number, number, number, number][]) || []} support={support} resistance={resistance} />
        </div>

        {/* 커뮤니티 센티먼트 — 데이터(점수) vs 군중(태그) 비교 */}
        <div style={{ ...cardStyle, borderRadius: 16, padding: 18, marginTop: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>🗳️ 커뮤니티 여론 <span style={{ fontSize: 12, color: T.muted, fontWeight: 400 }}>· 최근 7일 태그</span></div>
          {bullPct != null ? (
            <>
              <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', marginTop: 12 }}>
                <div style={{ width: `${bullPct}%`, background: T.green }} />
                <div style={{ width: `${100 - bullPct}%`, background: T.red }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6 }}>
                <span style={{ color: T.green, fontWeight: 700 }}>🐂 강세 {bullPct}% ({s!.bull})</span>
                <span style={{ color: T.red, fontWeight: 700 }}>🐻 약세 {100 - bullPct}% ({s!.bear})</span>
              </div>
              <div style={{ fontSize: 11.5, color: T.muted, marginTop: 8, lineHeight: 1.6 }}>
                여론은 <b style={{ color: T.text }}>참고 지표</b>일 뿐, 7팩터 점수와 다를 수 있어요. 오히려 <b style={{ color: T.text }}>점수와 여론이 엇갈릴 때</b> 왜 그런지 살펴보는 게 학습에 도움이 됩니다.
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: T.muted, marginTop: 10 }}>아직 태그된 의견이 없어요. 아래 채팅에서 🐂/🐻 태그를 달아보세요.</div>
          )}
        </div>

        {/* 종목 전용 채팅방 */}
        <div style={{ marginTop: 14, height: 460 }}>
          <CommunityChat symbol={r.symbol} title={`${r.name} 토론방`} />
        </div>

        <p style={{ fontSize: 12, color: T.muted, marginTop: 22, lineHeight: 1.7, borderTop: `1px solid ${T.cardBr}`, paddingTop: 14 }}>
          ⚠️ 정보 제공·분석·교육 목적. 특정 종목 매수·매도 권유가 아니며 투자 판단과 책임은 본인 몫입니다.
          운영자는 제도권 금융기관·투자자문업자가 아니며, 대가를 받는 자문·리딩·일임을 제공하지 않습니다.
          {r.cached_at && <><br />업데이트: {new Date(r.cached_at).toLocaleString('ko-KR')}</>}
        </p>
      </main>
    </div>
  )
}
