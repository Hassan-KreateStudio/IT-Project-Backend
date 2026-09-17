package neo4jdb

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

func Migrate(ctx context.Context, client *Client, dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return fmt.Errorf("read migrations: %w", err)
	}

	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".cypher") {
			continue
		}
		names = append(names, entry.Name())
	}
	sort.Strings(names)

	for _, name := range names {
		applied, err := isApplied(ctx, client, name)
		if err != nil {
			return err
		}
		if applied {
			continue
		}

		body, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			return fmt.Errorf("read %s: %w", name, err)
		}

		for _, statement := range splitStatements(string(body)) {
			if err := client.RunWrite(ctx, statement, nil); err != nil {
				return fmt.Errorf("migrate %s: %w", name, err)
			}
		}

		if err := client.RunWrite(ctx, `MERGE (m:Migration {id: $id}) SET m.appliedAt = datetime()`, map[string]any{
			"id": name,
		}); err != nil {
			return fmt.Errorf("record %s: %w", name, err)
		}
	}

	return nil
}

func isApplied(ctx context.Context, client *Client, name string) (bool, error) {
	value, err := client.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		res, err := tx.Run(ctx, `MATCH (m:Migration {id: $id}) RETURN m.id AS id`, map[string]any{"id": name})
		if err != nil {
			return false, err
		}
		return res.Next(ctx), res.Err()
	})
	if err != nil {
		return false, err
	}
	applied, _ := value.(bool)
	return applied, nil
}

func splitStatements(body string) []string {
	parts := strings.Split(body, ";")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		stmt := strings.TrimSpace(part)
		if stmt == "" {
			continue
		}
		out = append(out, stmt)
	}
	return out
}
