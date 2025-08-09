"""
fridac 日志系统模块
提供统一的日志输出和格式化功能
"""

from datetime import datetime

# Rich imports for beautiful UI
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

# Initialize Rich console
console = Console() if RICH_AVAILABLE else None

def log_info(message, **kwargs):
    """Enhanced info logging with rich formatting"""
    if RICH_AVAILABLE:
        timestamp = datetime.now().strftime("%H:%M:%S")
        console.print(f"[dim]{timestamp}[/dim] [cyan]ℹ️[/cyan] {message}", **kwargs)
    else:
        print(f"ℹ️  {message}")

def log_success(message, **kwargs):
    """Enhanced success logging with rich formatting"""
    if RICH_AVAILABLE:
        timestamp = datetime.now().strftime("%H:%M:%S")
        console.print(f"[dim]{timestamp}[/dim] [green]✅[/green] {message}", **kwargs)
    else:
        print(f"✅ {message}")

def log_warning(message, **kwargs):
    """Enhanced warning logging with rich formatting"""
    if RICH_AVAILABLE:
        timestamp = datetime.now().strftime("%H:%M:%S")
        console.print(f"[dim]{timestamp}[/dim] [yellow]⚠️[/yellow] {message}", **kwargs)
    else:
        print(f"⚠️  {message}")

def log_error(message, **kwargs):
    """Enhanced error logging with rich formatting"""
    if RICH_AVAILABLE:
        timestamp = datetime.now().strftime("%H:%M:%S")
        console.print(f"[dim]{timestamp}[/dim] [red]❌[/red] {message}", **kwargs)
    else:
        print(f"❌ {message}")

def log_debug(message, **kwargs):
    """Enhanced debug logging with rich formatting"""
    if RICH_AVAILABLE:
        timestamp = datetime.now().strftime("%H:%M:%S")
        console.print(f"[dim]{timestamp}[/dim] [magenta]🔍[/magenta] {message}", **kwargs)
    else:
        print(f"🔍 {message}")

def show_banner():
    """Display beautiful fridac banner"""
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
    """Get Rich console instance if available"""
    return console if RICH_AVAILABLE else None

def is_rich_available():
    """Check if Rich is available"""
    return RICH_AVAILABLE
