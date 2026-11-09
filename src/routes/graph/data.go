package graph

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
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
		NodeCount int  `json:"nodeCount"`
		EdgeCount int  `json:"edgeCount"`
		Limit     int  `json:"limit"`
		Truncated bool `json:"truncated"`
	} `json:"meta"`
}

// Data returns the whole graph, capped and stripped. One query: collect the
// nodes, then only the relationships whose endpoints both survived the cap.
func Data(client *neo4jdb.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limit := defaultLimit
		if raw := r.URL.Query().Get("limit"); raw != "" {
			if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 && parsed <= maxLimit {
				limit = parsed
			}
		}

		value, err := client.ExecuteRead(r.Context(), func(tx neo4j.ManagedTransaction) (any, error) {
			res, err := tx.Run(r.Context(), `
				MATCH (n)
				WHERE NOT n:Migration
				WITH n ORDER BY elementId(n) LIMIT $limit
				WITH collect(n) AS nodes
				UNWIND nodes AS a
				OPTIONAL MATCH (a)-[rel]->(b)
				WHERE b IN nodes
				WITH nodes, collect(DISTINCT rel) AS rels
				RETURN nodes, rels
			`, map[string]any{"limit": limit})
			if err != nil {
				return nil, err
			}
			if !res.Next(r.Context()) {
				return nil, res.Err()
			}

			record := res.Record()
			rawNodes, _ := record.Get("nodes")
			rawRels, _ := record.Get("rels")

			return build(rawNodes, rawRels, limit), nil
		})
		if err != nil {
			http.Error(w, fmt.Sprintf(`{"error":%q}`, err.Error()), http.StatusInternalServerError)
			return
		}

		out, _ := value.(payload)
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		writeJSON(w, out)
	}
}

func build(rawNodes, rawRels any, limit int) payload {
	out := payload{Nodes: make([]node, 0), Edges: make([]edge, 0)}
	out.Meta.Limit = limit

	nodeList, _ := rawNodes.([]any)
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

	relList, _ := rawRels.([]any)
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
			props["initials"] = initials(fmt.Sprint(value))
			hidden = append(hidden, key)
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

var _ = context.Background
