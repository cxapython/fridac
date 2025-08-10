"""
fridac 日志系统模块
提供统一的日志输出和格式化功能
"""

from datetime import datetime
import json

# Rich 导入（用于美观的终端界面），缺失时优雅降级
try:
    from rich.console import Console
    from rich.panel import Panel
    from rich.text import Text
    from rich.align import Align
    from rich.box import DOUBLE
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False
    Console = None

# 初始化 Rich 控制台
console = Console() if RICH_AVAILABLE else None

def log_info(message, **kwargs):
    """信息日志（支持 rich 格式化）"""
    if RICH_AVAILABLE:
        timestamp = datetime.now().strftime("%H:%M:%S")
        console.print(f"[dim]{timestamp}[/dim] [cyan]ℹ️[/cyan] {message}", **kwargs)
    else:
        print(f"ℹ️  {message}")

def log_success(message, **kwargs):
    """成功日志（支持 rich 格式化）"""
    if RICH_AVAILABLE:
        timestamp = datetime.now().strftime("%H:%M:%S")
        console.print(f"[dim]{timestamp}[/dim] [green]✅[/green] {message}", **kwargs)
    else:
        print(f"✅ {message}")

def log_warning(message, **kwargs):
    """警告日志（支持 rich 格式化）"""
    if RICH_AVAILABLE:
        timestamp = datetime.now().strftime("%H:%M:%S")
        console.print(f"[dim]{timestamp}[/dim] [yellow]⚠️[/yellow] {message}", **kwargs)
    else:
        print(f"⚠️  {message}")

def log_error(message, **kwargs):
    """错误日志（支持 rich 格式化）"""
    if RICH_AVAILABLE:
        timestamp = datetime.now().strftime("%H:%M:%S")
        console.print(f"[dim]{timestamp}[/dim] [red]❌[/red] {message}", **kwargs)
    else:
        print(f"❌ {message}")

def log_debug(message, **kwargs):
    """调试日志（支持 rich 格式化）"""
    if RICH_AVAILABLE:
        timestamp = datetime.now().strftime("%H:%M:%S")
        console.print(f"[dim]{timestamp}[/dim] [magenta]🔍[/magenta] {message}", **kwargs)
    else:
        print(f"🔍 {message}")

def show_banner():
    """显示 fridac 横幅（Banner）"""
    if RICH_AVAILABLE:
        banner_text = Text()
        banner_text.append("🔧 ", style="bold cyan")
        banner_text.append("fridac", style="bold green")
        banner_text.append(" - Enhanced Frida CLI Tool", style="bold white")
        
        panel = Panel(
            Align.center(banner_text),
            box=DOUBLE,
            border_style="cyan",
            padding=(1, 2)
        )
        console.print(panel)
    else:
        print("🔧 fridac - Enhanced Frida CLI Tool")

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
