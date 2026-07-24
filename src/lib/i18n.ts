import { cookies } from 'next/headers'

// 한/영 이중언어 — 페이지가 서버 컴포넌트라 **쿠키 기반**(Context는 서버에서 못 씀).
// 토글이 쿠키를 세팅 + router.refresh() → 서버가 다시 렌더. 네비게이션 간 유지되고 SSR도 정상.
export type Lang = 'ko' | 'en'
export const LANG_COOKIE = 'navcp_lang'

export function getLang(): Lang {
  try {
    return cookies().get(LANG_COOKIE)?.value === 'en' ? 'en' : 'ko'
  } catch { return 'ko' }
}

type Pair = { ko: string; en: string }
const D = {
  // 공통
  brandSuffix: { ko: '주식', en: 'Stocks' },
  navKR: { ko: '🇰🇷 국내', en: '🇰🇷 Korea' },
  navUS: { ko: '🇺🇸 미국', en: '🇺🇸 US' },
  navMethod: { ko: '방법론', en: 'Method' },
  navCrypto: { ko: '크립토 →', en: 'Crypto →' },
  privacy: { ko: '개인정보 처리방침', en: 'Privacy Policy' },
  updatedAgoMin: { ko: '분 전 갱신', en: 'min ago' },
  updatedAgoHour: { ko: '시간 전 갱신', en: 'h ago' },
  updatedAgoDay: { ko: '일 전 갱신', en: 'd ago' },
  viewDetail: { ko: '상세 보기 →', en: 'View details →' },
  viewAll: { ko: '전체 보기 →', en: 'View all →' },
  stocksUnit: { ko: '종목', en: 'stocks' },
  coverage: { ko: '커버리지', en: 'Coverage' },
  points: { ko: '점', en: 'pts' },

  // 등급
  gStrong: { ko: '강한 우호', en: 'Strongly Favorable' },
  gFav: { ko: '우호', en: 'Favorable' },
  gNeutral: { ko: '중립', en: 'Neutral' },
  gCaution: { ko: '주의', en: 'Caution' },
  gWarn: { ko: '경계', en: 'Warning' },

  // 홈
  marketRegime: { ko: '국면', en: 'Regime' },
  regimeNote: { ko: '자동 판정 · 매수/매도 신호 아님', en: 'Auto-assessed · not a buy/sell signal' },
  regimeUpStable: { ko: '지수 20일선 위 · 변동성 안정', en: 'Index above 20D MA · volatility stable' },
  regimeDownVol: { ko: '지수 약세 · 변동성 확대', en: 'Index weak · volatility rising' },
  regimeDown: { ko: '지수 20일선 아래 · 신중 접근', en: 'Index below 20D MA · proceed carefully' },
  regimeUp: { ko: '지수 상승 추세 유지', en: 'Index holding an uptrend' },
  regimeNoData: { ko: '판정 데이터 부족', en: 'Insufficient data' },
  marketSummary: { ko: '시장 종합', en: 'Market Overview' },
  krStocks: { ko: '국내 주식', en: 'Korean Stocks' },
  usStocks: { ko: '해외 주식', en: 'US Stocks' },
  surge: { ko: '급등', en: 'Gainers' },
  plunge: { ko: '급락', en: 'Losers' },
  crossMarketWarn: {
    ko: '※ 국내·미국은 측정 가능한 데이터가 달라 커버리지가 다릅니다. 두 시장의 점수를 직접 비교하지 마세요.',
    en: '※ Coverage differs by market because available data differs. Do not compare scores across markets directly.',
  },
  goodNews: { ko: '🟢 호재 공시', en: '🟢 Positive Filings' },
  badNews: { ko: '🔴 악재 공시', en: '🔴 Negative Filings' },
  noFilings: { ko: '집계된 공시가 아직 없어요.', en: 'No filings collected yet.' },
  filingSource: {
    ko: '※ 국내 DART 전자공시 · 미국 SEC 8-K 공식 항목코드 기반 자동 분류. 주가 방향을 보장하지 않습니다.',
    en: '※ Auto-classified from Korea DART filings and US SEC 8-K official item codes. Does not predict price direction.',
  },
  sectorFlow: { ko: '🇰🇷 국내 업종 흐름', en: '🇰🇷 Korea Sector Flow' },
  sectorAvg: { ko: '평균', en: 'avg' },
  flowTitle: { ko: '🇰🇷 기관·외국인 순매수 상위', en: '🇰🇷 Top Institutional & Foreign Net Buying' },
  flowNote: {
    ko: '미국은 외국인·기관 순매수 구분 개념이 없어 국내에만 제공됩니다.',
    en: 'The US market has no equivalent foreign/institutional net-buying breakdown, so this is Korea-only.',
  },
  netBuy: { ko: '순매수', en: 'net buying' },
  days: { ko: '일', en: 'd' },

  // 성과 검증
  perfTitle: { ko: '📊 성과 검증', en: '📊 Track Record' },
  perfSub: {
    ko: '등급별 이후 20거래일 수익률을 실측해 공개합니다',
    en: 'We will publish measured 20-trading-day forward returns by grade',
  },
  perfDay: { ko: '기록', en: 'Recording day' },
  perfOf: { ko: '일차 / 최소 20거래일', en: ' / 20 trading days minimum' },
  perfStart: { ko: '시작', en: 'started' },
  perfBody: {
    ko: '매일 전 종목 점수를 스냅샷으로 저장하고 있습니다. 표본이 부족한 지금은 수치를 표시하지 않습니다 — 며칠치로 계산한 승률·수익률은 통계가 아니라 소음이고, 그걸 성과처럼 보여주는 건 정직하지 않으니까요. 20거래일이 쌓이면 강한우호·우호·중립·주의·경계 각 등급의 실제 평균 수익률을 이 자리에 그대로 공개합니다.',
    en: 'We snapshot every stock score daily. While the sample is small we show no numbers — a win rate computed from a few days is noise, not statistics, and presenting it as a track record would be dishonest. Once 20 trading days accumulate, the actual average return for each grade will appear here as measured.',
  },

  // 소개·면책
  introBody: {
    ko: '7팩터(거시·수급·재무·공시·공매도·기술·전략)로 국내·미국 종목을 100점 스코어링하는 제 분석 화면을 무료로 공개합니다. 점수가 높다고 매수 신호가 아니라, 제가 시장을 어떻게 읽는지 투명하게 보여드리는 도구예요.',
    en: 'I openly share the screen I use: Korean and US stocks scored out of 100 across 7 factors (macro, flows, financials, filings, short interest, technicals, strategy). A high score is not a buy signal — it is a transparent view of how I read the market.',
  },
  methodLink: { ko: '방법론 보기 →', en: 'See the method →' },
  disclaimer: {
    ko: '⚠️ 정보 제공·분석·교육 목적입니다. 특정 종목의 매수·매도 권유가 아니며, 투자 판단과 책임은 본인에게 있습니다. 운영자는 제도권 금융기관·투자자문업자가 아니며, 대가를 받는 투자자문·리딩·투자일임을 제공하지 않습니다.',
    en: '⚠️ For information, analysis and education only. This is not a solicitation to buy or sell any security; all investment decisions and their consequences are your own. The operator is not a licensed financial institution or investment adviser and provides no paid advisory, signal-calling or discretionary management services.',
  },

  // 장 운영시간
  marketKR: { ko: '국내 증시', en: 'Korea Market' },
  marketUS: { ko: '미국 증시', en: 'US Market' },
  sPre: { ko: '프리마켓', en: 'Pre-market' },
  sRegular: { ko: '정규장', en: 'Regular' },
  sAfter: { ko: '애프터마켓', en: 'After-hours' },
  sDay: { ko: '데이마켓', en: 'Day market' },
  closed: { ko: '장 마감', en: 'Closed' },
  remaining: { ko: '남음', en: 'left' },
  nextIn: { ko: '뒤', en: 'from now' },
  dayDone: { ko: '오늘 일정 종료', en: 'Done for today' },

  // 점수판
  scoresTitleKR: { ko: '국내 종목 7팩터 점수', en: 'Korean Stocks — 7-Factor Scores' },
  scoresTitleUS: { ko: '미국 종목 7팩터 점수', en: 'US Stocks — 7-Factor Scores' },
  scoresLead: {
    ko: '제가 시장을 읽는 화면을 그대로 공개합니다. 점수가 높다고 매수 신호가 아니며, 커버리지(측정 충실도)를 함께 보세요.',
    en: 'This is the exact screen I read the market with. A high score is not a buy signal — always read it together with coverage (how much was actually measured).',
  },
  usCoverageNote: {
    ko: 'ⓘ 미국판은 커버리지 87%입니다. 수급 팩터(13점)는 미국에 외국인·기관 순매수 구분 개념 자체가 없어 비워두고, 측정된 팩터만으로 정규화합니다. 공매도는 FINRA 기준이 국내와 달라(시장조성자 헤지 포함) 미국 유니버스 내 상대 순위로 평가해요. 국내 점수와 직접 비교하지 마세요.',
    en: 'ⓘ US coverage is 87%. The flows factor (13 pts) is left unmeasured because the US market has no foreign/institutional net-buying equivalent; scores are normalized over measured factors only. Short interest uses FINRA data (which includes market-maker hedging), so it is ranked relative to the US universe. Do not compare directly with Korean scores.',
  },
  search: { ko: '종목명 · 코드 검색', en: 'Search name or symbol' },
  filters: { ko: '조건', en: 'Filters' },
  reset: { ko: '초기화', en: 'Reset' },
  noneInGrade: { ko: '이 등급의 종목이 없어요.', en: 'No stocks in this grade.' },
} satisfies Record<string, Pair>

export type Key = keyof typeof D
export function tr(lang: Lang) {
  return (k: Key) => D[k][lang]
}
export const dict = D
