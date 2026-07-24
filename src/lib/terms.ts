// 데이터로 들어오는 한글 용어(DART 공시명·KIS 업종명)의 영문 표기.
// ⚠️ 매핑에 없으면 **원문을 그대로 노출**한다(임의 의역으로 뜻을 바꾸지 않기 위해).
// 8-K 항목은 SEC 공식 명칭을 사용한다.

const FILING: Record<string, string> = {
  '단일판매 · 공급계약체결': 'Major supply contract',
  '단일판매·공급계약체결': 'Major supply contract',
  '기업설명회': 'IR / earnings call',
  '현금 · 현물배당결정': 'Cash/stock dividend declared',
  '현금·현물배당결정': 'Cash/stock dividend declared',
  '현금 · 현물배당을위한주주명부폐쇄': 'Record date set for dividend',
  '주식소각결정': 'Share cancellation',
  '자기주식취득결정': 'Share buyback',
  '자기주식취득신탁계약체결결정': 'Buyback trust agreement',
  '무상증자결정': 'Bonus issue',
  '유상증자결정': 'Rights offering (dilution)',
  '전환사채권발행결정': 'Convertible bond issuance',
  '신주인수권부사채권발행결정': 'Bond with warrants issued',
  '교환사채권발행결정': 'Exchangeable bond issued',
  '소송등의제기 · 신청': 'Litigation filed',
  '소송등의제기·신청': 'Litigation filed',
  '소송등의판결 · 결정': 'Litigation ruling',
  '소송등의판결·결정': 'Litigation ruling',
  '영업정지': 'Business suspension',
  '주요사항보고서': 'Material event report',
  '감자결정': 'Capital reduction',
  '불성실공시법인지정': 'Designated for poor disclosure',
  '관리종목지정': 'Designated as administrative issue',
  '상장폐지': 'Delisting',
  '특수관계인의유상증자참여': 'Related-party participation in offering',
  '유상증자또는주식관련사채등의발행결과': 'Offering / convertible issuance result',
  '최대주주변경': 'Change of largest shareholder',
  '회생절차개시신청': 'Rehabilitation filing',
}

// SEC 8-K 항목 공식 명칭 (engine이 '8-K 1.01 중요계약' 형태로 저장)
const ITEM_8K: Record<string, string> = {
  '1.01': 'Material Definitive Agreement',
  '1.03': 'Bankruptcy or Receivership',
  '2.04': 'Triggering Event Accelerating Obligation',
  '2.05': 'Exit or Disposal Costs',
  '2.06': 'Material Impairment',
  '3.01': 'Delisting / Listing Rule Failure',
  '4.01': 'Change in Certifying Accountant',
  '4.02': 'Non-Reliance on Prior Financials',
}

const SECTOR: Record<string, string> = {
  '금속': 'Metals', '통신': 'Telecom', '음식료·담배': 'Food & Tobacco',
  '운송·창고': 'Transport & Logistics', '보험': 'Insurance', '오락·문화': 'Media & Leisure',
  '제약': 'Pharmaceuticals', '일반서비스': 'General Services', '전기·전자': 'Electronics',
  '금융': 'Financials', '운송장비·부품': 'Auto & Transport Equipment', 'IT 서비스': 'IT Services',
  '기계·장비': 'Machinery', '화학': 'Chemicals', '증권': 'Securities', '유통': 'Retail',
  '건설': 'Construction', '철강': 'Steel', '섬유·의류': 'Textiles & Apparel',
  '비금속': 'Non-metals', '종이·목재': 'Paper & Wood', '전기·가스': 'Utilities',
  '부동산': 'Real Estate', '기타': 'Others', '의료·정밀기기': 'Medical & Precision',
  '지주회사': 'Holding Companies', '은행': 'Banks',
}

export function trFiling(nm: string | undefined, lang: 'ko' | 'en'): string {
  if (!nm) return ''
  if (lang === 'ko') return nm
  const m = nm.match(/^8-K\s+(\d\.\d{2})/)          // '8-K 1.01 중요계약' → 공식 명칭
  if (m) return `8-K ${m[1]} ${ITEM_8K[m[1]] ?? ''}`.trim()
  return FILING[nm.trim()] ?? nm                     // 매핑 없으면 원문 유지
}

// 미국 업종은 SEC의 SIC 설명(영문)으로 들어온다 → 한국어 모드에서 한글로 표기.
// 종류가 많아 개별 매핑 대신 **키워드 규칙**으로 큰 분류에 대응시키고, 못 맞추면 원문을 유지한다.
const SIC_KO: [RegExp, string][] = [
  [/semiconductor/i, '반도체'],
  [/prepackaged software|computer programming|data processing|services-computer/i, '소프트웨어·IT서비스'],
  [/electronic computers|computer (storage|peripheral|communications)/i, '컴퓨터·하드웨어'],
  [/pharmaceutical|biological products|medicinal|in vitro|diagnostic/i, '제약·바이오'],
  [/real estate investment trusts|real estate/i, '부동산·리츠'],
  [/national commercial banks|state commercial banks|savings institution|banks?$/i, '은행'],
  [/security brokers|investment advice|finance services|blank checks|finance lessors/i, '금융서비스'],
  [/fire, marine|life insurance|insurance/i, '보험'],
  [/telephone communications|radiotelephone|communications services|cable/i, '통신'],
  [/motor vehicles?|auto|truck/i, '자동차'],
  [/retail|variety stores|catalog/i, '유통·소매'],
  [/crude petroleum|petroleum refining|natural gas|oil/i, '에너지'],
  [/gold mining|metal mining|steel works|rolling|nonferrous/i, '금속·광업'],
  [/aircraft|guided missiles|ordnance|search, detection/i, '항공우주·방산'],
  [/electric services|gas transmission|water supply|cogeneration/i, '유틸리티'],
  [/services-medical|hospital|health services|nursing/i, '헬스케어 서비스'],
  [/beverages|food|sugar|bakery|dairy/i, '음식료'],
  [/apparel|footwear|textile/i, '의류·섬유'],
  [/services-motion picture|broadcasting|advertising|amusement|recreation/i, '미디어·엔터'],
  [/chemicals?|plastics|industrial organic/i, '화학'],
  [/air transportation|trucking|railroads|water transportation|transportation/i, '운송'],
  [/electrical machinery|industrial instruments|measuring|laboratory apparatus/i, '전기·계측장비'],
  [/construction|heavy construction|general building/i, '건설'],
  [/tobacco/i, '담배'],
]
export function trSector(nm: string | undefined, lang: 'ko' | 'en'): string {
  if (!nm) return ''
  if (lang === 'en') return SECTOR[nm.trim()] ?? nm          // 국내 업종(한글) → 영문
  for (const [re, ko] of SIC_KO) if (re.test(nm)) return ko  // 미국 SIC(영문) → 한글
  return nm                                                   // 못 맞추면 원문 유지(임의 의역 금지)
}
