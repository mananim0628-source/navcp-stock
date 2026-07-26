'use client'

import { useMemo, useState } from 'react'
import { T, cardStyle, gradeColor, gradeLabel } from '@/lib/theme'

// 매매 계획서 — 진입 전 계획을 계산해 공유 카드로 뽑는다.
// ⚠️ §6: 이건 '신호'가 아니라 **사용자가 세운 계획을 계산해주는 도구**다. "이 가격에 사라"가 아니라
//    "당신의 계획대로면 손익비가 이렇다"를 보여줄 뿐. 종목 점수는 참고값으로만 프리필한다.
// Archive Kay류(빈 계산기)와 달리, 우리는 분석된 종목의 점수·ATR 손절폭을 자동 채운다.
export type StockLite = {
  symbol: string; name: string | null; country: string
  price: number | null; atr14: number | null; total: number | null; grade: string | null
  reason?: string | null
}

type Buy = { price: string; qty: string }
type Tp = { price: string; weight: string }

export default function PlanBuilder({ stocks, lang = 'ko' }: { stocks: StockLite[]; lang?: 'ko' | 'en' }) {
  const en = lang === 'en'
  const t = (ko: string, e: string) => (en ? e : ko)

  const [symbol, setSymbol] = useState('')
  const [seed, setSeed] = useState('10000000')
  const [reason, setReason] = useState('')
  const [buys, setBuys] = useState<Buy[]>([{ price: '', qty: '' }, { price: '', qty: '' }, { price: '', qty: '' }])
  const [stop, setStop] = useState('')
  const [tps, setTps] = useState<Tp[]>([
    { price: '', weight: '25' }, { price: '', weight: '25' }, { price: '', weight: '25' }, { price: '', weight: '25' },
  ])

  const stock = stocks.find(s => s.symbol === symbol) || null
  const isUS = stock?.country === 'US'
  const cur = (v: number) => isUS
    ? '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : Math.round(v).toLocaleString('ko-KR') + '원'
  const won = (v: number) => (isUS ? '$' + Math.round(v).toLocaleString() : Math.round(v).toLocaleString('ko-KR') + '원')

  // 종목 선택 시 점수·현재가·ATR 기반으로 계획 프리필(사용자가 자유롭게 수정)
  function pick(sym: string) {
    setSymbol(sym)
    const s = stocks.find(x => x.symbol === sym)
    if (!s || !s.price) return
    const p = s.price, a = s.atr14 || p * 0.03
    setBuys([{ price: String(+p.toFixed(2)), qty: '' }, { price: String(+(p - 1.0 * a).toFixed(2)), qty: '' }, { price: '', qty: '' }])
    setStop(String(+(p - 1.2 * a).toFixed(2)))           // 우리 규칙과 동일 ATR 1.2×
    setTps([
      { price: String(+(p + 1.5 * a).toFixed(2)), weight: '25' },
      { price: String(+(p + 2.5 * a).toFixed(2)), weight: '25' },
      { price: String(+(p + 4.0 * a).toFixed(2)), weight: '25' },
      { price: String(+(p + 6.0 * a).toFixed(2)), weight: '25' },
    ])
    if (s.reason) setReason(s.reason)
  }

  const calc = useMemo(() => {
    const S = Number(seed) || 0
    const filledBuys = buys.map(b => ({ p: Number(b.price) || 0, q: Number(b.qty) || 0 })).filter(b => b.p > 0 && b.q > 0)
    const totalQty = filledBuys.reduce((a, b) => a + b.q, 0)
    if (!totalQty || S <= 0) return null
    const avg = filledBuys.reduce((a, b) => a + b.p * b.q, 0) / totalQty
    const position = avg * totalQty
    const weightPct = (position / S) * 100
    const stopP = Number(stop) || 0
    const lossPerShare = stopP > 0 ? avg - stopP : 0
    const totalLoss = lossPerShare * totalQty
    const lossSeedPct = (totalLoss / S) * 100
    const stopDistPct = stopP > 0 ? ((avg - stopP) / avg) * 100 : 0

    // 익절 계획: 각 익절가에서 (비중%)만큼 청산 → 누적 실현 손익·손익비
    const filledTps = tps.map(tp => ({ p: Number(tp.price) || 0, w: Number(tp.weight) || 0 })).filter(tp => tp.p > 0 && tp.w > 0)
    let cumProfit = 0
    const tpRows = filledTps.map(tp => {
      const qty = totalQty * (tp.w / 100)
      const profit = (tp.p - avg) * qty
      cumProfit += profit
      return { ...tp, profit, cumR: totalLoss > 0 ? cumProfit / totalLoss : null }
    })
    const plannedProfit = cumProfit                       // 계획대로 전부 익절 시
    const rr = totalLoss > 0 ? plannedProfit / totalLoss : null   // 손익비 = 벌 돈 ÷ 잃을 돈
    const breakeven = rr && rr > 0 ? 100 / (1 + rr) : null // 본전 승률 = 1/(1+R)

    return { S, totalQty, avg, position, weightPct, stopP, totalLoss, lossSeedPct, stopDistPct, tpRows, plannedProfit, rr, breakeven }
  }, [seed, buys, stop, tps])

  const setBuy = (i: number, k: keyof Buy, v: string) => setBuys(b => b.map((x, j) => j === i ? { ...x, [k]: v } : x))
  const setTp = (i: number, k: keyof Tp, v: string) => setTps(b => b.map((x, j) => j === i ? { ...x, [k]: v } : x))
  const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.cardBr}`, color: T.text, outline: 'none', width: '100%' }
  const num = (v: string, on: (s: string) => void, ph = '') => (
    <input value={v} onChange={e => on(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder={ph} style={inp} />
  )

  const withinPlan = calc && calc.lossSeedPct <= (Number(seed) ? 2 : 100)   // 총 시드 대비 손실 2% 이내 권장
  const total = stock?.total != null ? Math.round(Number(stock.total)) : null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 18 }}>
      {/* ── 입력 ── */}
      <div style={{ ...cardStyle, borderRadius: 16, padding: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>{t('① 종목 · 시드', '① Stock · Seed')}</div>
        <input list="plan-stocks" value={symbol} onChange={e => pick(e.target.value.toUpperCase())}
          placeholder={t('종목 코드/심볼 선택 (점수·ATR 자동 채움)', 'Pick a symbol (auto-fills score/ATR)')} style={{ ...inp, marginBottom: 8 }} />
        <datalist id="plan-stocks">
          {stocks.map(s => <option key={s.symbol} value={s.symbol}>{s.name} · {Math.round(Number(s.total || 0))}{t('점', 'pts')}</option>)}
        </datalist>
        {stock && total != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: T.muted, marginBottom: 8 }}>
            <span style={{ fontWeight: 800, color: gradeColor(total) }}>{stock.name} {total}{t('점', 'pts')} · {gradeLabel(total, lang)}</span>
            {stock.price != null && <span>{t('현재가', 'now')} {cur(stock.price)}</span>}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12.5, color: T.muted, minWidth: 56 }}>{t('총 시드', 'Seed')}</span>
          {num(seed, setSeed)}<span style={{ fontSize: 12, color: T.muted }}>{isUS ? '$' : '원'}</span>
        </div>

        <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 6 }}>{t('진입 근거 (선택)', 'Entry reason (optional)')}</div>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
          placeholder={t('왜 이 자리에서 사는가 — 안 채우면 매매하지 않는다는 마음으로', 'Why enter here — write it, or don\'t trade')}
          style={{ ...inp, resize: 'vertical', marginBottom: 14 }} />

        <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 8 }}>{t('② 분할 매수', '② Scaled entry')}</div>
        {buys.map((b, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: T.muted, minWidth: 42, alignSelf: 'center' }}>{i + 1}{t('차', '')}</span>
            {num(b.price, v => setBuy(i, 'price', v), t('매수가', 'price'))}
            {num(b.qty, v => setBuy(i, 'qty', v), t('수량', 'qty'))}
          </div>
        ))}

        <div style={{ fontSize: 13.5, fontWeight: 800, margin: '14px 0 8px' }}>{t('③ 손절가', '③ Stop')}</div>
        {num(stop, setStop, t('손절가', 'stop price'))}

        <div style={{ fontSize: 13.5, fontWeight: 800, margin: '14px 0 8px' }}>{t('④ 분할 익절 (가격 · 비중%)', '④ Scaled take-profit')}</div>
        {tps.map((tp, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: T.muted, minWidth: 42, alignSelf: 'center' }}>{i + 1}{t('차', '')}</span>
            {num(tp.price, v => setTp(i, 'price', v), t('익절가', 'price'))}
            {num(tp.weight, v => setTp(i, 'weight', v), t('비중%', 'weight%'))}
          </div>
        ))}
      </div>

      {/* ── 매매 계획서 카드 (스크린샷용) ── */}
      <div>
        <div style={{
          borderRadius: 16, overflow: 'hidden', border: `1px solid ${T.cardBr}`,
          background: 'linear-gradient(180deg, #0e1426, #0a0f1e)',
        }}>
          <div style={{ background: '#E6A82E', color: '#0b1020', textAlign: 'center', fontWeight: 900, fontSize: 16, padding: '10px 0' }}>
            🧭 {t('투자나침반 — 매매 계획서', 'Investment Compass — Trade Plan')}
          </div>

          {!calc ? (
            <div style={{ padding: 28, textAlign: 'center', color: T.muted, fontSize: 13 }}>
              {t('종목·시드·매수가·수량을 입력하면 계획서가 나옵니다.', 'Fill stock, seed, entry and qty to build the plan.')}
            </div>
          ) : (
            <div style={{ padding: 16, fontSize: 13, color: T.text }}>
              {/* 종목 헤더 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 900, padding: '2px 6px', borderRadius: 5, background: isUS ? T.us : T.kr, color: '#0b1020' }}>{isUS ? 'US' : 'KR'}</span>
                <span style={{ fontWeight: 800, fontSize: 15 }}>{stock?.name || symbol || '—'}</span>
                {total != null && <span style={{ marginLeft: 'auto', fontWeight: 800, color: gradeColor(total) }}>{total}{t('점', 'pts')} · {gradeLabel(total, lang)}</span>}
              </div>
              {reason && <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, marginBottom: 10, borderLeft: `2px solid ${T.teal}`, paddingLeft: 8 }}>{reason}</div>}
              {!reason && <div style={{ fontSize: 11.5, color: T.red, marginBottom: 10 }}>⚠ {t('근거 미작성 — 못 채우면 매매하지 않기', 'No reason written — don\'t trade until you do')}</div>}

              <Section label={t('진입 계획', 'Entry')}>
                <Row k={t('예상 평단가', 'Avg entry')} v={cur(calc.avg)} strong />
                <Row k={t('총 수량 / 포지션', 'Qty / Position')} v={`${calc.totalQty.toLocaleString()} / ${cur(calc.position)}`} />
                <Row k={t('투입 비중', 'Invested')} v={`${cur(calc.position)} = ${t('총 시드의', 'of seed')} ${calc.weightPct.toFixed(2)}%`} />
              </Section>

              <Section label={t('손절 계획', 'Stop')}>
                <Row k={t('손절가 (거리)', 'Stop (dist)')} v={`${cur(calc.stopP)} (${calc.stopDistPct.toFixed(2)}%)`} color={T.red} />
                <Row k={t('손절 시 손실', 'Loss if stopped')} v={`${won(calc.totalLoss)} = ${t('총 시드의', 'seed')} ${calc.lossSeedPct.toFixed(2)}%`} color={T.red} />
                <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 800, color: withinPlan ? T.green : T.red, padding: '6px 0', background: withinPlan ? 'rgba(40,199,111,0.1)' : 'rgba(240,101,74,0.1)', borderRadius: 6, marginTop: 4 }}>
                  {withinPlan ? '✅ ' + t('계획 리스크 이내(≤2%)', 'Within risk (≤2%)') : '⚠ ' + t('시드 대비 손실 과다', 'Loss too large')}
                </div>
              </Section>

              <Section label={t('익절 계획', 'Take-profit')}>
                {calc.tpRows.map((tp, i) => (
                  <Row key={i} k={`${i + 1}${t('차 익절', 'st TP')} ${tp.p} (${tp.w}%)`}
                    v={`+${won(tp.profit)} · ${t('도달 시 손익비', 'R')} ${tp.cumR != null ? tp.cumR.toFixed(2) : '—'}`} color={T.green} small />
                ))}
                <Row k={t('예상 수익 (계획대로)', 'Expected (as planned)')} v={`+${won(calc.plannedProfit)}`} strong color={T.green} />
              </Section>

              {/* 성적표 */}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <div style={{ flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}>
                  <div style={{ fontSize: 10.5, color: T.muted }}>{t('손익비 (벌 ÷ 잃을)', 'Risk/Reward')}</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: T.teal }}>{calc.rr != null ? calc.rr.toFixed(2) : '—'}</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}>
                  <div style={{ fontSize: 10.5, color: T.muted }}>{t('본전 승률', 'Breakeven win')}</div>
                  <div style={{ fontSize: 20, fontWeight: 900 }}>{calc.breakeven != null ? calc.breakeven.toFixed(0) + '%' : '—'}</div>
                </div>
              </div>
              {calc.rr != null && calc.breakeven != null && (
                <div style={{ textAlign: 'center', fontSize: 12, color: T.gold, fontWeight: 700, marginTop: 8 }}>
                  👍 {t(`좋은 구조 — 10번 중 ${Math.ceil(calc.breakeven / 10)}번만 맞아도 남는 매매`, `${Math.ceil(calc.breakeven / 10)} of 10 wins keeps you profitable`)}
                </div>
              )}

              <div style={{ fontSize: 9.5, color: T.muted, marginTop: 12, lineHeight: 1.6, borderTop: `1px solid ${T.cardBr}`, paddingTop: 8 }}>
                {t('※ 본인이 세운 계획의 계산 결과이며 매수·매도 권유가 아닙니다. 수수료·세금·슬리피지 미반영. 투자 판단·책임은 본인.',
                   '※ Calculation of your own plan, not a buy/sell signal. Fees/taxes/slippage not included. Your decision, your responsibility.')}
                <span style={{ float: 'right', color: T.teal }}>@navcp</span>
              </div>
            </div>
          )}
        </div>
        <p style={{ fontSize: 11, color: T.muted, marginTop: 8, textAlign: 'center' }}>
          {t('📸 카드를 캡처해 공유하세요 · 점수·ATR은 참고 프리필, 계획은 본인이 확정', '📸 Screenshot to share · score/ATR prefilled, you finalize the plan')}
        </p>
      </div>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ background: 'rgba(255,255,255,0.05)', fontSize: 11, fontWeight: 800, color: T.muted, padding: '4px 8px', borderRadius: 5, marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'grid', gap: 4, padding: '0 4px' }}>{children}</div>
    </div>
  )
}
function Row({ k, v, color, strong, small }: { k: string; v: string; color?: string; strong?: boolean; small?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: small ? 11.5 : 12.5 }}>
      <span style={{ color: '#8A93B5' }}>{k}</span>
      <span style={{ color: color || '#E8ECF6', fontWeight: strong ? 800 : 600, textAlign: 'right' }}>{v}</span>
    </div>
  )
}
