#!/bin/bash
# One-shot functional verification: multi-arm A/B/C, open tracking, auto-promote.
# Starts its own dev server (killed at the end); the system auto-server takes
# over again at the next turn.
set -u
cd /home/z/my-project

JAR=/tmp/jar2.txt
BASE=http://localhost:3000

echo "=== 0. boot server ==="
nohup bun run dev >> dev.log 2>&1 &
SRV=$!
code=000
for i in $(seq 1 40); do
  sleep 2
  code=$(curl -s -o /dev/null -w "%{http_code}" $BASE/ --max-time 8 2>/dev/null)
  [ "$code" = "200" ] && break
done
echo "server ready (code=$code, pid=$SRV)"

echo "=== 1. login ==="
curl -s -c $JAR -X POST $BASE/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"founder@consotto.com","password":"demo1234"}' -o /dev/null -w "login:%{http_code}\n" --max-time 20

echo "=== 2. create fresh campaign (LLM filters + copy) ==="
curl -s -b $JAR -X POST $BASE/api/campaigns -H "Content-Type: application/json" -d '{
  "name":"A/B/C arms v2 — clinics",
  "offer":"An AI receptionist that answers missed calls and books appointments automatically",
  "customerProblem":"Clinics lose 30% of new-patient calls when the front desk is busy",
  "targetRole":"founder, practice manager, owner",
  "targetGeography":"United States",
  "keywords":"veterinary clinics, dental clinics, med spas"
}' --max-time 120 -o /tmp/camp2.json -w "create:%{http_code}\n"
CID=$(python3 -c "import json; print(json.load(open('/tmp/camp2.json'))['campaign']['id'])")
echo "campaign: $CID"

echo "=== 3. variantTest+autoPromote (seeds A/B) then addVariant (C) ==="
curl -s -b $JAR -X PATCH $BASE/api/campaigns/$CID -H "Content-Type: application/json" \
  -d '{"variantTest":true,"autoPromote":true}' --max-time 60 | python3 -c "import json,sys; c=json.load(sys.stdin)['campaign']; print('variantTest:',c['variantTest'],'autoPromote:',c['autoPromote'])"
curl -s -b $JAR -X PATCH $BASE/api/campaigns/$CID -H "Content-Type: application/json" \
  -d '{"addVariant":true}' --max-time 90 -o /tmp/addv2.json -w "addVariant:%{http_code}\n"

echo "=== 4. arms + splitTest summary ==="
curl -s -b $JAR $BASE/api/campaigns/$CID --max-time 30 | python3 -c "
import json,sys
c=json.load(sys.stdin)['campaign']
for v in c['variants']: print(' ', v['label'], '|', v['subject'][:70])
st=c['splitTest']
print('  splitTest: leader=', st['leader'], 'eligible=', st['eligible'], 'p=', st['pValue'])
"

echo "=== 5. approve all + start ==="
curl -s -b $JAR -X POST $BASE/api/campaigns/$CID/actions -H "Content-Type: application/json" \
  -d '{"action":"approve_leads","all":true}' --max-time 30 | head -c 100; echo
curl -s -b $JAR -X POST $BASE/api/campaigns/$CID/actions -H "Content-Type: application/json" \
  -d '{"action":"start"}' --max-time 30 | head -c 60; echo

echo "=== 6. run 14 ticks ==="
for i in $(seq 1 14); do
  curl -s -b $JAR -X POST $BASE/api/tick -H "Content-Type: application/json" -d '{}' --max-time 60 \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'  tick: sent={d.get(\"sent\")} replies={d.get(\"replies\")} spent={round(d.get(\"spent\",0),2)}')" 2>/dev/null || echo "  tick: -"
  sleep 4
done

echo "=== 7. per-arm stats incl. open rate ==="
curl -s -b $JAR $BASE/api/campaigns/$CID --max-time 30 | python3 -c "
import json,sys
c=json.load(sys.stdin)['campaign']
for s in c['variantStats']:
    print(f\"  {s['label']}: assigned={s['assigned']} sent={s['sent']} openRate={round(s['openRate']*100)}% replies={s['replied']} replyRate={round(s['replyRate']*100)}%\")
st=c['splitTest']
print('  splitTest:', 'leader=',st['leader'], 'p=', None if st['pValue'] is None else round(st['pValue'],3), 'eligible=',st['eligible'], 'minSends=',st['minSends'])
"

echo "=== 8. pixel route: expect opens=2 after two fetches ==="
MSGID=$(bun -e "
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const m = await db.message.findFirst({ where: { campaignId: '$CID', direction: 'out', kind: 'touch', channel: 'email' }, orderBy: { createdAt: 'desc' }, select: { id: true } })
console.log(m?.id ?? '')
await db.\$disconnect()
")
curl -s "$BASE/api/open/$MSGID" -o /tmp/p1.gif -w "  pixel:%{http_code} type:%{content_type} bytes:%{size_download}\n" --max-time 15
curl -s "$BASE/api/open/$MSGID" -o /dev/null -w "  pixel again:%{http_code}\n" --max-time 15
bun -e "
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const m = await db.message.findUnique({ where: { id: '$MSGID' }, select: { opens: true, openedAt: true } })
console.log('  opens now:', m?.opens, '| openedAt:', !!m?.openedAt)
await db.\$disconnect()
"

echo "=== 9. force significance for B, tick, expect auto-promote ==="
bun -e "
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const variants = await db.copyVariant.findMany({ where: { campaignId: '$CID' }, orderBy: { label: 'asc' } })
const b = variants.find(v => v.label === 'B')
const bLeads = await db.lead.findMany({ where: { campaignId: '$CID', variantId: b.id, touchCount: { gt: 0 } }, select: { id: true } })
let added = 0
for (const l of bLeads) {
  const has = await db.message.count({ where: { campaignId: '$CID', leadId: l.id, direction: 'in' } })
  if (has === 0) {
    await db.message.create({ data: { campaignId: '$CID', leadId: l.id, direction: 'in', channel: 'email', kind: 'reply', body: 'Yes — this is exactly our bottleneck. Let us talk.', status: 'sent' } })
    added++
  }
}
console.log('  injected replies for B:', added, '/', bLeads.length, 'sent leads')
await db.\$disconnect()
"
for i in 1 2; do
  curl -s -b $JAR -X POST $BASE/api/tick -H "Content-Type: application/json" -d '{}' --max-time 60 | head -c 60; echo
  sleep 3
done
curl -s -b $JAR $BASE/api/campaigns/$CID --max-time 30 | python3 -c "
import json,sys
c=json.load(sys.stdin)['campaign']
print('  variantTest after:', c['variantTest'], '(should be False)')
print('  copySubject:', c['copySubject'])
print('  nextAction:', c['nextAction'][:130])
"

echo "=== 10. runtime errors ==="
grep -E "Error|error" dev.log | grep -vE "panic|report-this" | tail -3 | sed 's/^/  /'
echo "  (end)"

kill $SRV 2>/dev/null
pkill -f "next dev" 2>/dev/null
pkill -f "next-server" 2>/dev/null
sleep 1
echo "=== done, server stopped ==="
