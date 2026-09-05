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

func TestIsBrowserFamilyUserAgent(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name string
		ua   string
		want bool
	}{
		{name: "empty", ua: "", want: false},
		{name: "whitespace", ua: "  ", want: false},
		{name: "mozilla chrome safari", ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", want: true},
		{name: "chrome product only", ua: "Chrome/120.0.0.0", want: true},
		{name: "firefox", ua: "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0", want: true},
		{name: "clash.meta default", ua: DefaultUserAgent, want: false},
		{name: "clash-verge", ua: "clash-verge/v2.4.5", want: false},
		{name: "mihomo", ua: "mihomo/1.19.0", want: false},
		{name: "ClashX", ua: "ClashX/1.95.1", want: false},
		{name: "curl", ua: "curl/8.5.0", want: false},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			if got := IsBrowserFamilyUserAgent(testCase.ua); got != testCase.want {
				t.Fatalf("IsBrowserFamilyUserAgent(%q) = %v, want %v", testCase.ua, got, testCase.want)
			}
		})
	}
}

func TestForwardableSubscriptionUserAgent(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name string
		ua   string
		want string
	}{
		{name: "empty", ua: "", want: ""},
		{name: "browser mozilla", ua: "Mozilla/5.0", want: ""},
		{name: "browser trimmed", ua: "  Mozilla/5.0 (Macintosh)  ", want: ""},
		{name: "clash.meta forwarded", ua: "clash.meta/1.19.20", want: "clash.meta/1.19.20"},
		{name: "clash-verge trimmed", ua: "  clash-verge/v2.4.5  ", want: "clash-verge/v2.4.5"},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			if got := ForwardableSubscriptionUserAgent(testCase.ua); got != testCase.want {
				t.Fatalf("ForwardableSubscriptionUserAgent(%q) = %q, want %q", testCase.ua, got, testCase.want)
			}
		})
	}
}
