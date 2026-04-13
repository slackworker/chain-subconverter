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

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, ".", "");

	return {
		base: normalizeBasePath(env.VITE_CHAIN_SUBCONVERTER_BASE_PATH),
		plugins: [react()],
		server: {
			port: 5173,
			strictPort: true,
		},
	};
});