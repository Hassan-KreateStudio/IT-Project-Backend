// Grandfather: every MONITORS edge existing before this migration is a
// relationship the patient never consented to, but revoking them all would
// break live deployments. Stamp when access began so the UI can show it.
MATCH (c:User {role: 'CAREGIVER'})-[m:MONITORS]->(p:User {role: 'PATIENT'})
WHERE m.since IS NULL
SET m.since = datetime();
