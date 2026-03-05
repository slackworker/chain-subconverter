import http.server
import requests
import logging
import logging.handlers
import os
import re
from ruamel.yaml import YAML
from ruamel.yaml.compat import StringIO
from http.server import ThreadingHTTPServer # 使用 ThreadingHTTPServer 处理并发请求
from urllib.parse import urlparse, parse_qs, unquote, urlencode # 增加了 urlencode
import mimetypes
import datetime
from datetime import timezone # Add this near your other datetime import
import json

# --- 配置日志开始 ---
LOG_FILE = "logs/server.log"
LOG_DIR = os.path.dirname(LOG_FILE)
if not os.path.exists(LOG_DIR):
    os.makedirs(LOG_DIR)

logger = logging.getLogger(__name__)
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logger.setLevel(LOG_LEVEL)

file_handler = logging.handlers.RotatingFileHandler(
    LOG_FILE, maxBytes=1024*1024, backupCount=2, encoding='utf-8'
)
file_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
logger.addHandler(file_handler)

console_handler = logging.StreamHandler()
console_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
logger.addHandler(console_handler)
# --- 配置日志结束 ---

# --- 全局配置 ---
PORT = int(os.getenv("PORT", 11200))
# 新增：读取SSL验证配置的环境变量
REQUESTS_SSL_VERIFY_CONFIG = os.getenv("REQUESTS_SSL_VERIFY", "true").lower()
# 新增：读取是否显示服务地址配置区块的环境变量
env_value = os.getenv("SHOW_SERVICE_ADDRESS_CONFIG", "false").lower()
SHOW_SERVICE_ADDRESS_CONFIG_ENV = env_value == "true" or env_value == "1"


REGION_KEYWORD_CONFIG = [
    {"id": "HK", "name": "Hong Kong", "keywords": ["HK", "HongKong", "Hong Kong", "香港", "🇭🇰"]},
    {"id": "US", "name": "United States", "keywords": ["US", "USA", "UnitedStates", "United States", "美国", "🇺🇸"]},
    {"id": "JP", "name": "Japan", "keywords": ["JP", "Japan", "日本", "🇯🇵"]},
    {"id": "SG", "name": "Singapore", "keywords": ["SG", "Singapore", "新加坡", "🇸🇬"]},
    {"id": "TW", "name": "Taiwan", "keywords": ["TW", "Taiwan", "台湾", "🇼🇸"]},
    {"id": "KR", "name": "Korea", "keywords": ["KR", "Korea", "韩国", "🇰🇷"]},
]
LANDING_NODE_KEYWORDS = ["Landing", "落地"]

# 匹配 reality-opts 中的 short-id: <未加引号的值>，且值形如 6314e825（含字母 e 的十六进制风格）
# 此类值会被 YAML 解析为科学计数法 (6314×10^825) 导致浮点溢出为 inf，写出时变成 .inf
_SHORT_ID_SCI_NOTATION_PATTERN = re.compile(
    r"(short-id\s*:\s*)([0-9a-fA-F]+e[0-9a-fA-F]+)(\s*[,}\]\r\n]|\s*$)",
    re.MULTILINE
)


def _protect_reality_short_id_from_scientific_notation(yaml_content):
    """在 YAML 解析前，将 short-id 中形如 6314e825 的未加引号标量改为带引号字符串，避免被解析为科学计数法 (inf)。"""
    if isinstance(yaml_content, bytes):
        yaml_content = yaml_content.decode("utf-8", errors="replace")
    def replacer(m):
        prefix, value, suffix = m.group(1), m.group(2), m.group(3)
        return f'{prefix}"{value}"{suffix}'
    return _SHORT_ID_SCI_NOTATION_PATTERN.sub(replacer, yaml_content)


yaml = YAML()
yaml.preserve_quotes = True
yaml.indent(mapping=2, sequence=4, offset=2)
yaml.width = float('inf')
yaml.explicit_start = True
# --- 全局配置结束 ---

# --- 日志辅助函数 ---
def _add_log_entry(logs_list, level, message, an_exception=None):
    timestamp = datetime.datetime.now(timezone.utc).isoformat()
    log_entry = {"timestamp": timestamp, "level": level.upper(), "message": str(message)}
    logs_list.append(log_entry)

    if level.upper() == "ERROR":
        logger.error(message, exc_info=an_exception if an_exception else False)
    elif level.upper() == "WARN":
        logger.warning(message)
    elif level.upper() == "DEBUG":
        logger.debug(message)
    else:
        logger.info(message)

# --- 核心逻辑函数 ---
def apply_node_pairs_to_config(config_object, node_pairs_list):
    logs = [] # Logs specific to this function's execution
    _add_log_entry(logs, "info", f"开始应用 {len(node_pairs_list)} 个节点对到配置中。")

    if not isinstance(config_object, dict):
        _add_log_entry(logs, "error", "无效的配置对象：不是一个字典。")
        return False, config_object, logs

    proxies = config_object.get("proxies")
    proxy_groups = config_object.get("proxy-groups")

    if not isinstance(proxies, list):
        _add_log_entry(logs, "error", "配置对象中缺少有效的 'proxies' 部分。")
        return False, config_object, logs
    if "proxy-groups" in config_object and not isinstance(proxy_groups, list):
        _add_log_entry(logs, "warn", "配置对象中的 'proxy-groups' 部分无效（不是列表），可能会影响组操作。")
        proxy_groups = []

    applied_count = 0
    for landing_name, front_name in node_pairs_list:
        _add_log_entry(logs, "debug", f"尝试应用节点对: 落地='{landing_name}', 前置='{front_name}'.")

        landing_node_found = False
        for proxy_node in proxies:
            if isinstance(proxy_node, dict) and proxy_node.get("name") == landing_name:
                landing_node_found = True
                proxy_node["dialer-proxy"] = front_name
                _add_log_entry(logs, "info", f"成功为落地节点 '{landing_name}' 设置 'dialer-proxy' 为 '{front_name}'.")
                applied_count += 1
                if isinstance(proxy_groups, list):
                    for grp in proxy_groups:
                        if isinstance(grp, dict) and grp.get("name") == front_name:
                            group_proxies_list = grp.get("proxies")
                            if isinstance(group_proxies_list, list) and landing_name in group_proxies_list:
                                try:
                                    group_proxies_list.remove(landing_name)
                                    _add_log_entry(logs, "info", f"已从前置组 '{front_name}' 的节点列表中移除落地节点 '{landing_name}'。")
                                except ValueError:
                                    _add_log_entry(logs, "warn", f"尝试从前置组 '{front_name}' 移除落地节点 '{landing_name}' 时失败 (ValueError)。")
                            break
                break

        if not landing_node_found:
            _add_log_entry(logs, "warn", f"节点对中的落地节点 '{landing_name}' 未在 'proxies' 列表中找到，已跳过此对。")

    if len(node_pairs_list) > 0:
        if applied_count == 0:
            _add_log_entry(logs, "error", "未能应用任何提供的节点对。请检查节点名称是否与订阅中的节点匹配，或查看日志了解详情。")
            return False, config_object, logs
        elif applied_count < len(node_pairs_list):
            failed_count = len(node_pairs_list) - applied_count
            _add_log_entry(logs, "warn", f"节点对应用部分成功：成功 {applied_count} 个，失败 {failed_count} 个 (共 {len(node_pairs_list)} 个)。失败的节点对因无法匹配而被跳过。请核对节点名称或查看日志。")
            return False, config_object, logs
        else:
            _add_log_entry(logs, "info", f"成功应用所有 {applied_count} 个节点对。")
            return True, config_object, logs
    else:
        _add_log_entry(logs, "info", "没有提供节点对进行应用，配置未修改。")
        return True, config_object, logs

def _keyword_match(text_to_search, keyword_to_find):
    if not text_to_search or not keyword_to_find:
        return False
    text_lower = text_to_search.lower()
    keyword_lower = keyword_to_find.lower()
    if re.search(r'[a-zA-Z]', keyword_to_find):
        pattern_str = r'(?<![a-zA-Z])' + re.escape(keyword_lower) + r'(?![a-zA-Z])'
        try:
            if re.search(pattern_str, text_lower):
                return True
        except re.error as e:
            logger.debug(f"Regex error during keyword match for keyword '{keyword_to_find}': {e}")
            pass
    else:
        if keyword_lower in text_lower:
            return True
    return False

def perform_auto_detection(config_object, region_keyword_config, landing_node_keywords_config):
    logs = []
    _add_log_entry(logs, "info", "开始自动节点对检测。")
    suggested_pairs = []
    if not isinstance(config_object, dict):
        _add_log_entry(logs, "error", "无效的配置对象：不是一个字典。")
        return [], logs
    proxies = config_object.get("proxies")
    proxy_groups = config_object.get("proxy-groups")
    if not isinstance(proxies, list):
        _add_log_entry(logs, "error", "配置对象中缺少有效的 'proxies' 列表，无法进行自动检测。")
        return [], logs
    if not isinstance(proxy_groups, list):
        _add_log_entry(logs, "warn", "'proxy-groups' 部分缺失或无效，自动检测前置组的功能将受影响。")
    for proxy_node in proxies:
        if not isinstance(proxy_node, dict):
            _add_log_entry(logs, "debug", f"跳过 'proxies' 中的无效条目: {proxy_node}")
            continue
        proxy_name = proxy_node.get("name")
        if not proxy_name:
            _add_log_entry(logs, "debug", f"跳过 'proxies' 中缺少名称的节点: {proxy_node}")
            continue
        is_landing = False
        for l_kw in landing_node_keywords_config:
            if _keyword_match(proxy_name, l_kw):
                is_landing = True
                break
        if not is_landing:
            _add_log_entry(logs, "debug", f"节点 '{proxy_name}' 未被识别为落地节点，跳过。")
            continue
        _add_log_entry(logs, "info", f"节点 '{proxy_name}' 被识别为潜在的落地节点。开始为其查找前置...")
        matched_region_ids = set()
        for region_def in region_keyword_config:
            for r_kw in region_def.get("keywords", []):
                if _keyword_match(proxy_name, r_kw):
                    matched_region_ids.add(region_def.get("id"))
                    break
        if not matched_region_ids:
            _add_log_entry(logs, "warn", f"落地节点 '{proxy_name}': 未能识别出任何区域。跳过此节点。")
            continue
        if len(matched_region_ids) > 1:
            _add_log_entry(logs, "error", f"落地节点 '{proxy_name}': 识别出多个区域 {list(matched_region_ids)}，区域不明确。跳过此节点。")
            continue
        target_region_id = matched_region_ids.pop()
        _add_log_entry(logs, "info", f"落地节点 '{proxy_name}': 成功识别区域ID为 '{target_region_id}'.")
        target_region_keywords_for_dialer_search = []
        for region_def in region_keyword_config:
            if region_def.get("id") == target_region_id:
                target_region_keywords_for_dialer_search = region_def.get("keywords", [])
                break
        if not target_region_keywords_for_dialer_search:
            _add_log_entry(logs, "error", f"内部错误：区域ID '{target_region_id}' 未找到对应的关键字列表。跳过落地节点 '{proxy_name}'.")
            continue
        found_dialer_name = None
        if isinstance(proxy_groups, list):
            matching_groups = []
            for group in proxy_groups:
                if not isinstance(group, dict): continue
                group_name = group.get("name")
                if not group_name: continue
                for r_kw in target_region_keywords_for_dialer_search:
                    if _keyword_match(group_name, r_kw):
                        matching_groups.append(group_name)
                        break
            if len(matching_groups) == 1:
                found_dialer_name = matching_groups[0]
                _add_log_entry(logs, "info", f"落地节点 '{proxy_name}': 在区域 '{target_region_id}' 找到唯一匹配的前置组: '{found_dialer_name}'.")
            elif len(matching_groups) > 1:
                _add_log_entry(logs, "error", f"落地节点 '{proxy_name}': 在区域 '{target_region_id}' 找到多个匹配的前置组 {matching_groups}，无法自动选择。跳过此节点。")
                continue
            else:
                _add_log_entry(logs, "info", f"落地节点 '{proxy_name}': 在区域 '{target_region_id}' 未找到匹配的前置组。将尝试查找节点。")
        else:
            _add_log_entry(logs, "debug", "跳过查找前置组，因为 'proxy-groups' 缺失或无效。")
        if not found_dialer_name:
            matching_nodes = []
            for candidate_proxy in proxies:
                if not isinstance(candidate_proxy, dict): continue
                candidate_name = candidate_proxy.get("name")
                if not candidate_name or candidate_name == proxy_name:
                    continue
                for r_kw in target_region_keywords_for_dialer_search:
                    if _keyword_match(candidate_name, r_kw):
                        matching_nodes.append(candidate_name)
                        break
            if len(matching_nodes) == 1:
                found_dialer_name = matching_nodes[0]
                _add_log_entry(logs, "info", f"落地节点 '{proxy_name}': 在区域 '{target_region_id}' 找到唯一匹配的前置节点: '{found_dialer_name}'.")
            elif len(matching_nodes) > 1:
                _add_log_entry(logs, "error", f"落地节点 '{proxy_name}': 在区域 '{target_region_id}' 找到多个匹配的前置节点 {matching_nodes}，无法自动选择。跳过此节点。")
                continue
            else:
                 _add_log_entry(logs, "warn", f"落地节点 '{proxy_name}': 在区域 '{target_region_id}' 也未能找到匹配的前置节点。")
        if found_dialer_name:
            suggested_pairs.append({"landing": proxy_name, "front": found_dialer_name})
            _add_log_entry(logs, "info", f"成功为落地节点 '{proxy_name}' 自动配置前置为 '{found_dialer_name}'.")
    _add_log_entry(logs, "info", f"自动节点对检测完成，共找到 {len(suggested_pairs)} 对建议。")
    if not suggested_pairs and len(proxies) > 0:
        _add_log_entry(logs, "warn", "未自动检测到任何可用的节点对。请检查节点命名是否符合预设的关键字规则，或调整关键字配置。")
    return suggested_pairs, logs

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    ALLOWED_EXTENSIONS = {'.html', '.js', '.css', '.ico'}

    def send_json_response(self, data_dict, http_status_code):
        try:
            response_body = json.dumps(data_dict, ensure_ascii=False).encode('utf-8')
            self.send_response(http_status_code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(response_body)))
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.end_headers()
            self.wfile.write(response_body)
        except Exception as e:
            _error_logs_internal = [] # Use a different name to avoid conflict if this function is nested
            _add_log_entry(_error_logs_internal, "error", f"发送JSON响应时发生严重内部错误: {e}", e)
            try:
                fallback_error = {"success": False, "message": "服务器在格式化响应时发生严重错误。", "logs": _error_logs_internal}
                response_body = json.dumps(fallback_error, ensure_ascii=False).encode('utf-8')
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(response_body)))
                self.end_headers()
                self.wfile.write(response_body)
            except:
                self.send_response(500)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.end_headers()
                self.wfile.write(b"Critical server error during response generation.")

    def _get_config_from_remote(self, remote_url, logs_list_ref):
        if not remote_url:
            _add_log_entry(logs_list_ref, "error", "必须提供 'remote_url'。") #
            return None
        try:
            parsed = urlparse(remote_url) #
            if parsed.scheme not in ('http', 'https'): #
                _add_log_entry(logs_list_ref, "error", f"仅支持 http 或 https 协议的远程 URL。") # 修改：移除 remote_url 变量
                return None
            _add_log_entry(logs_list_ref, "warn", f"服务配置为允许从任意 http/https 域名获取订阅。请务必注意相关的安全风险 (如 SSRF)。") #
        except Exception as e:
            _add_log_entry(logs_list_ref, "error", f"解析提供的远程 URL 时发生基本错误: {e}", e) # 修改：移除 remote_url 变量
            return None

        # 根据环境变量确定 verify 参数的值
        ssl_verify_value = True # 默认值
        if REQUESTS_SSL_VERIFY_CONFIG == "false":
            ssl_verify_value = False
            _add_log_entry(logs_list_ref, "warn", "警告：SSL证书验证已禁用 (REQUESTS_SSL_VERIFY=false)。这可能存在安全风险。")
        elif REQUESTS_SSL_VERIFY_CONFIG != "true":
            # 如果不是 "true" 或 "false"，则假定它是一个 CA bundle 文件的路径
            if os.path.exists(REQUESTS_SSL_VERIFY_CONFIG):
                ssl_verify_value = REQUESTS_SSL_VERIFY_CONFIG
                _add_log_entry(logs_list_ref, "info", f"SSL证书验证将使用自定义CA证书包: {REQUESTS_SSL_VERIFY_CONFIG}")
            else:
                _add_log_entry(logs_list_ref, "error", f"自定义CA证书包路径无效: {REQUESTS_SSL_VERIFY_CONFIG}。将回退到默认验证。")
                # ssl_verify_value 保持 True

        try:
            _add_log_entry(logs_list_ref, "info", f"正在请求远程订阅 (URL provided).") #
            headers = {'User-Agent': 'chain-subconverter/1.0'} #
            response = requests.get(remote_url, timeout=15, headers=headers, verify=ssl_verify_value) # 使用 ssl_verify_value
            response.raise_for_status() #
            _add_log_entry(logs_list_ref, "info", f"远程订阅获取成功，状态码: {response.status_code}") #
            config_content = response.content #
            if config_content.startswith(b'\xef\xbb\xbf'): #
                config_content = config_content[3:] #
                _add_log_entry(logs_list_ref, "debug", "已移除UTF-8 BOM。") #
            config_content = _protect_reality_short_id_from_scientific_notation(config_content)
            config_object = yaml.load(config_content) #
            if not isinstance(config_object, dict) or \
               not isinstance(config_object.get("proxies"), list): #
                _add_log_entry(logs_list_ref, "error", "远程YAML格式无效或缺少 'proxies' 列表。") #
                return None
            _add_log_entry(logs_list_ref, "debug", "远程配置解析成功。") #
            return config_object
        except requests.Timeout:
            _add_log_entry(logs_list_ref, "error", f"请求远程订阅超时 (URL provided).") #
            return None
        except requests.RequestException as e:
            _add_log_entry(logs_list_ref, "error", f"请求远程订阅发生错误 (URL provided): {e}", e) #
            return None
        except Exception as e:
            _add_log_entry(logs_list_ref, "error", f"处理远程订阅内容时出错 (URL provided): {e}", e) #
            return None


    def do_POST(self):
        parsed_url = urlparse(self.path)
        request_logs = [] # Renamed to avoid confusion with 'logs' parameter in other functions

        if parsed_url.path == "/api/validate_configuration":
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                if content_length == 0:
                    _add_log_entry(request_logs, "error", "请求体为空。")
                    self.send_json_response({"success": False, "message": "请求体为空。", "logs": request_logs}, 400)
                    return

                post_body = self.rfile.read(content_length)
                _add_log_entry(request_logs, "debug", f"收到的原始POST数据: {post_body[:200]}")
                data = json.loads(post_body.decode('utf-8'))

                remote_url = data.get("remote_url")
                node_pairs_from_request = data.get("node_pairs", [])
                if not isinstance(node_pairs_from_request, list):
                     _add_log_entry(request_logs, "error", "请求中的 'node_pairs' 格式无效，应为列表。")
                     self.send_json_response({"success": False, "message": "请求中的 'node_pairs' 格式无效，应为列表。", "logs": request_logs}, 400)
                     return


                node_pairs_tuples = []
                for pair_dict in node_pairs_from_request:
                    if isinstance(pair_dict, dict) and "landing" in pair_dict and "front" in pair_dict:
                        node_pairs_tuples.append((str(pair_dict["landing"]), str(pair_dict["front"])))
                    else:
                        _add_log_entry(request_logs, "warn", f"提供的节点对 '{pair_dict}' 格式不正确，已跳过。")

                _add_log_entry(request_logs, "info", f"开始验证配置 (URL provided), 节点对数量={len(node_pairs_tuples)}")

                config_object = self._get_config_from_remote(remote_url, request_logs)
                if config_object is None:
                    # _get_config_from_remote already added specific error to request_logs
                    client_message = "无法获取或解析远程配置以进行验证。"
                    if request_logs:
                        # Try to get the last error/warn from _get_config_from_remote
                        reason = next((log_entry['message'] for log_entry in reversed(request_logs) if log_entry['level'] in ['ERROR', 'WARN']), None)
                        if reason:
                            client_message = reason # Use the specific reason as the main message
                    _add_log_entry(request_logs, "error", "远程配置获取/解析失败，终止验证。") # Server-side overall status
                    self.send_json_response({"success": False, "message": client_message, "logs": request_logs}, 400)
                    return

                # config_object is valid, now try to apply pairs
                success, _, apply_logs_from_func = apply_node_pairs_to_config(config_object, node_pairs_tuples)

                if success:
                    request_logs.extend(apply_logs_from_func) # Add apply logs for successful case
                    _add_log_entry(request_logs, "info", "配置验证成功。")
                    self.send_json_response({"success": True, "message": "配置验证成功。", "logs": request_logs}, 200)
                else:
                    # Apply failed, determine the message from apply_logs_from_func
                    client_message = "节点对应用配置失败，详情请查看日志。" # Default
                    if apply_logs_from_func:
                        reason_from_apply = next((log_entry['message'] for log_entry in reversed(apply_logs_from_func) if log_entry['level'] in ['ERROR', 'WARN']), None)
                        if reason_from_apply:
                            client_message = reason_from_apply # This will be like "节点对应用部分成功..."

                    request_logs.extend(apply_logs_from_func) # Add logs from the apply function
                    _add_log_entry(request_logs, "error", "配置验证因节点对应用问题判定为失败。") # Overall server-side status log

                    self.send_json_response({"success": False, "message": client_message, "logs": request_logs}, 400)

            except json.JSONDecodeError as e:
                _add_log_entry(request_logs, "error", f"解析请求体JSON时出错: {e}", e)
                self.send_json_response({"success": False, "message": "请求体JSON格式错误。", "logs": request_logs}, 400)
            except ValueError as e: # For errors like invalid node_pairs format before _get_config_from_remote
                 _add_log_entry(request_logs, "error", f"请求数据处理错误: {e}", e)
                 self.send_json_response({"success": False, "message": f"请求数据错误: {e}", "logs": request_logs}, 400)
            except Exception as e:
                _add_log_entry(request_logs, "error", f"处理 /api/validate_configuration 时发生意外错误: {e}", e)
                self.send_json_response({"success": False, "message": "服务器内部错误。", "logs": request_logs}, 500)
        else:
            self.send_error_response("此路径不支持POST请求。", 405)


    def do_GET(self):
        parsed_url = urlparse(self.path)
        query_params = parse_qs(parsed_url.query)
        request_logs = []

        if parsed_url.path == "/api/auto_detect_pairs":
            remote_url = query_params.get('remote_url', [None])[0]
            _add_log_entry(request_logs, "info", f"收到 /api/auto_detect_pairs 请求 (URL provided).")

            config_object = self._get_config_from_remote(remote_url, request_logs)
            client_message_auto_detect = "无法获取或解析远程配置。"
            if config_object is None:
                if request_logs:
                    reason = next((log_entry['message'] for log_entry in reversed(request_logs) if log_entry['level'] in ['ERROR', 'WARN']), None)
                    if reason:
                        client_message_auto_detect = reason
                self.send_json_response({
                    "success": False,
                    "message": client_message_auto_detect,
                    "suggested_pairs": [],
                    "logs": request_logs
                }, 400)
                return

            suggested_pairs, detect_logs = perform_auto_detection(config_object, REGION_KEYWORD_CONFIG, LANDING_NODE_KEYWORDS)
            request_logs.extend(detect_logs)

            success_flag = True if suggested_pairs else False
            final_message = f"自动检测完成，找到 {len(suggested_pairs)} 对。" if success_flag else "自动检测未找到可用节点对。"
            if not success_flag and request_logs:
                relevant_log_msg = next((log_item['message'] for log_item in reversed(detect_logs) if log_item['level'] == 'WARN'), None)
                if relevant_log_msg: # Append warning if detection failed and there's a relevant warning
                    final_message += f" {relevant_log_msg}"
            self.send_json_response({
                "success": success_flag,
                "message": final_message,
                "suggested_pairs": suggested_pairs,
                "logs": request_logs
            }, 200)

        elif parsed_url.path == "/subscription.yaml":
            remote_url = query_params.get('remote_url', [None])[0]
            manual_pairs_str = unquote(query_params.get('manual_pairs', [''])[0])

            node_pairs_list = []
            if manual_pairs_str:
                pairs = manual_pairs_str.split(',')
                for pair_str in pairs:
                    if not pair_str.strip(): continue
                    parts = pair_str.split(':', 1)
                    if len(parts) == 2 and parts[0].strip() and parts[1].strip():
                        node_pairs_list.append((parts[0].strip(), parts[1].strip()))
                    else:
                        _add_log_entry(request_logs, "warn", f"解析 'manual_pairs' 中的 '{pair_str}' 格式不正确，已跳过。")

            _add_log_entry(request_logs, "info", f"收到 /subscription.yaml 请求 (URL provided), manual_pairs='{manual_pairs_str}' (解析后 {len(node_pairs_list)} 对)")

            config_object = self._get_config_from_remote(remote_url, request_logs)
            if config_object is None:
                error_detail = request_logs[-1]['message'] if request_logs and request_logs[-1]['message'] else '未知错误'
                self.send_error_response(f"错误: 无法获取或解析远程配置。详情: {error_detail}", 502)
                return

            success, modified_config, apply_logs_from_func = apply_node_pairs_to_config(config_object, node_pairs_list)
            request_logs.extend(apply_logs_from_func)

            if success:
                try:
                    output = StringIO()
                    yaml.dump(modified_config, output)
                    final_yaml_string = output.getvalue()
                    _add_log_entry(request_logs, "info", "成功生成YAML配置。")
                    self.send_response(200)
                    self.send_header("Content-Type", "text/yaml; charset=utf-8")
                    self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
                    self.send_header("Content-Disposition", f"inline; filename=\"chain_subscription_{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}.yaml\"")
                    self.end_headers()
                    self.wfile.write(final_yaml_string.encode("utf-8"))
                except Exception as e:
                    _add_log_entry(request_logs, "error", f"生成最终YAML时出错: {e}", e)
                    self.send_error_response(f"服务器内部错误：无法生成YAML。详情: {e}", 500)
            else: # success is False from apply_node_pairs_to_config
                client_error_detail = "应用节点对失败。" # Default
                if apply_logs_from_func: # Get specific reason from apply_node_pairs_to_config's logs
                     reason = next((log_entry['message'] for log_entry in reversed(apply_logs_from_func) if log_entry['level'] in ['ERROR', 'WARN']), None)
                     if reason:
                        client_error_detail = reason
                _add_log_entry(request_logs, "error", "应用节点对到配置时失败（/subscription.yaml）。") # Server-side log
                self.send_error_response(f"错误: {client_error_detail}", 400)

        elif parsed_url.path == "/" or parsed_url.path == "/frontend.html":
            self.serve_static_file("frontend.html", "text/html; charset=utf-8")
        elif parsed_url.path == "/script.js":
            self.serve_static_file("script.js", "application/javascript; charset=utf-8")
        elif parsed_url.path == "/favicon.ico":
            self.serve_static_file("favicon.ico", "image/x-icon")
        else:
            self.send_error_response(f"资源未找到: {self.path}", 404)

    def serve_static_file(self, file_name, content_type):
        script_dir = os.path.dirname(os.path.abspath(__file__))
        file_path = os.path.join(script_dir, file_name)
        normalized_script_dir = os.path.normcase(os.path.normpath(script_dir))
        normalized_file_path = os.path.normcase(os.path.normpath(os.path.realpath(file_path)))
        if not normalized_script_dir.endswith(os.sep):
            normalized_script_dir += os.sep
        if not normalized_file_path.startswith(normalized_script_dir):
            logger.warning(f"禁止访问：尝试访问脚本目录之外的文件: {file_path}")
            self.send_error_response(f"禁止访问: {self.path}", 403)
            return
        ext = os.path.splitext(file_path)[1].lower()
        if ext not in self.ALLOWED_EXTENSIONS:
            logger.warning(f"禁止访问：不允许的文件类型 {ext} 对于路径 {file_path}")
            self.send_error_response(f"文件类型 {ext} 不允许访问", 403)
            return
        if not os.path.exists(file_path) or not os.path.isfile(file_path):
            logger.warning(f"静态文件未找到或不是一个文件: {file_path}")
            self.send_error_response(f"资源未找到: {self.path}", 404)
            return
        try:
            with open(file_path, "rb") as f:
                content_to_serve = f.read()

            if file_name == "frontend.html":
                logger.debug(f"Modifying frontend.html to inject SHOW_SERVICE_ADDRESS_CONFIG: {SHOW_SERVICE_ADDRESS_CONFIG_ENV}")
                html_content_str = content_to_serve.decode('utf-8')
                js_config_script = f"<script>window.SHOW_SERVICE_ADDRESS_CONFIG = {str(SHOW_SERVICE_ADDRESS_CONFIG_ENV).lower()};</script>"
                # Insert before closing </head> tag
                insertion_point = html_content_str.find("</head>")
                if insertion_point != -1:
                    html_content_str = html_content_str[:insertion_point] + js_config_script + html_content_str[insertion_point:]
                else:
                    logger.warning("</head> tag not found in frontend.html, config script not injected near head. Trying before body.")
                    insertion_point_body = html_content_str.find("<body")
                    if insertion_point_body != -1: # find opening body tag
                         # find where that tag ends
                        end_of_body_tag = html_content_str.find(">",insertion_point_body)
                        if end_of_body_tag != -1:
                             html_content_str = html_content_str[:end_of_body_tag+1] + js_config_script + html_content_str[end_of_body_tag+1:]
                        else: # fallback if body tag is weirdly formatted
                             html_content_str = js_config_script + html_content_str # prepend
                    else: # ultimate fallback
                        html_content_str = js_config_script + html_content_str # prepend
                content_to_serve = html_content_str.encode('utf-8')


            logger.info(f"正在提供静态文件: {file_path} 类型: {content_type}")
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content_to_serve)))
            if content_type.startswith("text/html") or content_type.startswith("application/javascript"):
                 self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.end_headers()
            self.wfile.write(content_to_serve)
        except Exception as e:
            logger.error(f"读取或提供静态文件 {file_path} 时发生错误: {e}", exc_info=True)
            self.send_error_response(f"提供文件时出错: {e}", 500)

    def send_error_response(self, message, code=500):
        logger.info(f"发送错误响应: code={code}, message='{message}'")
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Content-Length", str(len(message.encode('utf-8'))))
        self.end_headers()
        self.wfile.write(message.encode("utf-8"))

    def log_message(self, format, *args):
        logger.debug(f"HTTP Request: {self.address_string()} {self.requestline} -> Status: {args[0] if args else 'N/A'}")
        return

# --- 主执行 ---
if __name__ == "__main__":
    if not os.path.exists(LOG_DIR):
        try:
            os.makedirs(LOG_DIR)
            logger.info(f"已创建日志目录: {LOG_DIR}")
        except OSError as e:
            logger.error(f"无法创建日志目录 {LOG_DIR}: {e}", exc_info=True)

    logger.info(f"正在启动服务，端口号: {PORT}...")
    logger.info(f"服务地址配置区块显示状态: {'启用' if SHOW_SERVICE_ADDRESS_CONFIG_ENV else '禁用'}")
    script_dir = os.path.dirname(os.path.abspath(__file__))
    logger.info(f"脚本所在目录: {script_dir}")
    logger.info(f"前端文件 frontend.html 预期路径: {os.path.join(script_dir, 'frontend.html')}")
    logger.info(f"前端脚本 script.js 预期路径: {os.path.join(script_dir, 'script.js')}")

    mimetypes.init()

    httpd = ThreadingHTTPServer(("", PORT), CustomHandler)
    logger.info(f"服务已启动于 http://0.0.0.0:{PORT}")
    logger.info("--- Mihomo 链式订阅转换服务已就绪 ---")
    logger.info(f"请通过 http://<您的服务器IP>:{PORT}/ 访问前端配置页面")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        logger.info("服务正在关闭...")
    finally:
        httpd.server_close()
        logger.info("服务已成功关闭。")