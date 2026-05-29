import { useEffect, useState } from "react";
import {
	buildManualSocks5URI,
	initialManualSocks5FormState,
	parseSocks5URIToManualSocks5FormState,
	type ManualSocks5FormState,
} from "../../lib/stage1";

export function Socks5Modal({
	isOpen,
	onClose,
	onSubmit,
}: {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: (form: ManualSocks5FormState) => void;
}) {
	const [form, setForm] = useState<ManualSocks5FormState>(initialManualSocks5FormState);
	const [uri, setUri] = useState("");
	const [error, setError] = useState("");

	useEffect(() => {
		if (!isOpen) {
			setForm(initialManualSocks5FormState);
			setUri("");
			setError("");
		}
	}, [isOpen]);

	if (!isOpen) {
		return null;
	}

	function parseUriOnBlur() {
		const trimmedURI = uri.trim();
		if (trimmedURI === "") {
			setError("");
			return;
		}
		try {
			setForm(parseSocks5URIToManualSocks5FormState(trimmedURI));
			setError("");
		} catch (parseError) {
			setError(parseError instanceof Error ? parseError.message : "SOCKS5 URI 解析失败");
		}
	}

	function handleSubmit() {
		try {
			buildManualSocks5URI(form);
			onSubmit(form);
		} catch (submitError) {
			setError(submitError instanceof Error ? submitError.message : "表单校验失败");
		}
	}

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
			role="presentation"
			onClick={onClose}
		>
			<div
				className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl w-[min(400px,calc(100vw-2rem))] shadow-2xl flex flex-col gap-4"
				role="dialog"
				aria-modal
				aria-labelledby="b-socks-title"
				onClick={(event) => event.stopPropagation()}
			>
				<h2 id="b-socks-title" className="text-xl font-semibold text-zinc-100">
					添加 / 转换 SOCKS5 节点
				</h2>

				{error ? <div className="text-red-400 text-sm bg-red-400/10 p-2 rounded">{error}</div> : null}

				<div className="flex flex-col gap-1">
					<label className="text-sm text-zinc-400">名称 *</label>
					<input
						className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200"
						value={form.name}
						onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
					/>
				</div>
				<div className="flex gap-4">
					<div className="flex flex-col gap-1 flex-1">
						<label className="text-sm text-zinc-400">服务器 *</label>
						<input
							className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200"
							value={form.server}
							onChange={(event) => setForm((current) => ({ ...current, server: event.target.value }))}
						/>
					</div>
					<div className="flex flex-col gap-1 w-24">
						<label className="text-sm text-zinc-400">端口 *</label>
						<input
							className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200"
							value={form.port}
							onChange={(event) => setForm((current) => ({ ...current, port: event.target.value }))}
						/>
					</div>
				</div>
				<div className="flex gap-4">
					<div className="flex flex-col gap-1 flex-1">
						<label className="text-sm text-zinc-400">用户名（可选）</label>
						<input
							className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200"
							value={form.username}
							onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
						/>
					</div>
					<div className="flex flex-col gap-1 flex-1">
						<label className="text-sm text-zinc-400">密码（可选）</label>
						<input
							type="text"
							className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200"
							value={form.password}
							onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
						/>
					</div>
				</div>
				<div className="flex flex-col gap-1 mt-2">
					<label className="text-sm text-zinc-400">SOCKS5 URI（可选）</label>
					<input
						className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200"
						value={uri}
						onChange={(event) => {
							setUri(event.target.value);
							if (error) {
								setError("");
							}
						}}
						onBlur={parseUriOnBlur}
						placeholder="socks5://user:pass@host:1080#name"
						autoComplete="off"
					/>
				</div>

				<div className="flex justify-end gap-3 mt-4">
					<button type="button" className="px-4 py-2 rounded-lg text-zinc-300 hover:bg-zinc-800 transition-colors" onClick={onClose}>
						取消
					</button>
					<button type="button" className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors" onClick={handleSubmit}>
						添加
					</button>
				</div>
			</div>
		</div>
	);
}

export function PortForwardModal({
	isOpen,
	onClose,
	onSubmit,
}: {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: (drafts: string[]) => void;
}) {
	const [draftTags, setDraftTags] = useState<string[]>([]);
	const [error, setError] = useState("");

	useEffect(() => {
		if (isOpen) {
			setDraftTags([]);
			setError("");
		}
	}, [isOpen]);

	if (!isOpen) {
		return null;
	}

	function handleSubmit() {
		try {
			onSubmit(draftTags);
		} catch (submitError) {
			setError(submitError instanceof Error ? submitError.message : "端口转发服务校验失败");
		}
	}

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
			role="presentation"
			onClick={onClose}
		>
			<div
				className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl w-[min(400px,calc(100vw-2rem))] shadow-2xl flex flex-col gap-4"
				role="dialog"
				aria-modal
				aria-labelledby="b-port-forward-title"
				onClick={(event) => event.stopPropagation()}
			>
				<h2 id="b-port-forward-title" className="text-xl font-semibold text-zinc-100">
					添加端口转发服务
				</h2>

				{error ? <div className="text-red-400 text-sm bg-red-400/10 p-2 rounded">{error}</div> : null}

				<div className="flex flex-col gap-2">
					<label className="text-sm text-zinc-400">转发信息</label>
					<TagInputDraft tags={draftTags} onChange={setDraftTags} placeholder="输入 server:port，按 Enter 添加" />
				</div>

				<div className="flex justify-end gap-3 mt-4">
					<button type="button" className="px-4 py-2 rounded-lg text-zinc-300 hover:bg-zinc-800 transition-colors" onClick={onClose}>
						取消
					</button>
					<button type="button" className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors" onClick={handleSubmit}>
						确认
					</button>
				</div>
			</div>
		</div>
	);
}

function TagInputDraft({
	tags,
	onChange,
	placeholder,
}: {
	tags: string[];
	onChange: (tags: string[]) => void;
	placeholder: string;
}) {
	const [input, setInput] = useState("");

	function addTag() {
		const trimmed = input.trim();
		if (!trimmed || tags.includes(trimmed)) {
			setInput("");
			return;
		}
		onChange([...tags, trimmed]);
		setInput("");
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex gap-2">
				<input
					className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 flex-1"
					value={input}
					onChange={(event) => setInput(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							addTag();
						}
					}}
					placeholder={placeholder}
				/>
				<button type="button" className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors" onClick={addTag}>
					添加
				</button>
			</div>
			{tags.length > 0 ? (
				<div className="flex flex-wrap gap-2 min-h-[48px] p-3 border border-zinc-800/50 rounded-lg bg-zinc-950/50">
					{tags.map((item) => (
						<div key={item} className="flex items-center gap-2 bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded">
							<span className="text-sm">{item}</span>
							<button type="button" className="hover:text-white" onClick={() => onChange(tags.filter((tag) => tag !== item))}>
								×
							</button>
						</div>
					))}
				</div>
			) : (
				<span className="text-zinc-600 text-sm italic px-1">暂无条目</span>
			)}
		</div>
	);
}
