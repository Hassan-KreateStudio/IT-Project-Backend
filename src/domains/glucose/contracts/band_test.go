package contracts

import "testing"

func TestGlucoseBandBoundaries(t *testing.T) {
	cases := []struct {
		value float64
		band  string
	}{
		{value: 0, band: "low"},
		{value: 69.9, band: "low"},
		{value: 70, band: "in"},
		{value: 120, band: "in"},
		{value: 180, band: "in"},
		{value: 180.1, band: "high"},
		{value: 250, band: "high"},
	}
	for _, tc := range cases {
		if got := GlucoseBand(tc.value); got != tc.band {
			t.Errorf("GlucoseBand(%v) = %s, want %s", tc.value, got, tc.band)
		}
	}
}
