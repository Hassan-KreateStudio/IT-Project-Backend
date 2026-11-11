package config

import "testing"

func TestResolveGraphExplorer(t *testing.T) {
	cases := []struct {
		raw, uri, want string
	}{
		{raw: "", uri: "bolt://localhost:7687", want: "public"},
		{raw: "", uri: "bolt://127.0.0.1:7687", want: "public"},
		{raw: "", uri: "bolt://neo4j:7687", want: "public"},
		{raw: "", uri: "neo4j+s://abc.databases.neo4j.io", want: "auth"},
		{raw: "", uri: "bolt://notlocalhost:7687", want: "auth"},
		{raw: "", uri: "", want: "auth"},
		{raw: "public", uri: "neo4j+s://abc.databases.neo4j.io", want: "public"},
		{raw: "auth", uri: "bolt://localhost:7687", want: "auth"},
		{raw: "off", uri: "bolt://localhost:7687", want: "off"},
		{raw: " FALSE ", uri: "bolt://localhost:7687", want: "off"},
	}
	for _, tc := range cases {
		if got := ResolveGraphExplorer(tc.raw, tc.uri); got != tc.want {
			t.Fatalf("ResolveGraphExplorer(%q, %q) = %q, want %q", tc.raw, tc.uri, got, tc.want)
		}
	}
}
