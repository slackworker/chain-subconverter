package api

import (
	"fmt"
	"net/http"
	"net/netip"
	"strings"
)

type requestOriginResolver struct {
	trustedProxyCIDRs []netip.Prefix
}

type requestOrigin struct {
	clientIP string
	scheme   string
	host     string
}

func WithTrustedProxyCIDRs(trustedProxyCIDRs string) HandlerOption {
	return func(handler *Handler) error {
		resolver, err := newRequestOriginResolver(trustedProxyCIDRs)
		if err != nil {
			return err
		}
		handler.requestOrigin = resolver
		return nil
	}
}

func newRequestOriginResolver(trustedProxyCIDRs string) (*requestOriginResolver, error) {
	trimmed := strings.TrimSpace(trustedProxyCIDRs)
	if trimmed == "" {
		return nil, nil
	}

	parts := strings.Split(trimmed, ",")
	prefixes := make([]netip.Prefix, 0, len(parts))
	for _, part := range parts {
		entry := strings.TrimSpace(part)
		if entry == "" {
			continue
		}

		if prefix, err := netip.ParsePrefix(entry); err == nil {
			prefixes = append(prefixes, prefix.Masked())
			continue
		}

		addr, err := netip.ParseAddr(entry)
		if err != nil {
			return nil, fmt.Errorf("parse trusted proxy CIDRs: invalid proxy entry %q", entry)
		}
		addr = addr.Unmap()
		prefixes = append(prefixes, netip.PrefixFrom(addr, addr.BitLen()))
	}

	if len(prefixes) == 0 {
		return nil, nil
	}

	return &requestOriginResolver{trustedProxyCIDRs: prefixes}, nil
}

func (resolver *requestOriginResolver) resolve(request *http.Request) requestOrigin {
	origin := requestOrigin{
		clientIP: clientIPAddress(request.RemoteAddr),
		scheme:   requestScheme(request),
		host:     requestHost(request),
	}
	if resolver == nil {
		return origin
	}

	peerAddr, ok := parseIPAddress(request.RemoteAddr)
	if !ok || !resolver.isTrusted(peerAddr) {
		return origin
	}

	if clientIP := resolver.clientIPFromForwardedFor(request.Header.Get("X-Forwarded-For")); clientIP != "" {
		origin.clientIP = clientIP
	}
	if proto := firstForwardedHeaderValue(request.Header.Get("X-Forwarded-Proto")); proto == "http" || proto == "https" {
		origin.scheme = proto
	}
	if host := firstForwardedHeaderValue(request.Header.Get("X-Forwarded-Host")); host != "" {
		origin.host = host
	}

	return origin
}

func (resolver *requestOriginResolver) clientIPFromForwardedFor(headerValue string) string {
	parts := strings.Split(headerValue, ",")
	addrs := make([]netip.Addr, 0, len(parts))
	for _, part := range parts {
		entry := strings.TrimSpace(part)
		if entry == "" {
			continue
		}

		addr, ok := parseIPAddress(entry)
		if !ok {
			return ""
		}
		addrs = append(addrs, addr)
	}
	if len(addrs) == 0 {
		return ""
	}

	for index := len(addrs) - 1; index >= 0; index-- {
		if !resolver.isTrusted(addrs[index]) {
			return addrs[index].String()
		}
	}

	return addrs[0].String()
}

func (resolver *requestOriginResolver) isTrusted(addr netip.Addr) bool {
	addr = addr.Unmap()
	for _, prefix := range resolver.trustedProxyCIDRs {
		if prefix.Contains(addr) {
			return true
		}
	}
	return false
}

func firstForwardedHeaderValue(headerValue string) string {
	for _, part := range strings.Split(headerValue, ",") {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func requestScheme(request *http.Request) string {
	if request.TLS != nil {
		return "https"
	}
	return "http"
}

func requestHost(request *http.Request) string {
	host := request.Host
	if host == "" {
		return "localhost"
	}
	return host
}

func parseIPAddress(value string) (netip.Addr, bool) {
	trimmed := strings.Trim(strings.TrimSpace(value), "[]")
	if trimmed == "" {
		return netip.Addr{}, false
	}

	if host, _, found := strings.Cut(trimmed, ":"); found && strings.Count(trimmed, ":") == 1 {
		trimmed = host
	}

	addr, err := netip.ParseAddr(trimmed)
	if err != nil {
		return netip.Addr{}, false
	}
	return addr.Unmap(), true
}
