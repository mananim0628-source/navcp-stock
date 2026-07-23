'use client'

import { T } from '@/lib/theme'

// KIS 일봉으로 자체 캔들차트 (트레이딩뷰 대체 — 애플 폴백 버그 근절, 100% 우리 데이터).
// 캔들 + 이평(20/60) + 지지/저항선. SVG, 반응형.
type Candle = [string, number, number, number, number] // [날짜,시,고,저,종]

function sma(closes: number[], n: number): (number | null)[] {
  return closes.map((_, i) => i < n - 1 ? null : closes.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n)
}

export default function CandleChart({ candles, support, resistance }: { candles: Candle[]; support?: number | null; resistance?: number | null }) {
  if (!candles || candles.length < 3) {
    return <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted, border: `1px solid ${T.cardBr}`, borderRadius: 14 }}>차트 데이터를 불러오는 중이거나 없습니다.</div>
  }
  const W = 820, H = 360, padT = 16, padB = 28, padR = 56, padL = 8
  const closes = candles.map(c => c[4])
  const ma20 = sma(closes, 20), ma60 = sma(closes, 60)
  const vals = [...candles.map(c => c[2]), ...candles.map(c => c[3])]
  if (support) vals.push(support); if (resistance) vals.push(resistance)
  let max = Math.max(...vals), min = Math.min(...vals)
  const pad = (max - min) * 0.06; max += pad; min -= pad
  const plotW = W - padL - padR, plotH = H - padT - padB
  const x = (i: number) => padL + (i + 0.5) * (plotW / candles.length)
  const y = (v: number) => padT + plotH - ((v - min) / (max - min)) * plotH
  const cw = Math.max(1.5, (plotW / candles.length) * 0.62)
  const fmt = (v: number) => v >= 10000 ? Math.round(v).toLocaleString() : v.toFixed(0)
  const linePath = (arr: (number | null)[]) => arr.map((v, i) => v == null ? '' : `${i === 0 || arr[i - 1] == null ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')

  return (
    <div style={{ border: `1px solid ${T.cardBr}`, borderRadius: 14, padding: 8, background: 'rgba(14,20,38,0.4)' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        {/* 지지/저항선 */}
        {support != null && <><line x1={padL} x2={W - padR} y1={y(support)} y2={y(support)} stroke={T.green} strokeDasharray="4 4" strokeWidth={1} opacity={0.6} /><text x={W - padR + 4} y={y(support) + 4} fill={T.green} fontSize={11}>지지 {fmt(support)}</text></>}
        {resistance != null && <><line x1={padL} x2={W - padR} y1={y(resistance)} y2={y(resistance)} stroke={T.red} strokeDasharray="4 4" strokeWidth={1} opacity={0.6} /><text x={W - padR + 4} y={y(resistance) + 4} fill={T.red} fontSize={11}>저항 {fmt(resistance)}</text></>}
        {/* 이평선 */}
        <path d={linePath(ma20)} fill="none" stroke={T.blue} strokeWidth={1.2} opacity={0.8} />
        <path d={linePath(ma60)} fill="none" stroke={T.gold} strokeWidth={1.2} opacity={0.8} />
        {/* 캔들 */}
        {candles.map((c, i) => {
          const [, o, h, l, cl] = c
          const up = cl >= o
          const col = up ? T.green : T.red
          const bodyTop = y(Math.max(o, cl)), bodyBot = y(Math.min(o, cl))
          return (
            <g key={i}>
              <line x1={x(i)} x2={x(i)} y1={y(h)} y2={y(l)} stroke={col} strokeWidth={1} />
              <rect x={x(i) - cw / 2} y={bodyTop} width={cw} height={Math.max(1, bodyBot - bodyTop)} fill={col} />
            </g>
          )
        })}
        {/* 우측 가격축 (최근가) */}
        <text x={W - padR + 4} y={y(closes[closes.length - 1]) + 4} fill={T.text} fontSize={11} fontWeight={700}>{fmt(closes[closes.length - 1])}</text>
      </svg>
      <div style={{ display: 'flex', gap: 14, padding: '4px 8px', fontSize: 11, color: T.muted }}>
        <span><span style={{ color: T.blue }}>—</span> 20일선</span>
        <span><span style={{ color: T.gold }}>—</span> 60일선</span>
        <span style={{ marginLeft: 'auto' }}>최근 {candles.length}일 · KIS 일봉</span>
      </div>
    </div>
  )
}
