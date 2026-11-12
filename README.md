# IT Project Backend

Go GraphQL API for graph-based analysis of Apple Watch physical activity data and synthetic glucose input, used to support type 2 diabetes self-monitoring.

Synthetic glucose is not a formula and it is not a fitted curve. A day with activity and no reading gets three copied values, flagged `synthetic: true`. Each value is a real ShanghaiT2DM continuous-glucose reading (Zhao et al., *Scientific Data* 10, 35, 2023, https://doi.org/10.1038/s41597-023-01940-7; data file https://doi.org/10.6084/m9.figshare.21600933.v5, CC BY 4.0). The day's step count picks the third of that time-of-day slot to copy: under 5,000 steps copies the high-glucose third, 5,000 through 10,000 the middle third, and over 10,000 the low-glucose third. That link is planted so the analysis has a known pattern to recover. The lookup table is compiled into the binary. Bands, tercile cut-offs, and how to rebuild the table are in `src/domains/glucose/synthetic/README.md`.

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

`/graph/` is the default view: steps, active minutes, intensity, sedentary time, and heart rate around glucose, one dot per day. Open a dot for that day's readings. `/graph/advanced/` is a five-stop tour of the same patient. Its Free explore button opens `/graph/advanced/explore/`, the full relationship graph. Links such as `#variable=`, `#day=`, `#edge=`, `#metric=`, and `#reading=` still open that explorer, including when they are appended to `/graph/`. The tour links back to the default view. Press N on the tour, or add `?notes=1`, for the speaker notes. Both pages load `/graph/data`. The tour's figures come from that response; the default view still computes same-day correlations in the browser.

Consecutive `Day` nodes for one patient are joined by a `NEXT` edge. Syncing activity or glucose rebuilds that patient's chain. `migrations/007_day_next.cypher` rebuilds every patient's chain when the API starts, which is how an existing database (including Render) gets the edges without a separate job.

`/graph/`, `/graph/advanced/`, `/graph/advanced/explore/`, and `/graph/data` are scoped to one patient. Pass `?user=` with that patient's id or email (`userId`, `id`, and `email` are aliases).

Who can open it depends on `GRAPH_EXPLORER`:

| Value | Behaviour |
|---|---|
| unset, Neo4j on localhost / `neo4j` | public, so local development stays as it was |
| unset, remote Neo4j (Aura) | bearer token required, same JWT as GraphQL |
| `public` | no auth |
| `auth` | bearer token required even locally |
| `off` | 404 |

With no `user` parameter, a database that has one patient uses that patient. If several patient accounts exist but only one of them has day nodes, that patient is used. If more than one patient has days, the request asks for `user` instead of correlating every patient's days together. Emails are not included in the payload.

Day hubs and the dashboard use one calendar: the phone's `hk:yyyy-MM-dd` local day, otherwise Africa/Nairobi. A HealthKit day starts at local midnight, which is 21:00 the previous date in UTC, so labelling activity by the UTC date put 8 Nov's steps on 7 Nov while daytime glucose stayed on 8 Nov. The graph correlations pair on that same `Day.date`. `dashboard(offsetMinutes)` still accepts a non-zero viewer offset; zero means Nairobi, not UTC.

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

On Render, set a **different** `JWT_SECRET` plus Aura `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `NEO4J_DATABASE=neo4j`, and `REDIS_URL`. `CORS_ALLOWED_ORIGINS` is optional; leave it unset to keep the default allow-list (this service's origin, plus localhost for development). Leave `GRAPH_EXPLORER` unset so `/graph` and `/graph/advanced/` require a bearer token against Aura, or set `GRAPH_EXPLORER=public` if the browser tool should stay open. Health check: `/ping`.

The ShanghaiT2DM lookup table is embedded in the API binary during `docker build`. `make render-deploy` does not need a new environment variable or a data file on the Render disk.

Deploys are image pulls (`make render-deploy`), not a Git push. This repo has no `render.yaml` and no GitHub Actions workflow, so merging to `main` does not by itself deploy.
