// navcp 디자인 토큰 (crypto 레포와 동일 팔레트 · brand-guide §2)
export const T = {
  bg0: '#080c18', bg1: '#0e1426', bg2: '#141d36',
  cardBg: 'rgba(30,42,78,0.55)', cardBr: 'rgba(120,150,220,0.14)', cardBlur: '12px',
  green: '#28C76F', amber: '#E6A82E', red: '#F0654A',
  teal: '#19C2B0', gold: '#C8992E', blue: '#6496ff',
  text: '#E8ECF6', muted: '#8A93B5', onTeal: '#06121f',
} as const

export const bgGradient = `radial-gradient(ellipse at 20% 20%, ${T.bg2} 0%, ${T.bg0} 60%, ${T.bg0} 100%)`

export const cardStyle = {
  background: T.cardBg,
  border: `1px solid ${T.cardBr}`,
  backdropFilter: `blur(${T.cardBlur})`,
  WebkitBackdropFilter: `blur(${T.cardBlur})`,
} as const

// 등급색 규칙 (CLAUDE.md §3): 우호=green / 중립=amber / 주의=red
// 주식판 임계는 KIS 백테스트 후 재설정 예정 — 지금은 크립토 기준 임시.
export function gradeColor(total: number): string {
  if (total >= 66) return T.green
  if (total >= 56) return T.amber
  return T.red
}
export function gradeLabel(total: number): string {
  if (total >= 78) return '강한 우호'
  if (total >= 66) return '우호'
  if (total >= 56) return '중립'
  if (total >= 48) return '주의'
  return '경계'
}
