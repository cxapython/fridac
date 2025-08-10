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
from .task_manager import FridaTaskManager, TaskType, TaskStatus
from .script_templates import ScriptTemplateEngine

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
    
    # Enable tab completion (libedit vs GNU readline 兼容)
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
        
        # 任务管理器 (多脚本管理)
        self.task_manager = None
        self.script_engine = None
        
    def on_message(self, message, data):
        """Handle messages from Frida script with enhanced logging"""
        console = get_console()
        
        if message['type'] == 'send':
            payload = message['payload']
            if RICH_AVAILABLE and console:
                # Rich 着色渲染（字符串启发式、JSON结构友好显示）
                try:
                    if isinstance(payload, str):
                        style = None
                        if payload.startswith('✅') or payload.startswith('🟢'):
                            style = 'green'
                        elif payload.startswith('❌') or payload.startswith('🔴'):
                            style = 'red'
                        elif payload.startswith('⚠️') or payload.startswith('🟡'):
                            style = 'yellow'
                        elif payload.startswith('🔍') or payload.startswith('📚') or payload.startswith('🌐'):
                            style = 'cyan'
                        elif payload.startswith('🔧') or payload.startswith('🎯'):
                            style = 'bright_white'
                        if style:
                            from rich.text import Text
                            console.print(Text(payload, style=style))
                        else:
                            console.print(payload)
                    else:
                        # 尝试作为JSON渲染
                        import json
                        try:
                            console.print(payload)
                        except Exception:
                            console.print(json.dumps(payload, ensure_ascii=False))
                except Exception:
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
            
            # 初始化任务管理器
            self._setup_task_manager()
            
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
    
    def _setup_task_manager(self):
        """初始化任务管理器"""
        try:
            # 传递session信息给任务管理器
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
        """Disconnect from target with graceful cleanup"""
        self.running = False
        
        # 清理所有任务
        if self.task_manager:
            try:
                self.task_manager.cleanup()
            except Exception as e:
                log_error(f"清理任务时出错: {e}")
        
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
            # 始终使用标准输入以启用 readline Tab 补全
            user_input = input("fridac> ").strip()
            
            if not user_input:
                continue
                
            # Handle exit commands
            if user_input.lower() in ['q', 'quit', 'exit']:
                log_info("正在退出...")
                break
            
            # 兼容 JS 风格的命令调用（如 hookurl() / kill(3) / hookbase64(true)）
            normalized_input = _normalize_cli_syntax(user_input)
            
            # Handle new task management commands (CLI 风格)
            if _handle_task_commands(session, normalized_input):
                continue
            
            # Execute JavaScript code
            session.execute_js(user_input)
            
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
        # 同时显示旧任务管理系统的任务
        try:
            result = session.script.exports.eval("typeof jobs !== 'undefined' ? jobs() : null")
        except:
            pass
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
    
    # 创建Hook任务的简化命令
    elif cmd == 'hookmethod':
        if len(parts) < 2:
            log_error("❌ 用法: hookmethod <class.method> [show_stack]")
            return True
        target = parts[1]
        show_stack = len(parts) > 2 and parts[2].lower() in ['true', '1', 'yes']
        options = {'show_stack': show_stack}
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
        options = {'show_stack': show_stack}
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
        options = {'show_stack': show_stack}
        task_id = session.create_hook_task('native', target, options)
        if task_id > 0:
            log_success(f"✅ Native Hook任务已创建: #{task_id}")
        return True
    
    elif cmd == 'hookbase64':
        show_stack = len(parts) > 1 and parts[1].lower() in ['true', '1', 'yes']
        options = {'hook_type': 'base64', 'show_stack': show_stack}
        task_id = session.create_hook_task('location', 'base64', options)
        if task_id > 0:
            log_success(f"✅ Base64 Hook任务已创建: #{task_id}")
        else:
            log_error("❌ Base64 Hook任务创建失败")
        return True
    
    elif cmd == 'hooktoast':
        show_stack = len(parts) > 1 and parts[1].lower() in ['true', '1', 'yes']
        options = {'hook_type': 'toast', 'show_stack': show_stack}
        task_id = session.create_hook_task('location', 'toast', options)
        if task_id > 0:
            log_success(f"✅ Toast Hook任务已创建: #{task_id}")
        return True
    
    elif cmd == 'hookarraylist':
        show_stack = len(parts) > 1 and parts[1].lower() in ['true', '1', 'yes']
        options = {'hook_type': 'arraylist', 'show_stack': show_stack}
        task_id = session.create_hook_task('location', 'arraylist', options)
        if task_id > 0:
            log_success(f"✅ ArrayList Hook任务已创建: #{task_id}")
        return True
    
    elif cmd == 'hookloadlibrary':
        show_stack = len(parts) > 1 and parts[1].lower() in ['true', '1', 'yes']
        options = {'hook_type': 'loadlibrary', 'show_stack': show_stack}
        task_id = session.create_hook_task('location', 'loadlibrary', options)
        if task_id > 0:
            log_success(f"✅ LoadLibrary Hook任务已创建: #{task_id}")
        return True
    
    elif cmd == 'hooknewstringutf':
        show_stack = len(parts) > 1 and parts[1].lower() in ['true', '1', 'yes']
        options = {'hook_type': 'newstringutf', 'show_stack': show_stack}
        task_id = session.create_hook_task('location', 'newstringutf', options)
        if task_id > 0:
            log_success(f"✅ NewStringUTF Hook任务已创建: #{task_id}")
        return True
    
    elif cmd == 'hookfileoperations':
        show_stack = len(parts) > 1 and parts[1].lower() in ['true', '1', 'yes']
        options = {'hook_type': 'fileoperations', 'show_stack': show_stack}
        task_id = session.create_hook_task('location', 'fileoperations', options)
        if task_id > 0:
            log_success(f"✅ File Operations Hook任务已创建: #{task_id}")
        return True
    
    elif cmd == 'hookjsonobject':
        show_stack = len(parts) > 1 and parts[1].lower() in ['true', '1', 'yes']
        options = {'hook_type': 'jsonobject', 'show_stack': show_stack}
        task_id = session.create_hook_task('location', 'jsonobject', options)
        if task_id > 0:
            log_success(f"✅ JSONObject Hook任务已创建: #{task_id}")
        return True
    
    elif cmd == 'hookhashmap':
        target_key = parts[1] if len(parts) > 1 else ""
        show_stack = len(parts) > 2 and parts[2].lower() in ['true', '1', 'yes']
        options = {'hook_type': 'hashmap', 'target_key': target_key, 'show_stack': show_stack}
        task_id = session.create_hook_task('location', 'hashmap', options)
        if task_id > 0:
            log_success(f"✅ HashMap Hook任务已创建: #{task_id}")
        return True
    
    elif cmd == 'hookedittext':
        show_stack = len(parts) > 1 and parts[1].lower() in ['true', '1', 'yes']
        options = {'hook_type': 'edittext', 'show_stack': show_stack}
        task_id = session.create_hook_task('location', 'edittext', options)
        if task_id > 0:
            log_success(f"✅ EditText Hook任务已创建: #{task_id}")
        return True
    
    elif cmd == 'hooklog':
        show_stack = len(parts) > 1 and parts[1].lower() in ['true', '1', 'yes']
        options = {'hook_type': 'log', 'show_stack': show_stack}
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
        options = {'hook_type': 'url', 'show_stack': show_stack}
        task_id = session.create_hook_task('location', 'url', options)
        if task_id > 0:
            log_success(f"✅ URL Hook任务已创建: #{task_id}")
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
        help_table.add_column("命令", style="green", width=20)
        help_table.add_column("说明", style="cyan", width=35)
        help_table.add_column("示例", style="yellow", width=35)
        
        commands = [
            ("tasks / jobs", "显示所有任务", "tasks, jobs running"),
            ("kill <id>", "终止指定任务", "kill 1"),
            ("killall [type]", "终止所有任务", "killall, killall method_hook"),
            ("taskinfo <id>", "显示任务详情", "taskinfo 1"),
            ("taskstats", "显示任务统计", "taskstats"),
            ("hookmethod", "创建方法Hook任务", "hookmethod com.app.Class.method true"),
            ("hookclass", "创建类Hook任务", "hookclass com.app.MainActivity"),
            ("hooknative", "创建Native Hook任务", "hooknative open true"),
            ("hookbase64", "创建Base64 Hook任务", "hookbase64 true"),
            ("hooktoast", "创建Toast Hook任务", "hooktoast"),
            ("taskhelp", "显示此帮助", "taskhelp")
        ]
        
        for cmd, desc, example in commands:
            help_table.add_row(cmd, desc, example)
        
        console.print()
        console.print(help_table)
        console.print()
        console.print("💡 [yellow]提示[/yellow]: 新的任务管理系统基于脚本隔离，每个任务运行在独立的Frida脚本中")
        console.print("🗑️  [yellow]优势[/yellow]: killall 命令现在可以真正清理所有Hook，不会残留")
        console.print()
    else:
        log_info("\n🎯 任务管理命令:")
        log_info("tasks/jobs      - 显示所有任务")
        log_info("kill <id>       - 终止指定任务")
        log_info("killall [type]  - 终止所有任务")
        log_info("taskinfo <id>   - 显示任务详情")
        log_info("taskstats       - 显示任务统计")
        log_info("hookmethod      - 创建方法Hook任务")
        log_info("hookclass       - 创建类Hook任务")
        log_info("hooknative      - 创建Native Hook任务")
        log_info("hookbase64      - 创建Base64 Hook任务")
        log_info("hooktoast       - 创建Toast Hook任务")
        log_info("taskhelp        - 显示此帮助")
        log_info("\n💡 提示: 新的任务管理系统基于脚本隔离，killall可以真正清理所有Hook\n")

def _show_rich_interactive_info():
    """Show interactive information with Rich UI"""
    console = get_console()
    if not console:
        return
        
    # 彩色“可用函数”总览（三列：函数名/描述/使用示例）
    table = Table(title="🚀 可用函数", box=ROUNDED, show_header=True, header_style="bold magenta")
    table.add_column("函数名", style="cyan", width=28)
    table.add_column("描述", style="green", width=36)
    table.add_column("使用示例", style="yellow", width=60)

    comp = FridacCompleter()
    # 组装行：从补全词典获取函数 → (描述, 示例)
    preferred_order = [
        # Java Hook
        'traceClass','traceMethod','findClasses','enumAllClasses','describeJavaClass','printStack',
        # 定位 Hook（新任务命令）
        'hookbase64','hooktoast','hookjsonobject','hookhashmap','hookarraylist','hookloadlibrary','hooknewstringutf','hookfileoperations','hooklog','hookurl',
        # 任务命令
        'tasks','taskinfo','taskstats','kill','killall',
        # Native
        'nativeHookNativeFunction','nativeFindModules','nativeFindExports','nativeFindImports','nativeSearchMemory','printNativeStack',
        'nativeHookDlopenFamily','nativeHookJNIFunctions','nativeHookCryptoFunctions','nativeHookNetworkFunctions','nativeHookAntiDebug','nativeAnalyzeSO',
        'nativeEnableAllHooks','nativeQuickHookCrypto','nativeQuickHookNetwork','nativeQuickAnalyzeApp',
        # 智能工具
        'smartTrace','intelligentHookDispatcher','loadNativeSupport'
    ]
    added = set()
    for name in preferred_order:
        if name in comp.functions and name not in added:
            desc, example = comp.functions[name]
            table.add_row(f"[cyan]{name}()[/cyan]" if not name.startswith('hook') and not name.startswith('task') and not name.startswith('kill') else f"[cyan]{name}[/cyan]", desc, example)
            added.add(name)
    # 其余函数补齐
    for name, (desc, example) in comp.functions.items():
        if name not in added:
            table.add_row(f"[cyan]{name}[/cyan]", desc, example)

    console.print()
    console.print(table)
    console.print()

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
