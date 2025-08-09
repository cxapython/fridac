"""
fridac 环境检测和配置模块
处理Python环境、Frida版本检测和设备连接
"""

import sys
import subprocess
import frida

try:
    from rich.console import Console
    from rich.table import Table
    from rich.box import SIMPLE
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False

from .logger import log_warning, log_error, log_success, get_console

def detect_python_environment():
    """Detect current Python environment and corresponding Frida version"""
    python_info = {
        'version': 'unknown',
        'executable': sys.executable,
        'frida_version': 'unknown',
        'using_pyenv': False
    }
    
    try:
        # Get Python version
        python_version = "{}.{}.{}".format(sys.version_info.major, sys.version_info.minor, sys.version_info.micro)
        python_info['version'] = python_version
        
        # Check if pyenv is available and active
        pyenv_available = False
        try:
            pyenv_result = subprocess.run(['pyenv', 'version'], 
                                        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                        universal_newlines=True)
            if pyenv_result.returncode == 0:
                pyenv_version = pyenv_result.stdout.split()[0]
                python_info['pyenv_version'] = pyenv_version
                python_info['using_pyenv'] = True
                pyenv_available = True
        except FileNotFoundError:
            # pyenv not found, use system python3
            pass
        except:
            pass
        
        # Determine which Python to use for Frida
        python_executable = sys.executable
        if not pyenv_available:
            # Try to use python3 if available and current is not python3
            try:
                # Check if python3 is available
                python3_result = subprocess.run(['python3', '--version'], 
                                              stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                              universal_newlines=True)
                if python3_result.returncode == 0:
                    # Use python3 as preferred executable
                    python_executable = 'python3'
                    python_info['executable'] = python_executable
                    # Update version info from python3
                    version_output = python3_result.stdout.strip()
                    if 'Python' in version_output:
                        version_parts = version_output.split()[1].split('.')
                        if len(version_parts) >= 3:
                            python_info['version'] = "{}.{}.{}".format(version_parts[0], version_parts[1], version_parts[2])
            except:
                # Fallback to current executable
                pass
        
        # Get Frida version using the determined executable
        frida_commands = [
            [python_executable, '-m', 'frida', '--version'],
            [python_executable, '-m', 'frida_tools.frida', '--version'],
            ['frida', '--version']  # System frida as fallback
        ]
        
        for cmd in frida_commands:
            try:
                result = subprocess.run(cmd, 
                                      stdout=subprocess.PIPE, stderr=subprocess.PIPE, 
                                      universal_newlines=True, timeout=5)
                if result.returncode == 0:
                    python_info['frida_version'] = result.stdout.strip()
                    break
            except:
                continue
            
    except Exception as e:
        log_warning("检测Python环境时出错: {}".format(e))
    
    return python_info

def get_frida_version():
    """Get current Frida version"""
    try:
        # Use environment detection to get the correct Python executable
        env_info = detect_python_environment()
        return env_info.get('frida_version', 'unknown')
    except:
        return "unknown"

def get_frontmost_app():
    """Get the frontmost (current foreground) application"""
    try:
        device = frida.get_usb_device()
        frontmost_app = device.get_frontmost_application()
        if frontmost_app and frontmost_app.identifier:
            return frontmost_app.identifier, frontmost_app.name
        return None, None
    except Exception as e:
        log_error("获取前台应用失败: {}".format(e))
        return None, None

def find_target_app():
    """Find the target application automatically"""
    try:
        # Detect environment to get the correct Python executable
        env_info = detect_python_environment()
        python_executable = env_info.get('executable', sys.executable)
        
        # Get list of running apps using determined Python executable
        frida_ps_commands = [
            [python_executable, '-m', 'frida_tools.ps', '-Ua'],
            [python_executable, '-m', 'frida_tools.frida_ps', '-Ua'],
            ['frida-ps', '-Ua']  # System frida-ps as fallback
        ]
        
        result = None
        for cmd in frida_ps_commands:
            try:
                result = subprocess.run(cmd, 
                                      stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                      universal_newlines=True, timeout=10)
                if result.returncode == 0:
                    break
            except:
                continue
        
        if not result or result.returncode != 0:
            log_error("无法获取应用列表，请检查 Frida 安装")
            return None
        
        lines = result.stdout.strip().split('\n')[1:]  # Skip header
        
        if not lines:
            log_error("没有找到运行的应用程序")
            return None
        
        # Parse apps data
        apps = []
        for line in lines:
            line = line.strip()
            if not line:  # Skip empty lines
                continue
            # frida-ps -Ua output: PID, Name, Identifier
            # Split into at most 3 parts to handle spaces in names
            parts = line.split(None, 2)
            if len(parts) >= 3:
                pid = parts[0]
                name = parts[1]
                identifier = parts[2]
                # Validate PID is numeric
                if pid.isdigit():
                    apps.append((pid, name, identifier))
        
        if not apps:
            log_error("没有找到可用的应用程序")
            return None
        
        return _select_app_from_list(apps)
            
    except Exception as e:
        log_error("获取应用程序列表失败: {}".format(e))
        return None

def _select_app_from_list(apps):
    """Select app from list with Rich UI"""
    console = get_console()
    
    # Show available apps with rich table
    if RICH_AVAILABLE and console:
        from rich.table import Table
        from rich.box import ROUNDED
        from rich.prompt import Prompt
        
        app_table = Table(title="📱 可用的应用程序", box=ROUNDED, show_header=True, header_style="bold cyan")
        app_table.add_column("序号", style="magenta", width=6, justify="center")
        app_table.add_column("应用名称", style="green", min_width=15)
        app_table.add_column("包名", style="blue", min_width=20)
        app_table.add_column("PID", style="yellow", width=8, justify="center")
        
        for i, (pid, name, identifier) in enumerate(apps, 1):
            app_table.add_row(str(i), name, identifier, pid)
        
        console.print()
        console.print(app_table)
        console.print()
        
        # Auto-select if only one app, otherwise ask user
        if len(apps) == 1:
            selected_app = apps[0]
            log_success("自动选择: {} {}".format(selected_app[1], selected_app[2]))
            return selected_app[2]  # Return identifier (package name)
        else:
            while True:
                try:
                    choice = Prompt.ask(
                        "\n[bold cyan]请选择应用程序[/bold cyan]",
                        choices=[str(i) for i in range(1, len(apps) + 1)] + ['q', 'quit', 'exit'],
                        default='q',
                        show_choices=False
                    ).strip()
                    console.print(f"[dim]输入: {choice}[/dim]")
                    
                    # Check for quit command
                    if choice.lower() in ['q', 'quit', 'exit']:
                        log_info("退出选择")
                        return None
                    
                    if choice.isdigit():
                        idx = int(choice) - 1
                        if 0 <= idx < len(apps):
                            selected_app = apps[idx]
                            log_success("选择了: {} {}".format(selected_app[1], selected_app[2]))
                            return selected_app[2]  # Return identifier (package name)
                    
                    log_warning("无效的选择，请重新输入 (1-{} 或 q)".format(len(apps)))
                except KeyboardInterrupt:
                    log_info("操作取消")
                    return None
    else:
        # Fallback to basic mode
        from .logger import log_info
        log_info("可用的应用程序:")
        for i, (pid, name, identifier) in enumerate(apps, 1):
            print("  [{}] {} {} (PID: {})".format(i, name, identifier, pid))
        
        # Auto-select if only one app, otherwise ask user
        if len(apps) == 1:
            selected_app = apps[0]
            log_success("自动选择: {} {}".format(selected_app[1], selected_app[2]))
            return selected_app[2]  # Return identifier (package name)
        else:
            while True:
                try:
                    choice = input("\n请选择应用程序 (输入序号或 'q' 退出): ").strip()
                    
                    # Check for quit command
                    if choice.lower() in ['q', 'quit', 'exit']:
                        log_info("退出选择")
                        return None
                    
                    if choice.isdigit():
                        idx = int(choice) - 1
                        if 0 <= idx < len(apps):
                            selected_app = apps[idx]
                            log_success("选择了: {} {}".format(selected_app[1], selected_app[2]))
                            return selected_app[2]  # Return identifier (package name)
                    
                    log_warning("无效的选择，请重新输入 (1-{} 或 q)".format(len(apps)))
                except KeyboardInterrupt:
                    log_info("操作取消")
                    return None

def show_environment_info(env_info):
    """Display environment information"""
    console = get_console()
    
    if RICH_AVAILABLE and console:
        # Create environment info table
        env_table = Table(title="🔧 环境信息", box=SIMPLE, show_header=True, header_style="bold blue")
        env_table.add_column("组件", style="cyan", min_width=10)
        env_table.add_column("版本/路径", style="green", min_width=30)
        env_table.add_column("状态", style="yellow", min_width=15)
        
        # Python info
        python_status = "✅ 正常" if env_info['version'] != 'unknown' else "❌ 异常"
        env_table.add_row("Python", f"{env_info['version']} ({env_info['executable']})", python_status)
        
        # Pyenv info
        if env_info.get('using_pyenv') and 'pyenv_version' in env_info:
            env_table.add_row("pyenv", env_info['pyenv_version'], "✅ 激活")
        else:
            env_table.add_row("pyenv", "系统 Python", "⚪ 未使用")
        
        # Frida info
        frida_status = "✅ 可用" if env_info['frida_version'] != 'unknown' else "❌ 未安装"
        env_table.add_row("Frida", env_info['frida_version'], frida_status)
        
        console.print()
        console.print(env_table)
        console.print()
    else:
        from .logger import log_info
        log_info("Python: {} ({})".format(env_info['version'], env_info['executable']))
        if env_info.get('using_pyenv') and 'pyenv_version' in env_info:
            log_info("pyenv: {}".format(env_info['pyenv_version']))
        elif not env_info.get('using_pyenv'):
            log_info("环境: 系统 Python (未使用 pyenv)")
        log_info("Frida: {}".format(env_info['frida_version']))
