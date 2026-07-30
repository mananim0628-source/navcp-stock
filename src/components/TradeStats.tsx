'use client'

import { useMemo } from 'react'
import { T, cardStyle } from '@/lib/theme'

// 성과 분석 — 해외 매매일지(TradeZella·Edgewonk·Tradervue) 표준 지표.
// 철학: 승률은 과대평가된 지표. 기대값(Expectancy)·R-multiple·MAE/MFE·Profit Factor가 핵심.
// ⚠️ 표본 20건 미만이면 수치를 숨긴다(소음을 성과로 내보내지 않음).
type CT = {
  pnl_pct: number | null; r_multiple: number | null; mae_pct: number | null; mfe_pct: number | null
  exit_kind: string | null; session: string | null; country: string; holding_days: number | null; rule?: string | null
}

const MIN_N = 20

export default function TradeStats({ closed, lang = 'ko' }: { closed: CT[]; lang?: 'ko' | 'en' }) {
  const en = lang === 'en'
  const t = (ko: string, e: string) => (en ? e : ko)

  const s = useMemo(() => {
    const rows = closed.filter(x => x.pnl_pct != null)
    const n = rows.length
    if (!n) return null
    const wins = rows.filter(x => Number(x.pnl_pct) > 0)
    const losses = rows.filter(x => Number(x.pnl_pct) <= 0)
    const sum = (a: CT[], k: keyof CT) => a.reduce((acc, x) => acc + (Number(x[k]) || 0), 0)
    const avg = (a: CT[], k: keyof CT) => (a.length ? sum(a, k) / a.length : 0)

    const grossWin = sum(wins, 'pnl_pct'), grossLoss = Math.abs(sum(losses, 'pnl_pct'))
    const rArr = rows.map(x => x.r_multiple).filter((v): v is number => v != null)
    // 자산곡선(누적 %) — 시간순
    let cum = 0; const curve = rows.map(x => (cum += Number(x.pnl_pct)))
    let peak = 0, mdd = 0
    for (const v of curve) { peak = Math.max(peak, v); mdd = Math.min(mdd, v - peak) }

    return {
      n, winRate: Math.round((wins.length / n) * 100),
      avgWin: +avg(wins, 'pnl_pct').toFixed(2), avgLoss: +avg(losses, 'pnl_pct').toFixed(2),
      expectancy: +(avg(rows, 'pnl_pct')).toFixed(2),
      pf: grossLoss > 0 ? +(grossWin / grossLoss).toFixed(2) : null,
      avgR: rArr.length ? +(rArr.reduce((a, b) => a + b, 0) / rArr.length).toFixed(2) : null,
      avgMae: +avg(rows, 'mae_pct').toFixed(2), avgMfe: +avg(rows, 'mfe_pct').toFixed(2),
      // Capture Ratio = 실현손익 ÷ 최대순행(얼마나 잘 먹었나)
      capture: (() => { const c = rows.filter(x => Number(x.mfe_pct) > 0); return c.length ? +(avg(c, 'pnl_pct') / avg(c, 'mfe_pct')).toFixed(2) : null })(),
      curve, mdd: +mdd.toFixed(2),
      bySession: ['preopen', 'close'].map(k => {
        const r = rows.filter(x => x.session === k)
        return { k, n: r.length, win: r.length ? Math.round((r.filter(x => Number(x.pnl_pct) > 0).length / r.length) * 100) : null, exp: r.length ? +avg(r, 'pnl_pct').toFixed(2) : null }
      }),
      byExit: ['target', 'stop', 'grade_drop', 'timeout'].map(k => ({ k, n: rows.filter(x => x.exit_kind === k).length })),
    }
  }, [closed])

  if (!s) return (
    <div style={{ ...cardStyle, borderRadius: 14, padding: 18 }}>
      <div style={{ fontSize: 15, fontWeight: 800 }}>{t('📊 성과 분석', '📊 Performance')}</div>
      <p style={{ fontSize: 12.5, color: T.muted, marginTop: 8 }}>{t('종료된 기록이 쌓이면 분석이 나옵니다.', 'Analytics appear once trades close.')}</p>
    </div>
  )

  const enough = s.n >= MIN_N
  const W = 320, Hh = 130, PAD = 8
  const cmin = Math.min(0, ...s.curve), cmax = Math.max(0, ...s.curve)
  const cx = (i: number) => PAD + (i / Math.max(1, s.curve.length - 1)) * (W - PAD * 2)
  const cy = (v: number) => PAD + (1 - (v - cmin) / ((cmax - cmin) || 1)) * (Hh - PAD * 2)
  const line = s.curve.map((v, i) => `${i ? 'L' : 'M'}${cx(i).toFixed(1)},${cy(v).toFixed(1)}`).join(' ')
  const last = s.curve[s.curve.length - 1]
  const lineCol = last >= 0 ? T.green : T.red
  const gid = last >= 0 ? 'eqUp' : 'eqDn'
  const area = `${line} L${cx(s.curve.length - 1).toFixed(1)},${cy(0).toFixed(1)} L${cx(0).toFixed(1)},${cy(0).toFixed(1)} Z`

  const Metric = ({ label, value, color, hint }: { label: string; value: string; color?: string; hint?: string }) => (
    <div style={{ flex: 1, minWidth: 92, border: `1px solid ${T.cardBr}`, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: T.muted }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 3, color: color || T.text }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>{hint}</div>}
    </div>
  )

  return (
    <div style={{ ...cardStyle, borderRadius: 16, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 800 }}>{t('📊 성과 분석', '📊 Performance')}</span>
        <span style={{ fontSize: 11.5, color: T.muted }}>{s.n}{t('건 종료', ' closed')}</span>
      </div>

      {/* 자산곡선 — 면적 그라데이션 + 제로 baseline (dataviz) */}
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 11, color: T.muted }}>
          <span>{t('누적 손익 곡선', 'Equity curve')}</span>
          <span>{t('최대 낙폭', 'Max DD')} <b style={{ color: T.red }}>{s.mdd}%</b> · <b style={{ color: lineCol, fontSize: 12 }}>{last >= 0 ? '+' : ''}{last.toFixed(1)}%</b></span>
        </div>
        <svg viewBox={`0 0 ${W} ${Hh}`} width="100%" height={130} preserveAspectRatio="none" style={{ marginTop: 6, display: 'block', overflow: 'visible' }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineCol} stopOpacity="0.30" />
              <stop offset="100%" stopColor={lineCol} stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1={PAD} x2={W - PAD} y1={cy(0)} y2={cy(0)} stroke={T.muted} strokeOpacity={0.35} strokeWidth={1} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          <path d={area} fill={`url(#${gid})`} stroke="none" />
          <path d={line} fill="none" stroke={lineCol} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>

      {!enough ? (
        <p style={{ fontSize: 12, color: T.amber, marginTop: 12, lineHeight: 1.7 }}>
          {t(`핵심 지표(기대값·손익비·R)는 종료 20건 이상에서 공개합니다(현재 ${s.n}건). 몇 건으로 낸 수치는 통계가 아니라 소음이니까요.`,
             `Key metrics (expectancy, PF, R) unlock at 20+ closed trades (now ${s.n}). A number from a handful of trades is noise.`)}
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
            <Metric label={t('기대값/건', 'Expectancy')} value={`${s.expectancy > 0 ? '+' : ''}${s.expectancy}%`} color={s.expectancy > 0 ? T.green : T.red} hint={t('1건당 평균 손익', 'avg per trade')} />
            <Metric label={t('손익비(PF)', 'Profit factor')} value={s.pf != null ? String(s.pf) : '—'} color={s.pf != null && s.pf >= 1 ? T.green : T.red} hint={t('총이익/총손실', 'gross W/L')} />
            <Metric label={t('평균 R', 'Avg R')} value={s.avgR != null ? `${s.avgR > 0 ? '+' : ''}${s.avgR}R` : '—'} color={s.avgR != null && s.avgR > 0 ? T.green : T.red} hint={t('위험 대비 손익', 'reward/risk')} />
            <Metric label={t('승률', 'Win rate')} value={`${s.winRate}%`} hint={t('참고 지표', 'context only')} />
            <Metric label={t('최대 낙폭', 'Max DD')} value={`${s.mdd}%`} color={T.red} />
          </div>

          {/* MAE/MFE 진단 — 손절/목표가 적절했나 */}
          <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: `1px solid ${T.cardBr}`, background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.teal }}>{t('손절·목표 진단 (MAE/MFE)', 'Stop/target check (MAE/MFE)')}</div>
            <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 12, color: T.muted, flexWrap: 'wrap' }}>
              <span>{t('평균 최대역행', 'Avg MAE')} <b style={{ color: T.red }}>{s.avgMae}%</b></span>
              <span>{t('평균 최대순행', 'Avg MFE')} <b style={{ color: T.green }}>+{s.avgMfe}%</b></span>
              {s.capture != null && <span>{t('실현효율', 'Capture')} <b style={{ color: T.text }}>{Math.round(s.capture * 100)}%</b></span>}
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 6, lineHeight: 1.6 }}>
              {t('역행폭이 작으면 손절을 더 조여도 되고, 순행폭 대비 실현효율이 낮으면 목표가가 너무 멀다는 뜻이에요.',
                 'Small MAE means you can tighten stops; low capture vs MFE means targets sit too far.')}
            </div>
          </div>

          {/* 시점별 성과 */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>{t('시점별 성과', 'By session')}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {s.bySession.filter(x => x.n > 0).map(x => (
                <div key={x.k} style={{ flex: 1, minWidth: 120, border: `1px solid ${T.cardBr}`, borderRadius: 9, padding: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{x.k === 'preopen' ? t('장전 매수', 'Pre-open') : t('종가 매수', 'Close')}</div>
                  <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{x.n}{t('건', '')} · {t('승률', 'win')} {x.win}% · {t('기대값', 'exp')} {x.exp! > 0 ? '+' : ''}{x.exp}%</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
