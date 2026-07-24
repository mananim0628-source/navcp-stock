import { T, cardStyle } from '@/lib/theme'

// 포트폴리오 구성 시각화 — "지금 내 포트가 어떻게 짜여 있나"를 한눈에.
// 핵심: 자동매매일지는 기록이 목적이 아니라, 내가 보고 판단해 손매매할 때 돕는 도구.
// 그래서 현금비중·코어/위성·국가·섹터 배분을 먼저 보여준다.
type Pos = {
  symbol: string; name: string | null; country: string
  weight_pct: number | null; tier: string | null; sector?: string | null
  unrealized_pct: number | null
}

const donut = (segs: { label: string; pct: number; color: string }[], size = 128) => {
  const r = size / 2 - 10, cx = size / 2, cy = size / 2, C = 2 * Math.PI * r
  let off = 0
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      {segs.map((s, i) => {
        const len = (s.pct / 100) * C
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={16}
            strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} />
        )
        off += len
        return el
      })}
    </svg>
  )
}

const PALETTE = ['#19C2B0', '#3B82F6', '#A855F7', '#E6A82E', '#28C76F', '#F0654A', '#8A93B5', '#6496ff']

export default function PortfolioComposition({ positions, cashPct, lang = 'ko' }: { positions: Pos[]; cashPct: number; lang?: 'ko' | 'en' }) {
  const en = lang === 'en'
  const t = (ko: string, e: string) => (en ? e : ko)
  const invested = positions.reduce((a, p) => a + (Number(p.weight_pct) || 0), 0)

  // 그룹 집계 헬퍼
  const group = (keyFn: (p: Pos) => string) => {
    const m = new Map<string, number>()
    for (const p of positions) {
      const k = keyFn(p); m.set(k, (m.get(k) || 0) + (Number(p.weight_pct) || 0))
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }

  const byTier = group(p => (p.tier === 'satellite' ? t('위성(중소형)', 'Satellite') : t('코어(대형)', 'Core')))
  const byCountry = group(p => (p.country === 'US' ? t('미국', 'US') : t('국내', 'KR')))
  const bySector = group(p => p.sector || t('기타', 'Other')).slice(0, 6)

  // 투입 + 현금을 합쳐 100% 도넛(현금은 회색)
  const allocSegs = [
    ...positions.slice().sort((a, b) => (Number(b.weight_pct) || 0) - (Number(a.weight_pct) || 0)).slice(0, 7)
      .map((p, i) => ({ label: p.name || p.symbol, pct: Number(p.weight_pct) || 0, color: PALETTE[i % PALETTE.length] })),
    { label: t('현금', 'Cash'), pct: Math.max(0, cashPct), color: 'rgba(138,147,181,0.35)' },
  ]

  const Bar = ({ rows, colors }: { rows: [string, number][]; colors?: string[] }) => (
    <div style={{ display: 'grid', gap: 6 }}>
      {rows.map(([label, pct], i) => (
        <div key={label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
            <span>{label}</span><span style={{ color: T.muted }}>{pct.toFixed(1)}%</span>
          </div>
          <div style={{ height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: (colors || PALETTE)[i % PALETTE.length] }} />
          </div>
        </div>
      ))}
    </div>
  )

  if (positions.length === 0) {
    return (
      <div style={{ ...cardStyle, borderRadius: 16, padding: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>{t('🧩 포트폴리오 구성', '🧩 Portfolio')}</div>
        <p style={{ fontSize: 12.5, color: T.muted, marginTop: 8 }}>{t('보유 포지션이 없습니다.', 'No open positions.')}</p>
      </div>
    )
  }

  return (
    <div style={{ ...cardStyle, borderRadius: 16, padding: 18 }}>
      <div style={{ fontSize: 15, fontWeight: 800 }}>{t('🧩 포트폴리오 구성', '🧩 Portfolio Composition')}</div>

      <div style={{ display: 'flex', gap: 18, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: 128, height: 128, flexShrink: 0 }}>
          {donut(allocSegs)}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: 11, color: T.muted }}>{t('투입', 'Invested')}</div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{invested.toFixed(0)}%</div>
            <div style={{ fontSize: 10, color: T.muted }}>{t('현금', 'cash')} {Math.max(0, cashPct).toFixed(0)}%</div>
          </div>
        </div>

        {/* 종목별 범례 */}
        <div style={{ flex: 1, minWidth: 180, display: 'grid', gap: 4 }}>
          {allocSegs.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: s.color, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: s.label === t('현금', 'Cash') ? T.muted : T.text }}>{s.label}</span>
              <span style={{ color: T.muted }}>{s.pct.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* 코어/위성 · 국가 · 섹터 배분 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16, marginTop: 18 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: T.muted, marginBottom: 8 }}>{t('코어 / 위성', 'Core / Satellite')}</div>
          <Bar rows={byTier} colors={[T.teal, T.gold]} />
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: T.muted, marginBottom: 8 }}>{t('국가 배분', 'By country')}</div>
          <Bar rows={byCountry} colors={[T.kr, T.us]} />
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: T.muted, marginBottom: 8 }}>{t('섹터 배분', 'By sector')}</div>
          <Bar rows={bySector} />
        </div>
      </div>

      <p style={{ fontSize: 10.5, color: T.muted, marginTop: 12, lineHeight: 1.6 }}>
        {t('※ 시뮬레이션 규칙이 구성한 포트입니다. 코어=대형주, 위성=지표가 강한 중소형주(현금 일부 배정). 매수·매도 권유가 아닙니다.',
           '※ Portfolio built by the simulation rule. Core = large caps, Satellite = strong small/mid caps (a slice of cash). Not a buy/sell signal.')}
      </p>
    </div>
  )
}
