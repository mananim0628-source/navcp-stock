#!/bin/bash
SRK=$(docker exec n8n printenv SUPABASE_SERVICE_ROLE_KEY)
SMTP_HOST=$(grep -E "^SMTP_HOST=" /root/.kis_api.key | cut -d= -f2-)
SMTP_PORT=$(grep -E '^SMTP_PORT=' /root/.kis_api.key | cut -d= -f2-)
SMTP_USER=$(grep -E "^SMTP_USER=" /root/.kis_api.key | cut -d= -f2-)
SMTP_PASS=$(grep -E "^SMTP_PASS=" /root/.kis_api.key | cut -d= -f2-)
SMTP_FROM=$(grep -E "^SMTP_FROM=" /root/.kis_api.key | cut -d= -f2-)
SUPABASE_SERVICE_ROLE_KEY=$SRK SMTP_HOST=$SMTP_HOST SMTP_PORT=$SMTP_PORT SMTP_USER=$SMTP_USER SMTP_PASS=$SMTP_PASS SMTP_FROM=$SMTP_FROM \
  /usr/bin/node /root/alert_worker.mjs >> /root/alert.log 2>&1
