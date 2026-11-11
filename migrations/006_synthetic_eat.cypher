// Slot wall-clock times that were stored labelled as UTC. 19800/48600/70200
// are 05:30:00, 13:30:00 and 19:30:00 UTC. Correct Africa/Nairobi instants are
// three hours earlier and do not match. The values themselves are unchanged.
MATCH (g:GlucoseReading)
WHERE coalesce(g.synthetic, false) = true
  AND g.source = 'backfill'
  AND g.recordedAt IS NOT NULL
WITH g, toInteger(g.recordedAt.epochMillis) AS ms
WHERE ms % 1000 = 0
  AND (ms / 1000) % 86400 IN [19800, 48600, 70200]
SET g.recordedAt = g.recordedAt - duration({hours: 3});
