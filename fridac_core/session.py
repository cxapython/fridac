"""
fridac 会话管理模块
处理Frida会话的创建、管理和交互
"""

import sys
import signal
import frida
import readline
import atexit
import os
import time
import re

try:
    import rlcompleter
except ImportError:
    rlcompleter = None

try:
    from rich.console import Console
    from rich.prompt import Prompt
    from rich.panel import Panel
    from rich.table import Table
    from rich.box import ROUNDED
    from rich.progress import Progress, SpinnerColumn, TextColumn
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False

from .logger import log_info, log_success, log_error, log_debug, log_warning, log_exception, get_console, render_structured_event
from .completer import FridacCompleter, get_prompt_toolkit_available
from .script_manager import create_frida_script, get_custom_script_manager
from .task_manager import FridaTaskManager, TaskType, TaskStatus
from .script_templates import ScriptTemplateEngine
from .smalltrace import get_smalltrace_manager, SmallTraceConfig, parse_offset, analyze_trace_file, QBDITraceAnalyzer

# prompt_toolkit 支持(内联提示）
try:
    from .completer import create_prompt_session, PROMPT_TOOLKIT_AVAILABLE
except ImportError:
    PROMPT_TOOLKIT_AVAILABLE = False
    create_prompt_session = None

# 命令历史记录文件（默认路径；实际读取时有回退逻辑）
HISTORY_FILE = os.path.expanduser("~/.fridac_history")
# prompt_toolkit 使用单独的历史文件（格式与 readline 不兼容）
PT_HISTORY_FILE = os.path.expanduser("~/.fridac_pt_history")

def setup_history():
    """设置命令历史与自动补全"""
    # 选择历史文件路径，必要时回退到临时目录
    history_path = None
    try:
        history_path = HISTORY_FILE
    except Exception:
        history_path = None

    # 读取历史：若失败则切换到临时路径
    def _ensure_read_history(path: str) -> str:
        try:
            # 若路径存在但不是文件，视为无效
            if os.path.exists(path) and not os.path.isfile(path):
                raise OSError(22, "Invalid history path (not a regular file)")
            # 若历史文件不存在则创建空文件
            if not os.path.exists(path):
                try:
                    with open(path, 'a', encoding='utf-8'):
                        pass
                except Exception:
                    # 创建失败也允许继续，read_history_file 将再尝试
                    pass
            # 读取历史
            try:
                readline.read_history_file(path)
            except FileNotFoundError:
                # 忽略：无历史文件
                pass
            return path
        except Exception as e:
            # 切换到临时历史文件
            log_warning(f"历史文件读取失败，切换到临时路径: {e}")
            try:
                import tempfile
                alt = os.path.join(tempfile.gettempdir(), "fridac_history")
                if os.path.exists(alt) and not os.path.isfile(alt):
                    # 不应发生，强制改名或忽略，最终重新创建文件
                    try:
                        os.remove(alt)
                    except Exception:
                        pass
                if not os.path.exists(alt):
                    try:
                        with open(alt, 'a', encoding='utf-8'):
                            pass
                    except Exception:
                        pass
                try:
                    readline.read_history_file(alt)
                except FileNotFoundError:
                    pass
                return alt
            except Exception:
                # 最终放弃历史功能（不影响交互）
                return None

    history_path = _ensure_read_history(history_path or HISTORY_FILE)
    # 设置历史条数上限
    try:
        readline.set_history_length(1000)
    except Exception:
        pass
    
    # 设置自动补全
    completer = FridacCompleter()
    readline.set_completer(completer.complete)
    
    # 启用 Tab 补全（兼容 libedit 与 GNU readline）
    if rlcompleter:
        try:
            doc = getattr(readline, "__doc__", "") or ""
            if "libedit" in doc.lower():
                # macOS 默认使用 libedit
                readline.parse_and_bind("bind ^I rl_complete")
            else:
                readline.parse_and_bind("tab: complete")
        except Exception:
            # 兜底：尝试两种绑定，不抛异常
            try:
                readline.parse_and_bind("tab: complete")
            except Exception:
                try:
                    readline.parse_and_bind("bind ^I rl_complete")
                except Exception:
                    pass
    
    # 设置补全分隔符（这些字符不触发分词）
    readline.set_completer_delims(' \t\n`!@#$%^&*()=+[{]}\\|;:,<>?')
    
    def save_history():
        # 优先写回当前使用的历史路径，失败则尝试临时路径
        targets = []
        if history_path:
            targets.append(history_path)
        try:
            import tempfile
            targets.append(os.path.join(tempfile.gettempdir(), "fridac_history"))
        except Exception:
            pass
        for target in targets:
            try:
                # 确保目录存在（通常为用户主目录或 /tmp）
                parent = os.path.dirname(target)
                if parent and not os.path.exists(parent):
                    try:
                        os.makedirs(parent, exist_ok=True)
                    except Exception:
                        pass
                readline.write_history_file(target)
                return
            except Exception:
                continue
        # 若全部失败则忽略
        return
    
    atexit.register(save_history)

class FridacSession:
    """Frida 会话管理类"""
    
    def __init__(self):
        self.session = None
        self.script = None
        self.device = None
        self.target_process = None
        self.running = False
        self.app_name = None  # 当前连接的应用包名
        
        # 任务管理器 (多脚本管理)
        self.task_manager = None
        self.script_engine = None
        
        # 输出重定向
        self.output_file = None
        self.output_handle = None
        self.append_mode = False
    
    def setup_output_redirect(self, output_file, append_mode=False):
        """设置输出重定向到文件"""
        try:
            self.output_file = os.path.abspath(output_file)
            self.append_mode = append_mode
            
            # 创建目录（如果不存在）
            output_dir = os.path.dirname(self.output_file)
            if output_dir and not os.path.exists(output_dir):
                os.makedirs(output_dir, exist_ok=True)
            
            # 打开文件句柄
            mode = 'a' if append_mode else 'w'
            self.output_handle = open(self.output_file, mode, encoding='utf-8', buffering=1)  # 行缓冲
            
            # 写入文件头
            if not append_mode or os.path.getsize(self.output_file) == 0:
                from datetime import datetime
                timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                self.output_handle.write(f"# fridac Hook Output Log\n")
                self.output_handle.write(f"# Started at: {timestamp}\n")
                self.output_handle.write(f"# Mode: {'Append' if append_mode else 'Overwrite'}\n")
                self.output_handle.write(f"{'='*60}\n\n")
                self.output_handle.flush()
            
            log_success(f"✅ 输出重定向已设置: {self.output_file}")
            
        except Exception as e:
            log_error(f"❌ 设置输出重定向失败: {e}")
            self.output_file = None
            self.output_handle = None
    
    def _write_to_output_file(self, content):
        """写入内容到输出文件"""
        if self.output_handle:
            try:
                from datetime import datetime
                timestamp = datetime.now().strftime('%H:%M:%S.%f')[:-3]  # 毫秒精度
                self.output_handle.write(f"[{timestamp}] {content}\n")
                self.output_handle.flush()
            except Exception as e:
                log_error(f"写入输出文件失败: {e}")
    
    def _clean_ansi_codes(self, text):
        """移除 ANSI 颜色代码"""
        import re
        # ANSI 颜色代码正则表达式
        ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
        return ansi_escape.sub('', text)
        
    def on_message(self, message, data):
        """处理来自 Frida 脚本的消息并增强日志展示"""
        console = get_console()
        
        if message['type'] == 'send':
            payload = message['payload']
            # fetch 日志文件处理：识别结构化 fetch 事件
            try:
                if isinstance(payload, dict) and payload.get('type') in ('fetch_start', 'fetch_request'):
                    # 初始化日志文件
                    if not hasattr(self, '_fetch_log_path') or (payload.get('type') == 'fetch_start'):
                        from datetime import datetime
                        ts = datetime.now().strftime('%Y%m%d_%H%M%S')
                        self._fetch_log_path = os.path.abspath(f"fetch_info_{ts}.log")
                        try:
                            with open(self._fetch_log_path, 'a', encoding='utf-8') as f:
                                f.write(f"# fetch log started at {ts}\n")
                                flt = None
                                try:
                                    flt = payload.get('items', {}).get('filter')
                                except Exception:
                                    flt = None
                                if flt:
                                    f.write(f"# filter: {flt}\n")
                        except Exception as e:
                            log_error(f"写入fetch日志文件失败: {e}")
                        if payload.get('type') == 'fetch_start':
                            # 不再继续统一渲染，直接返回
                            return
                    # 写入请求信息
                    try:
                        items = payload.get('items') or {}
                        method = items.get('method') or 'GET'
                        url = items.get('url') or ''
                        headers = items.get('headers') or {}
                        cookies = items.get('cookies')
                        python_code = items.get('python') or ''
                        stack = items.get('stack') or []
                        from datetime import datetime
                        tss = datetime.now().strftime('%H:%M:%S')
                        with open(self._fetch_log_path, 'a', encoding='utf-8') as f:
                            f.write(f"\n[{tss}] {method} {url}\n")
                            f.write(f"headers: {headers}\n")
                            if cookies:
                                f.write(f"cookies: {cookies}\n")
                            f.write(f"python: {python_code}\n")
                            if stack:
                                f.write("stack:\n")
                                for frame in stack:
                                    try:
                                        f.write(f"  {frame}\n")
                                    except Exception:
                                        pass
                    except Exception as e:
                        log_error(f"写入fetch请求失败: {e}")
                    # 同时在控制台结构化展示
                    try:
                        render_structured_event(payload)
                    except Exception:
                        pass
                    return
            except Exception:
                pass

            # 统一处理：若是结构化事件对象则走统一渲染，否则保持原有文本输出
            try:
                if isinstance(payload, dict) and ('type' in payload or 'items' in payload or 'ts' in payload or 'timestamp' in payload):
                    render_structured_event(payload)
                    # 同时写入文件（结构化数据转为字符串）
                    if self.output_handle:
                        self._write_to_output_file(f"STRUCTURED_EVENT: {payload}")
                else:
                    text = payload if isinstance(payload, str) else str(payload)
                    
                    # 写入输出文件
                    if self.output_handle:
                        # 移除 ANSI 颜色代码以便文件阅读
                        clean_text = self._clean_ansi_codes(text)
                        self._write_to_output_file(clean_text)
                    
                    # 控制台显示
                    if RICH_AVAILABLE and console:
                        try:
                            from rich.text import Text
                            style = None
                            if text.startswith('✅') or text.startswith('🟢'):
                                style = 'green'
                            elif text.startswith('❌') or text.startswith('🔴'):
                                style = 'red'
                            elif text.startswith('⚠️') or text.startswith('🟡'):
                                style = 'yellow'
                            elif text.startswith('🔍') or text.startswith('📚') or text.startswith('🌐'):
                                style = 'cyan'
                            elif text.startswith('🔧') or text.startswith('🎯'):
                                style = 'bright_white'
                            console.print(Text(text, style=style or 'white'))
                        except Exception:
                            print(payload)
                    else:
                        print(payload)
            except Exception:
                try:
                    print(payload)
                except Exception:
                    pass
        elif message['type'] == 'error':
            log_error("脚本错误: {}".format(message['description']))
    
    def connect_to_app(self, app_name, spawn_mode=False):
        """连接到目标应用"""
        try:
            # 保存应用包名
            self.app_name = app_name
            
            # 获取 USB 设备并显示进度
            console = get_console()
            
            if RICH_AVAILABLE and console:
                with Progress(
                    SpinnerColumn(),
                    TextColumn("[progress.description]{task.description}"),
                    console=console
                ) as progress:
                    task = progress.add_task("正在连接设备...", total=None)
                    self.device = frida.get_usb_device()
                    progress.update(task, description="✅ 设备连接成功")
            else:
                log_info("正在连接设备...")
                self.device = frida.get_usb_device()
            
            log_success("连接到设备: {}".format(self.device))
            
            if spawn_mode:
                # Spawn 模式
                log_info("启动应用: {}".format(app_name))
                pid = self.device.spawn([app_name])
                self.target_process = self.device.attach(pid)
                self.device.resume(pid)
                log_success("应用已启动 (PID: {})".format(pid))
            else:
                # Attach 模式
                log_info("连接到应用: {}".format(app_name))
                # 先尝试按名称直接 attach，失败则回退到解析 PID 再 attach
                try:
                    self.target_process = self.device.attach(app_name)
                except frida.ProcessNotFoundError:
                    # 回退 1：通过 enumerate_applications() 解析 PID
                    pid = None
                    try:
                        apps = self.device.enumerate_applications()
                        for app in apps:
                            try:
                                identifier = getattr(app, 'identifier', None)
                                name = getattr(app, 'name', None)
                                if identifier == app_name or name == app_name:
                                    pid = getattr(app, 'pid', 0) or None
                                    if pid:
                                        break
                            except Exception:
                                continue
                    except Exception:
                        pass

                    # 回退 2：直接遍历进程，匹配名称（优先精确匹配）
                    if not pid:
                        try:
                            procs = self.device.enumerate_processes()
                            exact = [p for p in procs if getattr(p, 'name', '') == app_name]
                            if exact:
                                pid = exact[0].pid
                            else:
                                candidates = [p for p in procs if app_name in getattr(p, 'name', '')]
                                if candidates:
                                    pid = candidates[0].pid
                        except Exception:
                            pass

                    # 回退 3：短暂轮询等待（某些应用在切前后台或冷启动时进程列表滞后）
                    if not pid:
                        for _ in range(10):  # 最多等待 ~5s
                            try:
                                procs = self.device.enumerate_processes()
                                exact = [p for p in procs if getattr(p, 'name', '') == app_name]
                                if exact:
                                    pid = exact[0].pid
                                    break
                            except Exception:
                                pass
                            time.sleep(0.5)

                    if pid:
                        self.target_process = self.device.attach(pid)
                    else:
                        # 维持与原有异常一致的语义，由外层捕获统一提示
                        raise

                log_success("已连接到运行中的应用")
                
                # 将应用拉到前台
                self._bring_app_to_foreground(app_name)
            
            # 加载并创建脚本
            log_info("正在加载 Frida 脚本...")
            js_script = create_frida_script()
            if not js_script:
                return False
                
            self.script = self.target_process.create_script(js_script)
            self.script.on('message', self.on_message)
            self.script.load()
            
            # 初始化任务管理器
            self._setup_task_manager()
            
            self.running = True
            log_success("Frida 脚本已加载，会话建立成功!")
            return True
            
        except frida.ProcessNotFoundError:
            log_error("找不到进程: {}".format(app_name))
            return False
        except frida.ServerNotRunningError:
            # 自动尝试启动 frida-server（只尝试一次，避免循环）
            if not getattr(self, '_server_start_attempted', False):
                self._server_start_attempted = True
                log_warning("⚠️ frida-server 未运行，正在自动启动...")
                try:
                    from fridac_core.device_manager import ensure_frida_server
                    if ensure_frida_server():
                        log_success("✅ frida-server 已启动，等待就绪...")
                        import time
                        time.sleep(1)  # 等待 frida 客户端检测到服务器
                        # 重新尝试连接
                        return self.connect_to_app(app_name, spawn_mode)
                    else:
                        log_error("❌ 无法启动 frida-server")
                        return False
                except Exception as e:
                    log_error(f"❌ 启动 frida-server 失败: {e}")
                    return False
            else:
                log_error("❌ frida-server 启动后仍无法连接，请检查设备状态")
                return False
        except Exception as e:
            log_error("连接失败: {}".format(e))
            return False
    
    def load_wallbreaker(self):
        """加载 wallbreaker 插件（用于对象搜索）"""
        wallbreaker_path = os.path.expanduser("~/.objection/plugins/wallbreaker/agent/_agent.js")
        if not os.path.exists(wallbreaker_path):
            return None
        
        try:
            with open(wallbreaker_path, 'r', encoding='utf-8') as f:
                wb_script = f.read()
            
            self.wallbreaker_script = self.target_process.create_script(wb_script)
            self.wallbreaker_script.load()
            self.wallbreaker_rpc = self.wallbreaker_script.exports
            log_debug("Wallbreaker 插件已加载")
            return self.wallbreaker_rpc
        except Exception as e:
            log_debug(f"加载 wallbreaker 失败: {e}")
            return None
    
    def _ensure_wallbreaker(self):
        """确保 wallbreaker 已加载（内部方法）"""
        if not hasattr(self, 'wallbreaker_rpc'):
            self.wallbreaker_rpc = None
        if not self.wallbreaker_rpc:
            self.wallbreaker_rpc = self.load_wallbreaker()
        return self.wallbreaker_rpc
    
    def objectsearch(self, class_name, stop=False):
        """
        搜索堆中的对象实例
        优先使用 wallbreaker（如果可用），否则降级到 JavaScript 版本
        """
        self._ensure_wallbreaker()
        
        # 优先使用 wallbreaker
        if self.wallbreaker_rpc:
            try:
                log_info(f"🔍 搜索对象实例 (wallbreaker): {class_name}")
                result = self.wallbreaker_rpc.object_search(class_name, stop)
                for handle, preview in result.items():
                    log_info(f"[{handle}]: {preview}")
                log_success(f"✅ 共找到 {len(result)} 个对象实例")
                return result
            except Exception as e:
                log_warning(f"Wallbreaker 搜索失败，降级到 JS 版本: {e}")
        
        # 降级到 JavaScript 版本
        log_info(f"🔍 搜索对象实例 (JS): {class_name}")
        try:
            js_code = f'objectsearch("{class_name}")'
            result = self.script.exports.eval(js_code)
            return result if result else []
        except Exception as e:
            log_error(f"搜索失败: {e}")
            return []
    
    def objectdump(self, handle, fullname=False):
        """
        查看对象的详细信息（字段值等）
        优先使用 wallbreaker，降级到 JavaScript 版本
        """
        self._ensure_wallbreaker()
        
        # 优先使用 wallbreaker
        if self.wallbreaker_rpc:
            try:
                # wallbreaker 的 objectdump 需要先获取类名，再 dump
                class_name = self.wallbreaker_rpc.object_get_class(str(handle))
                if class_name:
                    log_info(f"📦 对象详情 (wallbreaker): {handle}")
                    # 获取类结构
                    import json
                    class_info = json.loads(self.wallbreaker_rpc.class_use(class_name))
                    
                    # 打印类名
                    log_info(f"📘 Class: {class_info.get('name', class_name)}")
                    
                    # 打印静态字段
                    static_fields = class_info.get('staticFields', {})
                    if static_fields:
                        log_info("  /* static fields */")
                        for name, fields in static_fields.items():
                            for field in fields:
                                field_type = field.get('type', 'unknown')
                                value = self.wallbreaker_rpc.object_get_field(str(handle), name)
                                log_info(f"    {field_type} {name} = {value}")
                    
                    # 打印实例字段
                    instance_fields = class_info.get('instanceFields', {})
                    if instance_fields:
                        log_info("  /* instance fields */")
                        for name, fields in instance_fields.items():
                            for field in fields:
                                field_type = field.get('type', 'unknown')
                                value = self.wallbreaker_rpc.object_get_field(str(handle), name)
                                log_info(f"    {field_type} {name} = {value}")
                    
                    return class_info
            except Exception as e:
                log_warning(f"Wallbreaker dump 失败，降级到 JS 版本: {e}")
        
        # 降级到 JavaScript 版本
        log_info(f"📦 对象详情 (JS): {handle}")
        try:
            fullname_str = 'true' if fullname else 'false'
            js_code = f'objectdump("{handle}", {fullname_str})'
            result = self.script.exports.eval(js_code)
            return result
        except Exception as e:
            log_error(f"Dump 失败: {e}")
            return None
    
    def classdump(self, class_name, fullname=False):
        """
        查看类的结构（方法、字段等）
        优先使用 wallbreaker，降级到 JavaScript 版本
        """
        self._ensure_wallbreaker()
        
        # 优先使用 wallbreaker
        if self.wallbreaker_rpc:
            try:
                import json
                log_info(f"📘 类结构 (wallbreaker): {class_name}")
                class_info = json.loads(self.wallbreaker_rpc.class_use(class_name))
                
                # 格式化输出
                name = class_info.get('name', class_name)
                super_class = class_info.get('super', '')
                
                # 打印包名和类名
                if '.' in name:
                    pkg = name[:name.rindex('.')]
                    short_name = name[name.rindex('.') + 1:]
                    log_info(f"package {pkg};")
                    log_info(f"class {short_name} extends {super_class} {{")
                else:
                    log_info(f"class {name} extends {super_class} {{")
                
                # 静态字段
                static_fields = class_info.get('staticFields', {})
                if static_fields:
                    log_info("  /* static fields */")
                    for name, fields in static_fields.items():
                        for field in fields:
                            log_info(f"    static {field.get('type', '?')} {name};")
                
                # 实例字段
                instance_fields = class_info.get('instanceFields', {})
                if instance_fields:
                    log_info("  /* instance fields */")
                    for name, fields in instance_fields.items():
                        for field in fields:
                            log_info(f"    {field.get('type', '?')} {name};")
                
                # 构造方法
                constructors = class_info.get('constructors', [])
                if constructors:
                    log_info("  /* constructors */")
                    for ctor in constructors:
                        args = ', '.join(ctor.get('arguments', []))
                        log_info(f"    {ctor.get('name', '<init>')}({args});")
                
                # 静态方法
                static_methods = class_info.get('staticMethods', {})
                if static_methods:
                    log_info("  /* static methods */")
                    for name, methods in static_methods.items():
                        for method in methods:
                            args = ', '.join(method.get('arguments', []))
                            ret = method.get('retType', 'void')
                            log_info(f"    static {ret} {name}({args});")
                
                # 实例方法
                instance_methods = class_info.get('instanceMethods', {})
                if instance_methods:
                    log_info("  /* instance methods */")
                    for name, methods in instance_methods.items():
                        for method in methods:
                            args = ', '.join(method.get('arguments', []))
                            ret = method.get('retType', 'void')
                            log_info(f"    {ret} {name}({args});")
                
                log_info("}")
                return class_info
            except Exception as e:
                log_warning(f"Wallbreaker classdump 失败，降级到 JS 版本: {e}")
        
        # 降级到 JavaScript 版本
        log_info(f"📘 类结构 (JS): {class_name}")
        try:
            fullname_str = 'true' if fullname else 'false'
            js_code = f'classdump("{class_name}", {fullname_str})'
            result = self.script.exports.eval(js_code)
            return result
        except Exception as e:
            log_error(f"Classdump 失败: {e}")
            return None
    
    def classsearch(self, pattern):
        """
        搜索匹配的类名
        优先使用 wallbreaker，降级到 JavaScript 版本
        """
        self._ensure_wallbreaker()
        
        # 优先使用 wallbreaker
        if self.wallbreaker_rpc:
            try:
                log_info(f"🔍 搜索类 (wallbreaker): {pattern}")
                result = self.wallbreaker_rpc.class_match(pattern)
                for cls in result:
                    log_info(f"  {cls}")
                log_success(f"✅ 共找到 {len(result)} 个类")
                return result
            except Exception as e:
                log_warning(f"Wallbreaker 搜索失败，降级到 JS 版本: {e}")
        
        # 降级到 JavaScript 版本
        log_info(f"🔍 搜索类 (JS): {pattern}")
        try:
            js_code = f'findClasses("{pattern}")'
            result = self.script.exports.eval(js_code)
            return result if result else []
        except Exception as e:
            log_error(f"搜索失败: {e}")
            return []
    
    def execute_js(self, js_code):
        """执行 JavaScript 代码（包含增强的错误处理）"""
        if not self.script:
            log_error("没有活动的脚本会话")
            return
            
        try:
            # 处理特殊退出命令
            if js_code.strip().lower() in ['q', 'quit', 'exit']:
                self.running = False
                return
            
            # 对复杂命令做执行前提示
            if len(js_code) > 50 or '\n' in js_code:
                log_debug("执行 JavaScript: {}...".format(js_code[:50]))
            
            # 通过 RPC 执行 JavaScript 代码
            result = self.script.exports.eval(js_code)
            
        except Exception as e:
            log_error("执行错误: {}".format(e))
    
    def _bring_app_to_foreground(self, package_name: str):
        """将应用拉到前台"""
        try:
            import subprocess
            # 使用 monkey 命令启动应用的主 Activity
            cmd = ['adb', 'shell', 'monkey', '-p', package_name, '-c', 
                   'android.intent.category.LAUNCHER', '1']
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
            if result.returncode == 0:
                log_info(f"📱 已将 {package_name} 拉到前台")
            else:
                # 备用方案：使用 am start
                cmd2 = ['adb', 'shell', 'am', 'start', '-n', 
                        f'{package_name}/.MainActivity', '--activity-brought-to-front']
                subprocess.run(cmd2, capture_output=True, timeout=5)
        except Exception as e:
            log_debug(f"拉起应用失败 (非致命): {e}")
    
    def _setup_task_manager(self):
        """初始化任务管理器"""
        try:
            # 传递会话信息给任务管理器
            self.task_manager = FridaTaskManager(self.target_process)
            
            # 初始化脚本模板引擎
            script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            self.script_engine = ScriptTemplateEngine(script_dir)
            
            log_success("🎯 任务管理器初始化成功")
            
        except Exception as e:
            log_error(f"❌ 任务管理器初始化失败: {e}")
            self.task_manager = None
            self.script_engine = None
    
    # ===== 新的任务管理命令 =====
    
    def create_hook_task(self, task_type, target, options=None):
        """创建Hook任务"""
        if not self.task_manager or not self.script_engine:
            log_error("❌ 任务管理器未初始化")
            return -1
        
        try:
            # 生成脚本
            if task_type == "method":
                class_name, method_name = target.rsplit('.', 1)
                script_source = self.script_engine.generate_method_hook_script(
                    class_name, method_name, options or {}, 0  # task_id will be set by manager
                )
                description = f"Hook方法: {target}"
                task_type_enum = TaskType.METHOD_HOOK
            elif task_type == "class":
                script_source = self.script_engine.generate_class_hook_script(
                    target, options or {}, 0
                )
                description = f"Hook类: {target}"
                task_type_enum = TaskType.CLASS_HOOK
            elif task_type == "location":
                hook_type = options.get('hook_type', 'base64')
                script_source = self.script_engine.generate_location_hook_script(
                    hook_type, options or {}, 0
                )
                description = f"定位Hook: {hook_type}"
                task_type_enum = TaskType.LOCATION_HOOK
            elif task_type == "native":
                script_source = self.script_engine.generate_native_hook_script(
                    target, options or {}, 0
                )
                description = f"Native Hook: {target}"
                task_type_enum = TaskType.NATIVE_HOOK
            # 新增任务类型
            elif task_type == "trace_class":
                script_source = self.script_engine.generate_trace_class_script(
                    target, options or {}, 0
                )
                description = f"追踪类: {target}"
                task_type_enum = TaskType.TRACE_CLASS
            elif task_type == "trace_method":
                script_source = self.script_engine.generate_trace_method_script(
                    target, options or {}, 0
                )
                description = f"追踪方法: {target}"
                task_type_enum = TaskType.TRACE_METHOD
            elif task_type == "advanced_trace":
                script_source = self.script_engine.generate_advanced_trace_script(
                    target, options or {}, 0
                )
                description = f"高级追踪: {target}"
                task_type_enum = TaskType.ADVANCED_TRACE
            elif task_type == "network_fetch":
                filter_str = options.get('filter', '') if options else ''
                script_source = self.script_engine.generate_network_fetch_script(
                    filter_str, options or {}, 0
                )
                description = f"网络抓包: {filter_str or '全部'}"
                task_type_enum = TaskType.NETWORK_FETCH
            else:
                log_error(f"❌ 不支持的任务类型: {task_type}")
                return -1
            
            # 创建任务
            task_id = self.task_manager.create_task(
                task_type_enum, target, script_source, description, options
            )
            
            return task_id
            
        except Exception as e:
            log_error(f"❌ 创建任务失败: {e}")
            return -1
    
    def list_tasks(self, status_filter=None):
        """列出所有任务"""
        if not self.task_manager:
            log_error("❌ 任务管理器未初始化")
            return
        
        filter_enum = None
        if status_filter:
            try:
                filter_enum = TaskStatus(status_filter)
            except ValueError:
                log_error(f"❌ 无效的状态过滤器: {status_filter}")
                return
        
        self.task_manager.show_tasks(filter_enum)
    
    def kill_task(self, task_id):
        """终止指定任务"""
        if not self.task_manager:
            log_error("❌ 任务管理器未初始化")
            return False
        
        return self.task_manager.kill_task(task_id)
    
    def kill_all_tasks(self, task_type_filter=None):
        """终止所有任务"""
        if not self.task_manager:
            log_error("❌ 任务管理器未初始化")
            return 0
        
        filter_enum = None
        if task_type_filter:
            try:
                filter_enum = TaskType(task_type_filter)
            except ValueError:
                log_error(f"❌ 无效的类型过滤器: {task_type_filter}")
                return 0
        
        return self.task_manager.kill_all_tasks(filter_enum)
    
    def show_task_details(self, task_id):
        """显示任务详情"""
        if not self.task_manager:
            log_error("❌ 任务管理器未初始化")
            return
        
        self.task_manager.show_task_details(task_id)
    
    def show_task_stats(self):
        """显示任务统计"""
        if not self.task_manager:
            log_error("❌ 任务管理器未初始化")
            return
        
        self.task_manager.show_stats()
    
    def disconnect(self):
        """从目标断开并做善后清理（优先快速、避免卡死）"""
        self.running = False

        detach_ok = False
        # 1) 优先分离进程（detach 会隐式销毁所有脚本，避免逐个 unload 卡住）
        if self.target_process:
            try:
                self.target_process.detach()
                detach_ok = True
                log_debug("进程已分离")
            except Exception as e:
                log_error(f"分离进程失败: {e}")

        # 2) 主脚本卸载（未分离或分离失败时再尝试）
        if self.script and not detach_ok:
            try:
                self.script.unload()
                log_debug("脚本已卸载")
            except Exception:
                pass

        # 3) 任务清理：分离成功则直接清空记录，否则逐个清理
        if self.task_manager:
            try:
                if detach_ok:
                    task_count = len(self.task_manager.tasks)
                    self.task_manager.tasks.clear()
                    log_info(f"🧹 已快速清空 {task_count} 个任务记录（已分离进程）")
                else:
                    self.task_manager.cleanup()
            except Exception as e:
                log_error(f"清理任务时出错: {e}")

        # 4) 关闭输出文件
        if self.output_handle:
            try:
                from datetime import datetime
                timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                self.output_handle.write(f"\n{'='*60}\n")
                self.output_handle.write(f"# Session ended at: {timestamp}\n")
                self.output_handle.close()
                log_info(f"📁 输出文件已关闭: {self.output_file}")
            except Exception as e:
                log_error(f"关闭输出文件失败: {e}")
            finally:
                self.output_handle = None

        log_success("已断开连接")

def run_interactive_session(session):
    """运行交互式会话主循环"""
    console = get_console()
    
    # 检测是否可以使用 prompt_toolkit
    use_prompt_toolkit = False
    pt_session = None
    completer = FridacCompleter()
    
    try:
        stdin_is_tty = sys.stdin.isatty()
    except Exception:
        stdin_is_tty = True
    
    if stdin_is_tty and get_prompt_toolkit_available():
        try:
            # 使用单独的历史文件（prompt_toolkit 格式与 readline 不兼容）
            pt_session = create_prompt_session(completer, PT_HISTORY_FILE)
            use_prompt_toolkit = True
            log_info("✨ 已启用 内联提示（↑↓翻历史，Tab补全，Ctrl+R搜索）")
        except Exception as e:
            log_debug(f"prompt_toolkit 初始化失败，回退到 readline: {e}")
            use_prompt_toolkit = False
    
    if not use_prompt_toolkit:
        # 回退到 readline 模式
        setup_history()
    
    # 显示交互模式提示信息
    if RICH_AVAILABLE and console:
        _show_rich_interactive_info()
    else:
        _show_basic_interactive_info()
    
    # 非交互环境降级提示
    if not stdin_is_tty:
        log_warning("检测到非交互输入环境（可能通过管道或不支持的终端运行），输入将降级处理。建议直接在终端运行 fridac 以获得最佳体验。")

    # 简单的输入读取封装（readline 模式），处理 OSError(Errno 22) 等异常
    def _read_user_input_readline(prompt: str) -> str:
        try:
            return input(prompt)
        except OSError as e:
            # 回退到低级读取
            try:
                sys.stdout.write(prompt)
                sys.stdout.flush()
            except Exception:
                pass
            try:
                line = sys.stdin.readline()
                # 若仍失败，则抛回原错误
                if line is None:
                    raise e
                return line
            except Exception:
                # 无法读取，抛回让上层处理
                raise e

    # prompt_toolkit 风格的提示符（带颜色）
    def _get_pt_prompt():
        from prompt_toolkit.formatted_text import HTML
        return HTML('<prompt>fridac</prompt>> ')

    # 交互循环
    while session.running:
        try:
            # 根据模式选择输入方式
            if use_prompt_toolkit and pt_session:
                try:
                    user_input = pt_session.prompt(_get_pt_prompt()).strip()
                except KeyboardInterrupt:
                    # Ctrl+C 不退出，只清空当前行
                    print()
                    continue
            else:
                user_input = _read_user_input_readline("fridac> ").strip()
            
            if not user_input:
                continue
                
            # Handle exit commands
            if user_input.lower() in ['q', 'quit', 'exit']:
                log_info("正在退出...")
                session.running = False
                break
            
            # 兼容 JS 风格的命令调用（如 hookurl() / kill(3) / hookbase64(true)）
            normalized_input = _normalize_cli_syntax(user_input)
            
            # Handle new task management commands (CLI 风格)
            if _handle_task_commands(session, normalized_input):
                continue
            
            # Execute JavaScript code
            session.execute_js(user_input)
            
        except OSError as e:
            log_exception("I/O 错误", e)
            break
        except KeyboardInterrupt:
            log_info("正在退出...")
            break
        except EOFError:
            log_info("正在退出...")
            break

def _handle_task_commands(session, user_input):
    """
    处理新的任务管理命令
    
    Returns:
        bool: 如果命令被处理返回True，否则返回False
    """
    # 解析命令
    parts = user_input.strip().split()
    if not parts:
        return False
    
    cmd = parts[0].lower()
    
    # 任务列表命令
    if cmd in ['tasks', 'jobs']:
        status_filter = parts[1] if len(parts) > 1 else None
        # 显示新任务管理系统的任务
        session.list_tasks(status_filter)
        # 旧任务管理系统的任务 暂时禁用
        # try:
        #     result = session.script.exports.eval("typeof jobs !== 'undefined' ? jobs() : null")
        # except:
        #     pass
        return True
    
    # 终止任务命令
    elif cmd in ['kill', 'killtask']:
        if len(parts) < 2:
            log_error("❌ 用法: kill <task_id>")
            return True
        try:
            task_id = int(parts[1])
            session.kill_task(task_id)
        except ValueError:
            log_error("❌ 任务ID必须是数字")
        return True
    
    # 终止所有任务命令  
    elif cmd in ['killall', 'killalltasks']:
        task_type = parts[1] if len(parts) > 1 else None
        
        # 先清理新任务管理系统的任务
        new_count = session.kill_all_tasks(task_type)
        
        # 再清理旧任务管理系统的任务
        old_count = 0
        try:
            result = session.script.exports.eval("typeof killall !== 'undefined' ? killall() : 0")
            if isinstance(result, (int, float)):
                old_count = int(result)
        except Exception as e:
            log_error(f"清理旧任务系统时出错: {e}")
        
        total_count = new_count + old_count
        log_success(f"🧹 已终止 {total_count} 个任务 (新系统: {new_count}, 旧系统: {old_count})")
        return True
    
    # 任务详情命令
    elif cmd in ['taskinfo', 'jobinfo']:
        if len(parts) < 2:
            log_error("❌ 用法: taskinfo <task_id>")
            return True
        try:
            task_id = int(parts[1])
            session.show_task_details(task_id)
        except ValueError:
            log_error("❌ 任务ID必须是数字")
        return True
    
    # 任务统计命令
    elif cmd in ['taskstats', 'jobstats']:
        session.show_task_stats()
        return True
    
    # traceclass - 使用新任务系统创建类追踪任务
    elif cmd == 'traceclass':
        if len(parts) < 2:
            log_error("❌ 用法: traceclass <classname> [show_stack] [stack_lines]")
            return True
        target = parts[1]
        show_stack = len(parts) > 2 and parts[2].lower() in ['true', '1', 'yes']
        stack_lines = None
        if len(parts) > 3:
            try:
                stack_lines = int(parts[3])
            except Exception:
                stack_lines = None
        options = {'show_stack': show_stack}
        if stack_lines is not None:
            options['stack_lines'] = stack_lines
        task_id = session.create_hook_task('trace_class', target, options)
        if task_id > 0:
            log_success(f"✅ 类追踪任务已创建: #{task_id}")
        else:
            log_error("❌ 类追踪任务创建失败")
        return True
    
    # tracemethod - 使用新任务系统创建方法追踪任务
    elif cmd == 'tracemethod':
        if len(parts) < 2:
            log_error("❌ 用法: tracemethod <class.method> [show_stack] [stack_lines]")
            return True
        target = parts[1]
        show_stack = len(parts) > 2 and parts[2].lower() in ['true', '1', 'yes']
        stack_lines = None
        if len(parts) > 3:
            try:
                stack_lines = int(parts[3])
            except Exception:
                stack_lines = None
        options = {'show_stack': show_stack}
        if stack_lines is not None:
            options['stack_lines'] = stack_lines
        task_id = session.create_hook_task('trace_method', target, options)
        if task_id > 0:
            log_success(f"✅ 方法追踪任务已创建: #{task_id}")
        else:
            log_error("❌ 方法追踪任务创建失败")
        return True
    
    # advancedtrace - 高级追踪（带堆栈和字段信息）
    elif cmd == 'advancedtrace':
        if len(parts) < 2:
            log_error("❌ 用法: advancedtrace <class.method> [enable_fields]")
            return True
        target = parts[1]
        enable_fields = len(parts) > 2 and parts[2].lower() in ['true', '1', 'yes']
        options = {'enable_stack': True, 'enable_fields': enable_fields}
        task_id = session.create_hook_task('advanced_trace', target, options)
        if task_id > 0:
            log_success(f"✅ 高级追踪任务已创建: #{task_id}")
        else:
            log_error("❌ 高级追踪任务创建失败")
        return True

    # 创建Hook任务的简化命令
    elif cmd == 'hookmethod':
        if len(parts) < 2:
            log_error("❌ 用法: hookmethod <class.method> [show_stack]")
            return True
        target = parts[1]
        show_stack = len(parts) > 2 and parts[2].lower() in ['true', '1', 'yes']
        stack_lines = None
        if len(parts) > 3:
            try:
                stack_lines = int(parts[3])
            except Exception:
                stack_lines = None
        options = {'show_stack': show_stack}
        if stack_lines is not None:
            options['stack_lines'] = stack_lines
        task_id = session.create_hook_task('method', target, options)
        if task_id > 0:
            log_success(f"✅ 方法Hook任务已创建: #{task_id}")
        return True
    
    elif cmd == 'hookclass':
        if len(parts) < 2:
            log_error("❌ 用法: hookclass <classname> [show_stack]")
            return True
        target = parts[1]
        show_stack = len(parts) > 2 and parts[2].lower() in ['true', '1', 'yes']
        stack_lines = None
        if len(parts) > 3:
            try:
                stack_lines = int(parts[3])
            except Exception:
                stack_lines = None
        options = {'show_stack': show_stack}
        if stack_lines is not None:
            options['stack_lines'] = stack_lines
        task_id = session.create_hook_task('class', target, options)
        if task_id > 0:
            log_success(f"✅ 类Hook任务已创建: #{task_id}")
        return True
    
    elif cmd == 'hooknative':
        if len(parts) < 2:
            log_error("❌ 用法: hooknative <function_name> [show_stack]")
            return True
        target = parts[1]
        show_stack = len(parts) > 2 and parts[2].lower() in ['true', '1', 'yes']
        stack_lines = None
        if len(parts) > 3:
            try:
                stack_lines = int(parts[3])
            except Exception:
                stack_lines = None
        options = {'show_stack': show_stack}
        if stack_lines is not None:
            options['stack_lines'] = stack_lines
        task_id = session.create_hook_task('native', target, options)
        if task_id > 0:
            log_success(f"✅ Native Hook任务已创建: #{task_id}")
        return True
    
    elif cmd == 'hookbase64':
        show_stack = len(parts) > 1 and parts[1].lower() in ['true', '1', 'yes']
        stack_lines = None
        if len(parts) > 2:
            try:
                stack_lines = int(parts[2])
            except Exception:
                stack_lines = None
        options = {'hook_type': 'base64', 'show_stack': show_stack}
        if stack_lines is not None:
            options['stack_lines'] = stack_lines
        task_id = session.create_hook_task('location', 'base64', options)
        if task_id > 0:
            log_success(f"✅ Base64 Hook任务已创建: #{task_id}")
        else:
            log_error("❌ Base64 Hook任务创建失败")
        return True
    
    elif cmd == 'hooktoast':
        show_stack = len(parts) > 1 and parts[1].lower() in ['true', '1', 'yes']
        stack_lines = None
        if len(parts) > 2:
            try:
                stack_lines = int(parts[2])
            except Exception:
                stack_lines = None
        options = {'hook_type': 'toast', 'show_stack': show_stack}
        if stack_lines is not None:
            options['stack_lines'] = stack_lines
        task_id = session.create_hook_task('location', 'toast', options)
        if task_id > 0:
            log_success(f"✅ Toast Hook任务已创建: #{task_id}")
        return True
    
    elif cmd == 'hookarraylist':
        show_stack = len(parts) > 1 and parts[1].lower() in ['true', '1', 'yes']
        stack_lines = None
        if len(parts) > 2:
            try:
                stack_lines = int(parts[2])
            except Exception:
                stack_lines = None
        options = {'hook_type': 'arraylist', 'show_stack': show_stack}
        if stack_lines is not None:
            options['stack_lines'] = stack_lines
        task_id = session.create_hook_task('location', 'arraylist', options)
        if task_id > 0:
            log_success(f"✅ ArrayList Hook任务已创建: #{task_id}")
        return True
    
    elif cmd == 'hookloadlibrary':
        show_stack = len(parts) > 1 and parts[1].lower() in ['true', '1', 'yes']
        stack_lines = None
        if len(parts) > 2:
            try:
                stack_lines = int(parts[2])
            except Exception:
                stack_lines = None
        options = {'hook_type': 'loadlibrary', 'show_stack': show_stack}
        if stack_lines is not None:
            options['stack_lines'] = stack_lines
        task_id = session.create_hook_task('location', 'loadlibrary', options)
        if task_id > 0:
            log_success(f"✅ LoadLibrary Hook任务已创建: #{task_id}")
        return True
    
    elif cmd == 'hooknewstringutf':
        show_stack = len(parts) > 1 and parts[1].lower() in ['true', '1', 'yes']
        stack_lines = None
        if len(parts) > 2:
            try:
                stack_lines = int(parts[2])
            except Exception:
                stack_lines = None
        options = {'hook_type': 'newstringutf', 'show_stack': show_stack}
        if stack_lines is not None:
            options['stack_lines'] = stack_lines
        task_id = session.create_hook_task('location', 'newstringutf', options)
        if task_id > 0:
            log_success(f"✅ NewStringUTF Hook任务已创建: #{task_id}")
        return True
    
    elif cmd == 'hookfileoperations':
        show_stack = len(parts) > 1 and parts[1].lower() in ['true', '1', 'yes']
        stack_lines = None
        if len(parts) > 2:
            try:
                stack_lines = int(parts[2])
            except Exception:
                stack_lines = None
        options = {'hook_type': 'fileoperations', 'show_stack': show_stack}
        if stack_lines is not None:
            options['stack_lines'] = stack_lines
        task_id = session.create_hook_task('location', 'fileoperations', options)
        if task_id > 0:
            log_success(f"✅ File Operations Hook任务已创建: #{task_id}")
        return True
    
    elif cmd == 'hookjsonobject':
        show_stack = len(parts) > 1 and parts[1].lower() in ['true', '1', 'yes']
        stack_lines = None
        if len(parts) > 2:
            try:
                stack_lines = int(parts[2])
            except Exception:
                stack_lines = None
        options = {'hook_type': 'jsonobject', 'show_stack': show_stack}
        if stack_lines is not None:
            options['stack_lines'] = stack_lines
        task_id = session.create_hook_task('location', 'jsonobject', options)
        if task_id > 0:
            log_success(f"✅ JSONObject Hook任务已创建: #{task_id}")
        return True
    
    # 兼容旧风格：findStrInMap(key, showStack) -> 创建HashMap定位任务
    elif cmd == 'findstrinmap':
        target_key = parts[1] if len(parts) > 1 else ""
        show_stack = len(parts) > 2 and parts[2].lower() in ['true', '1', 'yes']
        stack_lines = None
        if len(parts) > 3:
            try:
                stack_lines = int(parts[3])
            except Exception:
                stack_lines = None
        options = {'hook_type': 'hashmap', 'target_key': target_key, 'show_stack': show_stack}
        if stack_lines is not None:
            options['stack_lines'] = stack_lines
        task_id = session.create_hook_task('location', 'hashmap', options)
        if task_id > 0:
            log_success(f"✅ HashMap Hook任务已创建: #{task_id}")
        return True

    elif cmd == 'hookhashmap':
        target_key = parts[1] if len(parts) > 1 else ""
        show_stack = len(parts) > 2 and parts[2].lower() in ['true', '1', 'yes']
        stack_lines = None
        if len(parts) > 3:
            try:
                stack_lines = int(parts[3])
            except Exception:
                stack_lines = None
        options = {'hook_type': 'hashmap', 'target_key': target_key, 'show_stack': show_stack}
        if stack_lines is not None:
            options['stack_lines'] = stack_lines
        task_id = session.create_hook_task('location', 'hashmap', options)
        if task_id > 0:
            log_success(f"✅ HashMap Hook任务已创建: #{task_id}")
        return True
    
    elif cmd == 'hookedittext':
        show_stack = len(parts) > 1 and parts[1].lower() in ['true', '1', 'yes']
        stack_lines = None
        if len(parts) > 2:
            try:
                stack_lines = int(parts[2])
            except Exception:
                stack_lines = None
        options = {'hook_type': 'edittext', 'show_stack': show_stack}
        if stack_lines is not None:
            options['stack_lines'] = stack_lines
        task_id = session.create_hook_task('location', 'edittext', options)
        if task_id > 0:
            log_success(f"✅ EditText Hook任务已创建: #{task_id}")
        return True
    
    elif cmd == 'hooklog':
        show_stack = len(parts) > 1 and parts[1].lower() in ['true', '1', 'yes']
        stack_lines = None
        if len(parts) > 2:
            try:
                stack_lines = int(parts[2])
            except Exception:
                stack_lines = None
        options = {'hook_type': 'log', 'show_stack': show_stack}
        if stack_lines is not None:
            options['stack_lines'] = stack_lines
        task_id = session.create_hook_task('location', 'log', options)
        if task_id > 0:
            log_success(f"✅ Log Hook任务已创建: #{task_id}")
        return True
    
    elif cmd == 'hookurl':
        # 支持 1/0/true/false
        show_stack = False
        if len(parts) > 1:
            val = parts[1].lower()
            show_stack = val in ['true', '1', 'yes']
        stack_lines = None
        if len(parts) > 2:
            try:
                stack_lines = int(parts[2])
            except Exception:
                stack_lines = None
        options = {'hook_type': 'url', 'show_stack': show_stack}
        if stack_lines is not None:
            options['stack_lines'] = stack_lines
        task_id = session.create_hook_task('location', 'url', options)
        if task_id > 0:
            log_success(f"✅ URL Hook任务已创建: #{task_id}")
        return True

    # 生成方法 Hook 脚本到 scripts/ 目录
    elif cmd == 'genm':
        # 用法: genm a.b.c.d output_name
        if len(parts) < 3:
            log_error("❌ 用法: genm <class.method> <outfile>")
            return True
        target = parts[1]
        outfile = parts[2]

        # 校验 target 形如 a.b.c.d
        if '.' not in target:
            log_error("❌ 目标格式错误，应为: 包.类.方法，例如 com.example.Class.method")
            return True

        try:
            # 计算 scripts 目录
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            scripts_dir = os.path.join(base_dir, 'scripts')
            os.makedirs(scripts_dir, exist_ok=True)

            # 归一化输出文件名为 .js
            name_wo_ext = os.path.splitext(os.path.basename(outfile))[0]
            js_filename = name_wo_ext + '.js'
            js_path = os.path.join(scripts_dir, js_filename)

            # 生成函数名（仅字母数字与下划线）
            sanitized = re.sub(r"[^A-Za-z0-9_]", "_", target)
            func_name = f"hook_{sanitized}"

            # 生成 JS 内容（参考 traceMethod），增强：对象参数打印其字段值
            js_code = f"""/**\n * 自动生成的方法 Hook (参考 traceMethod)\n * @description Hook 目标: {target}\n * @example {func_name}()\n */\nfunction {func_name}() {{\n    Java.perform(function() {{\n        try {{\n            var fullyQualifiedMethodName = '{target}';\n            var lastDotIndex = fullyQualifiedMethodName.lastIndexOf('.');\n            if (lastDotIndex === -1) {{\n                LOG('❌ 方法名格式错误，应为: 包.类.方法', {{ c: Color.Red }});\n                return;\n            }}\n\n            var className = fullyQualifiedMethodName.substring(0, lastDotIndex);\n            var methodName = fullyQualifiedMethodName.substring(lastDotIndex + 1);\n\n            var targetClass = null;\n            try {{\n                targetClass = Java.use(className);\n            }} catch (error) {{\n                if ((error.message || '').indexOf('ClassNotFoundException') !== -1) {{\n                    LOG('❌ 类未在默认ClassLoader中找到，搜索其他ClassLoader...', {{ c: Color.Yellow }});\n                    var loader = (typeof findTragetClassLoader === 'function') ? findTragetClassLoader(className) : null;\n                    if (loader) {{\n                        targetClass = Java.ClassFactory.get(loader).use(className);\n                        LOG('🎯 成功使用自定义ClassLoader加载类', {{ c: Color.Green }});\n                    }} else {{\n                        LOG('❌ 在所有ClassLoader中都未找到类: ' + className, {{ c: Color.Red }});\n                        return;\n                    }}\n                }} else {{\n                    throw error;\n                }}\n            }}\n\n            if (!targetClass || !targetClass[methodName]) {{\n                LOG('❌ 未找到方法: ' + fullyQualifiedMethodName, {{ c: Color.Red }});\n                return;\n            }}\n\n            // 基础类型判定\n            function __isPrimitive(value) {{\n                var t = typeof value;\n                if (value === null || t === 'undefined' || t === 'string' || t === 'number' || t === 'boolean') return true;\n                // Java 基本类型装箱类：String 之外一般 toString() 也可直接展示\n                try {{ if (value && value.$className) {{ var n = String(value.$className); if (n.indexOf('java.lang.') === 0) return true; }} }} catch(_e) {{}}\n                return false;\n            }}\n\n            // 参数类型获取\n            function __getArgType(value) {{\n                try {{\n                    if (value === null) return 'null';\n                    if (typeof value === 'undefined') return 'undefined';\n                    if (value && typeof value.getClass === 'function') {{\n                        try {{ return String(value.getClass().getName()); }} catch(_e) {{}}\n                    }}\n                    if (value && value.$className) {{\n                        try {{ return String(value.$className); }} catch(_e) {{}}\n                    }}\n                    if (value && value.class && typeof value.class.getName === 'function') {{\n                        try {{ return String(value.class.getName()); }} catch(_e) {{}}\n                    }}\n                    var t = typeof value;\n                    if (t === 'object') {{\n                        try {{ return Object.prototype.toString.call(value); }} catch(_e) {{}}\n                    }}\n                    return t;\n                }} catch (_ignored) {{\n                    return 'unknown';\n                }}\n            }}\n\n            // 打印对象字段（最多若干项）\n            function __printObjectDetails(obj, maxFields) {{\n                maxFields = maxFields || 20;\n                try {{\n                    var clazz = null;\n                    try {{ clazz = obj.getClass ? obj.getClass() : (obj.class ? obj.class : null); }} catch(_c) {{ clazz = null; }}\n                    var className = '';\n                    try {{ className = clazz ? String(clazz.getName ? clazz.getName() : clazz.getName()) : (obj.$className || 'Object'); }} catch(_cn) {{ className = obj.$className || 'Object'; }}\n                    LOG('🧩 对象: ' + className, {{ c: Color.Cyan }});\n\n                    var fields = []\n                    try {{\n                        if (obj.class && typeof obj.class.getDeclaredFields === 'function') {{\n                            fields = obj.class.getDeclaredFields();\n                        }} else if (clazz && typeof clazz.getDeclaredFields === 'function') {{\n                            fields = clazz.getDeclaredFields();\n                        }}\n                    }} catch(_f) {{ fields = []; }}\n\n                    var printed = 0;\n                    for (var i = 0; i < fields.length && printed < maxFields; i++) {{\n                        try {{\n                            var f = fields[i];\n                            try {{ f.setAccessible && f.setAccessible(true); }} catch(_sa) {{}}\n                            var name = String(f.getName());\n                            var val = f.get(obj);\n                            LOG('  - ' + name + ': ' + val, {{ c: Color.Gray }});\n                            printed++;\n                        }} catch(_fe) {{ /* ignore field errors */ }}\n                    }}\n\n                    if (fields.length > printed) {{\n                        LOG('  ... (' + (fields.length - printed) + ' more fields)', {{ c: Color.Gray }});\n                    }}\n                }} catch (e) {{\n                    LOG('⚠️ 无法展开对象属性: ' + e.message, {{ c: Color.Yellow }});\n                }}\n            }}\n\n            var wrapper = targetClass[methodName];\n            var overloads = wrapper.overloads || [];\n\n            if (overloads.length > 0) {{\n                LOG('🔀 发现 ' + overloads.length + ' 个重载，逐个设置Hook...', {{ c: Color.Blue }});\n                for (var i = 0; i < overloads.length; i++) {{\n                    try {{\n                        (function(over){{\n                            over.implementation = function() {{\n                                LOG("\\n*** 进入 " + fullyQualifiedMethodName, {{ c: Color.Green }});\n                                try {{ printStack(); }} catch(_s) {{}}\n                                if (arguments.length > 0) {{\n                                    LOG('📥 参数:', {{ c: Color.Blue }});\n                                    for (var j = 0; j < arguments.length; j++) {{\n                                        var __t = __getArgType(arguments[j]);\n                                        LOG('  arg[' + j + '] (' + __t + '): ' + arguments[j], {{ c: Color.White }});\n                                        try {{ if (!__isPrimitive(arguments[j])) __printObjectDetails(arguments[j], 20); }} catch(_pd) {{}}\n                                    }}\n                                }}\n                                var retval = over.apply(this, arguments);\n                                LOG('📤 返回值: ' + retval, {{ c: Color.Blue }});\n                                LOG("🏁 退出 " + fullyQualifiedMethodName + "\\n", {{ c: Color.Green }});\n                                return retval;\n                            }};\n                        }})(overloads[i]);\n                    }} catch (_e) {{}}\n                }}\n            }} else {{\n                // 兜底：无 overload 信息时直接设置\n                wrapper.implementation = function() {{\n                    LOG("\\n*** 进入 " + fullyQualifiedMethodName, {{ c: Color.Green }});\n                    try {{ printStack(); }} catch(_s) {{}}\n                    if (arguments.length > 0) {{\n                        LOG('📥 参数:', {{ c: Color.Blue }});\n                        for (var k = 0; k < arguments.length; k++) {{\n                            var __t2 = __getArgType(arguments[k]);\n                            LOG('  arg[' + k + '] (' + __t2 + '): ' + arguments[k], {{ c: Color.White }});\n                            try {{ if (!__isPrimitive(arguments[k])) __printObjectDetails(arguments[k], 20); }} catch(_pd2) {{}}\n                        }}\n                    }}\n                    var retval2 = this[methodName].apply(this, arguments);\n                    LOG('📤 返回值: ' + retval2, {{ c: Color.Blue }});\n                    LOG("🏁 退出 " + fullyQualifiedMethodName + "\\n", {{ c: Color.Green }});\n                    return retval2;\n                }};\n            }}\n\n            LOG('✅ 方法Hook设置成功: ' + fullyQualifiedMethodName, {{ c: Color.Green }});\n        }} catch (e) {{\n            LOG('❌ 方法Hook设置失败: ' + e.message, {{ c: Color.Red }});\n        }}\n    }});\n}}\n"""

            # 写入文件
            with open(js_path, 'w', encoding='utf-8') as f:
                f.write(js_code)

            log_success(f"✅ 已生成自定义脚本: {js_path}")
            log_info("🔄 正在重载自定义脚本以便立即可用...")
            try:
                _handle_reload_scripts()
            except Exception as e:
                log_warning(f"⚠️ 重载失败，请手动执行 reload_scripts: {e}")
            return True
        except Exception as e:
            log_error(f"❌ 生成脚本失败: {e}")
            return True

    elif cmd == 'hookfetch':
        # 语法: hookfetch [filter_string]
        filter_str = parts[1] if len(parts) > 1 else ''
        options = {'hook_type': 'fetch', 'filter': filter_str}
        task_id = session.create_hook_task('location', 'fetch', options)
        if task_id > 0:
            log_success(f"✅ fetch 抓包任务已创建: #{task_id}")
        else:
            log_error("❌ fetch 抓包任务创建失败")
        return True

    # 自测命令：一次性创建常用Hook并触发可验证的调用
    elif cmd in ['selftest', 'selftest_all']:
        log_info('🔎 开始自测（创建并触发常用Hook）...')
        # 1) 清理现有任务
        try:
            session.kill_all_tasks(None)
        except Exception:
            pass

        created = []
        # 2) 创建定位Hook（可验证触发）
        for hook_type in ['url', 'log', 'base64', 'jsonobject', 'hashmap', 'arraylist', 'fileoperations']:
            opts = {'hook_type': hook_type, 'show_stack': True}
            if hook_type == 'hashmap':
                opts['target_key'] = 'key'
            tid = session.create_hook_task('location', hook_type, opts)
            if tid > 0:
                created.append((hook_type, tid))

        log_info(f"✅ 已创建 {len(created)} 个定位Hook任务")

        # 3) 触发这些Hook
        trigger_snippets = [
            # URL 构造
            "Java.perform(function(){ var URL = Java.use('java.net.URL'); var u = URL.$new('https://example.com'); });",
            # Log.d
            "Java.perform(function(){ var Log = Java.use('android.util.Log'); Log.d('FRIDAC_TEST','hello'); });",
            # Base64 encode/decode
            "Java.perform(function(){ var Base64 = Java.use('android.util.Base64'); var s = 'Hi'; var bytes = Java.array('byte', [72,105]); var enc = Base64.encodeToString(bytes, 0); Base64.decode(enc, 0); });",
            # JSONObject
            "Java.perform(function(){ var JSONObject = Java.use('org.json.JSONObject'); var o = JSONObject.$new(); o.put && o.put('k','v'); o.toString(); });",
            # HashMap
            "Java.perform(function(){ var HashMap = Java.use('java.util.HashMap'); var m = HashMap.$new(); m.put('key','value'); });",
            # ArrayList
            "Java.perform(function(){ var ArrayList = Java.use('java.util.ArrayList'); var a = ArrayList.$new(); a.add('item'); });",
            # File.exists
            "Java.perform(function(){ var File = Java.use('java.io.File'); var f = File.$new('/sdcard'); f.exists(); });"
        ]
        for code in trigger_snippets:
            session.execute_js(code)

        log_success('🎉 自测触发完成，可查看输出与任务统计')
        session.list_tasks(None)
        return True
    
    # 帮助命令
    elif cmd in ['taskhelp', 'jobhelp']:
        _show_task_help()
        return True
    
    # 自定义脚本重载命令
    elif cmd in ['reload_scripts', 'reloadscripts']:
        _handle_reload_scripts()
        return True
    
    # === 内存搜索命令（优先 wallbreaker，降级 JS）===
    elif cmd == 'objectsearch':
        if len(parts) < 2:
            log_error("❌ 用法: objectsearch <class_name> [stop]")
            return True
        class_name = parts[1]
        stop = len(parts) > 2 and parts[2].lower() in ['true', '1', 'yes']
        session.objectsearch(class_name, stop)
        return True
    
    elif cmd == 'objectdump':
        if len(parts) < 2:
            log_error("❌ 用法: objectdump <handle> [fullname]")
            return True
        handle = parts[1]
        fullname = len(parts) > 2 and parts[2].lower() in ['true', '1', 'yes', 'fullname', '--fullname']
        session.objectdump(handle, fullname)
        return True
    
    elif cmd == 'classdump':
        if len(parts) < 2:
            log_error("❌ 用法: classdump <class_name> [fullname]")
            return True
        class_name = parts[1]
        fullname = len(parts) > 2 and parts[2].lower() in ['true', '1', 'yes', 'fullname', '--fullname']
        session.classdump(class_name, fullname)
        return True
    
    elif cmd == 'classsearch':
        if len(parts) < 2:
            log_error("❌ 用法: classsearch <pattern>")
            return True
        pattern = parts[1]
        session.classsearch(pattern)
        return True
    
    # ===== Small-Trace (QBDI 汇编追踪) 命令 =====
    elif cmd == 'smalltrace':
        # smalltrace <so_name> <offset> [output_file] [args_count] [hexdump]
        if len(parts) < 3:
            log_error("❌ 用法: smalltrace <so_name> <offset> [output_file] [args_count] [hexdump]")
            log_info("   示例: smalltrace libjnicalculator.so 0x21244")
            log_info("   示例: smalltrace libjnicalculator.so 0x21244 ~/Desktop/trace.log 5")
            log_info("   示例: smalltrace libjnicalculator.so 0x21244 ~/Desktop/trace.log 5 true  # 开启hexdump")
            log_info("   hexdump 参数: true/1/on 开启, 默认关闭")
            return True
        
        _handle_smalltrace_command(session, parts)
        return True
    
    elif cmd == 'smalltrace_symbol':
        # smalltrace_symbol <so_name> <symbol> [output_file] [args_count] [hexdump]
        if len(parts) < 3:
            log_error("❌ 用法: smalltrace_symbol <so_name> <symbol> [output_file] [args_count] [hexdump]")
            log_info("   示例: smalltrace_symbol libjnicalculator.so encryptToMd5Hex")
            log_info("   示例: smalltrace_symbol libjnicalculator.so myFunc ~/trace.log 5 true  # 开启hexdump")
            log_info("   hexdump 参数: true/1/on 开启, 默认关闭")
            return True
        
        _handle_smalltrace_symbol_command(session, parts)
        return True
    
    elif cmd == 'smalltrace_pull':
        # smalltrace_pull [output_file]
        output_file = parts[1] if len(parts) > 1 else None  # None 表示使用之前保存的路径
        _handle_smalltrace_pull_command(session, output_file)
        return True
    
    elif cmd == 'smalltrace_status':
        _handle_smalltrace_status_command(session)
        return True
    
    elif cmd == 'smalltrace_analyze':
        # smalltrace_analyze [trace_file]
        trace_file = parts[1] if len(parts) > 1 else getattr(session, '_smalltrace_output', None)
        if not trace_file:
            log_error("❌ 用法: smalltrace_analyze <trace_file>")
            log_info("   示例: smalltrace_analyze ~/Desktop/qbdi_trace_xxx.log")
            return True
        _handle_smalltrace_analyze_command(os.path.expanduser(trace_file))
        return True
    
    elif cmd == 'stalker_trace':
        # stalker_trace <so_name> <offset> [output_file]
        if len(parts) < 3:
            log_error("❌ 用法: stalker_trace <so_name> <offset> [output_file]")
            log_info("   示例: stalker_trace libjnicalculator.so 0x1f5e0 ~/Desktop/stalker_trace.txt")
            return True
        
        _handle_stalker_trace_command(session, parts)
        return True
    
    # 检查是否是自定义函数命令
    elif _handle_custom_function_command(session, cmd, parts):
        return True
    
    return False

def _normalize_cli_syntax(user_input):
    """
    将 JS 风格的调用（如 hookurl() / kill(3) / hookbase64(true) / hookhashmap("key", true)）
    规范化为 CLI 风格命令：
      hookurl -> hookurl
      kill 3 -> kill 3
      hookbase64 true -> hookbase64 true
      hookhashmap key true -> hookhashmap key true
    若不匹配 JS 风格调用，则返回原字符串。
    """
    text = user_input.strip()
    # 快速排除无括号的输入
    if '(' not in text or ')' not in text:
        return text
    # 必须是形如 name(args...) 或 name()
    if not text.endswith(')'):
        return text
    # 找到第一个 '(' 的位置
    try:
        paren_index = text.index('(')
    except ValueError:
        return text
    name = text[:paren_index].strip()
    args_section = text[paren_index + 1:-1].strip()  # 去掉最后一个 ')'
    # name 必须是命令样式的单词
    if not name or not (name[0].isalpha() or name[0] == '_'):
        return text
    if not all((ch.isalnum() or ch == '_') for ch in name):
        return text
    # 无参数 -> 直接返回 name
    if args_section == '':
        return name
    # 拆分参数，按逗号分隔，去掉包裹引号
    raw_args = [part.strip() for part in args_section.split(',')]
    normalized_args = []
    for arg in raw_args:
        if len(arg) >= 2 and ((arg[0] == '"' and arg[-1] == '"') or (arg[0] == "'" and arg[-1] == "'")):
            arg = arg[1:-1]
        # 将 true/false 规范为小写布尔
        if arg.lower() in ['true', 'false']:
            arg = arg.lower()
        normalized_args.append(arg)
    # 组装 CLI 风格命令
    return ' '.join([name] + normalized_args)

def _show_task_help():
    """显示任务管理帮助信息"""
    console = get_console()
    
    if RICH_AVAILABLE and console:
        help_table = Table(title="🎯 任务管理命令", box=ROUNDED, show_header=True, header_style="bold blue")
        help_table.add_column("命令", style="green", width=28)
        help_table.add_column("说明", style="cyan", width=32)
        help_table.add_column("示例", style="yellow", width=35)
        
        commands = [
            # 任务管理
            ("tasks / jobs", "显示所有任务", "tasks, jobs running"),
            ("kill <id>", "终止指定任务", "kill 1"),
            ("killall [type]", "终止所有任务", "killall, killall method_hook"),
            ("taskinfo <id>", "显示任务详情", "taskinfo 1"),
            ("taskstats", "显示任务统计", "taskstats"),
            # 类/方法追踪
            ("traceclass", "追踪类的所有方法", "traceclass com.app.Main true"),
            ("tracemethod", "追踪特定方法", "tracemethod com.app.Class.method true"),
            ("advancedtrace", "高级追踪(带字段)", "advancedtrace com.app.Class.method true"),
            # Hook 任务
            ("hookmethod", "创建方法Hook任务", "hookmethod com.app.Class.method true"),
            ("hookclass", "创建类Hook任务", "hookclass com.app.MainActivity"),
            ("hooknative", "创建Native Hook任务", "hooknative open true"),
            # 定位 Hook
            ("hookbase64", "Base64 Hook", "hookbase64 true"),
            ("hooktoast", "Toast Hook", "hooktoast"),
            ("hookurl", "URL Hook", "hookurl true"),
            ("hookhashmap [key]", "HashMap Hook", "hookhashmap password true"),
            ("hookjsonobject", "JSONObject Hook", "hookjsonobject true"),
            ("hookarraylist", "ArrayList Hook", "hookarraylist true"),
            ("hooklog", "Log Hook", "hooklog true"),
            ("hookedittext", "EditText Hook", "hookedittext true"),
            ("hookloadlibrary", "LoadLibrary Hook", "hookloadlibrary true"),
            ("hooknewstringutf", "JNI字符串Hook", "hooknewstringutf true"),
            ("hookfileoperations", "文件操作Hook", "hookfileoperations true"),
            # 网络抓包
            ("hookfetch [filter]", "网络抓包(任务模式)", "hookfetch mtgsig"),
            # 其他
            ("genm", "生成方法Hook脚本", "genm com.app.Class.method output"),
            ("selftest", "系统自测", "selftest"),
            ("taskhelp", "显示此帮助", "taskhelp")
        ]
        
        for cmd, desc, example in commands:
            help_table.add_row(cmd, desc, example)
        
        console.print()
        console.print(help_table)
        console.print()
        console.print("💡 [yellow]提示[/yellow]: 所有命令支持 [show_stack] [stack_lines] 参数控制调用栈显示")
        console.print("🗑️  [yellow]优势[/yellow]: 基于脚本隔离的任务系统，killall 可以真正清理所有Hook")
        console.print()
    else:
        log_info("\n🎯 任务管理命令:")
        log_info("=" * 60)
        log_info("📋 任务管理:")
        log_info("  tasks/jobs      - 显示所有任务")
        log_info("  kill <id>       - 终止指定任务")
        log_info("  killall [type]  - 终止所有任务")
        log_info("  taskinfo <id>   - 显示任务详情")
        log_info("  taskstats       - 显示任务统计")
        log_info("")
        log_info("🔍 类/方法追踪:")
        log_info("  traceclass <class> [show_stack]     - 追踪类的所有方法")
        log_info("  tracemethod <class.method> [stack]  - 追踪特定方法")
        log_info("  advancedtrace <method> [fields]     - 高级追踪")
        log_info("")
        log_info("🎯 Hook任务:")
        log_info("  hookmethod <class.method> [stack]   - 方法Hook")
        log_info("  hookclass <class> [stack]           - 类Hook")
        log_info("  hooknative <func> [stack]           - Native Hook")
        log_info("")
        log_info("📍 定位Hook:")
        log_info("  hookbase64, hooktoast, hookurl, hookhashmap,")
        log_info("  hookjsonobject, hookarraylist, hooklog,")
        log_info("  hookedittext, hookloadlibrary, hooknewstringutf,")
        log_info("  hookfileoperations")
        log_info("")
        log_info("🌐 网络抓包:")
        log_info("  hookfetch [filter] - 网络抓包(任务模式)")
        log_info("")
        log_info("💡 提示: 所有命令支持 [show_stack] [stack_lines] 参数")
        log_info("🗑️ 优势: killall 可以真正清理所有Hook\n")

def _show_rich_interactive_info():
    """Show interactive information with Rich UI"""
    console = get_console()
    if not console:
        return
    
    from rich.panel import Panel
    
    # 简洁的欢迎信息
    welcome_text = """[bold cyan]🎯 fridac 交互模式[/bold cyan]

[green]快捷操作:[/green]
  [yellow]Tab[/yellow]      补全命令        [yellow]↑↓[/yellow]       翻历史
  [yellow]Ctrl+R[/yellow]   搜索历史        [yellow]→[/yellow]        接受建议

[green]常用命令:[/green]
  [cyan]traceClass[/cyan]('类名', 1)         跟踪类的所有方法
  [cyan]traceMethod[/cyan]('类.方法', 1)     跟踪特定方法
  [cyan]findClasses[/cyan]('关键字')         搜索类
  [cyan]tasks[/cyan] / [cyan]kill[/cyan] <id> / [cyan]killall[/cyan]   任务管理

[green]帮助:[/green]
  [cyan]help()[/cyan]       查看所有函数    [cyan]taskhelp[/cyan]    任务命令帮助
  [cyan]q[/cyan] / [cyan]exit[/cyan]    退出程序"""
    
    console.print(Panel(welcome_text, border_style="green", padding=(0, 1)))

def _show_basic_interactive_info():
    """Show interactive information in basic mode"""
    print("\n" + "="*50)
    print("🎯 fridac 交互模式")
    print("-"*50)
    print("快捷操作: Tab=补全  ↑↓=翻历史  Ctrl+R=搜索")
    print("-"*50)
    print("常用: traceClass('类', 1)  traceMethod('类.方法', 1)")
    print("      findClasses('关键字')  tasks / kill / killall")
    print("-"*50)
    print("帮助: help() 查看所有函数  taskhelp 任务命令")
    print("退出: q 或 exit")
    print("="*50 + "\n")

def _handle_reload_scripts():
    """处理脚本重载命令"""
    try:
        custom_manager = get_custom_script_manager()
        if custom_manager:
            count = custom_manager.reload_scripts()
            log_success(f"🔄 已重新加载 {count} 个自定义脚本")
            
            # 更新补全器
            try:
                completer = FridacCompleter()
                completer.reload_custom_functions()
                readline.set_completer(completer.complete)
                log_debug("✅ 补全器已更新")
            except Exception as e:
                log_warning(f"⚠️ 更新补全器失败: {e}")
        else:
            log_warning("⚠️ 自定义脚本管理器未初始化")
    except Exception as e:
        log_error(f"❌ 重载脚本失败: {e}")


# ===== Small-Trace 命令处理函数 =====

def _generate_trace_output_path(package_name: str = None) -> str:
    """生成带包名和时间戳的追踪输出文件路径"""
    from datetime import datetime
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    pkg_part = package_name.replace('.', '_') if package_name else "unknown"
    filename = f"qbdi_trace_{pkg_part}_{timestamp}.log"
    return os.path.expanduser(f"~/Desktop/{filename}")


def _handle_smalltrace_command(session, parts):
    """处理 smalltrace 偏移追踪命令"""
    try:
        so_name = parts[1]
        offset = parse_offset(parts[2])
        # 用户指定则用用户的，否则自动生成带时间戳的文件名
        package_name = getattr(session, 'app_name', None)
        output_file = os.path.expanduser(parts[3]) if len(parts) > 3 else _generate_trace_output_path(package_name)
        args_count = int(parts[4]) if len(parts) > 4 else 5
        # 新增: hexdump 参数 (第6个参数, 默认关闭)
        show_hexdump = False
        if len(parts) > 5:
            hexdump_arg = parts[5].lower()
            show_hexdump = hexdump_arg in ('1', 'true', 'yes', 'on', 'hexdump')
        
        log_info("🔬 Small-Trace SO 汇编追踪")
        log_info(f"   目标: {so_name} @ 0x{offset:x}")
        log_info(f"   Hexdump: {'开启' if show_hexdump else '关闭'}")
        
        # 获取 SmallTrace 管理器
        manager = get_smalltrace_manager()
        
        # 确保追踪库可用
        if not manager.ensure_libqdbi():
            log_error("❌ Small-Trace 追踪库不可用")
            return
        
        # 关闭 SELinux
        manager.disable_selinux()
        
        # 生成追踪脚本
        config = SmallTraceConfig(
            so_name=so_name,
            offset=offset,
            trace_mode=1,  # 偏移追踪
            args_count=args_count,
            output_file=output_file,
            show_hexdump=show_hexdump
        )
        
        script_content = manager.generate_trace_script(config)
        
        # 执行脚本
        log_info("📜 注入追踪脚本...")
        session.execute_js(script_content)
        
        # 保存配置供后续 pull 使用
        session._smalltrace_output = output_file
        session._smalltrace_package = getattr(session, 'app_name', None)
        
        log_success("✅ Small-Trace 已启动")
        log_info(f"   📦 目标应用: {session._smalltrace_package}")
        log_info(f"   📁 输出文件: {output_file}")
        log_info("   触发目标函数后，使用 'smalltrace_pull' 拉取追踪日志")
        
    except Exception as e:
        log_error(f"❌ Small-Trace 启动失败: {e}")


def _handle_smalltrace_symbol_command(session, parts):
    """处理 smalltrace_symbol 符号追踪命令"""
    try:
        so_name = parts[1]
        symbol = parts[2]
        # 用户指定则用用户的，否则自动生成带时间戳的文件名
        package_name = getattr(session, 'app_name', None)
        output_file = os.path.expanduser(parts[3]) if len(parts) > 3 else _generate_trace_output_path(package_name)
        args_count = int(parts[4]) if len(parts) > 4 else 5
        # 新增: hexdump 参数 (第6个参数, 默认关闭)
        show_hexdump = False
        if len(parts) > 5:
            hexdump_arg = parts[5].lower()
            show_hexdump = hexdump_arg in ('1', 'true', 'yes', 'on', 'hexdump')
        
        log_info("🔬 Small-Trace 符号追踪")
        log_info(f"   目标: {so_name}::{symbol}")
        log_info(f"   Hexdump: {'开启' if show_hexdump else '关闭'}")
        
        # 获取 SmallTrace 管理器
        manager = get_smalltrace_manager()
        
        # 确保追踪库可用
        if not manager.ensure_libqdbi():
            log_error("❌ Small-Trace 追踪库不可用")
            return
        
        # 关闭 SELinux
        manager.disable_selinux()
        
        # 生成追踪脚本
        config = SmallTraceConfig(
            so_name=so_name,
            symbol=symbol,
            trace_mode=0,  # 符号追踪
            args_count=args_count,
            output_file=output_file,
            show_hexdump=show_hexdump
        )
        
        script_content = manager.generate_trace_script(config)
        
        # 执行脚本
        log_info("📜 注入追踪脚本...")
        session.execute_js(script_content)
        
        # 保存配置
        session._smalltrace_output = output_file
        session._smalltrace_package = getattr(session, 'app_name', None)
        
        log_success("✅ Small-Trace 已启动")
        log_info(f"   📦 目标应用: {session._smalltrace_package}")
        log_info(f"   📁 输出文件: {output_file}")
        log_info("   触发目标函数后，使用 'smalltrace_pull' 拉取追踪日志")
        
    except Exception as e:
        log_error(f"❌ Small-Trace 启动失败: {e}")


def _handle_smalltrace_pull_command(session, output_file):
    """处理 smalltrace_pull 拉取日志命令"""
    try:
        manager = get_smalltrace_manager()
        
        # 智能获取包名：优先使用已保存的配置，其次使用当前会话的 app_name
        package_name = getattr(session, '_smalltrace_package', None) or \
                       getattr(session, 'app_name', None)
        
        # 智能获取输出文件：用户未指定则使用之前保存的路径
        if output_file is None:
            output_file = getattr(session, '_smalltrace_output', None)
        else:
            output_file = os.path.expanduser(output_file)
        
        if not package_name:
            log_error("❌ 未知应用包名")
            log_info("   请先运行 smalltrace 命令，或指定包名:")
            log_info("   用法: smalltrace_pull <output_file>")
            return
        
        if not output_file:
            # 如果还没有保存的路径，生成一个新的
            output_file = _generate_trace_output_path(package_name)
        
        log_info(f"📥 拉取追踪日志")
        log_info(f"   📦 应用: {package_name}")
        log_info(f"   📁 保存到: {output_file}")
        
        # 拉取日志
        if manager.pull_trace_log(package_name, output_file):
            # 显示统计
            stats = manager.get_trace_stats(output_file)
            log_info(f"📊 追踪统计:")
            log_info(f"   总行数: {stats['total_lines']}")
            log_info(f"   指令数: {stats['instructions']}")
            log_info(f"   内存读: {stats['memory_reads']}")
            log_info(f"   内存写: {stats['memory_writes']}")
        
    except Exception as e:
        log_error(f"❌ 拉取追踪日志失败: {e}")


def _handle_smalltrace_analyze_command(trace_file: str):
    """处理 smalltrace_analyze 分析命令"""
    try:
        if not os.path.exists(trace_file):
            log_error(f"❌ 文件不存在: {trace_file}")
            return
        
        # 检查文件大小，决定是否使用快速模式
        file_size = os.path.getsize(trace_file)
        quick_mode = file_size > 10 * 1024 * 1024  # > 10MB 用快速模式
        
        if quick_mode:
            log_info(f"📊 文件较大 ({file_size // 1024 // 1024}MB)，使用快速模式分析...")
        
        analyzer = analyze_trace_file(trace_file, quick_mode=quick_mode)
        
        if analyzer:
            # 保存分析器供后续使用
            log_info("")
            log_info("💡 提示: 可使用以下命令进一步分析:")
            log_info("   - 查找特定偏移的指令: analyzer.find_instruction_at_offset(0x1234)")
            log_info("   - 查找内存访问: analyzer.find_memory_access_at_address(0x...)")
            log_info("   - 导出指令: analyzer.export_instructions_to_file('output.txt')")
        
    except Exception as e:
        log_error(f"❌ 分析失败: {e}")


def _handle_smalltrace_status_command(session):
    """处理 smalltrace_status 状态命令"""
    try:
        manager = get_smalltrace_manager()
        
        log_info("📊 Small-Trace 状态")
        log_info("=" * 50)
        
        # 检查追踪库
        if manager.check_libqdbi():
            log_success("✅ 追踪库: 已就绪")
        else:
            log_warning("⚠️ 追踪库: 未安装")
            log_info("   运行 smalltrace 命令会自动下载")
        
        # 检查 SELinux
        code, stdout, _ = manager._run_adb_shell('getenforce')
        selinux_status = stdout.strip() if code == 0 else "未知"
        if 'Permissive' in selinux_status or 'Disabled' in selinux_status:
            log_success(f"✅ SELinux: {selinux_status}")
        else:
            log_warning(f"⚠️ SELinux: {selinux_status}")
            log_info("   建议: adb shell su -c 'setenforce 0'")
        
        # 当前追踪配置
        log_info("")
        log_info("📋 当前追踪配置:")
        package = getattr(session, '_smalltrace_package', None) or getattr(session, 'app_name', None)
        output = getattr(session, '_smalltrace_output', None)
        if package:
            log_info(f"   📦 目标应用: {package}")
        else:
            log_warning("   📦 目标应用: 未设置 (请先运行 smalltrace 命令)")
        if output:
            log_info(f"   📁 输出文件: {output}")
        else:
            log_info(f"   📁 输出文件: ~/Desktop/qbdi_trace_{{包名}}_{{时间戳}}.log (自动生成)")
        
    except Exception as e:
        log_error(f"❌ 获取状态失败: {e}")


def _handle_stalker_trace_command(session, parts):
    """处理 stalker_trace Frida Stalker 追踪命令"""
    try:
        so_name = parts[1]
        offset = parse_offset(parts[2])
        output_file = os.path.expanduser(parts[3]) if len(parts) > 3 else "/tmp/stalker_trace.txt"
        
        log_info("🔍 Frida Stalker 汇编追踪")
        log_info(f"   目标: {so_name} @ 0x{offset:x}")
        log_info(f"   输出: {output_file} (设备上)")
        
        # 生成 Stalker 追踪脚本
        script_content = f'''
(function() {{
    const moduleName = "{so_name}";
    const targetOffset = {hex(offset)};
    const traceFile = new File("{output_file}", "w");
    
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("     Frida Stalker 汇编追踪");
    console.log("═══════════════════════════════════════════════════════════════");
    
    const mod = Process.findModuleByName(moduleName);
    if (!mod) {{
        console.log("[-] 模块未找到: " + moduleName);
        return;
    }}
    
    console.log("[+] 模块基址: " + mod.base);
    const targetAddr = mod.base.add(targetOffset);
    console.log("[+] 目标地址: " + targetAddr);
    
    let callCount = 0;
    let instructionCount = 0;
    
    Interceptor.attach(targetAddr, {{
        onEnter: function(args) {{
            this.threadId = Process.getCurrentThreadId();
            callCount++;
            instructionCount = 0;
            
            console.log("\\n[*] 函数调用 #" + callCount);
            traceFile.write("\\n========== 函数调用 #" + callCount + " ==========\\n");
            traceFile.write("地址: " + targetAddr + "\\n\\n");
            
            Stalker.flush();
            Stalker.follow(this.threadId, {{
                events: {{
                    call: false,
                    ret: false,
                    exec: true,
                    block: false,
                    compile: false
                }},
                onReceive: function(events) {{
                    // 解析事件
                }}
            }});
        }},
        onLeave: function(retval) {{
            Stalker.unfollow(this.threadId);
            Stalker.flush();
            
            console.log("[*] 函数返回: " + retval);
            traceFile.write("\\n返回值: " + retval + "\\n");
            traceFile.write("==========================================\\n");
            traceFile.flush();
        }}
    }});
    
    console.log("[+] Stalker Hook 已设置");
    console.log("    触发目标函数后将记录汇编指令流");
    console.log("    输出文件: {output_file}");
}})();
'''
        
        # 执行脚本
        session.execute_js(script_content)
        
        log_success("✅ Stalker 追踪已启动")
        
    except Exception as e:
        log_error(f"❌ Stalker 追踪启动失败: {e}")


def _handle_custom_function_command(session, cmd, parts):
    """
    处理自定义函数命令
    
    Args:
        session: FridacSession实例
        cmd: 命令名
        parts: 命令参数列表
        
    Returns:
        bool: 是否处理了该命令
    """
    try:
        custom_manager = get_custom_script_manager()
        if not custom_manager:
            return False
        
        # 检查是否是自定义函数
        custom_function = custom_manager.get_function(cmd)
        if not custom_function:
            return False
        
        log_info(f"🎯 执行自定义函数: {cmd}")
        
        # 构建JavaScript调用
        if len(parts) > 1:
            # 有参数
            args = ', '.join([f"'{arg}'" if not arg.isdigit() and arg.lower() not in ['true', 'false'] else arg 
                             for arg in parts[1:]])
            js_call = f"{cmd}({args})"
        else:
            # 无参数
            js_call = f"{cmd}()"
        
        # 如果函数支持任务管理，创建任务
        if custom_function.task_capable and session.task_manager and session.script_engine:
            try:
                # 生成自定义脚本任务
                script_source = session.script_engine.generate_custom_script(
                    f"Java.perform(function() {{ {js_call}; }});", 0  # task_id will be set by manager
                )
                
                task_id = session.task_manager.create_task(
                    TaskType.CUSTOM_HOOK,
                    cmd,
                    script_source,
                    f"自定义函数: {cmd}",
                    {'custom_function': cmd, 'args': parts[1:] if len(parts) > 1 else []}
                )
                
                if task_id > 0:
                    log_success(f"✅ 自定义函数任务已创建: #{task_id}")
                else:
                    # 降级到直接执行
                    session.execute_js(js_call)
                    
            except Exception as e:
                log_warning(f"⚠️ 创建自定义函数任务失败，降级到直接执行: {e}")
                session.execute_js(js_call)
        else:
            # 直接执行
            session.execute_js(js_call)
        
        return True
        
    except Exception as e:
        log_error(f"❌ 执行自定义函数失败: {e}")
        return False
