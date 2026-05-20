package engine

import (
	"context"
	"time"

	"github.com/spmt/monitoring/internal/model"
)

// Prober interface to break import cycle. 
// Pipeline uses duck-typing or interface to call the prober.
type Prober interface {
	Probe(ctx context.Context, target model.Website) (Telemetry, error)
}

// Analyzer interface
type Analyzer interface {
	Analyze(telemetry Telemetry) []Signal
}

// Pipeline orchestrates the flow: Probe -> Analyze -> Infer
type Pipeline struct {
	prober    Prober
	analyzers []Analyzer
	inference *InferenceEngine
}

func NewPipeline(p Prober, a []Analyzer, inf *InferenceEngine) *Pipeline {
	return &Pipeline{
		prober:    p,
		analyzers: a,
		inference: inf,
	}
}

// Run executes the diagnostic flow for a given website.
func (pipe *Pipeline) Run(ctx context.Context, target model.Website, nodeHealth NodeHealth) (DiagnosticResult, error) {
	// 1. Gather Facts (Raw Telemetry)
	telemetry, err := pipe.prober.Probe(ctx, target)
	if err != nil {
		// If prober completely fails to execute (e.g. invalid URL format)
		return DiagnosticResult{}, err
	}
	
	// Inject NodeHealth context
	telemetry.NodeHealth = nodeHealth

	// 2. Extract Signals
	var allSignals []Signal
	for _, analyzer := range pipe.analyzers {
		signals := analyzer.Analyze(telemetry)
		allSignals = append(allSignals, signals...)
	}

	// 3. Analyze Correlation & Infer Cause
	conclusion := pipe.inference.Infer(telemetry, allSignals)

	// 4. Return Output
	return DiagnosticResult{
		WebsiteID:  target.ID,
		Timestamp:  time.Now(),
		Telemetry:  telemetry,
		Conclusion: conclusion,
	}, nil
}
