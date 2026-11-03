import json, sys, urllib.request, urllib.error

URL = "http://localhost:8080/graphql"

def gql(query, token=None, variables=None):
    payload = {"query": query}
    if variables: payload["variables"] = variables
    req = urllib.request.Request(URL, data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})},
        method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return json.loads(res.read().decode())
    except urllib.error.HTTPError as exc:
        return json.loads(exc.read().decode())

def codes(data):
    return [((e.get("extensions") or {}).get("code") or e.get("message") or "") for e in (data.get("errors") or [])]

def ensure(email, role, name):
    d = gql("mutation($e:String!,$r:Role!,$n:String){requestAuthCode(email:$e,role:$r,displayName:$n){debugCode}}",
            variables={"e": email, "r": role, "n": name})
    code = d["data"]["requestAuthCode"]["debugCode"]
    d = gql("mutation($e:String!,$c:String!){verifyAuthCode(email:$e,code:$c){token}}",
            variables={"e": email, "c": code})
    return d["data"]["verifyAuthCode"]["token"]

results = []
def check(name, ok, detail):
    results.append((name, ok))
    print(("PASS" if ok else "FAIL"), "-", name, "-", detail if not ok else "")

cg = ensure("cg@example.com", "CAREGIVER", "Care Giver")
pat = ensure("pat@example.com", "PATIENT", "Pat Ient")

def dashboard():
    d = gql('query($id:ID!){patientDashboard(patientId:$id){summary{totalSteps}}}', token=cg, variables={"id": pat_id})
    return d

# patient id
d = gql("{me{id}}", token=pat); pat_id = d["data"]["me"]["id"]

d = gql('mutation($e:String!){requestAccess(patientEmail:$e){id displayName}}', token=cg, variables={"e":"pat@example.com"})
check("caregiver can request", (d.get("data") or {}).get("requestAccess", {}).get("displayName") == "Pat Ient", d)

d = dashboard()
check("pending request grants NO access", "forbidden" in codes(d), d)

d = gql("{caregiverRequests{requestedAt caregiver{id displayName}}}", token=pat)
reqs = (d.get("data") or {}).get("caregiverRequests") or []
check("patient sees the request", len(reqs) == 1 and reqs[0]["caregiver"]["displayName"] == "Care Giver", d)

cg_id = reqs[0]["caregiver"]["id"] if reqs else ""

d = gql('mutation($id:ID!){respondToRequest(caregiverId:$id,accept:false)}', token=pat, variables={"id": cg_id})
check("patient can decline", (d.get("data") or {}).get("respondToRequest") is True, d)

d = gql("{caregiverRequests{caregiver{id}}}", token=pat)
check("decline clears the request", ((d.get("data") or {}).get("caregiverRequests") or []) == [], d)

d = dashboard()
check("declined request still no access", "forbidden" in codes(d), d)

gql('mutation($e:String!){requestAccess(patientEmail:$e){id}}', token=cg, variables={"e":"pat@example.com"})
d = gql('mutation($id:ID!){respondToRequest(caregiverId:$id,accept:true)}', token=pat, variables={"id": cg_id})
check("patient can accept", (d.get("data") or {}).get("respondToRequest") is True, d)

d = dashboard()
check("accepted request grants access", (d.get("data") or {}).get("patientDashboard") is not None, d)

d = gql("{monitoredPatients{id displayName since}}", token=cg)
pats = (d.get("data") or {}).get("monitoredPatients") or []
check("caregiver sees patient with since", len(pats) == 1 and pats[0]["since"] is not None, d)

d = gql('mutation($id:ID!){revokeCaregiver(caregiverId:$id)}', token=pat, variables={"id": cg_id})
check("patient can revoke", (d.get("data") or {}).get("revokeCaregiver") is True, d)

d = dashboard()
check("revoked access is gone", "forbidden" in codes(d), d)

d = gql("{monitoredPatients{id}}", token=cg)
check("caregiver list empty after revoke", ((d.get("data") or {}).get("monitoredPatients") or []) == [], d)

# caregiver cannot answer their own request, patient cannot request
d = gql('mutation($e:String!){requestAccess(patientEmail:$e){id}}', token=pat, variables={"e":"cg@example.com"})
check("patient cannot request access", "forbidden" in codes(d), d)

passed = sum(1 for _, ok in results if ok)
print(f"\nconsent: {passed}/{len(results)} passed")
sys.exit(0 if passed == len(results) else 1)
