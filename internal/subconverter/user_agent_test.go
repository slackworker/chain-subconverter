package subconverter

import "testing"

func TestEffectiveUserAgent(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name     string
		override string
		want     string
	}{
		{name: "empty uses default", override: "", want: DefaultUserAgent},
		{name: "whitespace uses default", override: "  \t  ", want: DefaultUserAgent},
		{name: "override trimmed", override: "  clash-verge/v2.4.5  ", want: "clash-verge/v2.4.5"},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			if got := EffectiveUserAgent(testCase.override); got != testCase.want {
				t.Fatalf("EffectiveUserAgent(%q) = %q, want %q", testCase.override, got, testCase.want)
			}
		})
	}
}
