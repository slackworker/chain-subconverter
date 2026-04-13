/// <reference types="vite/client" />

interface Window {
	__CHAIN_SUBCONVERTER_API_BASE__?: string;
}

interface ImportMetaEnv {
	readonly VITE_CHAIN_SUBCONVERTER_API_BASE?: string;
	readonly VITE_CHAIN_SUBCONVERTER_BASE_PATH?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}