package service

import (
	"strings"
	"testing"
)

func TestValidateStage1InputLimits_TotalSize(t *testing.T) {
	tests := []struct {
		name     string
		landing  string
		transit  string
		maxSize  int
		wantErr  bool
		wantCode string
	}{
		{
			name:    "within limit",
			landing: "https://example.com/sub",
			transit: "https://example.com/transit",
			maxSize: 2048,
		},
		{
			name:     "exceeds limit",
			landing:  strings.Repeat("a", 1500),
			transit:  strings.Repeat("b", 600),
			maxSize:  2048,
			wantErr:  true,
			wantCode: "STAGE1_INPUT_TOO_LARGE",
		},
		{
			name:    "zero limit means no check",
			landing: strings.Repeat("a", 5000),
			transit: strings.Repeat("b", 5000),
			maxSize: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateStage1InputLimits(Stage1Input{
				LandingRawText: tt.landing,
				TransitRawText: tt.transit,
			}, InputLimits{MaxInputSize: tt.maxSize})

			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				respErr, ok := AsResponseError(err)
				if !ok {
					t.Fatalf("expected ResponseError, got %T", err)
				}
				if respErr.BlockingError().Code != tt.wantCode {
					t.Fatalf("error code mismatch: got %q want %q", respErr.BlockingError().Code, tt.wantCode)
				}
				if respErr.BlockingError().Scope != "stage1_field" {
					t.Fatalf("scope mismatch: got %q want %q", respErr.BlockingError().Scope, "stage1_field")
				}
			} else {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
			}
		})
	}
}

func TestValidateStage1InputLimits_URLCount(t *testing.T) {
	twentyOneURLs := strings.Repeat("https://example.com/sub\n", 21)
	twentyURLs := strings.Repeat("https://example.com/sub\n", 20)

	tests := []struct {
		name     string
		landing  string
		transit  string
		maxURLs  int
		wantErr  bool
		wantCode string
		wantCtx  string
	}{
		{
			name:    "within url limit",
			landing: twentyURLs,
			transit: twentyURLs,
			maxURLs: 20,
		},
		{
			name:     "landing exceeds url limit",
			landing:  twentyOneURLs,
			transit:  "https://example.com/transit",
			maxURLs:  20,
			wantErr:  true,
			wantCode: "TOO_MANY_UPSTREAM_URLS",
			wantCtx:  "landingRawText",
		},
		{
			name:     "transit exceeds url limit",
			landing:  "https://example.com/landing",
			transit:  twentyOneURLs,
			maxURLs:  20,
			wantErr:  true,
			wantCode: "TOO_MANY_UPSTREAM_URLS",
			wantCtx:  "transitRawText",
		},
		{
			name:     "standalone carriage return is treated as newline",
			landing:  strings.Repeat("https://example.com/sub\r", 21),
			transit:  "",
			maxURLs:  20,
			wantErr:  true,
			wantCode: "TOO_MANY_UPSTREAM_URLS",
			wantCtx:  "landingRawText",
		},
		{
			name:    "zero maxURLs means no check",
			landing: twentyOneURLs,
			transit: twentyOneURLs,
			maxURLs: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateStage1InputLimits(Stage1Input{
				LandingRawText: tt.landing,
				TransitRawText: tt.transit,
			}, InputLimits{MaxURLsPerField: tt.maxURLs})

			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				respErr, ok := AsResponseError(err)
				if !ok {
					t.Fatalf("expected ResponseError, got %T", err)
				}
				if respErr.BlockingError().Code != tt.wantCode {
					t.Fatalf("error code mismatch: got %q want %q", respErr.BlockingError().Code, tt.wantCode)
				}
				ctx := respErr.BlockingError().Context
				if ctx == nil || ctx["field"] != tt.wantCtx {
					t.Fatalf("context field mismatch: got %v want field=%q", ctx, tt.wantCtx)
				}
			} else {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
			}
		})
	}
}

func TestNormalizeSubconverterURLInput(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{name: "empty", input: "", want: ""},
		{name: "single url", input: "https://example.com/sub", want: "https://example.com/sub"},
		{name: "multi url", input: "https://a.com\nhttps://b.com", want: "https://a.com|https://b.com"},
		{name: "blank lines ignored", input: "https://a.com\n\n\nhttps://b.com\n", want: "https://a.com|https://b.com"},
		{name: "whitespace trimmed", input: "  https://a.com  \n  https://b.com  ", want: "https://a.com|https://b.com"},
		{name: "crlf normalized", input: "https://a.com\r\nhttps://b.com", want: "https://a.com|https://b.com"},
		{name: "cr normalized", input: "https://a.com\rhttps://b.com", want: "https://a.com|https://b.com"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := normalizeSubconverterURLInput(tt.input)
			if got != tt.want {
				t.Fatalf("normalizeSubconverterURLInput() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestCountInputLines(t *testing.T) {
	tests := []struct {
		input string
		want  int
	}{
		{"", 0},
		{"a", 1},
		{"a|b", 2},
		{"a|b|c", 3},
	}

	for _, tt := range tests {
		got := countInputLines(tt.input)
		if got != tt.want {
			t.Fatalf("countInputLines(%q) = %d, want %d", tt.input, got, tt.want)
		}
	}
}
