import { useEffect, useState } from "react";
import {
	buildManualSocks5URI,
	initialManualSocks5FormState,
	parseSocks5URIToManualSocks5FormState,
	type ManualSocks5FormState,
} from "../../lib/stage1";
import type { ColorMode } from "./theme";
import {
	modalAddButton,
	modalCancelButton,
	modalConfirmButton,
	modalEmptyHint,
	modalErrorBox,
	modalFieldLabel,
	modalPanel,
	modalTagArea,
	modalTagChip,
	modalTitle,
	textInput,
} from "./theme";

export function Socks5Modal({
	isOpen,
	onClose,
	onSubmit,
	colorMode,
}: {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: (form: ManualSocks5FormState) => void;
	colorMode: ColorMode;
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
				className={modalPanel(colorMode)}
				role="dialog"
				aria-modal
				aria-labelledby="b-socks-title"
				onClick={(event) => event.stopPropagation()}
			>
				<h2 id="b-socks-title" className={modalTitle(colorMode)}>
					添加 / 转换 SOCKS5 节点
				</h2>

				{error ? <div className={modalErrorBox()}>{error}</div> : null}

				<div className="flex flex-col gap-1">
					<label className={modalFieldLabel(colorMode)}>名称 *</label>
					<input
						className={textInput(colorMode)}
						value={form.name}
						onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
					/>
				</div>
				<div className="flex gap-4">
					<div className="flex flex-col gap-1 flex-1">
						<label className={modalFieldLabel(colorMode)}>服务器 *</label>
						<input
							className={textInput(colorMode)}
							value={form.server}
							onChange={(event) => setForm((current) => ({ ...current, server: event.target.value }))}
						/>
					</div>
					<div className="flex flex-col gap-1 w-24">
						<label className={modalFieldLabel(colorMode)}>端口 *</label>
						<input
							className={textInput(colorMode)}
							value={form.port}
							onChange={(event) => setForm((current) => ({ ...current, port: event.target.value }))}
						/>
					</div>
				</div>
				<div className="flex gap-4">
					<div className="flex flex-col gap-1 flex-1">
						<label className={modalFieldLabel(colorMode)}>用户名（可选）</label>
						<input
							className={textInput(colorMode)}
							value={form.username}
							onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
						/>
					</div>
					<div className="flex flex-col gap-1 flex-1">
						<label className={modalFieldLabel(colorMode)}>密码（可选）</label>
						<input
							type="text"
							className={textInput(colorMode)}
							value={form.password}
							onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
						/>
					</div>
				</div>
				<div className="flex flex-col gap-1 mt-2">
					<label className={modalFieldLabel(colorMode)}>SOCKS5 URI（可选）</label>
					<input
						className={textInput(colorMode)}
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
					<button type="button" className={modalCancelButton(colorMode)} onClick={onClose}>
						取消
					</button>
					<button type="button" className={modalConfirmButton()} onClick={handleSubmit}>
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
	colorMode,
}: {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: (drafts: string[]) => void;
	colorMode: ColorMode;
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
				className={modalPanel(colorMode)}
				role="dialog"
				aria-modal
				aria-labelledby="b-port-forward-title"
				onClick={(event) => event.stopPropagation()}
			>
				<h2 id="b-port-forward-title" className={modalTitle(colorMode)}>
					添加端口转发服务
				</h2>

				{error ? <div className={modalErrorBox()}>{error}</div> : null}

				<div className="flex flex-col gap-2">
					<label className={modalFieldLabel(colorMode)}>转发信息</label>
					<TagInputDraft tags={draftTags} onChange={setDraftTags} colorMode={colorMode} placeholder="输入 server:port，按 Enter 添加" />
				</div>

				<div className="flex justify-end gap-3 mt-4">
					<button type="button" className={modalCancelButton(colorMode)} onClick={onClose}>
						取消
					</button>
					<button type="button" className={modalConfirmButton()} onClick={handleSubmit}>
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
	colorMode,
	placeholder,
}: {
	tags: string[];
	onChange: (tags: string[]) => void;
	colorMode: ColorMode;
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
					className={`${textInput(colorMode)} flex-1`}
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
				<button type="button" className={modalAddButton(colorMode)} onClick={addTag}>
					添加
				</button>
			</div>
			{tags.length > 0 ? (
				<div className={modalTagArea(colorMode)}>
					{tags.map((item) => (
						<div key={item} className={modalTagChip()}>
							<span className="text-sm font-mono">{item}</span>
							<button type="button" className="hover:text-red-400 transition-colors" onClick={() => onChange(tags.filter((tag) => tag !== item))}>
								×
							</button>
						</div>
					))}
				</div>
			) : (
				<span className={modalEmptyHint(colorMode)}>暂无条目</span>
			)}
		</div>
	);
}
