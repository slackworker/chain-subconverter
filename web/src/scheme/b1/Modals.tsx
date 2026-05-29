import { useState } from "react";
import {
	parseSocks5URIToManualSocks5FormState,
	buildManualSocks5URI,
	normalizeForwardRelayItem,
} from "../../lib/stage1";
import { LOCALES, type Locale } from "./locales";

export function Socks5Modal({
	isOpen,
	onClose,
	onSubmit,
	locale,
}: {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: (uri: string) => void;
	locale: Locale;
}) {
	const [name, setName] = useState("");
	const [server, setServer] = useState("");
	const [port, setPort] = useState("");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [uri, setUri] = useState("");
	const [error, setError] = useState("");

	if (!isOpen) return null;
	const copy = LOCALES[locale];

	const handleUriChange = (val: string) => {
		setUri(val);
	};

	const handleUriBlur = () => {
		const val = uri.trim();
		if (!val) return;
		try {
			const parsed = parseSocks5URIToManualSocks5FormState(val);
			setName(parsed.name);
			setServer(parsed.server);
			setPort(parsed.port);
			setUsername(parsed.username);
			setPassword(parsed.password);
			setError("");
		} catch (e) {
			setError(e instanceof Error ? e.message : copy.socksParseFailed);
		}
	};

	const handleSubmit = () => {
		try {
			const result = buildManualSocks5URI({
				name,
				server,
				port,
				username,
				password,
			});
			onSubmit(result);
			setName("");
			setServer("");
			setPort("");
			setUsername("");
			setPassword("");
			setUri("");
			setError("");
		} catch (e) {
			setError(e instanceof Error ? e.message : copy.socksFormValidationFailed);
		}
	};

	const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
		if (e.target === e.currentTarget) {
			onClose();
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={handleBackdropClick}>
			<div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl w-[400px] shadow-2xl flex flex-col gap-4 text-zinc-300">
				<h2 className="text-xl font-semibold text-zinc-100">{copy.addOrConvertSocks5}</h2>
				
				{error && <div className="text-red-400 text-sm bg-red-400/10 p-2.5 rounded border border-red-500/20">{error}</div>}

				<div className="flex flex-col gap-1">
					<label className="text-sm text-zinc-400">{copy.name}</label>
					<input 
						className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 focus:outline-none focus:border-indigo-500/50" 
						value={name} 
						onChange={e => setName(e.target.value)} 
					/>
				</div>
				<div className="flex gap-4">
					<div className="flex flex-col gap-1 flex-1">
						<label className="text-sm text-zinc-400">{copy.server}</label>
						<input 
							className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 focus:outline-none focus:border-indigo-500/50" 
							value={server} 
							onChange={e => setServer(e.target.value)} 
						/>
					</div>
					<div className="flex flex-col gap-1 w-24">
						<label className="text-sm text-zinc-400">{copy.port}</label>
						<input 
							className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 focus:outline-none focus:border-indigo-500/50" 
							value={port} 
							onChange={e => setPort(e.target.value)} 
						/>
					</div>
				</div>
				<div className="flex gap-4">
					<div className="flex flex-col gap-1 flex-1">
						<label className="text-sm text-zinc-400">{copy.usernameOptional}</label>
						<input 
							className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 focus:outline-none focus:border-indigo-500/50" 
							value={username} 
							onChange={e => setUsername(e.target.value)} 
						/>
					</div>
					<div className="flex flex-col gap-1 flex-1">
						<label className="text-sm text-zinc-400">{copy.passwordOptional}</label>
						<input 
							type="password" 
							className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 focus:outline-none focus:border-indigo-500/50" 
							value={password} 
							onChange={e => setPassword(e.target.value)} 
						/>
					</div>
				</div>
				<div className="flex flex-col gap-1 mt-2">
					<label className="text-sm text-zinc-400">{copy.socks5Uri}</label>
					<input 
						className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 focus:outline-none focus:border-indigo-500/50 placeholder-zinc-700" 
						value={uri} 
						onChange={e => handleUriChange(e.target.value)} 
						onBlur={handleUriBlur}
						placeholder="socks5://..." 
					/>
				</div>

				<div className="flex justify-end gap-3 mt-4">
					<button className="px-4 py-2 rounded-lg text-zinc-300 hover:bg-zinc-800 transition-colors" onClick={onClose}>{copy.cancel}</button>
					<button className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors" onClick={handleSubmit}>{copy.confirm}</button>
				</div>
			</div>
		</div>
	);
}

export function PortForwardModal({
	isOpen,
	onClose,
	items,
	onItemsChange,
	onSubmit,
	locale,
}: {
	isOpen: boolean;
	onClose: () => void;
	items: string[];
	onItemsChange: (items: string[]) => void;
	onSubmit: () => void;
	locale: Locale;
}) {
	const [input, setInput] = useState("");
	const [error, setError] = useState("");

	if (!isOpen) return null;
	const copy = LOCALES[locale];

	const handleAdd = () => {
		const val = input.trim();
		if (!val) return;
		try {
			const normalized = normalizeForwardRelayItem(val);
			if (items.includes(normalized)) {
				setError(locale === "zh" ? `端口转发服务 ${normalized} 已存在` : `Port forward service ${normalized} already exists`);
				return;
			}
			onItemsChange([...items, normalized]);
			setInput("");
			setError("");
		} catch (e) {
			setError(e instanceof Error ? e.message : copy.portForwardValidationFailed);
		}
	};

	const handleRemove = (item: string) => {
		onItemsChange(items.filter(i => i !== item));
	};

	const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
		if (e.target === e.currentTarget) {
			onClose();
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm a-modal-backdrop" onClick={handleBackdropClick}>
			<div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl w-[400px] shadow-2xl flex flex-col gap-4 text-zinc-300" role="dialog" aria-label={copy.addPortForwardTitle}>
				<h2 className="text-xl font-semibold text-zinc-100">{copy.addPortForwardTitle}</h2>
				
				{error && <div className="text-red-400 text-sm bg-red-400/10 p-2.5 rounded border border-red-500/20">{error}</div>}

				<div className="flex flex-col gap-1">
					<div className="flex gap-2">
						<input 
							className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 flex-1 focus:outline-none focus:border-indigo-500/50" 
							value={input} 
							onChange={e => setInput(e.target.value)}
							onKeyDown={e => e.key === 'Enter' && handleAdd()}
							placeholder="输入 server:port ，按 Enter 添加多个" 
						/>
						<button className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors" onClick={handleAdd}>{copy.addButton}</button>
					</div>
				</div>

				<div className="flex flex-wrap gap-2 min-h-[60px] p-3 border border-zinc-800/50 rounded-lg bg-zinc-950/50">
					{items.map(item => (
						<div key={item} className="flex items-center gap-2 bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded border border-indigo-500/20">
							<span className="text-sm font-mono">{item}</span>
							<button className="hover:text-white transition-colors" onClick={() => handleRemove(item)}>&times;</button>
						</div>
					))}
					{items.length === 0 && <span className="text-zinc-600 text-sm italic">{copy.emptyPortForward}</span>}
				</div>

				<div className="flex justify-end gap-3 mt-4">
					<button className="px-4 py-2 rounded-lg text-zinc-300 hover:bg-zinc-800 transition-colors" onClick={onClose}>{copy.cancel}</button>
					<button className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors" onClick={onSubmit}>{copy.confirmButton}</button>
				</div>
			</div>
		</div>
	);
}
