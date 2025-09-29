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
from .script_manager import get_custom_script_manager

class FridacCompleter:
    """fridac 命令的增强自动补全（支持 rich 展示）"""
    
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
            'classsearch': ('🔍 搜索类（支持字符串/正则 /pattern/）', "classsearch('MainActivity')"),
            'objectsearch': ('🧩 搜索实例对象，返回可引用句柄', "objectsearch('com.example.MainActivity', 20)"),
            'classdump': ('📘 输出类结构（--fullname 等效为 true）', "classdump('com.example.MainActivity', true)"),
            'objectdump': ('📦 输出对象字段值（传 objectsearch 返回的句柄）', "objectdump('123456789', true)"),
            # 'printStack': ('📚 打印Java调用栈', "printStack()"),
            'findTragetClassLoader': ('🔗 查找目标类加载器', "findTragetClassLoader('com.example.Class')"),
            'printJavaCallStack': ('📚 打印Java调用栈（新函数名）', "printJavaCallStack(true, 50)"),
            'findStrInMap': ('🗺️ 监控HashMap查找key对应value', "findStrInMap('password', 1)"),
            
            # 高级追踪功能（基于 r0tracer）
            'bypassTracerPidDetection': ('🔒 绕过TracerPid检测', "bypassTracerPidDetection()"),
            'inspectObjectFields': ('🔍 检查对象字段详情', "inspectObjectFields(this, '上下文信息')"),
            'advancedMethodTracing': ('🎯 高级方法追踪', "advancedMethodTracing('com.example.Class.method', true, true)"),
            'batchHookWithFilters': ('📦 批量Hook（黑白名单）', "batchHookWithFilters('com.example', 'test', null)"),
            'hookAllApplicationClasses': ('🚀 Hook所有应用类', "hookAllApplicationClasses(true)"),
            
            # 任务管理（新系统）
            'jobs': ('📋 显示所有任务', "jobs"),
            'tasks': ('📋 显示所有任务', "tasks"),
            'kill': ('❌ 终止指定任务', "kill 1"),
            'killall': ('🧹 终止所有任务', "killall"),
            'taskinfo': ('🔍 查看任务详情', "taskinfo 1"),
            'taskstats': ('📊 查看任务统计', "taskstats"),
            
            # 统一使用新的 hook* / task* 命令
            
            # 新的Hook任务命令
            'hookbase64': ('🔐 创建Base64 Hook任务', "hookbase64 true"),
            'hooktoast': ('🍞 创建Toast Hook任务', "hooktoast true"),
            'hookjsonobject': ('📝 创建JSONObject Hook任务', "hookjsonobject true"),
            'hookhashmap': ('🗺️ 创建HashMap Hook任务', "hookhashmap password true"),
            'hookedittext': ('📝 创建EditText Hook任务', "hookedittext true"),
            'hookarraylist': ('📋 创建ArrayList Hook任务', "hookarraylist true"),
            'hookloadlibrary': ('📚 创建LoadLibrary Hook任务', "hookloadlibrary true"),
            'hooknewstringutf': ('🔤 创建JNI字符串Hook任务', "hooknewstringutf true"),
            'hookfileoperations': ('📁 创建文件操作Hook任务', "hookfileoperations true"),
            'hooklog': ('📜 创建日志Hook任务', "hooklog true"),
            'hookurl': ('🌐 创建URL Hook任务', "hookurl true"),
            'hookfetch': ('🌐 创建网络抓包(fetch)任务', "hookfetch mtgsig"),
            'hookmethod': ('⚙️ 创建Java方法Hook任务', "hookmethod com.example.Class.method true"),
            'hookclass': ('⚙️ 创建Java类Hook任务', "hookclass com.example.MainActivity true"),
            'hooknative': ('🖥️ 创建Native Hook任务', "hooknative malloc true"),
            'tasks': ('📋 查看所有任务', "tasks"),
            'taskinfo': ('🔍 查看任务详情', "taskinfo 1"),
            'taskstats': ('📊 查看任务统计', "taskstats"),
            
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
            'intelligentHookDispatcher': ('🎯 智能识别并Hook目标', "intelligentHookDispatcher('com.example.MainActivity', {enableStackTrace: true})"),
            'loadNativeSupport': ('🔧 加载Native Hook工具', "loadNativeSupport()"),
            
            # 工具函数
            'uniqBy': ('🎲 数组去重工具', "uniqBy(array, function(item) { return item.id; })"),
            'bytesToString': ('🔤 字节转换为字符串', "bytesToString([72, 101, 108, 108, 111])"),
            'LOG': ('📝 增强的日志输出', "LOG('message', {c: Color.Green})"),
            'Color': ('🎨 颜色常量', "Color.Red, Color.Green, Color.Blue"),
            'help': ('❓ 显示帮助信息', "help()"),
            'q': ('🚪 退出程序', "q"),
            'quit': ('🚪 退出程序', "quit"),
            'exit': ('🚪 退出程序', "exit"),
            
            # 自定义脚本管理命令
            'reload_scripts': ('🔄 重新加载自定义脚本', "reload_scripts"),
            'reloadscripts': ('🔄 重新加载自定义脚本', "reloadscripts")
        }
        
        # 加载自定义函数
        self._load_custom_functions()
        
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
    
    def _load_custom_functions(self):
        """加载自定义函数到补全列表"""
        try:
            custom_manager = get_custom_script_manager()
            if custom_manager:
                custom_functions = custom_manager.get_all_functions()
                for func_name, func_info in custom_functions.items():
                    # 过滤内部函数（以 __ 开头）不加入补全/帮助
                    if func_name.startswith('__'):
                        continue
                    self.functions[func_name] = (
                        f"🔧 自定义: {func_info.description}",
                        func_info.example
                    )
        except Exception:
            # 如果自定义脚本管理器还未初始化，忽略错误
            pass
    
    def reload_custom_functions(self):
        """重新加载自定义函数（用于脚本重载后）"""
        # 移除现有的自定义函数
        to_remove = []
        for func_name, (desc, _) in self.functions.items():
            if desc.startswith("🔧 自定义:"):
                to_remove.append(func_name)
        
        for func_name in to_remove:
            del self.functions[func_name]
        
        # 重新加载
        self._load_custom_functions()
    
    # 已移除未使用的 show_completion_help 方法
    
    def complete(self, text, state):
        """带模式匹配的增强补全"""
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
