// navcp 디자인 토큰 (crypto 레포와 동일 팔레트 · brand-guide §2)
// 2026 리프레시 — Linear/Mercury 계열 near-black 매트(파란 글래스 → 무광 중성).
// 핵심: 표면은 불투명 매트, 보더는 얇은 hairline, 액센트(teal)는 절제.
export const T = {
  bg0: '#0A0B0D', bg1: '#101114', bg2: '#16171B',      // near-black 캔버스(파란기 제거)
  cardBg: '#141518', cardBr: 'rgba(255,255,255,0.08)', cardBlur: '12px',  // 매트 표면 + hairline
  cardBg2: '#1B1C20',                                   // 한 단계 elevated(히어로 등)
  green: '#2ED17E', amber: '#E7B34A', red: '#FF5D5D',   // 손익색 살짝 선명하게(네온 아님)
  teal: '#19C2B0', gold: '#C8992E', blue: '#6496ff',
  text: '#ECEDEF', muted: '#9297A1', onTeal: '#06121f', // 대비 상향(muted ≥4.5:1)
  // 국가 식별색 — 등급색과 겹치지 않는 계열
  kr: '#4C8DFF', krSoft: 'rgba(76,141,255,0.14)',      // 국내 = 블루
  us: '#B072FF', usSoft: 'rgba(176,114,255,0.14)',     // 미국 = 퍼플
} as const

export const bgGradient = `radial-gradient(120% 90% at 30% 0%, ${T.bg2} 0%, ${T.bg0} 55%)`

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
