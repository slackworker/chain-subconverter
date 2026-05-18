import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function normalizeBasePath(value: string | undefined): string {
	const trimmedValue = value?.trim() ?? "";
	if (trimmedValue === "" || trimmedValue === "/") {
		return "/";
	}
	const withLeadingSlash = trimmedValue.charAt(0) === "/" ? trimmedValue : `/${trimmedValue}`;
	return withLeadingSlash.charAt(withLeadingSlash.length - 1) === "/" ? withLeadingSlash : `${withLeadingSlash}/`;
}

function parseAdditionalAllowedHosts(value: string | undefined): string[] {
	return (value ?? "")
		.split(",")
		.map((host) => host.trim())
		.filter((host) => host !== "");
}

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, ".", "");
	const apiProxyTarget = env.VITE_CHAIN_SUBCONVERTER_API_PROXY_TARGET?.trim() || "http://localhost:11200";
	const allowedHosts = ["host.docker.internal", ...parseAdditionalAllowedHosts(env.CHAIN_SUBCONVERTER_VITE_ALLOWED_HOSTS)];

	return {
		base: normalizeBasePath(env.VITE_CHAIN_SUBCONVERTER_BASE_PATH),
		plugins: [react()],
		server: {
			port: 5173,
			strictPort: true,
			allowedHosts,
			proxy: {
				"/api": {
					target: apiProxyTarget,
					changeOrigin: true,
				},
			},
		},
		preview: {
			proxy: {
				"/api": {
					target: apiProxyTarget,
					changeOrigin: true,
				},
			},
		},
	};
});