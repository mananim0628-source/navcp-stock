#!/bin/bash
# ── 중복 실행 방지 잠금 ──
# 과거 사고: 엔진을 겹쳐 실행하면 각자의 stale 정리(DELETE cached_at < now)가 서로가 쓴 행을 지워
# 테이블이 통째로 비었다(US 70종목 -> 2종목). flock 으로 원천 차단.
LOCK=/var/lock/navcp_kr.lock
exec 9>"$LOCK" || exit 1
flock -n 9 || { echo "[skip] 이미 실행 중 $(date "+%F %T")"; exit 0; }
AK=$(grep -E '^KIS_APP_KEY=' /root/.kis_api.key | cut -d= -f2-)
TID=$(grep -E '^TOSS_CLIENT_ID=' /root/.kis_api.key | cut -d= -f2-)
TSC=$(grep -E '^TOSS_CLIENT_SECRET=' /root/.kis_api.key | cut -d= -f2-)
SK=$(grep -E '^KIS_APP_SECRET=' /root/.kis_api.key | cut -d= -f2-)
SRK=$(docker exec n8n printenv SUPABASE_SERVICE_ROLE_KEY)
DK=$(grep -E '^DART_API_KEY=' /root/.kis_api.key | cut -d= -f2-)
KIS_APP_KEY=$AK KIS_APP_SECRET=$SK SUPABASE_SERVICE_ROLE_KEY=$SRK DART_API_KEY=$DK TOSS_CLIENT_ID=$TID TOSS_CLIENT_SECRET=$TSC /usr/bin/node /root/score_kr.mjs >> /root/stock_score.log 2>&1
