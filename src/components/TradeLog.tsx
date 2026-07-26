'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { T, cardStyle } from '@/lib/theme'

// 개인 매매기록 → 이동평균 취득가액·실현손익 **예상** 계산.
// ⚠️ 전부 '예상(추정)'으로만 표기한다. 우리 계산은 참고용이고 실제 세액·산정방식은 국세청/세무사 확인.
//    분할매수 취득가액이 세금 신고 때 골칫거리라는 실수요 → 장부 보조 도구(신호·자문 아님).
type Row = {
  id: number; symbol: string; country: string; name: string | null
  side: 'buy' | 'sell'; price: number; qty: number; fee: number; traded_at: string; memo: string | null
}

export default function TradeLog({ lang = 'ko' }: { lang?: 'ko' | 'en' }) {
  const en = lang === 'en'
  const t = (ko: string, e: string) => (en ? e : ko)
  const [uid, setUid] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [form, setForm] = useState({ symbol: '', name: '', country: 'KR', side: 'buy' as 'buy' | 'sell', price: '', qty: '', fee: '', traded_at: '', memo: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: u } = await supabase.auth.getUser()
      const id = u.user?.id ?? null; setUid(id)
      if (!id) return
      const { data } = await supabase.from('stock_trade_log').select('*').order('traded_at', { ascending: true }).order('id', { ascending: true })
      setRows((data as Row[]) || [])
    }
    load()
    const { data: sub } = supabase.auth.onAuthStateChange(() => load())
    return () => sub.subscription.unsubscribe()
  }, [])

  async function add() {
    if (!uid || busy) return
    const price = Number(form.price), qty = Number(form.qty)
    if (!form.symbol.trim() || !(price > 0) || !(qty > 0) || !form.traded_at) return
    setBusy(true)
    const { data, error } = await supabase.from('stock_trade_log').insert({
      user_id: uid, symbol: form.symbol.trim().toUpperCase(), name: form.name.trim() || null, country: form.country,
      side: form.side, price, qty, fee: Number(form.fee) || 0, traded_at: form.traded_at, memo: form.memo.trim() || null,
    }).select('*').single()
    setBusy(false)
    if (!error && data) {
      setRows(r => [...r, data as Row].sort((a, b) => a.traded_at.localeCompare(b.traded_at) || a.id - b.id))
      setForm(f => ({ ...f, price: '', qty: '', fee: '', memo: '' }))
    }
  }
  async function del(id: number) {
    await supabase.from('stock_trade_log').delete().eq('id', id)
    setRows(r => r.filter(x => x.id !== id))
  }

  // 종목별 이동평균 취득가액·보유수량·누적 실현손익 (예상)
  const summary = useMemo(() => {
    const bySym = new Map<string, { name: string | null; country: string; qty: number; avg: number; realized: number; invested: number }>()
    for (const r of rows) {
      const g = bySym.get(r.symbol) || { name: r.name, country: r.country, qty: 0, avg: 0, realized: 0, invested: 0 }
      if (r.side === 'buy') {
        const cost = r.price * r.qty + (r.fee || 0)
        g.avg = (g.avg * g.qty + cost) / (g.qty + r.qty)   // 이동평균
        g.qty += r.qty; g.invested += cost
      } else {
        const proceeds = r.price * r.qty - (r.fee || 0)
        g.realized += proceeds - g.avg * r.qty             // 실현손익 = 매도금 - 취득가액분
        g.qty = Math.max(0, g.qty - r.qty)
        if (g.qty === 0) g.avg = 0
      }
      g.name = g.name || r.name
      bySym.set(r.symbol, g)
    }
    return [...bySym.entries()].map(([symbol, g]) => ({ symbol, ...g }))
      .sort((a, b) => (b.qty > 0 ? 1 : 0) - (a.qty > 0 ? 1 : 0))
  }, [rows])

  const totalRealized = summary.reduce((a, s) => a + s.realized, 0)

  const money = (v: number, us: boolean) => us ? '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : Math.round(v).toLocaleString('ko-KR') + '원'
  const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, fontSize: 13, background: 'rgba(255,255,255,0.04)', border: `1px solid ${T.cardBr}`, color: T.text, outline: 'none' }

  if (uid === null) {
    return <div style={{ ...cardStyle, borderRadius: 14, padding: 18 }}>
      <div style={{ fontSize: 15, fontWeight: 800 }}>{t('🧾 내 매매 기록 (예상 취득가액)', '🧾 My Trade Log (est. cost basis)')}</div>
      <p style={{ fontSize: 12.5, color: T.muted, marginTop: 8 }}>{t('로그인하면 매수·매도를 기록하고 예상 취득가액을 계산할 수 있어요.', 'Sign in to log trades and estimate cost basis.')}</p>
    </div>
  }

  return (
    <div style={{ ...cardStyle, borderRadius: 16, padding: 18 }}>
      <div style={{ fontSize: 15, fontWeight: 800 }}>{t('🧾 내 매매 기록 · 예상 취득가액', '🧾 My Trade Log · Est. Cost Basis')}</div>
      <p style={{ fontSize: 11.5, color: T.amber, marginTop: 6, lineHeight: 1.6 }}>
        {t('⚠ 아래 취득가액·실현손익은 이동평균 기준 예상(추정)치입니다. 우리 계산이 100% 정확한 세무 계산은 아니며, 실제 세액·산정방식은 국세청/세무사에서 확인하세요.',
           '⚠ Cost basis and realized P&L below are estimates (moving-average). Not an exact tax calculation — confirm actual amounts with a tax professional.')}
      </p>

      {/* 입력 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, marginTop: 14 }}>
        <input value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value }))} placeholder={t('종목코드', 'Symbol')} style={inp} />
        <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('종목명(선택)', 'Name (opt)')} style={inp} />
        <select value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} style={inp as any}>
          <option value="KR">🇰🇷 KR</option><option value="US">🇺🇸 US</option>
        </select>
        <select value={form.side} onChange={e => setForm(f => ({ ...f, side: e.target.value as any }))} style={inp as any}>
          <option value="buy">{t('매수', 'Buy')}</option><option value="sell">{t('매도', 'Sell')}</option>
        </select>
        <input value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value.replace(/[^\d.]/g, '') }))} inputMode="decimal" placeholder={t('단가', 'Price')} style={inp} />
        <input value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value.replace(/[^\d.]/g, '') }))} inputMode="decimal" placeholder={t('수량', 'Qty')} style={inp} />
        <input value={form.fee} onChange={e => setForm(f => ({ ...f, fee: e.target.value.replace(/[^\d.]/g, '') }))} inputMode="decimal" placeholder={t('수수료(선택)', 'Fee (opt)')} style={inp} />
        <input value={form.traded_at} onChange={e => setForm(f => ({ ...f, traded_at: e.target.value }))} type="date" style={inp} />
      </div>
      <button onClick={add} disabled={busy} style={{ marginTop: 10, padding: '9px 18px', borderRadius: 9, fontWeight: 800, fontSize: 13, cursor: 'pointer', border: 'none', background: T.teal, color: T.onTeal }}>
        {t('기록 추가', 'Add')}
      </button>

      {/* 종목별 예상 요약 */}
      {summary.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>{t('종목별 예상 요약', 'Per-symbol estimate')}</div>
            <div style={{ fontSize: 12, color: T.muted }}>{t('누적 예상 실현손익', 'Est. realized P&L')} <b style={{ color: totalRealized >= 0 ? T.green : T.red, fontSize: 15 }}>{totalRealized >= 0 ? '+' : ''}{money(totalRealized, false)}</b></div>
          </div>
          <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
            {summary.map(s => {
              const us = s.country === 'US'
              return (
                <div key={s.symbol} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 12px', borderRadius: 10, border: `1px solid ${T.cardBr}`, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, fontWeight: 900, padding: '2px 6px', borderRadius: 5, background: us ? T.us : T.kr, color: '#0b1020' }}>{us ? 'US' : 'KR'}</span>
                  <span style={{ fontWeight: 700, fontSize: 13.5, minWidth: 80 }}>{s.name || s.symbol}</span>
                  <span style={{ fontSize: 12, color: T.muted }}>{t('예상 보유', 'Held')} <b style={{ color: T.text }}>{s.qty.toLocaleString()}</b></span>
                  {s.qty > 0 && <span style={{ fontSize: 12, color: T.muted }}>{t('예상 취득가액', 'Avg cost')} <b style={{ color: T.text }}>{money(s.avg, us)}</b></span>}
                  <span style={{ fontSize: 12, color: T.muted, marginLeft: 'auto' }}>{t('예상 실현손익', 'Realized')} <b style={{ color: s.realized >= 0 ? T.green : T.red }}>{s.realized >= 0 ? '+' : ''}{money(s.realized, us)}</b></span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 원장 */}
      {rows.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: T.muted, marginBottom: 6 }}>{t('전체 기록', 'All entries')}</div>
          <div style={{ display: 'grid', gap: 4 }}>
            {[...rows].reverse().map(r => (
              <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, color: T.muted, padding: '5px 0', borderTop: `1px solid ${T.cardBr}` }}>
                <span style={{ minWidth: 66 }}>{r.traded_at}</span>
                <span style={{ fontWeight: 700, color: r.side === 'buy' ? T.green : T.red }}>{r.side === 'buy' ? t('매수', 'BUY') : t('매도', 'SELL')}</span>
                <span style={{ color: T.text }}>{r.name || r.symbol}</span>
                <span>{r.qty} × {r.price}</span>
                {r.fee > 0 && <span>({t('수수료', 'fee')} {r.fee})</span>}
                <button onClick={() => del(r.id)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: T.muted, cursor: 'pointer', fontSize: 12 }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <p style={{ fontSize: 10.5, color: T.muted, marginTop: 14, lineHeight: 1.6 }}>
        {t('※ 이동평균법 기준 예상치. 실제 과세는 취득가액 산정방식(이동평균·선입선출 등)·공제·거래세에 따라 달라집니다. 세무 신고 전 국세청/세무사 확인 필수. 매수·매도 권유 아님.',
           '※ Moving-average estimate. Actual tax depends on cost-basis method, deductions and transaction taxes. Confirm with a tax professional before filing. Not a buy/sell signal.')}
      </p>
    </div>
  )
}
