import { useState } from "react";
import {
	parseSocks5URIToManualSocks5FormState,
	buildManualSocks5URI,
	normalizeForwardRelayItem,
} from "../../lib/stage1";
import { LOCALES, type Locale } from "./locales";
import type { ColorMode } from "../b2/theme";
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
} from "../b2/theme";

export function Socks5Modal({
	isOpen,
	onClose,
	onSubmit,
	locale,
	colorMode,
}: {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: (uri: string) => void;
	locale: Locale;
	colorMode: ColorMode;
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
			<div className={modalPanel(colorMode)} onClick={(e) => e.stopPropagation()}>
				<h2 className={modalTitle(colorMode)}>{copy.addOrConvertSocks5}</h2>

				{error && <div className={modalErrorBox()}>{error}</div>}

				<div className="flex flex-col gap-1">
					<label className={modalFieldLabel(colorMode)}>{copy.name}</label>
					<input className={textInput(colorMode)} value={name} onChange={(e) => setName(e.target.value)} />
				</div>
				<div className="flex gap-4">
					<div className="flex flex-col gap-1 flex-1">
						<label className={modalFieldLabel(colorMode)}>{copy.server}</label>
						<input className={textInput(colorMode)} value={server} onChange={(e) => setServer(e.target.value)} />
					</div>
					<div className="flex flex-col gap-1 w-24">
						<label className={modalFieldLabel(colorMode)}>{copy.port}</label>
						<input className={textInput(colorMode)} value={port} onChange={(e) => setPort(e.target.value)} />
					</div>
				</div>
				<div className="flex gap-4">
					<div className="flex flex-col gap-1 flex-1">
						<label className={modalFieldLabel(colorMode)}>{copy.usernameOptional}</label>
						<input className={textInput(colorMode)} value={username} onChange={(e) => setUsername(e.target.value)} />
					</div>
					<div className="flex flex-col gap-1 flex-1">
						<label className={modalFieldLabel(colorMode)}>{copy.passwordOptional}</label>
						<input
							type="password"
							className={textInput(colorMode)}
							value={password}
							onChange={(e) => setPassword(e.target.value)}
						/>
					</div>
				</div>
				<div className="flex flex-col gap-1 mt-2">
					<label className={modalFieldLabel(colorMode)}>{copy.socks5Uri}</label>
					<input
						className={textInput(colorMode)}
						value={uri}
						onChange={(e) => handleUriChange(e.target.value)}
						onBlur={handleUriBlur}
						placeholder="socks5://..."
					/>
				</div>

				<div className="flex justify-end gap-3 mt-4">
					<button type="button" className={modalCancelButton(colorMode)} onClick={onClose}>
						{copy.cancel}
					</button>
					<button type="button" className={modalConfirmButton()} onClick={handleSubmit}>
						{copy.confirm}
					</button>
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
	colorMode,
}: {
	isOpen: boolean;
	onClose: () => void;
	items: string[];
	onItemsChange: (items: string[]) => void;
	onSubmit: () => void;
	locale: Locale;
	colorMode: ColorMode;
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
		onItemsChange(items.filter((i) => i !== item));
	};

	const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
		if (e.target === e.currentTarget) {
			onClose();
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={handleBackdropClick}>
			<div className={modalPanel(colorMode)} role="dialog" aria-label={copy.addPortForwardTitle} onClick={(e) => e.stopPropagation()}>
				<h2 className={modalTitle(colorMode)}>{copy.addPortForwardTitle}</h2>

				{error && <div className={modalErrorBox()}>{error}</div>}

				<div className="flex flex-col gap-1">
					<div className="flex gap-2">
						<input
							className={`${textInput(colorMode)} flex-1`}
							value={input}
							onChange={(e) => setInput(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && handleAdd()}
							placeholder="输入 server:port ，按 Enter 添加多个"
						/>
						<button type="button" className={modalAddButton(colorMode)} onClick={handleAdd}>
							{copy.addButton}
						</button>
					</div>
				</div>

				<div className={modalTagArea(colorMode)}>
					{items.map((item) => (
						<div key={item} className={modalTagChip()}>
							<span className="text-sm font-mono">{item}</span>
							<button type="button" className="hover:text-red-400 transition-colors" onClick={() => handleRemove(item)}>
								&times;
							</button>
						</div>
					))}
					{items.length === 0 && <span className={modalEmptyHint(colorMode)}>{copy.emptyPortForward}</span>}
				</div>

				<div className="flex justify-end gap-3 mt-4">
					<button type="button" className={modalCancelButton(colorMode)} onClick={onClose}>
						{copy.cancel}
					</button>
					<button type="button" className={modalConfirmButton()} onClick={onSubmit}>
						{copy.confirmButton}
					</button>
				</div>
			</div>
		</div>
	);
}
