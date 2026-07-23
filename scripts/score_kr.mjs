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
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lpdhtagnbqwjagtmifug.supabase.co'
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const KIS = 'https://openapi.koreainvestment.com:9443'
const TOKEN_FILE = fs.existsSync('/root') ? '/root/.kis_token' : './.kis_token'
const sleep = ms => new Promise(r => setTimeout(r, ms))

// 유니버스 (v0: 시총 상위 국내 대표 + 코스닥 일부). market J=코스피/코스닥 공통 코드.
const UNIVERSE = [
  { code: '005930', name: '삼성전자', market: 'KOSPI' },
  { code: '000660', name: 'SK하이닉스', market: 'KOSPI' },
  { code: '373220', name: 'LG에너지솔루션', market: 'KOSPI' },
  { code: '207940', name: '삼성바이오로직스', market: 'KOSPI' },
  { code: '005380', name: '현대차', market: 'KOSPI' },
  { code: '000270', name: '기아', market: 'KOSPI' },
  { code: '005490', name: 'POSCO홀딩스', market: 'KOSPI' },
  { code: '035420', name: 'NAVER', market: 'KOSPI' },
  { code: '035720', name: '카카오', market: 'KOSPI' },
  { code: '068270', name: '셀트리온', market: 'KOSPI' },
  { code: '247540', name: '에코프로비엠', market: 'KOSDAQ' },
  { code: '196170', name: '알테오젠', market: 'KOSDAQ' },
]

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
  const r = await fetch(`${KIS}/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${code}`,
    { headers: { authorization: `Bearer ${tok}`, appkey: AK, appsecret: SK, tr_id: 'FHKST01010100' } })
  const j = await r.json()
  return j.output || null
}

// 투자자별 매매동향(30일) — 외국인·기관 순매수 거래대금. 장 마감 무관(과거 데이터).
async function investor(code, tok) {
  const r = await fetch(`${KIS}/uapi/domestic-stock/v1/quotations/inquire-investor?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${code}`,
    { headers: { authorization: `Bearer ${tok}`, appkey: AK, appsecret: SK, tr_id: 'FHKST01010900' } })
  const j = await r.json()
  return Array.isArray(j.output) ? j.output : null
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
function scoreStock(o, supplyInfo) {
  const price = +o.stck_prpr, chg = +o.prdy_ctrt
  const hi52 = +o.w52_hgpr, lo52 = +o.w52_lwpr
  const per = +o.per, pbr = +o.pbr
  const frgn = +o.hts_frgn_ehrt   // 외국인 보유율(%)
  const na = []

  // 기술(20): 52주 위치(눌림 가점, 고점 근처 감점) + 당일 모멘텀
  let technical = null
  if (isFinite(hi52) && isFinite(lo52) && hi52 > lo52) {
    const pos = (price - lo52) / (hi52 - lo52)   // 0~1
    const posScore = pos < 0.4 ? 14 : pos < 0.7 ? 18 : pos < 0.9 ? 12 : 6   // 중단 sweet
    const mom = clamp(6 + chg * 0.8, 0, 6)
    technical = Math.round(clamp(posScore * 0.7 + mom, 0, 20))
  } else na.push('기술')

  // 수급(13): 외국인·기관 20일 순매수 일관성 (V1 — 투자자별 매매동향). 결측시 측정 안 됨.
  let supply = null
  if (supplyInfo && supplyInfo.score != null) supply = supplyInfo.score
  else na.push('수급')

  // 밸류→재무(20 중 밸류 파트만, v0): PER/PBR 낮을수록 가점
  let financial = null
  if (isFinite(per) && per > 0 && isFinite(pbr) && pbr > 0) {
    const perScore = per < 10 ? 10 : per < 20 ? 7 : per < 40 ? 4 : 2
    const pbrScore = pbr < 1 ? 10 : pbr < 2 ? 7 : pbr < 4 ? 4 : 2
    financial = perScore + pbrScore
  } else na.push('재무')

  // 미측정 팩터(거시12·AI15·파생15·전략5) → 측정 안 됨
  na.push('거시', 'AI', '파생', '전략')

  if (supplyInfo) { o._supplyDbg = `${supplyInfo.netDir} ${supplyInfo.posDays}/${supplyInfo.days}일` }
  const measured = [['technical', technical, 20], ['supply', supply, 13], ['financial', financial, 20]]
  const gotPts = measured.filter(m => m[1] != null).reduce((a, m) => a + m[1], 0)
  const gotCap = measured.filter(m => m[1] != null).reduce((a, m) => a + m[2], 0)
  const coverage = +(gotCap / 100).toFixed(2)
  // total = 측정분 캡 정규화 (크립토 방식 동일 → 커버리지와 함께 해석)
  const total = gotCap > 0 ? Math.round(gotPts / gotCap * 100) : 0

  return {
    scores: {
      total, technical, supply, financial, coverage,
      per: isFinite(per) ? per : null, pbr: isFinite(pbr) ? pbr : null,
      frgn_hold: isFinite(frgn) ? frgn : null, chg,
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
  let ok = 0
  for (const s of UNIVERSE) {
    try {
      const o = await price(s.code, tok)
      if (!o || !o.stck_prpr) { console.log('  skip', s.name, '(응답없음)'); continue }
      await sleep(250)
      const inv = await investor(s.code, tok)
      const supplyInfo = computeSupply(inv)
      const { scores, coverage } = scoreStock(o, supplyInfo)
      await upsert({ symbol: s.code, name: s.name, market: s.market, scores, coverage, cached_at: now })
      const sd = supplyInfo ? `수급 ${scores.supply}(${supplyInfo.netDir})` : '수급 n/a'
      console.log(`  ${s.name.padEnd(14)} total ${String(scores.total).padStart(3)} · cov ${Math.round(coverage*100)}% · ${sd} · PER ${scores.per} · PBR ${scores.pbr}`)
      ok++
    } catch (e) { console.log('  err', s.name, String(e.message).slice(0, 80)) }
    await sleep(350)   // KIS 초당 제한 여유(2콜/종목)
  }
  console.log(`\n완료: ${ok}/${UNIVERSE.length} 종목 적재`)
})()
