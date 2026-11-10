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

`CORS_ALLOWED_ORIGINS` is a comma-separated list of browser origins allowed to call the API. When it is unset, the allow-list is `https://it-project-backend-aldq.onrender.com` plus any `localhost`, `127.0.0.1`, or `::1` origin so local web clients work. Setting the variable replaces that default: include the Render origin again if browsers should still be able to call the deployed API.

The iOS app is native. It does not send an `Origin` header and does not depend on CORS, so this list does not change its API calls. Requests from an origin that is not on the list still reach the server; a browser simply cannot read the response.

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

## Graph explorer

`/graph` and `/graph/data` are scoped to one patient. The data endpoint stays public (no auth) for the single-user demo. Pass `?user=` with that patient's id or email (`userId`, `id`, and `email` are aliases).

With no parameter, a database that has one patient uses that patient. If several patient accounts exist but only one of them has day nodes, that patient is used. If more than one patient has days, the request asks for `user` instead of correlating every patient's days together. Emails are not included in the payload.

## GraphQL

Public: `requestAuthCode`, `verifyAuthCode`, `health`.

Local proofs need `AUTH_DEBUG_CODES=1` so `requestAuthCode` returns `debugCode`. Leave that off on Render. Leave `RESEND_API_KEY` empty until a verified from-address is ready.

Authenticated (Bearer JWT):

- Patient: `syncActivity`, `addGlucose`, `syncProfile`, `dashboard`, `caregivers`
- Caregiver: `linkPatient`, `monitoredPatients`, `patientDashboard`, `stopMonitoring`

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

On Render, set a **different** `JWT_SECRET` plus Aura `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `NEO4J_DATABASE=neo4j`, and `REDIS_URL`. `CORS_ALLOWED_ORIGINS` is optional; leave it unset to keep the default allow-list (this service's origin, plus localhost for development). Health check: `/ping`.

Deploys are image pulls (`make render-deploy`), not a Git push. This repo has no `render.yaml` and no GitHub Actions workflow, so merging to `main` does not by itself deploy.
