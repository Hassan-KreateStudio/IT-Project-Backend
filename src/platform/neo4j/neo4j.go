package neo4jdb

import (
	"context"
	"fmt"
	"time"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

type Client struct {
	driver   neo4j.DriverWithContext
	database string
}

func Connect(ctx context.Context, uri, user, password, database string) (*Client, error) {
	if uri == "" {
		return nil, fmt.Errorf("NEO4J_URI is required")
	}
	if password == "" {
		return nil, fmt.Errorf("NEO4J_PASSWORD is required")
	}
	if database == "" {
		database = "neo4j"
	}

	driver, err := neo4j.NewDriverWithContext(uri, neo4j.BasicAuth(user, password, ""))
	if err != nil {
		return nil, err
	}

	client := &Client{driver: driver, database: database}
	if err := client.Ping(ctx); err != nil {
		_ = driver.Close(ctx)
		return nil, err
	}

	return client, nil
}

func ConnectWithRetry(ctx context.Context, uri, user, password, database string, attempts int, delay time.Duration) (*Client, error) {
	var lastErr error
	for i := 0; i < attempts; i++ {
		client, err := Connect(ctx, uri, user, password, database)
		if err == nil {
			return client, nil
		}
		lastErr = err
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(delay):
		}
	}
	return nil, fmt.Errorf("neo4j connect: %w", lastErr)
}

func (c *Client) Close(ctx context.Context) error {
	return c.driver.Close(ctx)
}

func (c *Client) Ping(ctx context.Context) error {
	return c.driver.VerifyConnectivity(ctx)
}

func (c *Client) ExecuteRead(ctx context.Context, work neo4j.ManagedTransactionWork) (any, error) {
	session := c.driver.NewSession(ctx, neo4j.SessionConfig{
		AccessMode:   neo4j.AccessModeRead,
		DatabaseName: c.database,
	})
	defer session.Close(ctx)
	return session.ExecuteRead(ctx, work)
}

func (c *Client) ExecuteWrite(ctx context.Context, work neo4j.ManagedTransactionWork) (any, error) {
	session := c.driver.NewSession(ctx, neo4j.SessionConfig{
		AccessMode:   neo4j.AccessModeWrite,
		DatabaseName: c.database,
	})
	defer session.Close(ctx)
	return session.ExecuteWrite(ctx, work)
}

func (c *Client) RunWrite(ctx context.Context, cypher string, params map[string]any) error {
	_, err := c.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		_, err := tx.Run(ctx, cypher, params)
		return nil, err
	})
	return err
}
