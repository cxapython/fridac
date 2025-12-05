"""
fridac 日志系统模块
提供统一的日志输出和格式化功能
"""

from datetime import datetime
import json
import sys
import traceback

# Rich 导入（用于美观的终端界面），缺失时优雅降级
try:
    from rich.console import Console
    from rich.panel import Panel
    from rich.text import Text
    from rich.align import Align
    from rich.box import DOUBLE
    from rich.markup import escape as _rich_escape
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False
    Console = None
    def _rich_escape(x):
        try:
            return str(x)
        except Exception:
            return x

# 初始化 Rich 控制台
console = Console() if RICH_AVAILABLE else None

def log_info(message, **kwargs):
    """信息日志（支持 rich 格式化）"""
    if RICH_AVAILABLE:
        timestamp = datetime.now().strftime("%H:%M:%S")
        console.print(f"[dim]{timestamp}[/dim] [cyan]ℹ️[/cyan] {_rich_escape(message)}", **kwargs)
    else:
        print(f"ℹ️  {message}")

def log_success(message, **kwargs):
    """成功日志（支持 rich 格式化）"""
    if RICH_AVAILABLE:
        timestamp = datetime.now().strftime("%H:%M:%S")
        console.print(f"[dim]{timestamp}[/dim] [green]✅[/green] {_rich_escape(message)}", **kwargs)
    else:
        print(f"✅ {message}")

def log_warning(message, **kwargs):
    """警告日志（支持 rich 格式化）"""
    if RICH_AVAILABLE:
        timestamp = datetime.now().strftime("%H:%M:%S")
        console.print(f"[dim]{timestamp}[/dim] [yellow]⚠️[/yellow] {_rich_escape(message)}", **kwargs)
    else:
        print(f"⚠️  {message}")

def log_error(message, **kwargs):
    """错误日志（支持 rich 格式化）"""
    if RICH_AVAILABLE:
        timestamp = datetime.now().strftime("%H:%M:%S")
        console.print(f"[dim]{timestamp}[/dim] [red]❌[/red] {_rich_escape(message)}", **kwargs)
    else:
        print(f"❌ {message}")

def log_debug(message, **kwargs):
    """调试日志（支持 rich 格式化）"""
    if RICH_AVAILABLE:
        timestamp = datetime.now().strftime("%H:%M:%S")
        console.print(f"[dim]{timestamp}[/dim] [magenta]🔍[/magenta] {_rich_escape(message)}", **kwargs)
    else:
        print(f"🔍 {message}")

def log_exception(prefix_message, exc: Exception = None):
    """
    输出带文件名与行号的异常信息，并附加完整 traceback。
    Args:
        prefix_message (str): 前缀提示语，例如 "运行出错"。
        exc (Exception): 异常对象；若为空则使用当前异常信息。
    """
    # 捕获当前异常信息
    exc_type, exc_value, exc_tb = sys.exc_info()
    if exc is not None and (exc_value is None or exc_value is exc):
        # 使用传入异常对象配合当前 traceback
        exc_value = exc
    # 提取最后一帧用于快速定位
    location = None
    try:
        if exc_tb is not None:
            last = traceback.extract_tb(exc_tb)[-1]
            location = f"{last.filename}:{last.lineno} in {last.name}"
    except Exception:
        location = None
    # 组装标题
    title = prefix_message
    if exc_value is not None:
        title = f"{prefix_message}: {exc_value}"
    if location:
        title = f"{title}  (at {location})"
    # 打印标题
    log_error(title)
    # 打印完整 traceback
    try:
        tb_text = ''.join(traceback.format_exception(exc_type or type(exc_value), exc_value, exc_tb))
    except Exception:
        tb_text = None
    if tb_text:
        if RICH_AVAILABLE and console is not None:
            try:
                console.print(tb_text)
            except Exception:
                print(tb_text)
        else:
            print(tb_text)

def show_banner(env_info=None):
    """
    显示 fridac 横幅（Banner）
    Args:
        env_info (dict): 环境信息字典，包含 python_version, frida_version 等
    """
    # 纯块字符 ASCII 艺术（避免线条字符宽度不一致问题）
    ascii_art = (
        "  ███████ ██████  ██ ██████   █████   ██████\n"
        "  ██      ██   ██ ██ ██   ██ ██   ██ ██\n"
        "  █████   ██████  ██ ██   ██ ███████ ██\n"
        "  ██      ██   ██ ██ ██   ██ ██   ██ ██\n"
        "  ██      ██   ██ ██ ██████  ██   ██  ██████"
    )
    
    # 构建版本副标题
    if env_info:
        py_ver = env_info.get('version', '?')
        # 简化 Python 版本显示（只显示主要版本号）
        if '.' in py_ver:
            parts = py_ver.split('.')
            py_ver = f"{parts[0]}.{parts[1]}" if len(parts) >= 2 else py_ver
        
        frida_ver = env_info.get('frida_version', '?')
        # 简化 Frida 版本显示
        if frida_ver and frida_ver != 'unknown':
            frida_parts = frida_ver.split('.')
            frida_ver = f"{frida_parts[0]}.{frida_parts[1]}" if len(frida_parts) >= 2 else frida_ver
        
        status = "✅ Ready" if frida_ver and frida_ver != 'unknown' else "⚠️ Frida未安装"
        subtitle = f"Python {py_ver} │ Frida {frida_ver} │ {status}"
    else:
        subtitle = "Enhanced Frida CLI Tool"
    
    if RICH_AVAILABLE:
        from rich.text import Text as RichText
        
        # 渲染 ASCII 艺术，使用渐变色
        lines = ascii_art.split('\n')
        lines = [l for l in lines if l.strip()]  # 移除空行但保留缩进
        colors = ['bright_cyan', 'cyan', 'blue', 'bright_blue', 'magenta', 'bright_magenta']
        
        console.print()  # 空行
        for i, line in enumerate(lines):
            color = colors[i % len(colors)]
            console.print(f"[{color}]{line}[/{color}]")
        
        # 副标题居中显示
        console.print()
        console.print(f"[dim]{subtitle.center(50)}[/dim]")
        console.print()
    else:
        # 无 Rich 时的降级显示
        print(ascii_art)
        print(f"         {subtitle}")
        print()

def get_console():
    """获取 Rich 控制台实例（若可用）"""
    return console if RICH_AVAILABLE else None

def is_rich_available():
    """检查 Rich 是否可用"""
    return RICH_AVAILABLE


def render_structured_event(payload, task_id=None):
    """
    统一渲染来自 JS 的结构化 JSON 事件
    支持字段: type, ts/timestamp, pid, tid, items, message 等
    Args:
        payload (dict): 结构化事件对象
        task_id (int|str|None): 可选的任务ID，用于展示前缀
    """
    try:
        if not isinstance(payload, dict):
            # 非字典，退化为普通日志
            log_info(str(payload))
            return

        evt_type = payload.get('type') or payload.get('event') or 'event'
        ts = payload.get('ts') or payload.get('timestamp')
        pid = payload.get('pid')
        tid = payload.get('tid')
        items = payload.get('items')

        # 事件类型到图标/颜色的简单映射
        icon_map = {
            'stalker_summary': ('📈', 'cyan'),
            'dns_query': ('🔎', 'cyan'),
            'net_connect': ('🌐', 'cyan'),
            'net_send': ('📤', 'white'),
            'net_recv': ('📥', 'white'),
            'net_accept': ('🤝', 'green'),
            'net_sendmsg': ('📤', 'white'),
            'net_recvmsg': ('📥', 'white'),
            'task_hit': ('🎯', 'green'),
            'task_error': ('❌', 'red'),
            'event': ('🔔', 'white'),
        }

        icon, color = icon_map.get(evt_type, ('🔔', 'white'))

        # 时间戳格式化
        try:
            if isinstance(ts, (int, float)):
                # ts 可能是毫秒
                if ts > 10_000_000_000:
                    ts_dt = datetime.fromtimestamp(ts / 1000.0)
                else:
                    ts_dt = datetime.fromtimestamp(ts)
                ts_str = ts_dt.strftime('%H:%M:%S')
            else:
                ts_str = datetime.now().strftime('%H:%M:%S')
        except Exception:
            ts_str = datetime.now().strftime('%H:%M:%S')

        prefix = f"[#${task_id}] " if task_id is not None else ""
        header = f"{prefix}{icon} {evt_type}"
        meta_parts = []
        if pid is not None:
            meta_parts.append(f"pid={pid}")
        if tid is not None:
            meta_parts.append(f"tid={tid}")
        meta_str = (" [" + ", ".join(meta_parts) + "]") if meta_parts else ""

        # 优先使用 rich 进行结构化展示
        if RICH_AVAILABLE and console is not None:
            try:
                from rich.text import Text
                console.print(Text(f"[dim]{ts_str}[/dim] {header}{meta_str}", style=color))
                # 渲染 items 或 payload 体
                body = items if items is not None else {k: v for k, v in payload.items() if k not in ('type', 'ts', 'timestamp', 'pid', 'tid')}
                if body is not None and body != {}:
                    console.print(body)
                return
            except Exception:
                pass

        # 无 rich 或渲染失败时的降级输出
        print(f"{ts_str} {header}{meta_str}")
        body = items if items is not None else {k: v for k, v in payload.items() if k not in ('type', 'ts', 'timestamp', 'pid', 'tid')}
        if body is not None and body != {}:
            try:
                print(json.dumps(body, ensure_ascii=False))
            except Exception:
                print(str(body))
    except Exception as e:
        log_error(f"结构化事件渲染失败: {e}")
