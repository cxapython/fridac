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
            # ===== Java Hook 核心函数 =====
            'traceClass': ('🏛️ 跟踪类的所有方法', "traceClass('com.example.MainActivity')"),
            'traceMethod': ('🎯 跟踪特定方法', "traceMethod('com.example.Class.method')"),
            'advancedMethodTracing': ('🔥 高级方法追踪（带堆栈和字段）', "advancedMethodTracing('com.example.Class.method', true, true)"),
            'findClasses': ('🔍 查找匹配的类', "findClasses('MainActivity', true)"),
            'enumAllClasses': ('📋 枚举包下所有类', "enumAllClasses('com.example')"),
            'describeJavaClass': ('📖 描述Java类详细信息', "describeJavaClass('java.lang.String')"),
            
            # ===== Wallbreaker风格搜索 =====
            'classsearch': ('🔍 搜索类（支持正则/pattern/）', "classsearch('MainActivity')"),
            'objectsearch': ('🧩 搜索对象实例', "objectsearch('com.example.MainActivity', 20)"),
            'classdump': ('📘 输出类结构', "classdump('com.example.MainActivity', true)"),
            'objectdump': ('📦 输出对象字段值', "objectdump('123456789', true)"),
            
            # ===== 工具函数 =====
            'printStack': ('📚 打印Java调用栈', "printStack()"),
            'findTragetClassLoader': ('🔗 查找目标ClassLoader', "findTragetClassLoader('com.example.Class')"),
            'findStrInMap': ('🗺️ 监控HashMap查找key', "findStrInMap('password', 1)"),
            
            # ===== 任务管理系统 =====
            'jobs': ('📋 显示所有任务', "jobs"),
            'tasks': ('📋 显示所有任务', "tasks"),
            'kill': ('❌ 终止指定任务', "kill 1"),
            'killall': ('🧹 终止所有任务', "killall"),
            'taskinfo': ('🔍 查看任务详情', "taskinfo 1"),
            'taskstats': ('📊 查看任务统计', "taskstats"),
            'taskhelp': ('❓ 任务命令帮助', "taskhelp"),
            
            # 类/方法追踪 (使用任务系统)
            'traceclass': ('🏛️ 追踪类的所有方法(任务)', "traceclass com.example.MainActivity true"),
            'tracemethod': ('🎯 追踪特定方法(任务)', "tracemethod com.example.Class.method true"),
            'advancedtrace': ('🔥 高级追踪(带字段)', "advancedtrace com.example.Class.method true"),
            
            # Hook任务命令
            'hookbase64': ('🔐 Base64 Hook任务', "hookbase64 true"),
            'hooktoast': ('🍞 Toast Hook任务', "hooktoast true"),
            'hookjsonobject': ('📝 JSONObject Hook任务', "hookjsonobject true"),
            'hookhashmap': ('🗺️ HashMap Hook任务', "hookhashmap password true"),
            'hookedittext': ('📝 EditText Hook任务', "hookedittext true"),
            'hookarraylist': ('📋 ArrayList Hook任务', "hookarraylist true"),
            'hookloadlibrary': ('📚 LoadLibrary Hook任务', "hookloadlibrary true"),
            'hooknewstringutf': ('🔤 JNI字符串Hook任务', "hooknewstringutf true"),
            'hookfileoperations': ('📁 文件操作Hook任务', "hookfileoperations true"),
            'hooklog': ('📜 日志Hook任务', "hooklog true"),
            'hookurl': ('🌐 URL Hook任务', "hookurl true"),
            'hookfetch': ('🌐 网络抓包任务', "hookfetch mtgsig"),
            'hookmethod': ('⚙️ Java方法Hook任务', "hookmethod com.example.Class.method true"),
            'hookclass': ('⚙️ Java类Hook任务', "hookclass com.example.MainActivity true"),
            'hooknative': ('🖥️ Native Hook任务', "hooknative malloc true"),
            
            # 其他工具命令
            'genm': ('🔧 生成方法Hook脚本', "genm com.example.Class.method output"),
            'selftest': ('🧪 系统自测', "selftest"),
            'reload_scripts': ('🔄 重载自定义脚本', "reload_scripts"),
            
            # ===== Native Hook 函数 =====
            'nativeFindModules': ('📦 查找已加载模块', "nativeFindModules(/libc/)"),
            'nativeFindExports': ('📤 查找导出函数', "nativeFindExports('libc.so', /malloc/)"),
            'nativeFindImports': ('📥 查找导入函数', "nativeFindImports('app', /strcpy/)"),
            'nativeAnalyzeSO': ('🔍 分析SO文件', "nativeAnalyzeSO('libtest.so', 1, 1)"),
            'printNativeStack': ('📚 打印Native调用栈', "printNativeStack()"),
            
            # ===== Native Hook 高级 =====
            'nativeHookDlopenFamily': ('📚 Hook动态库加载', "nativeHookDlopenFamily(1)"),
            'nativeHookCryptoFunctions': ('🔐 Hook加密算法', "nativeHookCryptoFunctions('all', 1)"),
            'nativeHookNetworkFunctions': ('🌐 Hook网络函数', "nativeHookNetworkFunctions(1)"),
            'nativeHookTLSFunctions': ('🔐 Hook TLS明文', "nativeHookTLSFunctions(1)"),
            'nativeHookFileIOFunctions': ('📁 Hook文件IO', "nativeHookFileIOFunctions(1)"),
            'nativeEnableAntiDebugBypass': ('🛡️ 反调试绕过', "nativeEnableAntiDebugBypass({})"),
            'nativeEnableArmSuite': ('🚀 启用ARM套件(全功能)', "nativeEnableArmSuite({showStack: true})"),
            
            # ===== 网络抓包 =====
            'fetch': ('🌐 网络抓包(生成Python代码)', "fetch('keyword')"),
            'okhttpStart': ('🌐 OkHttp抓包(一键启动)', "okhttpStart()"),
            'okhttpHistory': ('📋 OkHttp请求历史', "okhttpHistory()"),
            'okhttpResend': ('🔄 重放OkHttp请求', "okhttpResend(1)"),
            
            # ===== 智能工具 =====
            'intelligentHookDispatcher': ('🎯 智能Hook目标', "intelligentHookDispatcher('com.example.MainActivity', {})"),
            
            'help': ('❓ 显示帮助信息', "help()"),
            'q': ('🚪 退出程序', "q"),
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
