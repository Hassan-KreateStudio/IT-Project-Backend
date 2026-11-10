package config

import "testing"

func TestResolveCORSDefaultIncludesRenderAndLocalDev(t *testing.T) {
	origins, local := ResolveCORS("", false)
	if !local {
		t.Fatal("expected localhost convenience")
	}
	if len(origins) != 1 || origins[0] != DefaultCORSOrigin {
		t.Fatalf("origins %#v", origins)
	}

	origins, local = ResolveCORS("   ", true)
	if !local || len(origins) != 1 || origins[0] != DefaultCORSOrigin {
		t.Fatalf("blank set: local %v origins %#v", local, origins)
	}
}

func TestResolveCORSExplicitListReplacesDefault(t *testing.T) {
	origins, local := ResolveCORS(" https://app.example , http://localhost:8080, https://app.example ", true)
	if local {
		t.Fatal("explicit list should not also allow every localhost port")
	}
	if len(origins) != 2 || origins[0] != "https://app.example" || origins[1] != "http://localhost:8080" {
		t.Fatalf("origins %#v", origins)
	}
}
