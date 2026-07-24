// 자동 모의매매 워커 — 규칙대로 '가상' 진입/청산을 기록한다. **실제 주문은 절대 내지 않는다.**
//
// ⚠️ 프레임(§6): 이건 '진입 신호'가 아니라 **규칙이 이렇게 판정했다는 기록**이다.
//    목적은 "우리 점수가 실제로 먹히는가"를 실측으로 검증하는 것. 이용자는 이 기록을 보고 직접 판단한다.
// ⚠️ 정직성: 청산가는 **다음 거래일 이후 실제 캔들**로만 판정한다. 미래를 앞당겨 보지 않는다.
//    진입가도 판정일 종가를 쓴다(당일 저가 체결 같은 유리한 가정 금지).
//
// 실행: node scripts/paper_trade.mjs   (엔진 실행 뒤 크론)

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lpdhtagnbqwjagtmifug.supabase.co'
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPA_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY 없음')

// ── 규칙 (한 곳에 모아둠. 바꾸면 rule 이름도 바꿔서 과거 기록과 섞이지 않게 할 것)
const RULE = process.env.PT_RULE || 'score78'
const ENTRY_SCORE = Number(process.env.PT_ENTRY || 78)   // 진입 판정 점수
const MIN_COVERAGE = 0.9                                  // 커버리지 낮으면 판정 제외(신뢰 부족)
const ATR_STOP = 1.5                                      // 손절 = 진입가 - 1.5×ATR
const ATR_TARGET = 2.5                                    // 목표 = 진입가 + 2.5×ATR (손익비 1.67)
const MAX_DAYS = 20                                       // 최대 보유 20거래일(타임아웃)
const MAX_OPEN = 12                                       // 동시 보유 상한(집중 방지)

const H = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' }
const rest = async (path, init = {}) => {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } })
  if (!r.ok) throw new Error(`${path} ${r.status} ${(await r.text()).slice(0, 160)}`)
  return r.status === 204 ? null : r.json()
}
const pct = (a, b) => +(((a - b) / b) * 100).toFixed(2)

// 진입 근거 자동 생성 — 실제 팩터 값만 인용한다(없는 사실을 지어내지 않음).
function entryReason(sc) {
  const bits = []
  const n = v => (v == null ? null : Number(v))
  if (n(sc.total) != null) bits.push(`종합 ${Math.round(n(sc.total))}점(${sc.grade || ''})`)
  if (n(sc.financial) != null) bits.push(`재무 ${n(sc.financial)}/20`)
  if (n(sc.technical) != null) bits.push(`기술 ${n(sc.technical)}/20`)
  if (n(sc.supply) != null) bits.push(`수급 ${n(sc.supply)}/13${sc.supply_dir ? `(${sc.supply_dir})` : ''}`)
  if (n(sc.per) != null) bits.push(`PER ${n(sc.per)}`)
  if (n(sc.roe) != null) bits.push(`ROE ${n(sc.roe)}%`)
  if (n(sc.rsi) != null) bits.push(`RSI ${n(sc.rsi)}`)
  if (n(sc.mom) != null) bits.push(`모멘텀 ${n(sc.mom)}%(${sc.mom_months ?? '?'}개월)`)
  if (n(sc.rs60) != null) bits.push(`상대강도 ${n(sc.rs60)}%p`)
  if (n(sc.vol20) != null) bits.push(`변동성 ${n(sc.vol20)}%`)
  return `커버리지 ${Math.round((n(sc.coverage) ?? 0) * 100)}% · ` + bits.join(' · ')
}
function exitReason(kind, t, price, sc) {
  const p = pct(price, t.entry_price)
  const base = {
    target: `목표가 ${t.target_price} 도달 → 청산`,
    stop: `손절가 ${t.stop_price} 이탈 → 청산`,
    grade_drop: `등급이 진입 시(${t.entry_grade})보다 두 단계 이상 하락 → 청산`,
    timeout: `최대 보유 ${MAX_DAYS}거래일 경과 → 청산`,
  }[kind]
  return `${base}. 손익 ${p > 0 ? '+' : ''}${p}%` + (sc?.total != null ? ` (청산 시 종합 ${Math.round(Number(sc.total))}점)` : '')
}

const RANK = { 경계: 0, 주의: 1, 중립: 2, 우호: 3, 강한우호: 4 }
const gradeOf = t => t >= 78 ? '강한우호' : t >= 66 ? '우호' : t >= 56 ? '중립' : t >= 48 ? '주의' : '경계'

;(async () => {
  // 오늘자 점수 스냅샷 (엔진이 이미 적재한 것)
  const cache = await rest('stock_score_cache?select=symbol,name,country,scores,coverage,cached_at')
  if (!cache.length) { console.log('[paper] 점수 캐시 없음'); return }
  const today = String(cache[0].cached_at).slice(0, 10)
  const byS = new Map(cache.map(r => [r.symbol, r]))

  // ── 1) 보유 중 포지션 청산 판정 — 진입 이후 실제 캔들로만 본다
  const open = await rest('stock_paper_trade?select=*&status=eq.open')
  let closed = 0
  for (const t of open) {
    const row = byS.get(t.symbol)
    if (!row) continue
    const sc = row.scores || {}
    const candles = Array.isArray(sc.candles) ? sc.candles : null
    if (!candles) continue
    // 진입일 '이후' 봉만 사용 (미래 참조·당일 유리 체결 방지)
    const after = candles.filter(c => String(c[0]).slice(0, 8) > String(t.entry_date).replace(/-/g, ''))
    if (!after.length) continue

    let kind = null, price = null, when = null
    for (const [d, , h, l, c] of after) {
      const dd = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
      if (t.stop_price != null && Number(l) <= Number(t.stop_price)) { kind = 'stop'; price = Number(t.stop_price); when = dd; break }
      if (t.target_price != null && Number(h) >= Number(t.target_price)) { kind = 'target'; price = Number(t.target_price); when = dd; break }
      if (after.indexOf(after.find(x => x[0] === d)) + 1 >= MAX_DAYS) { kind = 'timeout'; price = Number(c); when = dd; break }
    }
    // 등급 급락은 최신 점수로 판정
    if (!kind) {
      const g = sc.grade || gradeOf(Number(sc.total))
      if ((RANK[t.entry_grade] ?? 0) - (RANK[g] ?? 0) >= 2) {
        kind = 'grade_drop'; price = Number(sc.price); when = today
      }
    }
    if (!kind || !(price > 0)) continue

    const days = after.findIndex(x => `${x[0].slice(0,4)}-${x[0].slice(4,6)}-${x[0].slice(6,8)}` === when) + 1
    await rest(`stock_paper_trade?id=eq.${t.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'closed', exit_date: when, exit_price: price, exit_kind: kind,
        exit_reason: exitReason(kind, t, price, sc),
        pnl_pct: pct(price, t.entry_price), holding_days: days > 0 ? days : null,
      }),
    })
    closed++
  }

  // ── 2) 신규 진입 판정
  const stillOpen = (await rest('stock_paper_trade?select=id,symbol&status=eq.open')).length
  const room = Math.max(0, MAX_OPEN - stillOpen)
  const openSyms = new Set((await rest('stock_paper_trade?select=symbol&status=eq.open')).map(r => r.symbol))

  const candidates = cache
    .filter(r => {
      const sc = r.scores || {}
      return Number(sc.total) >= ENTRY_SCORE
        && Number(r.coverage) >= MIN_COVERAGE
        && Number(sc.price) > 0
        && Number(sc.atr14) > 0
        && !openSyms.has(r.symbol)
    })
    .sort((a, b) => Number(b.scores.total) - Number(a.scores.total))
    .slice(0, room)

  const news = candidates.map(r => {
    const sc = r.scores
    const price = Number(sc.price), a = Number(sc.atr14)
    return {
      symbol: r.symbol, country: r.country, name: r.name, rule: RULE,
      entry_date: today, entry_price: price,
      entry_score: Math.round(Number(sc.total)),
      entry_grade: sc.grade || gradeOf(Number(sc.total)),
      entry_reason: entryReason({ ...sc, coverage: r.coverage, grade: sc.grade || gradeOf(Number(sc.total)) }),
      stop_price: +(price - ATR_STOP * a).toFixed(2),
      target_price: +(price + ATR_TARGET * a).toFixed(2),
      meta: { atr: a, atr_stop: ATR_STOP, atr_target: ATR_TARGET, max_days: MAX_DAYS },
    }
  })

  let opened = 0
  if (news.length) {
    const r = await fetch(`${SUPA_URL}/rest/v1/stock_paper_trade?on_conflict=symbol,rule,entry_date`, {
      method: 'POST',
      headers: { ...H, Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify(news),
    })
    opened = r.ok ? (await r.json()).length : 0
  }

  console.log(`[paper] ${today} · 청산 ${closed}건 · 신규 ${opened}건 (보유 ${stillOpen - closed + opened}/${MAX_OPEN}) · 규칙 ${RULE}(${ENTRY_SCORE}점)`)
})()
