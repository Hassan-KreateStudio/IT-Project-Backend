CREATE CONSTRAINT day_id IF NOT EXISTS FOR (d:Day) REQUIRE d.id IS UNIQUE;
CREATE CONSTRAINT day_patient_date IF NOT EXISTS FOR (d:Day) REQUIRE (d.patientId, d.date) IS UNIQUE;
CREATE INDEX day_patient IF NOT EXISTS FOR (d:Day) ON (d.patientId);
CREATE INDEX day_date IF NOT EXISTS FOR (d:Day) ON (d.date);

MATCH (p:User {role: 'PATIENT'})-[:GENERATES]->(a:ActivityRecord)
WITH p, a,
  CASE
    WHEN a.sourceId STARTS WITH 'hk:' AND size(a.sourceId) >= 13 THEN substring(a.sourceId, 3, 10)
    ELSE toString(date(a.recordedAt))
  END AS day
MERGE (d:Day {patientId: p.id, date: day})
ON CREATE SET d.id = randomUUID()
MERGE (p)-[:HAS_DAY]->(d)
MERGE (d)-[:HAS_ACTIVITY]->(a);

MATCH (p:User {role: 'PATIENT'})-[:GENERATES]->(g:GlucoseReading)
WITH p, g, toString(date(g.recordedAt)) AS day
MERGE (d:Day {patientId: p.id, date: day})
ON CREATE SET d.id = randomUUID()
MERGE (p)-[:HAS_DAY]->(d)
MERGE (d)-[:HAS_GLUCOSE]->(g);
