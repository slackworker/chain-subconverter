import type { Config } from "tailwindcss";

export default {
	content: ["./index.html", "./src/**/*.{ts,tsx}"],
	theme: {
		extend: {
			colors: {
				canvas: "var(--color-canvas)",
				surface: "var(--color-surface)",
				panel: "var(--color-panel)",
				line: "var(--color-line)",
				ink: "var(--color-ink)",
				muted: "var(--color-muted)",
				accent: "var(--color-accent)",
				accentSoft: "var(--color-accent-soft)",
				warm: "var(--color-warm)",
				danger: "var(--color-danger)",
				success: "var(--color-success)",
			},
			fontFamily: {
				display: ["system-ui", "sans-serif"],
				body: ["system-ui", "sans-serif"],
				mono: ["ui-monospace", "monospace"],
			},
		},
	},
	plugins: [],
} satisfies Config;