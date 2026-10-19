package neo4jdb

import (
	"fmt"
	"time"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

func NodeString(node neo4j.Node, key string) string {
	value, _ := node.Props[key].(string)
	return value
}

func NodeInt(node neo4j.Node, key string) int {
	return AsInt(node.Props[key])
}

func NodeFloat(node neo4j.Node, key string) float64 {
	return AsFloat(node.Props[key])
}

func NodeTime(node neo4j.Node, key string) time.Time {
	return AsTime(node.Props[key])
}

func NodeIntPtr(node neo4j.Node, key string) *int {
	value, ok := node.Props[key]
	if !ok || value == nil {
		return nil
	}
	n := AsInt(value)
	return &n
}

func NodeFloatPtr(node neo4j.Node, key string) *float64 {
	value, ok := node.Props[key]
	if !ok || value == nil {
		return nil
	}
	n := AsFloat(value)
	return &n
}

func NodeStringPtr(node neo4j.Node, key string) *string {
	value, ok := node.Props[key].(string)
	if !ok || value == "" {
		return nil
	}
	return &value
}

func AsInt(value any) int {
	switch n := value.(type) {
	case int:
		return n
	case int64:
		return int(n)
	case int32:
		return int(n)
	case float64:
		return int(n)
	default:
		return 0
	}
}

func AsFloat(value any) float64 {
	switch n := value.(type) {
	case float64:
		return n
	case float32:
		return float64(n)
	case int:
		return float64(n)
	case int64:
		return float64(n)
	default:
		return 0
	}
}

func AsTime(value any) time.Time {
	switch t := value.(type) {
	case time.Time:
		return t
	case interface{ Time() time.Time }:
		return t.Time()
	default:
		return time.Time{}
	}
}

func AsNode(value any) (neo4j.Node, error) {
	node, ok := value.(neo4j.Node)
	if !ok {
		return neo4j.Node{}, fmt.Errorf("expected neo4j node")
	}
	return node, nil
}
