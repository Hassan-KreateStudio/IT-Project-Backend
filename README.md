# IT Project Backend

Go GraphQL API for graph-based analysis of Apple Watch physical activity data and synthetic glucose input, used to support type 2 diabetes self-monitoring.

## Stack

- Language: Go
- API: GraphQL (`gqlgen`) over chi
- Database: Neo4j (Aura in prod, Docker locally)
- Auth cache: Redis (5 minute token → user cache)
- Analysis: computed on query (not stored)
- Deploy: Docker Hub → Render

## Environment

| File | Git | Used for |
|---|---|---|
| `.env` | ignored | Local API + Compose Neo4j/Redis credentials |
| `.deploy.env` | ignored | Docker Hub + Render service id |
| `.env.example` / `.deploy.env.example` | committed | Templates for a new machine |

Aura + production JWT stay in the Render dashboard. Do not put them in `.env`.

## Run locally

```sh
make up
curl http://localhost:8080/ping
```

GraphQL playground: `http://localhost:8080/graphql`

Domain proofs live next to the domain (Terminal, not Playground):

```sh
python3 src/domains/auth/tests/run.py
python3 src/domains/caregiver/tests/run.py
python3 src/domains/activity/tests/run.py
python3 src/domains/glucose/tests/run.py
python3 src/domains/analysis/tests/run.py
```

`make run` uses the same `.env` and talks to Neo4j on `bolt://localhost:7687`.

## GraphQL

Public: `requestAuthCode`, `verifyAuthCode`, `health`.

Local proofs need `AUTH_DEBUG_CODES=1` so `requestAuthCode` returns `debugCode`. Leave that off on Render. Leave `RESEND_API_KEY` empty until a verified from-address is ready.

Authenticated (Bearer JWT):

- Patient: `syncActivity`, `addGlucose`, `dashboard`, `linkCaregiver`
- Caregiver: `monitoredPatients`, `patientDashboard`

Dashboard analysis is computed on query. It is not stored as a graph node.

After schema changes:

```sh
make gqlgen
```

## Deploy

```sh
make render-push
make render-create
# put RENDER_SERVICE_ID into .deploy.env
make render-deploy
```

On Render, set a **different** `JWT_SECRET` plus Aura `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `NEO4J_DATABASE=neo4j`, and `REDIS_URL`. Health check: `/ping`.
