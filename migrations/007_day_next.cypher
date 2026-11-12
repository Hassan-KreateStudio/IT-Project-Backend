// Consecutive Day nodes for one patient, oldest to newest. Rebuilt so an
// existing database picks the edges up on the next startup, and a day that
// arrives later does not leave a NEXT edge that skips it.
MATCH (a:Day)-[r:NEXT]->()
DELETE r;

MATCH (:User {role: 'PATIENT'})-[:HAS_DAY]->(d:Day)
WITH d ORDER BY d.patientId, d.date
WITH d.patientId AS patientId, collect(d) AS days
UNWIND range(0, size(days) - 2) AS i
WITH days[i] AS a, days[i + 1] AS b
WHERE a IS NOT NULL AND b IS NOT NULL
MERGE (a)-[:NEXT]->(b);
