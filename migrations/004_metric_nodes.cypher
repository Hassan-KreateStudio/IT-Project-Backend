CREATE CONSTRAINT steps_patient_day IF NOT EXISTS FOR (s:Steps) REQUIRE (s.patientId, s.day) IS UNIQUE;
CREATE CONSTRAINT heart_rate_patient_day IF NOT EXISTS FOR (h:HeartRate) REQUIRE (h.patientId, h.day) IS UNIQUE;
CREATE CONSTRAINT active_minutes_patient_day IF NOT EXISTS FOR (m:ActiveMinutes) REQUIRE (m.patientId, m.day) IS UNIQUE;
CREATE CONSTRAINT sedentary_patient_day IF NOT EXISTS FOR (s:Sedentary) REQUIRE (s.patientId, s.day) IS UNIQUE;

MATCH (p:User {role: 'PATIENT'})-[:GENERATES]->(a:ActivityRecord)
WITH p, a,
  CASE
    WHEN a.sourceId STARTS WITH 'hk:' AND size(a.sourceId) >= 13 THEN substring(a.sourceId, 3, 10)
    ELSE toString(date(a.recordedAt))
  END AS day
MERGE (d:Day {patientId: p.id, date: day})
ON CREATE SET d.id = randomUUID()
SET d.intensity = a.intensity
MERGE (p)-[:HAS_DAY]->(d)
MERGE (s:Steps {patientId: p.id, day: day})
SET s.count = a.stepCount, s.sourceId = a.sourceId, s.recordedAt = a.recordedAt
MERGE (d)-[:HAS_STEPS]->(s)
MERGE (m:ActiveMinutes {patientId: p.id, day: day})
SET m.minutes = a.durationMinutes
MERGE (d)-[:HAS_ACTIVE_MINUTES]->(m)
MERGE (sd:Sedentary {patientId: p.id, day: day})
SET sd.minutes = a.sedentaryMinutes
MERGE (d)-[:HAS_SEDENTARY]->(sd)
FOREACH (_ IN CASE WHEN a.heartRate IS NULL THEN [] ELSE [1] END |
  MERGE (h:HeartRate {patientId: p.id, day: day})
  SET h.bpm = a.heartRate
  MERGE (d)-[:HAS_HEART_RATE]->(h)
);

MATCH (a:ActivityRecord)
DETACH DELETE a;
