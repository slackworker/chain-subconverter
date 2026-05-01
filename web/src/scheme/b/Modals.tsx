import { useState } from "react";
import type { Stage1Input } from "../../types/api";

export function Socks5Modal({
	isOpen,
	onClose,
	onSubmit
}: {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: (uri: string) => void;
}) {
	const [name, setName] = useState("");
	const [server, setServer] = useState("");
	const [port, setPort] = useState("");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [uri, setUri] = useState("");
	const [error, setError] = useState("");

	if (!isOpen) return null;

	const handleUriChange = (val: string) => {
		setUri(val);
		if (!val.startsWith("socks5://")) return;
		try {
			const withoutPrefix = val.slice(9);
			const atIndex = withoutPrefix.indexOf("@");
			let auth = "";
			let hostPort = withoutPrefix;
			if (atIndex !== -1) {
				auth = withoutPrefix.slice(0, atIndex);
				hostPort = withoutPrefix.slice(atIndex + 1);
			}
			const hashIndex = hostPort.indexOf("#");
			let remarks = "";
			if (hashIndex !== -1) {
				remarks = decodeURIComponent(hostPort.slice(hashIndex + 1));
				hostPort = hostPort.slice(0, hashIndex);
			}

			const portIndex = hostPort.lastIndexOf(":");
			if (portIndex !== -1) {
				setServer(hostPort.slice(0, portIndex));
				setPort(hostPort.slice(portIndex + 1));
			} else {
				setServer(hostPort);
			}

			if (auth) {
				const colonIndex = auth.indexOf(":");
				if (colonIndex !== -1) {
					setUsername(decodeURIComponent(auth.slice(0, colonIndex)));
					setPassword(decodeURIComponent(auth.slice(colonIndex + 1)));
				} else {
					setUsername(decodeURIComponent(auth));
				}
			}

			if (remarks) {
				setName(remarks);
			}
		} catch (e) {
			// ignore parse errors
		}
	};

	const handleSubmit = () => {
		if (!name || !server || !port) {
			setError("名称、服务器和端口为必填项");
			return;
		}
		const portNum = parseInt(port, 10);
		if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
			setError("端口必须是 1-65535 的数字");
			return;
		}
		if ((username && !password) || (!username && password)) {
			setError("用户名和密码必须成对出现");
			return;
		}

		let result = `tg://socks?server=${encodeURIComponent(server)}&port=${encodeURIComponent(port)}&remarks=${encodeURIComponent(name)}`;
		if (username && password) {
			result += `&user=${encodeURIComponent(username)}&pass=${encodeURIComponent(password)}`;
		}
		onSubmit(result);
		setName("");
		setServer("");
		setPort("");
		setUsername("");
		setPassword("");
		setUri("");
		setError("");
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
			<div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl w-[400px] shadow-2xl flex flex-col gap-4">
				<h2 className="text-xl font-semibold text-zinc-100">添加 SOCKS5 节点</h2>
				
				{error && <div className="text-red-400 text-sm bg-red-400/10 p-2 rounded">{error}</div>}

				<div className="flex flex-col gap-1">
					<label className="text-sm text-zinc-400">名称 *</label>
					<input className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200" value={name} onChange={e => setName(e.target.value)} />
				</div>
				<div className="flex gap-4">
					<div className="flex flex-col gap-1 flex-1">
						<label className="text-sm text-zinc-400">服务器 *</label>
						<input className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200" value={server} onChange={e => setServer(e.target.value)} />
					</div>
					<div className="flex flex-col gap-1 w-24">
						<label className="text-sm text-zinc-400">端口 *</label>
						<input className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200" value={port} onChange={e => setPort(e.target.value)} />
					</div>
				</div>
				<div className="flex gap-4">
					<div className="flex flex-col gap-1 flex-1">
						<label className="text-sm text-zinc-400">用户名</label>
						<input className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200" value={username} onChange={e => setUsername(e.target.value)} />
					</div>
					<div className="flex flex-col gap-1 flex-1">
						<label className="text-sm text-zinc-400">密码</label>
						<input type="password" className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200" value={password} onChange={e => setPassword(e.target.value)} />
					</div>
				</div>
				<div className="flex flex-col gap-1 mt-2">
					<label className="text-sm text-zinc-400">或解析 socks5:// 链接</label>
					<input className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200" value={uri} onChange={e => handleUriChange(e.target.value)} placeholder="socks5://..." />
				</div>

				<div className="flex justify-end gap-3 mt-4">
					<button className="px-4 py-2 rounded-lg text-zinc-300 hover:bg-zinc-800 transition-colors" onClick={onClose}>取消</button>
					<button className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors" onClick={handleSubmit}>确认添加</button>
				</div>
			</div>
		</div>
	);
}

export function PortForwardModal({
	isOpen,
	onClose,
	initialItems,
	onSubmit
}: {
	isOpen: boolean;
	onClose: () => void;
	initialItems: string[];
	onSubmit: (items: string[]) => void;
}) {
	const [items, setItems] = useState<string[]>(initialItems);
	const [input, setInput] = useState("");

	if (!isOpen) return null;

	const handleAdd = () => {
		if (input && !items.includes(input)) {
			setItems([...items, input]);
			setInput("");
		}
	};

	const handleRemove = (item: string) => {
		setItems(items.filter(i => i !== item));
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
			<div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl w-[400px] shadow-2xl flex flex-col gap-4">
				<h2 className="text-xl font-semibold text-zinc-100">添加端口转发服务（实验性）</h2>
				
				<div className="flex flex-col gap-1">
					<div className="flex gap-2">
						<input 
							className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 flex-1" 
							value={input} 
							onChange={e => setInput(e.target.value)}
							onKeyDown={e => e.key === 'Enter' && handleAdd()}
							placeholder="server:port" 
						/>
						<button className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg transition-colors" onClick={handleAdd}>添加</button>
					</div>
				</div>

				<div className="flex flex-wrap gap-2 min-h-[60px] p-3 border border-zinc-800/50 rounded-lg bg-zinc-950/50">
					{items.map(item => (
						<div key={item} className="flex items-center gap-2 bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded">
							<span className="text-sm">{item}</span>
							<button className="hover:text-white" onClick={() => handleRemove(item)}>&times;</button>
						</div>
					))}
					{items.length === 0 && <span className="text-zinc-600 text-sm italic">暂无条目</span>}
				</div>

				<div className="flex justify-end gap-3 mt-4">
					<button className="px-4 py-2 rounded-lg text-zinc-300 hover:bg-zinc-800 transition-colors" onClick={onClose}>取消</button>
					<button className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors" onClick={() => onSubmit(items)}>确认</button>
				</div>
			</div>
		</div>
	);
}
