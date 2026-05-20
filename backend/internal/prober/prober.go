package prober

import (
	"context"

	"github.com/spmt/monitoring/internal/engine"
	"github.com/spmt/monitoring/internal/model"
)

// Config holds settings for the probers
type Config struct {
	TimeoutMs int
	UserAgent string
	// You can add Proxy, Custom DNS, etc. here
}

// Prober defines the interface for data gatherers.
// A prober's ONLY job is to execute a network request and return facts (Telemetry).
// It MUST NOT make any assumptions about whether the site is "Online" or "Offline".
type Prober interface {
	// Probe executes the check and populates the Telemetry object.
	// It returns an error ONLY if the prober itself failed to run (e.g., bad config).
	// Network errors (timeout, connection refused) are captured INSIDE the Telemetry object.
	Probe(ctx context.Context, target model.Website) (engine.Telemetry, error)
}
