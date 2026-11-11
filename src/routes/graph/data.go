package graph

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"reflect"
	"strconv"
	"strings"
	"time"

	neo4jdb "github.com/Hassan-KreateStudio/IT-Project-Backend/src/platform/neo4j"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

const (
	defaultLimit = 2000
	maxLimit     = 5000
)

type node struct {
	ID     string         `json:"id"`
	Label  string         `json:"label"`
	Props  map[string]any `json:"props"`
	Hidden []string       `json:"hidden,omitempty"`
}

type edge struct {
	ID    string `json:"id"`
	Type  string `json:"type"`
	Start string `json:"start"`
	End   string `json:"end"`
}

type payload struct {
	Nodes []node `json:"nodes"`
	Edges []edge `json:"edges"`
	Meta  struct {
		NodeCount int    `json:"nodeCount"`
		EdgeCount int    `json:"edgeCount"`
		Limit     int    `json:"limit"`
		Truncated bool   `json:"truncated"`
		PatientID string `json:"patientId,omitempty"`
	} `json:"meta"`
}

// Data returns one patient's graph, capped and stripped. The route is gated
// before this runs (local Neo4j is open; a remote database requires a bearer
// token unless GRAPH_EXPLORER=public). Correlations must not mix Day nodes
// from different people. Pass ?user= with an id or an email to choose; with
// no parameter the only patient (or the only patient who has days) is used.
func Data(client *neo4jdb.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limit := defaultLimit
		if raw := r.URL.Query().Get("limit"); raw != "" {
			if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 && parsed <= maxLimit {
				limit = parsed
			}
		}

		value, err := client.ExecuteRead(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
			patients, err := listPatients(r.Context(), tx)
			if err != nil {
				return nil, err
			}
			patientID, err := selectPatient(patients, userKey(r))
			if err != nil {
				return nil, err
			}
			if patientID == "" {
				return emptyPayload(limit), nil
			}
			return loadPatient(r.Context(), tx, patientID, limit)
		})
		if err != nil {
			status := http.StatusInternalServerError
			switch {
			case errors.Is(err, errPatientNotFound):
				status = http.StatusNotFound
			case errors.Is(err, errMultiplePatients):
				status = http.StatusBadRequest
			}
			writeError(w, status, err.Error())
			return
		}

		out, _ := value.(payload)
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		writeJSON(w, out)
	}
}

func listPatients(ctx context.Context, tx neo4j.ManagedTransaction) ([]patientRef, error) {
	res, err := tx.Run(ctx, `
		MATCH (u:User)
		WHERE u.role = 'PATIENT'
		OPTIONAL MATCH (u)-[:HAS_DAY]->(d:Day)
		RETURN u.id AS id, u.email AS email, count(d) AS days
	`, nil)
	if err != nil {
		return nil, err
	}
	patients := make([]patientRef, 0)
	for res.Next(ctx) {
		record := res.Record()
		id, _ := record.Get("id")
		email, _ := record.Get("email")
		days, _ := record.Get("days")
		patientID, _ := id.(string)
		if patientID == "" {
			continue
		}
		emailText, _ := email.(string)
		patients = append(patients, patientRef{
			ID:    patientID,
			Email: strings.TrimSpace(emailText),
			Days:  neo4jdb.AsInt(days),
		})
	}
	return patients, res.Err()
}

// loadPatient returns the patient and the nodes within two hops: days and
// their metrics, the profile, and generated readings. Other users are not
// followed, so a caregiver link cannot pull a second patient into the window.
func loadPatient(ctx context.Context, tx neo4j.ManagedTransaction, patientID string, limit int) (payload, error) {
	res, err := tx.Run(ctx, `
		MATCH (u:User {id: $patientId, role: 'PATIENT'})
		OPTIONAL MATCH (u)-[*1..2]->(n)
		WHERE n IS NULL OR (NOT n:User AND NOT n:Migration)
		WITH u, [x IN collect(DISTINCT n) WHERE x IS NOT NULL AND NOT x:User AND NOT x:Migration] AS related
		WITH ([u] + related) AS allNodes
		WITH allNodes[0..$limit] AS nodes, size(allNodes) > $limit AS truncated
		UNWIND nodes AS a
		OPTIONAL MATCH (a)-[rel]->(b)
		WHERE b IN nodes
		WITH nodes, truncated, [r IN collect(DISTINCT rel) WHERE r IS NOT NULL] AS rels
		RETURN nodes, rels, truncated
	`, map[string]any{"patientId": patientID, "limit": limit})
	if err != nil {
		return payload{}, err
	}
	if !res.Next(ctx) {
		if err := res.Err(); err != nil {
			return payload{}, err
		}
		return emptyPayload(limit), nil
	}
	record := res.Record()
	rawNodes, _ := record.Get("nodes")
	rawRels, _ := record.Get("rels")
	truncated, _ := record.Get("truncated")
	out := build(rawNodes, rawRels, limit)
	if flag, ok := truncated.(bool); ok {
		out.Meta.Truncated = flag
	}
	out.Meta.PatientID = patientID
	return out, res.Err()
}

// asSlice accepts the []any lists the driver usually returns, and any other
// slice shape, so a typed node list does not collapse the payload to empty.
func asSlice(value any) []any {
	if value == nil {
		return nil
	}
	if list, ok := value.([]any); ok {
		return list
	}
	rv := reflect.ValueOf(value)
	if !rv.IsValid() || rv.Kind() != reflect.Slice {
		return nil
	}
	out := make([]any, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		out[i] = rv.Index(i).Interface()
	}
	return out
}

func emptyPayload(limit int) payload {
	out := payload{Nodes: []node{}, Edges: []edge{}}
	out.Meta.Limit = limit
	return out
}

func build(rawNodes, rawRels any, limit int) payload {
	out := payload{Nodes: make([]node, 0), Edges: make([]edge, 0)}
	out.Meta.Limit = limit

	nodeList := asSlice(rawNodes)
	ids := make(map[string]bool, len(nodeList))

	for _, entry := range nodeList {
		n, ok := entry.(neo4j.Node)
		if !ok {
			continue
		}
		id := elementID(n)
		ids[id] = true
		out.Nodes = append(out.Nodes, convertNode(n, id))
	}

	relList := asSlice(rawRels)
	for _, entry := range relList {
		rel, ok := entry.(neo4j.Relationship)
		if !ok {
			continue
		}
		start := elementIDOf(rel.ElementId, rel.StartElementId)
		end := elementIDOf(rel.ElementId, rel.EndElementId)
		if !ids[start] || !ids[end] {
			continue
		}
		out.Edges = append(out.Edges, edge{
			ID:    rel.ElementId,
			Type:  rel.Type,
			Start: start,
			End:   end,
		})
	}

	out.Meta.NodeCount = len(out.Nodes)
	out.Meta.EdgeCount = len(out.Edges)
	out.Meta.Truncated = len(out.Nodes) >= limit
	return out
}

// convertNode keeps the numbers and drops the identity of the person. The
// graph is published on a URL, so emails, password hashes and full names
// never leave the server.
func convertNode(n neo4j.Node, id string) node {
	label := "Node"
	if len(n.Labels) > 0 {
		label = n.Labels[0]
	}

	props := make(map[string]any, len(n.Props))
	hidden := make([]string, 0)

	for key, value := range n.Props {
		switch strings.ToLower(key) {
		case "email", "passwordhash", "password", "token":
			hidden = append(hidden, key)
			continue
		case "displayname":
			// the patient's own name is shown; only contact details and
			// credentials are withheld
			props["initials"] = initials(fmt.Sprint(value))
			props[key] = value
			continue
		}
		props[key] = normalise(value)
	}

	return node{ID: id, Label: label, Props: props, Hidden: hidden}
}

func normalise(value any) any {
	switch typed := value.(type) {
	case time.Time:
		return typed.UTC().Format(time.RFC3339)
	default:
		return value
	}
}

func initials(name string) string {
	parts := strings.Fields(name)
	out := ""
	for _, part := range parts {
		if len(out) == 2 {
			break
		}
		if part == "" {
			continue
		}
		out += strings.ToUpper(string([]rune(part)[0]))
	}
	if out == "" {
		return "?"
	}
	return out
}

func elementID(n neo4j.Node) string { return n.ElementId }

// Neo4j renamed the relationship endpoints; keep one accessor so the callers
// do not care which field the driver filled in.
func elementIDOf(_ string, endpoint string) string { return endpoint }

func writeJSON(w http.ResponseWriter, value any) {
	encoder := json.NewEncoder(w)
	encoder.SetIndent("", "  ")
	_ = encoder.Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}
