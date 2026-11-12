package graph

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

// dayFact is one calendar day after the Cypher read: steps and the glucose
// readings in time order. A missing step count or an empty reading list is a
// gap, not a zero.
type dayFact struct {
	Date    string
	Steps   *float64
	Glucose []float64
	Fasting *float64
	Average *float64
}

type bandFinding struct {
	Count   int     `json:"count"`
	Average float64 `json:"average"`
	Over180 int     `json:"over180"`
}

type streakSpan struct {
	Start        string  `json:"start"`
	End          string  `json:"end"`
	Length       int     `json:"length"`
	Average      float64 `json:"average"`
	After        string  `json:"after,omitempty"`
	AfterAverage float64 `json:"afterAverage,omitempty"`
	AfterInRange bool    `json:"afterInRange"`
}

type findings struct {
	Days    int         `json:"days"`
	Low     bandFinding `json:"low"`
	Middle  bandFinding `json:"middle"`
	High    bandFinding `json:"high"`
	Streaks struct {
		Count            int       `json:"count"`
		Longest          int       `json:"longest"`
		LongestStart     string    `json:"longestStart,omitempty"`
		LongestEnd       string    `json:"longestEnd,omitempty"`
		LongestWhen      string    `json:"longestWhen,omitempty"`
		LongestAverage   float64   `json:"longestAverage"`
		AfterAverage     float64   `json:"afterAverage"`
		AfterAllInRange  bool      `json:"afterAllInRange"`
		PositionAverages []float64 `json:"positionAverages"`
	} `json:"streaks"`
	Correlation struct {
		SameDay        float64 `json:"sameDay"`
		NextDay        float64 `json:"nextDay"`
		NextDayFasting float64 `json:"nextDayFasting"`
	} `json:"correlation"`
	NextFasting struct {
		AfterLow    float64 `json:"afterLow"`
		AfterMiddle float64 `json:"afterMiddle"`
		LowCount    int     `json:"lowCount"`
		MiddleCount int     `json:"middleCount"`
	} `json:"nextFasting"`
	NodeCount int `json:"nodeCount"`
	EdgeCount int `json:"edgeCount"`
}

func loadFindings(ctx context.Context, tx neo4j.ManagedTransaction, patientID string) (findings, error) {
	res, err := tx.Run(ctx, `
		MATCH (d:Day {patientId: $patientId})
		OPTIONAL MATCH (d)-[:HAS_STEPS]->(s:Steps)
		CALL {
			WITH d
			OPTIONAL MATCH (d)-[:HAS_GLUCOSE]->(g:GlucoseReading)
			WITH g ORDER BY g.recordedAt
			RETURN [x IN collect(g.value) WHERE x IS NOT NULL] AS glucose
		}
		RETURN d.date AS date, s.count AS steps, glucose
		ORDER BY date
	`, map[string]any{"patientId": patientID})
	if err != nil {
		return findings{}, err
	}
	rows := make([]dayFact, 0)
	for res.Next(ctx) {
		record := res.Record()
		date, _ := record.Get("date")
		steps, _ := record.Get("steps")
		glucose, _ := record.Get("glucose")
		row := dayFact{Date: fmt.Sprint(date)}
		if value, ok := asFloat(steps); ok {
			row.Steps = &value
		}
		for _, item := range asSlice(glucose) {
			if value, ok := asFloat(item); ok {
				row.Glucose = append(row.Glucose, value)
			}
		}
		rows = append(rows, row)
	}
	if err := res.Err(); err != nil {
		return findings{}, err
	}
	return summarise(rows), nil
}

func asFloat(value any) (float64, bool) {
	switch typed := value.(type) {
	case nil:
		return 0, false
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case int:
		return float64(typed), true
	default:
		return 0, false
	}
}

func factsFromRows(rows []dayFact) []dayFact {
	out := make([]dayFact, 0, len(rows))
	for _, row := range rows {
		row.Average = meanPtr(row.Glucose)
		if len(row.Glucose) > 0 {
			v := row.Glucose[0]
			row.Fasting = &v
		}
		out = append(out, row)
	}
	return out
}

// summarise is the lag.py reading of one patient's days, in date order.
// Low is under 5,000 steps, middle is 5,000 through 10,000. A streak is a
// run of three or more low-step days. The day after a streak is the next
// day in that order, which is the NEXT edge when the graph is linked.
func summarise(rows []dayFact) findings {
	days := factsFromRows(rows)
	var out findings
	out.Days = len(days)
	out.Streaks.PositionAverages = []float64{0, 0, 0, 0}
	if len(days) == 0 {
		out.Streaks.AfterAllInRange = true
		return out
	}

	var low, mid, high []dayFact
	for _, day := range days {
		if day.Steps == nil || day.Average == nil {
			continue
		}
		switch band(*day.Steps) {
		case "low":
			low = append(low, day)
		case "mid":
			mid = append(mid, day)
		default:
			high = append(high, day)
		}
	}
	out.Low = bandOf(low)
	out.Middle = bandOf(mid)
	out.High = bandOf(high)

	steps := make([]float64, 0, len(days))
	avgs := make([]float64, 0, len(days))
	for _, day := range days {
		if day.Steps == nil || day.Average == nil {
			continue
		}
		steps = append(steps, *day.Steps)
		avgs = append(avgs, *day.Average)
	}
	out.Correlation.SameDay = pearson(steps, avgs)

	var nextSteps, nextAvg, fastSteps, nextFast []float64
	var fastLow, fastMid []float64
	for i := 0; i < len(days)-1; i++ {
		today, tomorrow := days[i], days[i+1]
		if today.Steps == nil || tomorrow.Average == nil {
			continue
		}
		nextSteps = append(nextSteps, *today.Steps)
		nextAvg = append(nextAvg, *tomorrow.Average)
		if tomorrow.Fasting != nil {
			fastSteps = append(fastSteps, *today.Steps)
			nextFast = append(nextFast, *tomorrow.Fasting)
			switch band(*today.Steps) {
			case "low":
				fastLow = append(fastLow, *tomorrow.Fasting)
			case "mid":
				fastMid = append(fastMid, *tomorrow.Fasting)
			}
		}
	}
	out.Correlation.NextDay = pearson(nextSteps, nextAvg)
	out.Correlation.NextDayFasting = pearson(fastSteps, nextFast)
	out.NextFasting.AfterLow = mean(fastLow)
	out.NextFasting.AfterMiddle = mean(fastMid)
	out.NextFasting.LowCount = len(fastLow)
	out.NextFasting.MiddleCount = len(fastMid)

	type run struct{ i, j int }
	var runs []run
	for i := 0; i < len(days); {
		if days[i].Steps != nil && *days[i].Steps < 5000 {
			j := i
			for j < len(days) && days[j].Steps != nil && *days[j].Steps < 5000 {
				j++
			}
			runs = append(runs, run{i, j})
			i = j
			continue
		}
		i++
	}
	pos := [4][]float64{}
	for _, span := range runs {
		for k := span.i; k < span.j; k++ {
			if days[k].Average == nil {
				continue
			}
			slot := k - span.i
			if slot > 3 {
				slot = 3
			}
			pos[slot] = append(pos[slot], *days[k].Average)
		}
	}
	for i := 0; i < 4; i++ {
		out.Streaks.PositionAverages[i] = mean(pos[i])
	}

	var longest run
	var afters []float64
	allInRange := true
	for _, span := range runs {
		if span.j-span.i < 3 {
			continue
		}
		out.Streaks.Count++
		if span.j-span.i >= longest.j-longest.i {
			longest = span
		}
		if span.j < len(days) && days[span.j].Average != nil {
			afters = append(afters, *days[span.j].Average)
			if *days[span.j].Average > 180 {
				allInRange = false
			}
		}
	}
	out.Streaks.AfterAllInRange = out.Streaks.Count == 0 || allInRange
	out.Streaks.AfterAverage = mean(afters)
	if out.Streaks.Count > 0 {
		out.Streaks.Longest = longest.j - longest.i
		out.Streaks.LongestStart = days[longest.i].Date
		out.Streaks.LongestEnd = days[longest.j-1].Date
		out.Streaks.LongestWhen = dateSpan(days[longest.i].Date, days[longest.j-1].Date)
		var within []float64
		for k := longest.i; k < longest.j; k++ {
			if days[k].Average != nil {
				within = append(within, *days[k].Average)
			}
		}
		out.Streaks.LongestAverage = mean(within)
	}
	return out
}

func band(steps float64) string {
	if steps < 5000 {
		return "low"
	}
	if steps <= 10000 {
		return "mid"
	}
	return "high"
}

func bandOf(days []dayFact) bandFinding {
	var out bandFinding
	out.Count = len(days)
	values := make([]float64, 0, len(days))
	for _, day := range days {
		if day.Average == nil {
			continue
		}
		values = append(values, *day.Average)
		if *day.Average > 180 {
			out.Over180++
		}
	}
	out.Average = mean(values)
	return out
}

func mean(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	sum := 0.0
	for _, value := range values {
		sum += value
	}
	return sum / float64(len(values))
}

func meanPtr(values []float64) *float64 {
	if len(values) == 0 {
		return nil
	}
	value := mean(values)
	return &value
}

func dateSpan(start, end string) string {
	months := []string{"January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"}
	left, errA := time.Parse("2006-01-02", start)
	right, errB := time.Parse("2006-01-02", end)
	if errA != nil || errB != nil {
		return start + "–" + end
	}
	if left.Month() == right.Month() {
		return fmt.Sprintf("%d–%d %s", left.Day(), right.Day(), months[left.Month()-1])
	}
	return fmt.Sprintf("%d %s – %d %s", left.Day(), months[left.Month()-1], right.Day(), months[right.Month()-1])
}

func pearson(xs, ys []float64) float64 {
	n := len(xs)
	if len(ys) < n {
		n = len(ys)
	}
	if n < 3 {
		return math.NaN()
	}
	xs, ys = xs[:n], ys[:n]
	mx, my := mean(xs), mean(ys)
	var num, dx, dy float64
	for i := 0; i < n; i++ {
		a, b := xs[i]-mx, ys[i]-my
		num += a * b
		dx += a * a
		dy += b * b
	}
	if dx < 1e-12 || dy < 1e-12 {
		return math.NaN()
	}
	return num / math.Sqrt(dx*dy)
}
