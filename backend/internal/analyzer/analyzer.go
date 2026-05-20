package analyzer

import "github.com/spmt/monitoring/internal/engine"

// Analyzer interface represents a module that reads raw telemetry 
// and extracts specific diagnostic signals (symptoms).
type Analyzer interface {
	Analyze(telemetry engine.Telemetry) []engine.Signal
}
