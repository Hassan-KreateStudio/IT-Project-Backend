package graph

import (
	"net/http"
	"testing"
)

func TestSelectPatientDefaultsToTheOnlyPatient(t *testing.T) {
	id, err := selectPatient([]patientRef{{ID: "p1", Email: "a@example.com", Days: 3}}, "")
	if err != nil || id != "p1" {
		t.Fatalf("id %q err %v", id, err)
	}
}

func TestSelectPatientUsesTheOnlyPatientWithDays(t *testing.T) {
	patients := []patientRef{
		{ID: "empty", Email: "empty@example.com", Days: 0},
		{ID: "owner", Email: "owner@example.com", Days: 12},
		{ID: "care-test", Email: "other@example.com", Days: 0},
	}
	id, err := selectPatient(patients, "")
	if err != nil || id != "owner" {
		t.Fatalf("id %q err %v", id, err)
	}
}

func TestSelectPatientRefusesToMixPatients(t *testing.T) {
	patients := []patientRef{
		{ID: "a", Email: "a@example.com", Days: 4},
		{ID: "b", Email: "b@example.com", Days: 9},
	}
	if _, err := selectPatient(patients, ""); err != errMultiplePatients {
		t.Fatalf("err %v", err)
	}
	id, err := selectPatient(patients, "B@example.com")
	if err != nil || id != "b" {
		t.Fatalf("email id %q err %v", id, err)
	}
	id, err = selectPatient(patients, "a")
	if err != nil || id != "a" {
		t.Fatalf("id lookup %q err %v", id, err)
	}
	if _, err := selectPatient(patients, "missing@example.com"); err != errPatientNotFound {
		t.Fatalf("missing err %v", err)
	}
}

func TestAsSliceAcceptsTypedSlices(t *testing.T) {
	if asSlice(nil) != nil {
		t.Fatal("nil")
	}
	got := asSlice([]string{"a", "b"})
	if len(got) != 2 || got[0] != "a" || got[1] != "b" {
		t.Fatalf("%#v", got)
	}
}

func TestUserKeyAcceptsIDOrEmail(t *testing.T) {
	req, err := http.NewRequest(http.MethodGet, "/graph/data?email=owner@example.com", nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := userKey(req); got != "owner@example.com" {
		t.Fatalf("email %q", got)
	}
	req, err = http.NewRequest(http.MethodGet, "/graph/data?user=abc", nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := userKey(req); got != "abc" {
		t.Fatalf("user %q", got)
	}
	req, err = http.NewRequest(http.MethodGet, "/graph/data?userId=from-id", nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := userKey(req); got != "from-id" {
		t.Fatalf("userId %q", got)
	}
}
