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

from .logger import log_info, log_success, log_error, log_debug, get_console
from .completer import FridacCompleter
from .script_manager import create_frida_script

# History file for command history
HISTORY_FILE = os.path.expanduser("~/.fridac_history")

def setup_history():
    """Setup command history and auto-completion"""
    try:
        readline.read_history_file(HISTORY_FILE)
        readline.set_history_length(1000)
    except FileNotFoundError:
        pass
    
    # Setup auto-completion
    completer = FridacCompleter()
    readline.set_completer(completer.complete)
    
    # Enable tab completion
    if rlcompleter:
        readline.parse_and_bind("tab: complete")
    
    # Set completion delimiters (don't break on these characters)
    readline.set_completer_delims(' \t\n`!@#$%^&*()=+[{]}\\|;:,<>?')
    
    def save_history():
        try:
            readline.write_history_file(HISTORY_FILE)
        except:
            pass
    
    atexit.register(save_history)

class FridacSession:
    """Frida session management class"""
    
    def __init__(self):
        self.session = None
        self.script = None
        self.device = None
        self.target_process = None
        self.running = False
        
    def on_message(self, message, data):
        """Handle messages from Frida script with enhanced logging"""
        console = get_console()
        
        if message['type'] == 'send':
            payload = message['payload']
            if RICH_AVAILABLE and console:
                # Try to format JavaScript output nicely
                if isinstance(payload, str) and (payload.startswith('{') or payload.startswith('[')):
                    try:
                        import json
                        formatted = json.loads(payload)
                        console.print(formatted)
                    except:
                        console.print(payload)
                else:
                    console.print(payload)
            else:
                print(payload)
        elif message['type'] == 'error':
            log_error("脚本错误: {}".format(message['description']))
    
    def connect_to_app(self, app_name, spawn_mode=False):
        """Connect to target app"""
        try:
            # Get USB device with progress indicator
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
                # Spawn mode
                log_info("启动应用: {}".format(app_name))
                pid = self.device.spawn([app_name])
                self.target_process = self.device.attach(pid)
                self.device.resume(pid)
                log_success("应用已启动 (PID: {})".format(pid))
            else:
                # Attach mode  
                log_info("连接到应用: {}".format(app_name))
                self.target_process = self.device.attach(app_name)
                log_success("已连接到运行中的应用")
            
            # Load and create script
            log_info("正在加载 Frida 脚本...")
            js_script = create_frida_script()
            if not js_script:
                return False
                
            self.script = self.target_process.create_script(js_script)
            self.script.on('message', self.on_message)
            self.script.load()
            
            self.running = True
            log_success("Frida 脚本已加载，会话建立成功!")
            return True
            
        except frida.ProcessNotFoundError:
            log_error("找不到进程: {}".format(app_name))
            return False
        except frida.ServerNotRunningError:
            log_error("Frida 服务器未运行，请确保设备已连接并启动 frida-server")
            return False
        except Exception as e:
            log_error("连接失败: {}".format(e))
            return False
    
    def execute_js(self, js_code):
        """Execute JavaScript code with enhanced error handling"""
        if not self.script:
            log_error("没有活动的脚本会话")
            return
            
        try:
            # Handle special exit commands
            if js_code.strip().lower() in ['q', 'quit', 'exit']:
                self.running = False
                return
            
            # Show what we're executing for complex commands
            if len(js_code) > 50 or '\n' in js_code:
                log_debug("执行 JavaScript: {}...".format(js_code[:50]))
            
            # Execute the JavaScript code through RPC
            result = self.script.exports.eval(js_code)
            
        except Exception as e:
            log_error("执行错误: {}".format(e))
    
    def disconnect(self):
        """Disconnect from target with graceful cleanup"""
        self.running = False
        if self.script:
            try:
                self.script.unload()
                log_debug("脚本已卸载")
            except:
                pass
        if self.target_process:
            try:
                self.target_process.detach()
                log_debug("进程已分离")
            except:
                pass
        log_success("已断开连接")

def run_interactive_session(session):
    """Run the interactive session loop"""
    console = get_console()
    
    # Setup command history and completion
    setup_history()
    
    # Show beautiful interactive mode information
    if RICH_AVAILABLE and console:
        _show_rich_interactive_info()
    else:
        _show_basic_interactive_info()
    
    # Interactive loop
    while session.running:
        try:
            # Get user input with rich prompt if available
            if RICH_AVAILABLE and console:
                user_input = Prompt.ask(
                    "[bold cyan]fridac[/bold cyan][dim]>[/dim]",
                    default="",
                    show_default=False
                ).strip()
            else:
                user_input = input("fridac> ").strip()
            
            if not user_input:
                continue
                
            # Handle exit commands
            if user_input.lower() in ['q', 'quit', 'exit']:
                log_info("正在退出...")
                break
            
            # Execute JavaScript code
            session.execute_js(user_input)
            
        except KeyboardInterrupt:
            log_info("正在退出...")
            break
        except EOFError:
            log_info("正在退出...")
            break

def _show_rich_interactive_info():
    """Show interactive information with Rich UI"""
    console = get_console()
    if not console:
        return
        
    # Show examples
    example_table = Table(title="📝 常用命令示例", box=ROUNDED, show_header=True, header_style="bold blue")
    example_table.add_column("功能说明", style="green", width=35)
    example_table.add_column("使用示例", style="cyan", width=55)
    
    examples = [
        ("🏛️ 跟踪类的所有方法", "[cyan]traceClass[/cyan]('com.example.MainActivity')"),
        ("🏛️ 跟踪类的所有方法（新函数）", "[cyan]hookAllMethodsInJavaClass[/cyan]('com.example.MainActivity')"),
        ("🎯 跟踪特定方法", "[cyan]traceMethod[/cyan]('com.example.Class.method')"),
        ("🎯 跟踪特定方法（新函数）", "[cyan]hookJavaMethodWithTracing[/cyan]('com.example.Class.method', true)"),
        ("🔥 高级方法追踪（字段+彩色）", "[cyan]advancedMethodTracing[/cyan]('com.example.Class.method', true, true)"),
        ("📦 批量Hook（黑白名单）", "[cyan]batchHookWithFilters[/cyan]('com.example', 'test', null)"),
        ("🚀 Hook所有应用类", "[cyan]hookAllApplicationClasses[/cyan](true)"),
        ("🔒 绕过反调试检测", "[cyan]bypassTracerPidDetection[/cyan]()"),
        ("📋 可管理的方法Hook", "var id = [cyan]traceMethodWithJob[/cyan]('com.example.Class.method', true)"),
        ("📊 查看所有活跃任务", "[cyan]jobs[/cyan]()"),
        ("❌ 取消指定任务", "[cyan]kill[/cyan](id)"),
        ("❓ 任务管理帮助", "[cyan]jobhelp[/cyan]()"),
        ("🔍 查找匹配的类并显示方法", "[cyan]findClasses[/cyan]('MainActivity', true)"),
        ("📋 枚举包下的所有类", "[cyan]enumAllClasses[/cyan]('com.example')"),
        ("📚 显示完整帮助信息", "[cyan]help[/cyan]()")
    ]
    
    for desc, cmd in examples:
        example_table.add_row(desc, cmd)
    
    # Show completion helper
    completer = FridacCompleter()
    completer.show_completion_help()

def _show_basic_interactive_info():
    """Show interactive information in basic mode"""
    print("\n" + "="*60)
    print("🎯 进入交互模式 - 智能补全已启用")
    print("💡 使用 Tab 键自动补全函数名和类名")
    print("📝 可以直接调用 JS 函数，例如:")
    print("   traceClass('com.example.MainActivity')")
    print("   hookAllMethodsInJavaClass('com.example.MainActivity')  # 新函数名")
    print("   traceMethod('com.example.Class.method')")
    print("   hookJavaMethodWithTracing('com.example.Class.method', true)  # 新函数名")
    print("   advancedMethodTracing('com.example.Class.method', true, true)  # 高级追踪")
    print("   batchHookWithFilters('com.example', 'test', null)  # 批量Hook")
    print("   bypassTracerPidDetection()  # 绕过反调试")
    print("   var id = traceMethodWithJob('com.example.Class.method', true)  # 可管理Hook")
    print("   jobs()  # 查看任务")
    print("   kill(id)  # 取消任务")
    print("   findClasses('MainActivity', true)")
    print("📚 输入 help() 查看所有可用函数")
    print("🚪 输入 q 或 exit 退出")
    print("="*60 + "\n")
