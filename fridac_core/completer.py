"""
fridac 自动补全系统模块
提供智能补全和函数帮助功能
"""

import readline

try:
    from rich.console import Console
    from rich.table import Table
    from rich.tree import Tree
    from rich.box import ROUNDED
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False

from .logger import get_console

class FridacCompleter:
    """Enhanced auto-completion for fridac commands with rich display"""
    
    def __init__(self):
        # Available functions for completion with descriptions and examples
        self.functions = {
            # Java Hook 函数
            'traceClass': ('🏛️  跟踪类的所有方法', "traceClass('com.example.MainActivity')"),
            'hookAllMethodsInJavaClass': ('🏛️  跟踪类的所有方法（新函数名）', "hookAllMethodsInJavaClass('com.example.MainActivity')"),
            'traceMethod': ('🎯 跟踪特定方法', "traceMethod('com.example.Class.method', true)"),
            'hookJavaMethodWithTracing': ('🎯 跟踪特定方法（新函数名）', "hookJavaMethodWithTracing('com.example.Class.method', true)"),
            'findClasses': ('🔍 查找匹配的类', "findClasses('MainActivity', true)"),
            'enumAllClasses': ('📋 枚举所有已加载的类', "enumAllClasses('com.example')"),
            'describeJavaClass': ('📖 描述Java类的详细信息', "describeJavaClass('java.lang.String')"),
            'printStack': ('📚 打印Java调用栈', "printStack()"),
            'findTragetClassLoader': ('🔗 查找目标类加载器', "findTragetClassLoader('com.example.Class')"),
            'findTargetClassLoaderForClass': ('🔗 查找目标类加载器（新函数名）', "findTargetClassLoaderForClass('com.example.Class')"),
            'printJavaCallStack': ('📚 打印Java调用栈（新函数名）', "printJavaCallStack(true, 50)"),
            'findStrInMap': ('🗺️ 监控HashMap查找key对应value', "findStrInMap('password', 1)"),
            
            # 高级追踪功能（基于 r0tracer）
            'bypassTracerPidDetection': ('🔒 绕过TracerPid检测', "bypassTracerPidDetection()"),
            'inspectObjectFields': ('🔍 检查对象字段详情', "inspectObjectFields(this, '上下文信息')"),
            'advancedMethodTracing': ('🎯 高级方法追踪', "advancedMethodTracing('com.example.Class.method', true, true)"),
            'batchHookWithFilters': ('📦 批量Hook（黑白名单）', "batchHookWithFilters('com.example', 'test', null)"),
            'hookAllApplicationClasses': ('🚀 Hook所有应用类', "hookAllApplicationClasses(true)"),
            
            # 任务管理系统（参考 objection）
            'jobs': ('📋 显示所有活跃任务', "jobs()"),
            'job': ('🔍 显示任务详情', "job(1)"),
            'kill': ('❌ 取消指定任务', "kill(1)"),
            'killall': ('🧹 取消所有任务', "killall()"),
            'pause': ('⏸️ 暂停任务', "pause(1)"),
            'resume': ('▶️ 恢复任务', "resume(1)"),
            'jobstats': ('📊 显示任务统计', "jobstats()"),
            'history': ('📚 显示任务历史', "history(20)"),
            'cleanup': ('🧹 清理已完成任务', "cleanup()"),
            'jobhelp': ('❓ 任务管理帮助', "jobhelp()"),
            
            # 带任务管理的Hook函数
            'traceMethodWithJob': ('🎯 带任务管理的方法Hook', "traceMethodWithJob('com.example.Class.method', true)"),
            'traceClassWithJob': ('🏛️ 带任务管理的类Hook', "traceClassWithJob('com.example.MainActivity')"),
            'advancedMethodTracingWithJob': ('🔥 带任务管理的高级追踪', "advancedMethodTracingWithJob('method', true, true)"),
            'batchHookWithJob': ('📦 带任务管理的批量Hook', "batchHookWithJob('com.example', 'test', null)"),
            
            # 定位Hook函数
            'hookBase64': ('🔐 Hook Base64编码解码', "hookBase64(1)"),
            'hookToast': ('🍞 Hook Toast显示', "hookToast(1)"),
            'hookJSONObject': ('📝 Hook JSONObject操作', "hookJSONObject(1)"),
            'hookHashMap': ('🗺️ Hook HashMap操作', "hookHashMap('key', 1)"),
            'hookEditText': ('📝 Hook EditText输入', "hookEditText(1)"),
            'hookArrayList': ('📋 Hook ArrayList操作', "hookArrayList(1)"),
            'hookLoadLibrary': ('📚 Hook 动态库加载', "hookLoadLibrary(1)"),
            'hookNewStringUTF': ('🔤 Hook JNI字符串创建', "hookNewStringUTF(1)"),
            'hookFileOperations': ('📁 Hook 文件操作', "hookFileOperations(1)"),
            'hookLog': ('📜 Hook Log输出', "hookLog(1)"),
            'hookURL': ('🌐 Hook URL请求', "hookURL(1)"),
            'enableAllHooks': ('🚀 启用所有定位Hook', "enableAllHooks(1)"),
            
            # Native Hook 函数
            'nativeHookNativeFunction': ('🔧 Hook Native 函数', "nativeHookNativeFunction('malloc', {argTypes: ['int']})"),
            'nativeFindModules': ('📦 查找加载的模块', "nativeFindModules(/libc/)"),
            'nativeFindExports': ('📤 查找模块导出函数', "nativeFindExports('libc.so', /malloc/)"),
            'nativeFindImports': ('📥 查找模块导入函数', "nativeFindImports('app', /strcpy/)"),
            'nativeSearchMemory': ('🔍 搜索内存模式', "nativeSearchMemory('48 89 e5')"),
            'printNativeStack': ('📚 打印Native调用栈', "printNativeStack()"),
            
            # 高级Native Hook
            'nativeHookDlopenFamily': ('📚 Hook动态库加载', "nativeHookDlopenFamily(1)"),
            'nativeHookJNIFunctions': ('☕ Hook JNI函数', "nativeHookJNIFunctions(1)"),
            'nativeHookCryptoFunctions': ('🔐 Hook加密算法', "nativeHookCryptoFunctions('aes', 1)"),
            'nativeHookNetworkFunctions': ('🌐 Hook网络函数', "nativeHookNetworkFunctions(1)"),
            'nativeHookAntiDebug': ('🛡️ Hook反调试检测', "nativeHookAntiDebug(1)"),
            'nativeAnalyzeSO': ('🔍 分析SO文件', "nativeAnalyzeSO('libtest.so', 1, 1)"),
            'nativeEnableAllHooks': ('🚀 启用所有Native Hook', "nativeEnableAllHooks(1)"),
            'nativeQuickHookCrypto': ('⚡ 快速Hook加密', "nativeQuickHookCrypto('md5')"),
            'nativeQuickHookNetwork': ('⚡ 快速Hook网络', "nativeQuickHookNetwork()"),
            'nativeQuickAnalyzeApp': ('⚡ 快速分析应用', "nativeQuickAnalyzeApp()"),
            
            # 智能工具
            'smartTrace': ('🎯 智能识别并Hook目标', "smartTrace('com.example.MainActivity')"),
            'intelligentHookDispatcher': ('🎯 智能识别并Hook目标（新函数名）', "intelligentHookDispatcher('com.example.MainActivity', {enableStackTrace: true})"),
            'loadNativeSupport': ('🔧 加载Native Hook工具', "loadNativeSupport()"),
            
            # 工具函数
            'uniqBy': ('🎲 数组去重工具', "uniqBy(array, function(item) { return item.id; })"),
            'bytesToString': ('🔤 字节转换为字符串', "bytesToString([72, 101, 108, 108, 111])"),
            'LOG': ('📝 增强的日志输出', "LOG('message', {c: Color.Green})"),
            'Color': ('🎨 颜色常量', "Color.Red, Color.Green, Color.Blue"),
            'help': ('❓ 显示帮助信息', "help()"),
            'q': ('🚪 退出程序', "q"),
            'quit': ('🚪 退出程序', "quit"),
            'exit': ('🚪 退出程序', "exit")
        }
        
        # Common Java class patterns for suggestions with categories
        self.common_patterns = {
            'Android系统类': [
                'com.android.', 'android.app.', 'android.content.',
                'android.view.', 'android.widget.', 'android.os.',
                'android.util.', 'android.net.'
            ],
            '常见应用包名': [
                'com.google.', 'com.facebook.', 'com.tencent.',
                'com.alibaba.', 'com.baidu.', 'com.sina.', 'com.xiaomi.',
                'com.huawei.', 'com.oppo.', 'com.vivo.'
            ],
            'Java标准库': [
                'java.lang.', 'java.util.', 'java.io.',
                'java.net.', 'java.security.', 'java.text.'
            ],
            'Android组件': [
                'MainActivity', 'Application', 'Activity', 'Service', 
                'Fragment', 'BroadcastReceiver', 'ContentProvider'
            ]
        }
    
    def show_completion_help(self):
        """Display beautiful completion help using rich"""
        if not RICH_AVAILABLE:
            return
            
        console = get_console()
        if not console:
            return
            
        # Create detailed function table with descriptions and examples
        func_table = Table(title="🚀 可用函数", box=ROUNDED, show_header=True, header_style="bold magenta")
        func_table.add_column("描述", style="green", width=40)
        func_table.add_column("使用示例", style="yellow", width=55)
        
        # Select key functions to display (avoid overwhelming the user)
        key_functions = [
            ('traceClass', '🏛️ 跟踪类的所有方法', "traceClass('com.example.MainActivity')"),
            ('hookAllMethodsInJavaClass', '🏛️ 跟踪类的所有方法（新函数名）', "hookAllMethodsInJavaClass('com.example.MainActivity')"),
            ('traceMethod', '🎯 跟踪特定方法', "traceMethod('com.example.Class.method', true)"),
            ('hookJavaMethodWithTracing', '🎯 跟踪特定方法（新函数名）', "hookJavaMethodWithTracing('com.example.Class.method', true)"),
            ('findClasses', '🔍 查找匹配的类', "findClasses('MainActivity', true)"),
            ('enumAllClasses', '📋 枚举所有已加载的类', "enumAllClasses('com.example')"),
            ('describeJavaClass', '📖 描述Java类的详细信息', "describeJavaClass('java.lang.String')"),
            ('printStack', '📚 打印Java调用栈', "printStack()"),
            ('findTargetClassLoaderForClass', '🔗 查找目标类加载器（新函数名）', "findTargetClassLoaderForClass('com.example.Class')"),
            ('printJavaCallStack', '📚 打印Java调用栈（新函数名）', "printJavaCallStack(true, 50)"),
            ('findStrInMap', '🗺️ 监控HashMap查找key对应value', "findStrInMap('password', 1)"),
            ('bypassTracerPidDetection', '🔒 绕过TracerPid检测', "bypassTracerPidDetection()"),
            ('inspectObjectFields', '🔍 检查对象字段详情', "inspectObjectFields(this, '上下文信息')"),
            ('advancedMethodTracing', '🎯 高级方法追踪', "advancedMethodTracing('com.example.Class.method', true, true)"),
            ('batchHookWithFilters', '📦 批量Hook（黑白名单）', "batchHookWithFilters('com.example', 'test', null)"),
            ('hookAllApplicationClasses', '🚀 Hook所有应用类', "hookAllApplicationClasses(true)"),
            ('jobs', '📋 显示所有活跃任务', "jobs()"),
            ('job', '🔍 显示任务详情', "job(1)"),
            ('kill', '❌ 取消指定任务', "kill(1)"),
            ('killall', '🧹 取消所有任务', "killall()"),
            ('jobstats', '📊 显示任务统计', "jobstats()"),
            ('traceMethodWithJob', '🎯 带任务管理的方法Hook', "traceMethodWithJob('com.example.Class.method', true)"),
            ('hookBase64', '🔐 Hook Base64编码解码', "hookBase64(1)"),
            ('hookToast', '🍞 Hook Toast显示', "hookToast(1)"),
            ('hookJSONObject', '📝 Hook JSONObject操作', "hookJSONObject(1)"),
            ('hookHashMap', '🗺️ Hook HashMap操作', "hookHashMap('key', 1)"),
            ('enableAllHooks', '🚀 启用所有定位Hook', "enableAllHooks(1)"),
            ('nativeHookCryptoFunctions', '🔐 Hook加密算法', "nativeHookCryptoFunctions('aes', 1)"),
            ('nativeAnalyzeSO', '🔍 分析SO文件', "nativeAnalyzeSO('libtest.so', 1, 1)"),
            ('smartTrace', '🎯 智能识别并Hook目标', "smartTrace('com.example.MainActivity')"),
            ('intelligentHookDispatcher', '🎯 智能识别并Hook目标（新函数名）', "intelligentHookDispatcher('com.example.MainActivity', {enableStackTrace: true})"),
            ('help', '❓ 显示帮助信息', "help()"),
        ]
        
        for func_name, description, example in key_functions:
            # Highlight function name in example
            highlighted_example = example.replace(func_name, f"[cyan]{func_name}[/cyan]")
            func_table.add_row(description, highlighted_example)
        
        # Create patterns tree
        patterns_tree = Tree("📁 [bold blue]常用类名模式[/bold blue]")
        for category, patterns in self.common_patterns.items():
            category_branch = patterns_tree.add(f"[yellow]{category}[/yellow]")
            for pattern in patterns[:3]:  # Show first 3 in each category
                category_branch.add(f"[dim]{pattern}...[/dim]")
        
        # Display function table and patterns
        console.print()
        console.print(func_table)
        console.print("💡 [bold blue]连接应用后使用 help() 查看所有函数的详细说明[/bold blue]")
        console.print()
    
    def complete(self, text, state):
        """Enhanced completion with rich pattern matching"""
        if state == 0:
            # First time this text is completed
            self.matches = []
            
            if text:
                # Match function names
                for func in self.functions.keys():
                    if func.startswith(text):
                        self.matches.append(f"{func}(")
                
                # If inside quotes, suggest common patterns
                if '"' in readline.get_line_buffer() or "'" in readline.get_line_buffer():
                    for category, patterns in self.common_patterns.items():
                        for pattern in patterns:
                            if pattern.startswith(text):
                                self.matches.append(pattern)
            else:
                # No text yet, show all functions
                self.matches = [f"{func}(" for func in self.functions.keys()]
        
        # Return the next match
        if state < len(self.matches):
            return self.matches[state]
        else:
            return None
