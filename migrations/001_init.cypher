CREATE CONSTRAINT user_id IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE;
CREATE CONSTRAINT user_email IF NOT EXISTS FOR (u:User) REQUIRE u.email IS UNIQUE;
CREATE CONSTRAINT activity_id IF NOT EXISTS FOR (a:ActivityRecord) REQUIRE a.id IS UNIQUE;
CREATE CONSTRAINT activity_patient_source IF NOT EXISTS FOR (a:ActivityRecord) REQUIRE (a.patientId, a.sourceId) IS UNIQUE;
CREATE CONSTRAINT glucose_id IF NOT EXISTS FOR (g:GlucoseReading) REQUIRE g.id IS UNIQUE;
CREATE INDEX activity_recorded_at IF NOT EXISTS FOR (a:ActivityRecord) ON (a.recordedAt);
CREATE INDEX glucose_recorded_at IF NOT EXISTS FOR (g:GlucoseReading) ON (g.recordedAt);
CREATE INDEX activity_patient IF NOT EXISTS FOR (a:ActivityRecord) ON (a.patientId);
CREATE INDEX glucose_patient IF NOT EXISTS FOR (g:GlucoseReading) ON (g.patientId);
