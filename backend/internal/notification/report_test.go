package notification

import (
	"testing"
	"time"
)

func TestNextOccurrence(t *testing.T) {
	loc := time.UTC
	tests := []struct {
		name    string
		from    time.Time
		weekday time.Weekday
		hour    int
		want    time.Time
	}{
		{
			name:    "earlier in the week picks this monday",
			from:    time.Date(2026, 6, 10, 9, 0, 0, 0, loc), // Wed
			weekday: time.Monday,
			hour:    8,
			want:    time.Date(2026, 6, 15, 8, 0, 0, 0, loc), // next Mon
		},
		{
			name:    "same day before the hour picks today",
			from:    time.Date(2026, 6, 15, 6, 0, 0, 0, loc), // Mon 06:00
			weekday: time.Monday,
			hour:    8,
			want:    time.Date(2026, 6, 15, 8, 0, 0, 0, loc), // Mon 08:00
		},
		{
			name:    "same day after the hour rolls to next week",
			from:    time.Date(2026, 6, 15, 9, 0, 0, 0, loc), // Mon 09:00
			weekday: time.Monday,
			hour:    8,
			want:    time.Date(2026, 6, 22, 8, 0, 0, 0, loc), // next Mon
		},
		{
			name:    "exactly at the hour rolls forward (strictly after)",
			from:    time.Date(2026, 6, 15, 8, 0, 0, 0, loc),
			weekday: time.Monday,
			hour:    8,
			want:    time.Date(2026, 6, 22, 8, 0, 0, 0, loc),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := nextOccurrence(tt.from, tt.weekday, tt.hour)
			if !got.Equal(tt.want) {
				t.Errorf("nextOccurrence() = %s, want %s", got, tt.want)
			}
		})
	}
}
