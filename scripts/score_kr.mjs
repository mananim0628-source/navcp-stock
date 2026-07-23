// ============================================================
// navcp-stock 스코어링 엔진 v0 — KIS로 국내 종목 7팩터 점수화 → stock_score_cache
// 실행(VPS/로컬): node scripts/score_kr.mjs  (env: KIS_APP_KEY, KIS_APP_SECRET, SUPABASE_SERVICE_ROLE_KEY)
// v0 커버리지: 기술·수급(외국인)·밸류만 실측. 재무성장·공매도·거시·AI는 '측정 안 됨'(정직 표기).
//   → coverage 낮게 나오는 게 정상. 크립토 ZAMA 뻥튀기 교훈: 커버리지 함께 저장.
// KIS: 토큰 1분1회 제한 → 캐시(/root/.kis_token 또는 ./.kis_token). 시세 tr_id FHKST01010100.
// §1: 분석·도구. 종목 추천 아님. 임계·정규화는 백테스트 후 재설정 대상(v0는 근사).
// ============================================================
import fs from 'node:fs'
// Supabase는 REST(PostgREST) fetch로 upsert — VPS에 SDK 설치 불필요.

const AK = process.env.KIS_APP_KEY, SK = process.env.KIS_APP_SECRET
const DART_KEY = process.env.DART_API_KEY
// 종목코드→DART corp_code 매핑 (corpCode.xml에서 미리 생성)
let CORPMAP = {}
try { CORPMAP = JSON.parse(fs.readFileSync(fs.existsSync('/root/dart_corpmap.json') ? '/root/dart_corpmap.json' : './dart_corpmap.json', 'utf8')) } catch (e) {}
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lpdhtagnbqwjagtmifug.supabase.co'
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const KIS = 'https://openapi.koreainvestment.com:9443'
const TOKEN_FILE = fs.existsSync('/root') ? '/root/.kis_token' : './.kis_token'
const sleep = ms => new Promise(r => setTimeout(r, ms))

// 유니버스 = KIS 시총상위 자동 수집(코스피+코스닥). 우선주·ETF·스팩·리츠 제외(정화).
async function fetchUniverse(tok) {
  const out = []
  const seen = new Set()
  // 코스피(J)·코스닥은 같은 랭킹 API가 시총순 반환. 한 번에 ~30 → 가격밴드 세분화로 더 긁기.
  const TARGET = 80
  const bands = [['', ''], ['300000', ''], ['150000', '299999'], ['100000', '149999'], ['70000', '99999'],
    ['50000', '69999'], ['35000', '49999'], ['25000', '34999'], ['15000', '24999'], ['10000', '14999'], ['5000', '9999'], ['', '4999']]
  for (const [p1, p2] of bands) {
    const j = await kisGet(`/uapi/domestic-stock/v1/ranking/market-cap?fid_cond_mrkt_div_code=J&fid_cond_scr_div_code=20174&fid_div_cls_code=0&fid_input_iscd=0000&fid_trgt_cls_code=0&fid_trgt_exls_cls_code=0&fid_input_price_1=${p1}&fid_input_price_2=${p2}&fid_vol_cnt=`, tok, 'FHPST01740000')
    const list = j && Array.isArray(j.output) ? j.output : []
    for (const r of list) {
      const code = r.mksc_shrn_iscd, name = (r.hts_kor_isnm || '').trim()
      if (!code || seen.has(code)) continue
      // 정화: 우선주(끝 0 아님) · ETF/ETN/리츠/스팩 · 이름에 '우' 끝
      if (!/0$/.test(code)) continue
      if (/(ETF|ETN|리츠|스팩|우$|우B$|배당|인버스|레버리지|선물)/i.test(name)) continue
      seen.add(code)
      out.push({ code, name, market: 'KR' })
      if (out.length >= TARGET) break
    }
    if (out.length >= TARGET) break
    await sleep(300)
  }
  return out
}

async function getToken() {
  if (fs.existsSync(TOKEN_FILE)) {
    const age = (Date.now() - fs.statSync(TOKEN_FILE).mtimeMs) / 1000
    if (age < 82800) return fs.readFileSync(TOKEN_FILE, 'utf8').trim()
  }
  const r = await fetch(`${KIS}/oauth2/tokenP`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ grant_type: 'client_credentials', appkey: AK, appsecret: SK }) })
  const j = await r.json()
  if (!j.access_token) throw new Error('토큰 발급 실패: ' + JSON.stringify(j).slice(0, 120))
  fs.writeFileSync(TOKEN_FILE, j.access_token); try { fs.chmodSync(TOKEN_FILE, 0o600) } catch {}
  return j.access_token
}

async function price(code, tok) {
  const j = await kisGet(`/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${code}`, tok, 'FHKST01010100')
  return j && j.output ? j.output : null
}

// KIS GET (재시도 3회 — 간헐 오류로 인한 skip/누락 최소화)
async function kisGet(path, tok, tr) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${KIS}${path}`, { headers: { authorization: `Bearer ${tok}`, appkey: AK, appsecret: SK, tr_id: tr } })
      const j = await r.json()
      if (j && (j.output || j.output1 || j.output2)) return j
    } catch (e) {}
    await sleep(600 * (i + 1))
  }
  return null
}

// 투자자별 매매동향(30일) — 외국인·기관 순매수 거래대금. 장 마감 무관(과거 데이터).
async function investor(code, tok) {
  const j = await kisGet(`/uapi/domestic-stock/v1/quotations/inquire-investor?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${code}`, tok, 'FHKST01010900')
  return j && Array.isArray(j.output) ? j.output : null
}

// 일봉 100일 — RSI·이평·지지/저항 계산용.
function ymd(offsetDays) { const d = new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3); return d.toISOString().slice(0, 10).replace(/-/g, '') }
async function daily(code, tok) {
  const j = await kisGet(`/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${code}&FID_INPUT_DATE_1=${ymd(-140)}&FID_INPUT_DATE_2=${ymd(0)}&FID_PERIOD_DIV_CODE=D&FID_ORG_ADJ_PRC=0`, tok, 'FHKST03010100')
  const o2 = j && Array.isArray(j.output2) ? j.output2 : null
  if (!o2) return null
  // 최신순 → 오래된순, 미완성(거래량 0) 당일 제외
  const rows = o2.filter(r => Number(r.acml_vol) > 0).map(r => ({
    d: r.stck_bsop_date, o: Number(r.stck_oprc), c: Number(r.stck_clpr), h: Number(r.stck_hgpr), l: Number(r.stck_lwpr), v: Number(r.acml_vol),
  })).filter(r => isFinite(r.c) && r.c > 0).reverse()
  return rows.length >= 20 ? rows : null
}

const Z_BAND = 0.5
const _mean = a => a.reduce((x, y) => x + y, 0) / a.length
const _std = (a, m) => a.length < 2 ? 0 : Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1))
function zLatest(vals) {
  const v = vals.filter(Number.isFinite)
  if (v.length < 2) return null
  const last = v[v.length - 1], rest = v.slice(0, -1), m = _mean(rest), sd = _std(rest, m)
  return sd === 0 ? null : (last - m) / sd
}

// 거시(12) — 시장 전체 공통. macro_daily 재사용(dxy·fed·10Y 완화=가점). 1회 계산.
async function computeMacro() {
  let rows = []
  try { rows = await (await fetch(`${SUPA_URL}/rest/v1/macro_daily?select=dxy,fed_rate,dgs10&order=date.desc&limit=30`, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } })).json() } catch (e) {}
  const asc = Array.isArray(rows) ? [...rows].reverse() : []
  if (asc.length < 5) return null
  let s = 0
  for (const k of ['dxy', 'fed_rate', 'dgs10']) {
    const z = zLatest(asc.map(x => Number(x[k])))
    s += z == null ? 2 : z < -Z_BAND ? 4 : z > Z_BAND ? 0 : 2   // 완화(하락)=가점
  }
  return Math.max(0, Math.min(12, s))
}

// 공매도 일별추이(22일) — 파생·공매도 팩터(15). 비중 낮고 감소=가점.
async function shortSale(code, tok) {
  const j = await kisGet(`/uapi/domestic-stock/v1/quotations/daily-short-sale?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${code}&FID_INPUT_DATE_1=${ymd(-40)}&FID_INPUT_DATE_2=${ymd(0)}`, tok, 'FHPST04830000')
  const o2 = j && Array.isArray(j.output2) ? j.output2 : null
  return o2
}
function computeDerivative(rows) {
  if (!rows) return null
  const ratios = rows.map(r => Number(r.ssts_vol_rlim)).filter(Number.isFinite).slice(0, 20)  // 최신순
  if (ratios.length < 5) return null
  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length
  const recent = ratios.slice(0, 5).reduce((a, b) => a + b, 0) / 5
  const prev = ratios.slice(5).reduce((a, b) => a + b, 0) / Math.max(1, ratios.length - 5)
  let s = avg < 2 ? 8 : avg < 5 ? 6 : avg < 10 ? 4 : 2          // 공매도 비중 낮을수록
  s += recent < prev * 0.9 ? 7 : recent < prev * 1.1 ? 4 : 1    // 감소 추세 가점
  return { score: Math.max(0, Math.min(15, Math.round(s))), avg: +avg.toFixed(1) }
}

// AI·재료(15) — DART 최근 30일 공시 유형 분류. §6: 실제 공시명만 사용, 지어내기 없음.
const AI_POS = /(자기주식.*취득|자기주식.*소각|주식소각|자사주|단일판매.*공급계약|수주|무상증자|현금.*배당.*결정|잠정실적.*(흑자|증가)|기업설명회)/
const AI_NEG = /(유상증자|전환사채|신주인수권부사채|교환사채|횡령|배임|감자|불성실공시|관리종목|상장폐지|영업정지|소송|최대주주.*변경|주식.*처분.*최대주주|부도|회생절차)/
async function dartAI(code) {
  if (!DART_KEY) return null
  const cc = CORPMAP[code]
  if (!cc) return { score: 8, note: '매핑없음(중립)' }   // 신규상장 등 → 중립
  const st = ymd(-30), en = ymd(0)
  let list = null
  for (let i = 0; i < 2; i++) {
    try {
      const j = await (await fetch(`https://opendart.fss.or.kr/api/list.json?crtfc_key=${DART_KEY}&corp_code=${cc}&bgn_de=${st}&end_de=${en}&page_count=50`)).json()
      if (j.status === '000') { list = j.list || []; break }
      if (j.status === '013') { list = []; break }   // 조회 데이터 없음 = 공시 없음(중립)
    } catch (e) {}
    await sleep(400)
  }
  if (list == null) return null
  let s = 8, pos = 0, neg = 0
  for (const r of list) {
    const nm = r.report_nm || ''
    if (AI_POS.test(nm)) { pos++; if (pos <= 3) s += 2 }
    if (AI_NEG.test(nm)) { neg++; if (neg <= 3) s -= 3 }
  }
  return { score: Math.max(0, Math.min(15, s)), pos, neg, count: list.length }
}

// 재무비율(장 무관·안정) — 성장률·ROE·부채·EPS·BPS. 재무 팩터(20)의 정식 소스.
async function financialRatio(code, tok) {
  const j = await kisGet(`/uapi/domestic-stock/v1/finance/financial-ratio?FID_DIV_CLS_CODE=0&fid_cond_mrkt_div_code=J&fid_input_iscd=${code}`, tok, 'FHKST66430300')
  const o = j && Array.isArray(j.output) ? j.output[0] : null
  if (!o) return null
  return { grs: Number(o.grs), opInc: Number(o.bsop_prfi_inrt), roe: Number(o.roe_val), eps: Number(o.eps), bps: Number(o.bps), debt: Number(o.lblt_rate) }
}
function computeFinancial(fr, price) {
  if (!fr) return null
  let s = 0
  const band = (v, a, b, c) => (v >= a ? 5 : v >= b ? 4 : v >= c ? 3 : v > 0 ? 2 : 1)
  s += Number.isFinite(fr.grs) ? band(fr.grs, 20, 10, 0) : 2         // 매출성장 5
  s += Number.isFinite(fr.opInc) ? Math.min(4, band(fr.opInc, 20, 10, 0)) : 2  // 영업이익성장 4
  s += Number.isFinite(fr.roe) ? (fr.roe >= 15 ? 4 : fr.roe >= 10 ? 3 : fr.roe >= 5 ? 2 : 1) : 2  // ROE 4
  s += Number.isFinite(fr.debt) ? (fr.debt < 100 ? 3 : fr.debt < 200 ? 2 : 1) : 1  // 부채안정 3
  // 밸류(PER/PBR = 현재가/EPS, 현재가/BPS) 4
  const per = (Number.isFinite(fr.eps) && fr.eps > 0 && price) ? price / fr.eps : null
  const pbr = (Number.isFinite(fr.bps) && fr.bps > 0 && price) ? price / fr.bps : null
  let val = 0
  if (per != null) val += per < 10 ? 2 : per < 20 ? 1.5 : per < 40 ? 1 : 0.5
  if (pbr != null) val += pbr < 1 ? 2 : pbr < 2 ? 1.5 : pbr < 4 ? 1 : 0.5
  s += Math.round(val)
  return { score: Math.max(0, Math.min(20, Math.round(s))), per: per ? +per.toFixed(1) : null, pbr: pbr ? +pbr.toFixed(2) : null, roe: fr.roe, grs: fr.grs }
}

function rsi14(closes) {
  if (closes.length < 15) return null
  let g = 0, l = 0
  for (let i = closes.length - 14; i < closes.length; i++) { const d = closes[i] - closes[i - 1]; if (d > 0) g += d; else l -= d }
  if (g + l === 0) return 50
  const rs = (g / 14) / ((l / 14) || 1e-9)
  return Math.round(100 - 100 / (1 + rs))
}
const ma = (a, n) => a.length >= n ? a.slice(-n).reduce((x, y) => x + y, 0) / n : null

// 기술(20) + 지지/저항 — 일봉 기반.
function computeTechAndLevels(rows) {
  if (!rows) return null
  const closes = rows.map(r => r.c), last = closes[closes.length - 1]
  const rsi = rsi14(closes)
  const m5 = ma(closes, 5), m20 = ma(closes, 20), m60 = ma(closes, 60)
  const recent = rows.slice(-20)
  const swingLow = Math.min(...recent.map(r => r.l))
  const swingHigh = Math.max(...recent.map(r => r.h))
  const hi52 = Math.max(...rows.map(r => r.h)), lo52 = Math.min(...rows.map(r => r.l))
  // 점수: 이평 정배열(6) + RSI 밴드(5) + 위치(5) + 거래량 추세(4)
  let s = 0
  if (m5 && m20 && m60) s += (m5 > m20 && m20 > m60) ? 6 : (m5 > m20) ? 3 : 0
  if (rsi != null) s += rsi >= 70 ? 1 : rsi >= 55 ? 5 : rsi >= 45 ? 4 : rsi >= 30 ? 2 : 3
  const pos = hi52 > lo52 ? (last - lo52) / (hi52 - lo52) : 0.5
  s += pos < 0.4 ? 5 : pos < 0.7 ? 4 : pos < 0.9 ? 2 : 1
  const vMa5 = ma(rows.map(r => r.v), 5), vMa20 = ma(rows.map(r => r.v), 20)
  if (vMa5 && vMa20) s += vMa5 > vMa20 * 1.2 ? 4 : vMa5 > vMa20 ? 3 : 1
  // 차트용 캔들 시리즈(최근 60개, 컴팩트 [날짜,시,고,저,종])
  const candles = rows.slice(-60).map(r => [r.d, r.o, r.h, r.l, r.c])
  return {
    technical: Math.max(0, Math.min(20, Math.round(s))),
    rsi, ma5: m5 ? Math.round(m5) : null, ma20: m20 ? Math.round(m20) : null, ma60: m60 ? Math.round(m60) : null,
    support: Math.round(swingLow), resistance: Math.round(swingHigh),
    w52_high: Math.round(hi52), w52_low: Math.round(lo52), last, candles,
  }
}

// 수급 점수(13): 최근 20일 (외국인+기관) 순매수의 일관성(며칠 샀나) + 방향. §6 결측시 null.
function computeSupply(rows) {
  if (!rows) return null
  const valid = rows
    .map(r => ({ frgn: Number(r.frgn_ntby_tr_pbmn), orgn: Number(r.orgn_ntby_tr_pbmn) }))
    .filter(r => Number.isFinite(r.frgn) || Number.isFinite(r.orgn))
    .slice(0, 20)
  if (valid.length < 5) return null
  let net = 0, posDays = 0
  for (const r of valid) {
    const d = (Number.isFinite(r.frgn) ? r.frgn : 0) + (Number.isFinite(r.orgn) ? r.orgn : 0)
    net += d
    if (d > 0) posDays++
  }
  const consistency = posDays / valid.length      // 0~1 (며칠이나 순매수)
  const score = Math.max(0, Math.min(13, consistency * 9 + (net > 0 ? 4 : 0)))
  return { score: Math.round(score), posDays, days: valid.length, netDir: net > 0 ? '순매수' : '순매도' }
}

// ── 팩터 산출 (v0 근사, 0~배점) ──
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
function scoreStock(o, supplyInfo, techInfo, finInfo, macroScore, derivInfo, aiInfo) {
  const price = +o.stck_prpr, chg = +o.prdy_ctrt
  const na = []

  // 거시(12): 시장 공통.
  let macro = null
  if (macroScore != null) macro = macroScore
  else na.push('거시')

  // AI·재료(15): DART 공시 분류.
  let ai = null
  if (aiInfo && aiInfo.score != null) ai = aiInfo.score
  else na.push('AI')

  // 파생·공매도(15).
  let derivative = null
  if (derivInfo && derivInfo.score != null) derivative = derivInfo.score
  else na.push('파생')

  // 기술(20): 일봉 기반(RSI·이평 정배열·위치·거래량). 일봉 없으면 측정 안 됨.
  let technical = null
  if (techInfo && techInfo.technical != null) technical = techInfo.technical
  else na.push('기술')

  // 수급(13): 외국인·기관 20일 순매수 일관성 (V1 — 투자자별 매매동향). 결측시 측정 안 됨.
  let supply = null
  if (supplyInfo && supplyInfo.score != null) supply = supplyInfo.score
  else na.push('수급')

  // 재무(20): 재무비율 API 기반(성장률·ROE·부채·밸류). 장 무관·안정.
  let financial = null
  if (finInfo && finInfo.score != null) financial = finInfo.score
  else na.push('재무')

  // 전략(5): 수급·기술 동시 점등 + 우량 눌림. (다른 팩터 측정됐을 때만)
  let strategy = null
  if (supply != null && technical != null && financial != null) {
    let st = 0
    if (supply >= 9 && technical >= 14) st += 3          // 수급+기술 동시 강함
    if (financial >= 14 && technical >= 10) st += 2      // 우량 + 기술 받침
    strategy = st
  } else na.push('전략')

  const measured = [['macro', macro, 12], ['supply', supply, 13], ['financial', financial, 20], ['ai', ai, 15], ['derivative', derivative, 15], ['technical', technical, 20], ['strategy', strategy, 5]]
  const gotPts = measured.filter(m => m[1] != null).reduce((a, m) => a + m[1], 0)
  const gotCap = measured.filter(m => m[1] != null).reduce((a, m) => a + m[2], 0)
  const coverage = +(gotCap / 100).toFixed(2)
  // total = 측정분 캡 정규화 (크립토 방식 동일 → 커버리지와 함께 해석)
  const total = gotCap > 0 ? Math.round(gotPts / gotCap * 100) : 0

  return {
    scores: {
      total, macro, supply, financial, ai, derivative, technical, strategy, coverage,
      ai_disc: aiInfo ? `공시 ${aiInfo.count ?? 0}건 (호재 ${aiInfo.pos ?? 0}·악재 ${aiInfo.neg ?? 0})` : null,
      per: finInfo?.per ?? null, pbr: finInfo?.pbr ?? null, roe: finInfo?.roe ?? null, grs: finInfo?.grs ?? null,
      short_ratio: derivInfo?.avg ?? null,
      price: isFinite(price) ? price : null, chg,
      // 기술 상세 + 지지/저항 (상세페이지용)
      rsi: techInfo?.rsi ?? null, ma5: techInfo?.ma5 ?? null, ma20: techInfo?.ma20 ?? null, ma60: techInfo?.ma60 ?? null,
      support: techInfo?.support ?? null, resistance: techInfo?.resistance ?? null,
      w52_high: techInfo?.w52_high ?? null, w52_low: techInfo?.w52_low ?? null,
      supply_dir: supplyInfo?.netDir ?? null, supply_days: supplyInfo ? `${supplyInfo.posDays}/${supplyInfo.days}` : null,
      candles: techInfo?.candles ?? null,   // 차트용 일봉 [날짜,시,고,저,종]
      naFactors: na,
    },
    coverage,
  }
}

async function upsert(row) {
  const r = await fetch(`${SUPA_URL}/rest/v1/stock_score_cache`, {
    method: 'POST',
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
  })
  if (!r.ok) throw new Error('upsert ' + r.status + ' ' + (await r.text()).slice(0, 100))
}

;(async () => {
  const tok = await getToken()
  const now = new Date().toISOString()
  const macroScore = await computeMacro()   // 시장 공통 1회
  const UNIVERSE = await fetchUniverse(tok)
  console.log(`유니버스 ${UNIVERSE.length}종목 · 거시점수 ${macroScore ?? 'n/a'}\n`)
  let ok = 0
  for (const s of UNIVERSE) {
    try {
      const o = await price(s.code, tok)
      if (!o || !o.stck_prpr) { console.log('  skip', s.name, '(응답없음)'); continue }
      await sleep(250)
      const inv = await investor(s.code, tok)
      const supplyInfo = computeSupply(inv)
      await sleep(250)
      const techInfo = computeTechAndLevels(await daily(s.code, tok))
      await sleep(250)
      const finInfo = computeFinancial(await financialRatio(s.code, tok), Number(o.stck_prpr))
      await sleep(250)
      const derivInfo = computeDerivative(await shortSale(s.code, tok))
      const aiInfo = await dartAI(s.code)
      const { scores, coverage } = scoreStock(o, supplyInfo, techInfo, finInfo, macroScore, derivInfo, aiInfo)
      await upsert({ symbol: s.code, name: s.name, market: s.market, scores, coverage, cached_at: now })
      const sd = supplyInfo ? `수급 ${scores.supply}(${supplyInfo.netDir})` : '수급 n/a'
      console.log(`  ${s.name.padEnd(14)} total ${String(scores.total).padStart(3)} · cov ${Math.round(coverage*100)}% · ${sd} · PER ${scores.per} · PBR ${scores.pbr}`)
      ok++
    } catch (e) { console.log('  err', s.name, String(e.message).slice(0, 80)) }
    await sleep(350)   // KIS 초당 제한 여유(2콜/종목)
  }
  // 이번 런에 갱신 안 된 stale 행 삭제(옛 유니버스 잔재 정리)
  try {
    await fetch(`${SUPA_URL}/rest/v1/stock_score_cache?cached_at=lt.${encodeURIComponent(now)}`, {
      method: 'DELETE', headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, Prefer: 'return=minimal' },
    })
  } catch (e) {}
  console.log(`\n완료: ${ok}/${UNIVERSE.length} 종목 적재 (stale 정리)`)
})()
