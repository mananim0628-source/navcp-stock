import { T } from '@/lib/theme'

// 7팩터 레이더(스노우플레이크) — Simply Wall St 방식. 각 축 = 배점 대비 달성률.
// 측정 전 팩터는 0으로 그리지 않고 점선 축으로만 표시(정직성: 0점과 미측정 구분).
type Axis = { label: string; value: number | null; cap: number }

export default function FactorRadar({ axes, color, size = 260 }: { axes: Axis[]; color: string; size?: number }) {
  const cx = size / 2, cy = size / 2, R = size * 0.34
  const n = axes.length
  const ang = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2
  const pt = (i: number, r: number) => [cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r] as const

  const ratios = axes.map(a => (a.value == null ? null : Math.max(0, Math.min(1, a.value / a.cap))))
  const measured = ratios.map((r, i) => (r == null ? null : pt(i, R * (0.06 + r * 0.94))))
  // 미측정 축은 중심 근처로 이어 붙여 형태를 왜곡하지 않게 최소 반경 사용
  const poly = measured.map((p, i) => p ?? pt(i, R * 0.06)).map(p => p.join(',')).join(' ')

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size, display: 'block', margin: '0 auto' }}>
      {/* 배경 격자 */}
      {[0.25, 0.5, 0.75, 1].map(f => (
        <polygon key={f} points={axes.map((_, i) => pt(i, R * f).join(',')).join(' ')}
          fill="none" stroke={T.cardBr} strokeWidth={1} />
      ))}
      {axes.map((a, i) => {
        const [x, y] = pt(i, R)
        return <line key={a.label} x1={cx} y1={cy} x2={x} y2={y} stroke={T.cardBr} strokeWidth={1}
          strokeDasharray={ratios[i] == null ? '3 3' : undefined} />
      })}
      {/* 점수 다각형 */}
      <polygon points={poly} fill={color} fillOpacity={0.28} stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {measured.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r={3} fill={color} />)}
      {/* 축 라벨 */}
      {axes.map((a, i) => {
        const [x, y] = pt(i, R * 1.3)
        const na = ratios[i] == null
        return (
          <text key={a.label} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            fontSize={10.5} fontWeight={700} fill={na ? T.muted : T.text}>
            {a.label}{na ? ' ·' : ''}
          </text>
        )
      })}
    </svg>
  )
}
