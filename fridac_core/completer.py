"""
fridac 自动补全系统模块
提供智能补全和 内联灰色提示功能
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

# prompt_toolkit 支持(内联提示）
try:
    from prompt_toolkit import prompt as pt_prompt
    from prompt_toolkit.history import FileHistory, InMemoryHistory
    from prompt_toolkit.auto_suggest import AutoSuggest, Suggestion
    from prompt_toolkit.completion import Completer as PTCompleter, Completion
    from prompt_toolkit.styles import Style
    PROMPT_TOOLKIT_AVAILABLE = True
except ImportError:
    PROMPT_TOOLKIT_AVAILABLE = False

from .logger import get_console
from .script_manager import get_custom_script_manager

class FridacCompleter:
    """fridac 命令的增强自动补全（支持 rich 展示）"""
    
    def __init__(self):
        # Available functions for completion with descriptions and examples
        self.functions = {
            # ===== Java Hook 核心函数 =====
            'traceClass': ('🏛️ 跟踪类的所有方法', "traceClass('com.a.B', 1)  // 1=显示调用栈"),
            'traceMethod': ('🎯 跟踪方法(完整版)', "traceMethod('com.a.B.m', 1, 20, null, 1)  // 调用栈+字段"),
            'findClasses': ('🔍 查找匹配的类', "findClasses('MainActivity', true)"),
            'enumAllClasses': ('📋 枚举包下所有类', "enumAllClasses('com.example')"),
            'describeJavaClass': ('📖 描述Java类详细信息', "describeJavaClass('java.lang.String')"),
            
            # ===== 接口/继承查找 =====
            'findImplementations': ('🔌 查找接口实现类', "findImplementations('com.a.animal.Dog', 'com.a')"),
            'findDirectImplementations': ('🎯 查找直接实现类', "findDirectImplementations('com.a.animal.Dog')"),
            'findSubclasses': ('📂 查找子类', "findSubclasses('android.app.Activity', 'com.example')"),
            'analyzeClassHierarchy': ('🌳 分析类继承层次', "analyzeClassHierarchy('com.example.MyClass')"),
            
            # ===== 类/对象搜索 =====
            'classsearch': ('🔍 搜索类（支持正则/pattern/）', "classsearch('MainActivity')"),
            'objectsearch': ('🧩 搜索对象实例', "objectsearch('com.example.MainActivity')"),
            'classdump': ('📘 输出类结构', "classdump('com.example.MainActivity', true)"),
            'objectdump': ('📦 输出对象字段值', "objectdump('0x12956')"),
            
            # ===== 对象查看器 =====
            'objectview': ('🔬 深度查看对象（含继承/静态字段）', "objectview('0x12956', {showInherited: true})"),
            'objectfields': ('📋 获取对象完整字段列表', "objectfields('0x12956')"),
            'objectrefresh': ('🔄 刷新对象查看最新值', "objectrefresh('0x12956')"),
            'objectexpand': ('🔗 展开对象字段（注册为新对象）', "objectexpand('0x12956', 'fieldName')"),
            'objectlist': ('📋 展开 List/Set 集合内容', "objectlist('0x12956', 20)"),
            'objectmap': ('🗺️ 展开 Map 集合内容', "objectmap('0x12956', 20)"),
            
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
            
            # ===== Small-Trace (QBDI 汇编追踪) =====
            'smalltrace': ('🔬 Small-Trace SO汇编追踪', "smalltrace libtarget.so 0x1234 output.log"),
            'smalltrace_symbol': ('🔬 Small-Trace 符号追踪', "smalltrace_symbol libtarget.so functionName output.log"),
            'smalltrace_pull': ('📥 拉取追踪日志', "smalltrace_pull output.log"),
            'smalltrace_status': ('📊 Small-Trace 状态', "smalltrace_status"),
            
            # ===== Frida Stalker (指令级追踪) =====
            'stalker_trace': ('🔍 Stalker 汇编追踪', "stalker_trace libtarget.so 0x1234 output.log"),
            
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
    
    def complete(self, text, state):
        """带模式匹配的增强补全（readline 版本）"""
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


# ==================== prompt_toolkit 版本====================

if PROMPT_TOOLKIT_AVAILABLE:
    
    class FridacAutoSuggest(AutoSuggest):
        """
       内联灰色提示
        基于已有命令和历史记录提供建议
        """
        
        def __init__(self, completer: 'FridacCompleter'):
            self.completer = completer
            # 按长度排序函数名，优先匹配更长的
            self._sorted_functions = sorted(
                completer.functions.keys(), 
                key=lambda x: (-len(x), x)
            )
        
        def get_suggestion(self, buffer, document):
            """获取内联建议（灰色提示文本）"""
            text = document.text_before_cursor
            
            if not text:
                return None
            
            # 获取当前输入的最后一个词
            # 处理空格分隔的命令，如 "traceclass com"
            words = text.split()
            if not words:
                return None
            
            current_word = words[-1] if words else text
            
            # 如果光标在空格后，不提供建议
            if text.endswith(' '):
                return None
            
            # 查找匹配的函数
            for func_name in self._sorted_functions:
                if func_name.startswith(current_word) and func_name != current_word:
                    # 返回剩余部分作为建议
                    suggestion = func_name[len(current_word):]
                    # 如果是函数，添加括号
                    if not text.endswith('('):
                        suggestion += '('
                    return Suggestion(suggestion)
            
            # 查找匹配的类名模式（在引号内时）
            if "'" in text or '"' in text:
                for category, patterns in self.completer.common_patterns.items():
                    for pattern in patterns:
                        if pattern.startswith(current_word) and pattern != current_word:
                            return Suggestion(pattern[len(current_word):])
            
            return None


    class FridacPTCompleter(PTCompleter):
        """
        prompt_toolkit 的补全器
        提供 Tab 补全功能
        """
        
        def __init__(self, completer: 'FridacCompleter'):
            self.completer = completer
        
        def get_completions(self, document, complete_event):
            """生成补全选项"""
            text = document.text_before_cursor
            
            # 获取当前正在输入的词
            words = text.split()
            current_word = words[-1] if words and not text.endswith(' ') else ''
            
            # 匹配函数名
            for func_name, (desc, example) in self.completer.functions.items():
                if func_name.startswith(current_word):
                    # 计算要补全的部分
                    completion_text = func_name[len(current_word):]
                    if not text.endswith('('):
                        completion_text += '('
                    
                    yield Completion(
                        completion_text,
                        start_position=0,
                        display=func_name,
                        display_meta=desc
                    )
            
            # 在引号内时补全类名模式
            if "'" in text or '"' in text:
                for category, patterns in self.completer.common_patterns.items():
                    for pattern in patterns:
                        if pattern.startswith(current_word) and pattern != current_word:
                            yield Completion(
                                pattern[len(current_word):],
                                start_position=0,
                                display=pattern,
                                display_meta=category
                            )


    # prompt_toolkit 样式
    FRIDAC_STYLE = Style.from_dict({
        # 提示符颜色
        'prompt': '#00aa00 bold',
        # 内联建议颜色（灰色）
        'auto-suggestion': '#666666',
        # 补全菜单
        'completion-menu': 'bg:#333333 #ffffff',
        'completion-menu.completion.current': 'bg:#00aa00 #000000',
        'completion-menu.completion': 'bg:#333333 #ffffff',
        'completion-menu.meta.completion': 'bg:#333333 #888888',
        'completion-menu.meta.completion.current': 'bg:#00aa00 #000000',
    })


    def create_prompt_session(completer: 'FridacCompleter', history_file: str = None):
        """
        创建 prompt_toolkit 会话
        
        Args:
            completer: FridacCompleter 实例
            history_file: 历史记录文件路径（可选）
        
        Returns:
            配置好的 PromptSession 或 None（如果 prompt_toolkit 不可用）
        """
        from prompt_toolkit import PromptSession
        from prompt_toolkit.key_binding import KeyBindings
        import os
        
        # 历史记录
        history = None
        if history_file:
            try:
                # 确保历史文件目录存在
                history_dir = os.path.dirname(history_file)
                if history_dir and not os.path.exists(history_dir):
                    os.makedirs(history_dir, exist_ok=True)
                # 确保文件存在（FileHistory 需要）
                if not os.path.exists(history_file):
                    open(history_file, 'a').close()
                history = FileHistory(history_file)
            except Exception as e:
                print(f"⚠️ 历史文件初始化失败: {e}，使用内存历史")
                history = InMemoryHistory()
        
        if history is None:
            history = InMemoryHistory()
        
        # 创建会话（上下键历史是默认行为，不需要额外配置）
        session = PromptSession(
            history=history,
            auto_suggest=FridacAutoSuggest(completer),
            completer=FridacPTCompleter(completer),
            style=FRIDAC_STYLE,
            complete_while_typing=False,  # 不自动弹窗，只在 Tab 时触发
            enable_history_search=True,   # 支持 Ctrl+R 搜索历史
        )
        
        return session


def get_prompt_toolkit_available():
    """检查 prompt_toolkit 是否可用"""
    return PROMPT_TOOLKIT_AVAILABLE
