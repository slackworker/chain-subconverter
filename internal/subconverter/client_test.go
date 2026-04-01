package subconverter

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/slackworker/chain-subconverter/internal/config"
)

type fixtureStage1Request struct {
	Stage1Input struct {
		LandingRawText  string `json:"landingRawText"`
		TransitRawText  string `json:"transitRawText"`
		AdvancedOptions struct {
			Emoji          bool   `json:"emoji"`
			UDP            bool   `json:"udp"`
			SkipCertVerify bool   `json:"skipCertVerify"`
			Config         string `json:"config"`
			Include        string `json:"include"`
			Exclude        string `json:"exclude"`
		} `json:"advancedOptions"`
	} `json:"stage1Input"`
}

func TestConvert_HappyPathUsesGoldenRequestShape(t *testing.T) {
	fixtureDir := fixtureDirectory(t)
	stage1Request := readStage1RequestFixture(t)

	expectedLandingURL := mustParseURL(t, readFixture(t, filepath.Join(fixtureDir, "landing-discovery.url.txt")))
	expectedTransitURL := mustParseURL(t, readFixture(t, filepath.Join(fixtureDir, "transit-discovery.url.txt")))
	expectedFullBaseURL := mustParseURL(t, readFixture(t, filepath.Join(fixtureDir, "full-base.url.txt")))

	responses := []string{
		readFixture(t, filepath.Join(fixtureDir, "landing-discovery.yaml")),
		readFixture(t, filepath.Join(fixtureDir, "transit-discovery.yaml")),
		readFixture(t, filepath.Join(fixtureDir, "full-base.yaml")),
	}

	var (
		mu      sync.Mutex
		gotURIs []string
		index   int
	)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		gotURIs = append(gotURIs, r.URL.RequestURI())
		responseBody := responses[index]
		index++
		mu.Unlock()

		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(responseBody))
	}))
	defer server.Close()

	client := newTestClient(t, server.URL+"/sub?", 2*time.Second, 10)
	result, err := client.Convert(context.Background(), toTestRequest(stage1Request))
	if err != nil {
		t.Fatalf("Convert() error = %v", err)
	}

	wantURIs := []string{
		expectedLandingURL.RequestURI(),
		expectedTransitURL.RequestURI(),
		expectedFullBaseURL.RequestURI(),
	}
	if len(gotURIs) != len(wantURIs) {
		t.Fatalf("request count mismatch: got %d want %d", len(gotURIs), len(wantURIs))
	}
	for i := range wantURIs {
		if gotURIs[i] != wantURIs[i] {
			t.Fatalf("request URI %d mismatch:\n got  %s\n want %s", i, gotURIs[i], wantURIs[i])
		}
	}

	if result.LandingDiscovery.RequestURL != server.URL+wantURIs[0] {
		t.Fatalf("landing RequestURL mismatch: got %q want %q", result.LandingDiscovery.RequestURL, server.URL+wantURIs[0])
	}
	if result.TransitDiscovery.RequestURL != server.URL+wantURIs[1] {
		t.Fatalf("transit RequestURL mismatch: got %q want %q", result.TransitDiscovery.RequestURL, server.URL+wantURIs[1])
	}
	if result.FullBase.RequestURL != server.URL+wantURIs[2] {
		t.Fatalf("full-base RequestURL mismatch: got %q want %q", result.FullBase.RequestURL, server.URL+wantURIs[2])
	}
}

func TestConvert_PropagatesOptionalQueryParameters(t *testing.T) {
	var got []*url.URL
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = append(got, r.URL)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("proxies:\n- {name: test, type: ss}\n"))
	}))
	defer server.Close()

	client := newTestClient(t, server.URL+"/sub?", 2*time.Second, 10)
	_, err := client.Convert(context.Background(), Request{
		LandingRawText: "landing",
		TransitRawText: "transit",
		Options: AdvancedOptions{
			Emoji:          true,
			UDP:            true,
			SkipCertVerify: true,
			Config:         "http://config.example/acl.ini",
			Include:        "hk|us",
			Exclude:        "test",
		},
	})
	if err != nil {
		t.Fatalf("Convert() error = %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("request count mismatch: got %d want 3", len(got))
	}

	firstQuery := got[0].Query()
	if firstQuery.Get("skip_cert_verify") != "true" {
		t.Fatalf("skip_cert_verify mismatch: got %q", firstQuery.Get("skip_cert_verify"))
	}
	if firstQuery.Get("config") != "http://config.example/acl.ini" {
		t.Fatalf("config mismatch: got %q", firstQuery.Get("config"))
	}
	if firstQuery.Get("include") != "hk|us" {
		t.Fatalf("include mismatch: got %q", firstQuery.Get("include"))
	}
	if firstQuery.Get("exclude") != "test" {
		t.Fatalf("exclude mismatch: got %q", firstQuery.Get("exclude"))
	}
	if firstQuery.Get("list") != "true" {
		t.Fatalf("landing list mismatch: got %q", firstQuery.Get("list"))
	}
	if got[2].Query().Get("list") != "" {
		t.Fatalf("full-base list should be absent, got %q", got[2].Query().Get("list"))
	}
}

func TestConvert_TimeoutMapsToUnavailable(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(100 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("proxies:\n- {name: test, type: ss}\n"))
	}))
	defer server.Close()

	client := newTestClient(t, server.URL+"/sub?", 20*time.Millisecond, 10)
	_, err := client.Convert(context.Background(), Request{LandingRawText: "landing", TransitRawText: "transit"})
	if !IsUnavailable(err) {
		t.Fatalf("Convert() error mismatch: got %v", err)
	}
}

func TestConvert_RejectsWhenConcurrencyLimitIsReached(t *testing.T) {
	started := make(chan struct{}, 1)
	release := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case started <- struct{}{}:
		default:
		}
		<-release
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("proxies:\n- {name: test, type: ss}\n"))
	}))
	defer server.Close()

	client := newTestClient(t, server.URL+"/sub?", 2*time.Second, 1)

	firstDone := make(chan error, 1)
	go func() {
		_, err := client.Convert(context.Background(), Request{LandingRawText: "landing", TransitRawText: "transit"})
		firstDone <- err
	}()

	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("first request did not start in time")
	}

	_, err := client.Convert(context.Background(), Request{LandingRawText: "landing", TransitRawText: "transit"})
	if !IsUnavailable(err) {
		t.Fatalf("second Convert() error mismatch: got %v", err)
	}

	close(release)
	if err := <-firstDone; err != nil {
		t.Fatalf("first Convert() error = %v", err)
	}
}

func TestConvert_RejectsHTTPFailures(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "upstream unavailable", http.StatusServiceUnavailable)
	}))
	defer server.Close()

	client := newTestClient(t, server.URL+"/sub?", 2*time.Second, 10)
	_, err := client.Convert(context.Background(), Request{LandingRawText: "landing", TransitRawText: "transit"})
	if !IsUnavailable(err) {
		t.Fatalf("Convert() error mismatch: got %v", err)
	}
}

func TestLiveLocalhostSmoke(t *testing.T) {
	if os.Getenv("CHAIN_SUBCONVERTER_SMOKE") != "1" {
		t.Skip("set CHAIN_SUBCONVERTER_SMOKE=1 to run against localhost:25500")
	}

	stage1Request := readStage1RequestFixture(t)
	client := newTestClient(t, "http://localhost:25500/sub?", 15*time.Second, 10)

	result, err := client.Convert(context.Background(), toTestRequest(stage1Request))
	if err != nil {
		t.Fatalf("Convert() error = %v", err)
	}

	if strings.TrimSpace(result.LandingDiscovery.YAML) == "" {
		t.Fatal("landing discovery YAML should not be empty")
	}
	if strings.TrimSpace(result.TransitDiscovery.YAML) == "" {
		t.Fatal("transit discovery YAML should not be empty")
	}
	if strings.TrimSpace(result.FullBase.YAML) == "" {
		t.Fatal("full-base YAML should not be empty")
	}
}

func newTestClient(t *testing.T, baseURL string, timeout time.Duration, maxInFlight int) *Client {
	t.Helper()

	client, err := NewClient(config.Subconverter{
		BaseURL:     baseURL,
		Timeout:     timeout,
		MaxInFlight: maxInFlight,
	})
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}
	return client
}

func readStage1RequestFixture(t *testing.T) fixtureStage1Request {
	t.Helper()

	var request fixtureStage1Request
	data := readFixture(t, filepath.Join(fixtureDirectory(t), "stage1-convert.request.json"))
	if err := json.Unmarshal([]byte(data), &request); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	return request
}

func toTestRequest(request fixtureStage1Request) Request {
	return Request{
		LandingRawText: request.Stage1Input.LandingRawText,
		TransitRawText: request.Stage1Input.TransitRawText,
		Options: AdvancedOptions{
			Emoji:          request.Stage1Input.AdvancedOptions.Emoji,
			UDP:            request.Stage1Input.AdvancedOptions.UDP,
			SkipCertVerify: request.Stage1Input.AdvancedOptions.SkipCertVerify,
			Config:         request.Stage1Input.AdvancedOptions.Config,
			Include:        request.Stage1Input.AdvancedOptions.Include,
			Exclude:        request.Stage1Input.AdvancedOptions.Exclude,
		},
	}
}

func mustParseURL(t *testing.T, rawURL string) *url.URL {
	t.Helper()

	parsedURL, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		t.Fatalf("url.Parse() error = %v", err)
	}
	return parsedURL
}

func fixtureDirectory(t *testing.T) string {
	t.Helper()

	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}

	return filepath.Join(
		filepath.Dir(currentFile),
		"..",
		"..",
		"testdata",
		"subconverter",
		"3pass-ss2022-test-subscription",
	)
}

func readFixture(t *testing.T, path string) string {
	t.Helper()

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("os.ReadFile(%q) error = %v", path, err)
	}
	return strings.ReplaceAll(string(data), "\r\n", "\n")
}
