"""
fridac 日志系统模块
提供统一的日志输出和格式化功能
"""

from datetime import datetime

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
