package main

import (
	"net"
	"testing"
)

func TestListenHTTPServerUsesIPv4(t *testing.T) {
	listener, err := listenHTTPServer("0.0.0.0:0")
	if err != nil {
		t.Fatalf("listenHTTPServer returned error: %v", err)
	}
	defer listener.Close()

	tcpAddr, ok := listener.Addr().(*net.TCPAddr)
	if !ok {
		t.Fatalf("listener addr type = %T, want *net.TCPAddr", listener.Addr())
	}
	if tcpAddr.IP == nil || tcpAddr.IP.To4() == nil {
		t.Fatalf("listener IP = %v, want IPv4 wildcard or IPv4 address", tcpAddr.IP)
	}
	if tcpAddr.Port == 0 {
		t.Fatal("listener port = 0, want assigned port")
	}
}