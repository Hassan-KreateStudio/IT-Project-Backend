package repository

import "testing"

func TestOptionalStepsDistinguishesMissingFromZero(t *testing.T) {
	if optionalSteps(nil) != nil {
		t.Fatal("a missing Steps node must stay missing")
	}
	zero := optionalSteps(int64(0))
	if zero == nil || *zero != 0 {
		t.Fatalf("zero count = %v, want 0", zero)
	}
	counted := optionalSteps(int64(5000))
	if counted == nil || *counted != 5000 {
		t.Fatalf("count = %v, want 5000", counted)
	}
}
