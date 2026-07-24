// navcp 디자인 토큰 (crypto 레포와 동일 팔레트 · brand-guide §2)
export const T = {
  bg0: '#080c18', bg1: '#0e1426', bg2: '#141d36',
  cardBg: 'rgba(30,42,78,0.62)', cardBr: 'rgba(120,150,220,0.14)', cardBlur: '12px',
  green: '#28C76F', amber: '#E6A82E', red: '#F0654A',
  teal: '#19C2B0', gold: '#C8992E', blue: '#6496ff',
  text: '#E8ECF6', muted: '#8A93B5', onTeal: '#06121f',
  // 국가 식별색 — 등급색(green/amber/red)과 겹치지 않는 계열로 골라 의미 충돌을 피한다.
  kr: '#3B82F6', krSoft: 'rgba(59,130,246,0.14)',    // 국내 = 블루
  us: '#A855F7', usSoft: 'rgba(168,85,247,0.14)',    // 미국 = 퍼플
} as const

export const bgGradient = `radial-gradient(ellipse at 20% 20%, ${T.bg2} 0%, ${T.bg0} 60%, ${T.bg0} 100%)`

// ⚠️ 성능: backdrop-filter 는 요소마다 GPU 합성을 유발한다.
// 카드가 100개 넘게 깔리는 목록에서 스크롤이 심하게 버벅여서 **카드에서는 제거**하고,
// 화면당 1개뿐인 sticky 헤더(glassStyle)에만 남긴다.
export const cardStyle = {
  background: T.cardBg,
  border: `1px solid ${T.cardBr}`,
} as const

// sticky 헤더 전용 (페이지당 1개라 비용이 크지 않음)
export const glassStyle = {
  background: 'rgba(8,12,24,0.85)',
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
export function gradeLabel(total: number, lang: 'ko' | 'en' = 'ko'): string {
  const en = lang === 'en'
  if (total >= 78) return en ? 'Strongly Favorable' : '강한 우호'
  if (total >= 66) return en ? 'Favorable' : '우호'
  if (total >= 56) return en ? 'Neutral' : '중립'
  if (total >= 48) return en ? 'Caution' : '주의'
  return en ? 'Warning' : '경계'
}
