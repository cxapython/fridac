"""
fridac Frida脚本管理器模块
负责JavaScript脚本的加载、创建和管理
"""

import os

from .logger import log_error, log_debug, log_warning, log_info

def create_frida_script():
    """Create the Frida script with all our functions"""
    # Try to find frida_common.js in multiple locations
    possible_paths = [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'frida_common_new.js'),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'frida_common_new.js'),
        os.path.join(os.path.expanduser('~'), 'fridaproject', 'frida_common_new.js'),
        'frida_common_new.js',  # Absolute fallback
        './frida_common_new.js'  # Current directory
    ]
    
    script_path = None
    for path in possible_paths:
        if os.path.exists(path):
            script_path = path
            break
    
    if not script_path:
        log_error("找不到 frida_common_new.js 文件，已尝试路径:")
        for path in possible_paths:
            log_debug("   - {}".format(path))
        return None
        
    with open(script_path, 'r', encoding='utf-8') as f:
        js_content = f.read()
    
    # Load additional script modules
    js_content += _load_native_hooks()
    js_content += _load_location_hooks()
    js_content += _load_advanced_tracer()
    # 旧的任务管理系统已禁用 - 改用新的多脚本任务管理
    # js_content += _load_job_manager()
    # js_content += _load_job_commands()
    
    # Add interactive shell initialization and Java.perform wrapper
    js_content = _wrap_with_java_perform(js_content)
    
    return js_content

def _load_native_hooks():
    """Load Native Hook tools"""
    native_paths = [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'frida_native_common.js'),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'frida_native_common.js'),
        os.path.join(os.path.expanduser('~'), 'fridaproject', 'frida_native_common.js'),
        'frida_native_common.js',
        './frida_native_common.js'
    ]
    
    native_script_path = None
    for path in native_paths:
        if os.path.exists(path):
            native_script_path = path
            break
    
    if native_script_path:
        log_debug("找到 Native Hook 工具: {}".format(native_script_path))
        try:
            with open(native_script_path, 'r', encoding='utf-8') as f:
                native_content = f.read()
            log_debug("Native Hook 工具已集成")
            return '\n\n// ===== Native Hook Tools =====\n' + native_content
        except Exception as e:
            log_warning("加载 Native Hook 工具失败: {}".format(e))
    else:
        log_debug("未找到 frida_native_common.js，仅加载 Java Hook 工具")
    
    return ""

def _load_location_hooks():
    """Load Location Hook tools"""
    location_paths = [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'frida_location_hooks_new.js'),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'frida_location_hooks_new.js'),
        os.path.join(os.path.expanduser('~'), 'fridaproject', 'frida_location_hooks_new.js'),
        'frida_location_hooks_new.js',
        './frida_location_hooks_new.js'
    ]
    
    location_script_path = None
    for path in location_paths:
        if os.path.exists(path):
            location_script_path = path
            break
    
    if location_script_path:
        log_debug("找到定位Hook工具: {}".format(location_script_path))
        try:
            with open(location_script_path, 'r', encoding='utf-8') as f:
                location_content = f.read()
            log_debug("定位Hook工具已集成")
            return '\n\n// ===== Location Hook Tools =====\n' + location_content
        except Exception as e:
            log_warning("加载定位Hook工具失败: {}".format(e))
    else:
        log_debug("未找到 frida_location_hooks.js，定位工具不可用")
    
    return ""

def _load_advanced_tracer():
    """Load Advanced Tracer tools"""
    advanced_tracer_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'frida_advanced_tracer.js')
    
    if os.path.exists(advanced_tracer_path):
        try:
            with open(advanced_tracer_path, 'r', encoding='utf-8') as f:
                advanced_content = f.read()
            log_debug("高级追踪工具已集成（基于 r0tracer）")
            return '\n\n// ===== Advanced Tracer Tools (Based on r0tracer) =====\n' + advanced_content
        except Exception as e:
            log_warning("加载高级追踪工具失败: {}".format(e))
    else:
        log_debug("未找到 frida_advanced_tracer.js，高级追踪工具不可用")
    
    return ""

def _load_job_manager():
    """Load Job Management System"""
    job_manager_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'frida_job_manager.js')
    
    if os.path.exists(job_manager_path):
        try:
            with open(job_manager_path, 'r', encoding='utf-8') as f:
                job_manager_content = f.read()
            log_debug("任务管理系统已集成")
            return '\n\n// ===== Hook Job Management System =====\n' + job_manager_content
        except Exception as e:
            log_warning("加载任务管理系统失败: {}".format(e))
    else:
        log_debug("未找到 frida_job_manager.js，任务管理不可用")
    
    return ""

def _load_job_commands():
    """Load Job Management Commands"""
    job_commands_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'frida_job_commands.js')
    
    if os.path.exists(job_commands_path):
        try:
            with open(job_commands_path, 'r', encoding='utf-8') as f:
                job_commands_content = f.read()
            log_debug("任务管理命令已集成")
            return '\n\n// ===== Job Management Commands =====\n' + job_commands_content
        except Exception as e:
            log_warning("加载任务管理命令失败: {}".format(e))
    else:
        log_debug("未找到 frida_job_commands.js，任务管理命令不可用")
    
    return ""

def _wrap_with_java_perform(js_content):
    """Wrap JavaScript content with Java.perform and add shell initialization"""
    
    wrapper_start = '''
Java.perform(function() {
'''
    
    wrapper_end = '''

// Interactive shell functions
function help() {
    LOG("\\n📚 fridac - 完整函数参考手册", { c: Color.Cyan });
    LOG("=" + "=".repeat(80), { c: Color.Gray });
    
    LOG("\\n☕ Java Hook 函数:", { c: Color.Green });
    LOG("  📋 类追踪:", { c: Color.Blue });
    LOG("    traceClass(className) - 跟踪类的所有方法", { c: Color.White });
    LOG("    hookAllMethodsInJavaClass(className) - 跟踪类的所有方法（新函数名）", { c: Color.White });
    LOG("      示例: traceClass('com.example.MainActivity')", { c: Color.Yellow });
    
    LOG("  🎯 方法追踪:", { c: Color.Blue });
    LOG("    traceMethod(classMethod, showTrace, returnValue) - 跟踪特定方法", { c: Color.White });
    LOG("    hookJavaMethodWithTracing(methodName, enableStackTrace, customReturnValue) - 跟踪特定方法（新函数名）", { c: Color.White });
    LOG("      示例: traceMethod('com.example.MainActivity.onCreate', true)", { c: Color.Yellow });
    
    LOG("  🔍 类查找:", { c: Color.Blue });
    LOG("    findClasses(pattern, showMethods) - 查找类", { c: Color.White });
    LOG("    enumAllClasses(pattern) - 枚举所有类", { c: Color.White });
    LOG("    describeJavaClass(className) - 描述Java类详细信息", { c: Color.White });
    LOG("      示例: findClasses('MainActivity', true)", { c: Color.Yellow });
    
    LOG("  🗺️ 对象监控:", { c: Color.Blue });
    LOG("    findStrInMap(key, showStack) - 监控HashMap查找key对应value", { c: Color.White });
    LOG("      示例: findStrInMap('password', 1)  // 1=显示调用栈, 0=不显示", { c: Color.Yellow });
    
    LOG("\\n📍 新的Hook任务命令:", { c: Color.Green });
    LOG("  使用新的任务管理系统创建独立的Hook任务:", { c: Color.Yellow });
    LOG("  🔐 编码解码:", { c: Color.Blue });
    LOG("    hookbase64 [show_stack] - 创建Base64 Hook任务", { c: Color.White });
    
    LOG("  📱 界面组件:", { c: Color.Blue });
    LOG("    hooktoast [show_stack] - 创建Toast Hook任务", { c: Color.White });
    LOG("    hookedittext [show_stack] - 创建EditText Hook任务", { c: Color.White });
    
    LOG("  📊 数据结构:", { c: Color.Blue });
    LOG("    hookjsonobject [show_stack] - 创建JSONObject Hook任务", { c: Color.White });
    LOG("    hookhashmap [key] [show_stack] - 创建HashMap Hook任务", { c: Color.White });
    LOG("    hookarraylist [show_stack] - 创建ArrayList Hook任务", { c: Color.White });
    
    LOG("  📚 系统功能:", { c: Color.Blue });
    LOG("    hookloadlibrary [show_stack] - 创建LoadLibrary Hook任务", { c: Color.White });
    LOG("    hooknewstringutf [show_stack] - 创建JNI字符串Hook任务", { c: Color.White });
    LOG("    hookfileoperations [show_stack] - 创建文件操作Hook任务", { c: Color.White });
    LOG("    hooklog [show_stack] - 创建日志Hook任务", { c: Color.White });
    
    LOG("  🌐 网络通信:", { c: Color.Blue });
    LOG("    hookurl [show_stack] - 创建URL Hook任务", { c: Color.White });
    
    LOG("  ⚙️ Java Hook:", { c: Color.Blue });
    LOG("    hookmethod <class.method> [show_stack] - Hook特定方法", { c: Color.White });
    LOG("    hookclass <classname> [show_stack] - Hook类的所有方法", { c: Color.White });
    
    LOG("  🖥️ Native Hook:", { c: Color.Blue });
    LOG("    hooknative <function> [show_stack] - Hook Native函数", { c: Color.White });
    
    LOG("  📋 任务管理:", { c: Color.Blue });
    LOG("    tasks [status] - 查看所有任务", { c: Color.White });
    LOG("    killall [type] - 终止所有任务", { c: Color.White });
    LOG("    taskinfo <id> - 查看任务详情", { c: Color.White });
    
    if (typeof nativeHookNativeFunction !== 'undefined') {
        LOG("\\n🔧 Native Hook 函数:", { c: Color.Green });
        LOG("  🔍 基础工具:", { c: Color.Blue });
        LOG("    nativeHookNativeFunction(address, options) - Hook Native 函数", { c: Color.White });
        LOG("    nativeFindModules(pattern) - 查找模块", { c: Color.White });
        LOG("    nativeFindExports(module, pattern) - 查找导出函数", { c: Color.White });
        LOG("    nativeSearchMemory(pattern) - 搜索内存", { c: Color.White });
        LOG("    printNativeStack() - 打印Native调用栈", { c: Color.White });
        
        if (typeof nativeHookDlopenFamily !== 'undefined') {
            LOG("  🚀 高级Hook:", { c: Color.Blue });
            LOG("    nativeHookDlopenFamily(showStack) - Hook动态库加载", { c: Color.White });
            LOG("    nativeHookJNIFunctions(showStack) - Hook JNI函数", { c: Color.White });
            LOG("    nativeHookAntiDebug(showStack) - Hook反调试检测", { c: Color.White });
            
            LOG("  🔐 加密Hook:", { c: Color.Blue });
            LOG("    nativeHookCryptoFunctions(algorithm, showStack) - Hook加密算法", { c: Color.White });
            LOG("      支持算法: aes, des, md5, sha, all", { c: Color.Yellow });
            
            LOG("  🌐 网络Hook:", { c: Color.Blue });
            LOG("    nativeHookNetworkFunctions(showStack) - Hook网络函数", { c: Color.White });
            
            LOG("  📊 分析工具:", { c: Color.Blue });
            LOG("    nativeAnalyzeSO(soName, showExports, showImports) - 分析SO文件", { c: Color.White });
            
            LOG("  ⚡ 便捷函数:", { c: Color.Blue });
            LOG("    nativeQuickHookCrypto(algorithm) - 快速Hook加密算法", { c: Color.White });
            LOG("    nativeQuickHookNetwork() - 快速Hook网络相关", { c: Color.White });
            LOG("    nativeQuickAnalyzeApp() - 快速分析应用信息", { c: Color.White });
            LOG("    nativeEnableAllHooks(showStack) - 一键启用所有Native Hook", { c: Color.White });
            LOG("      示例: nativeEnableAllHooks(1)  // 启用所有并显示调用栈", { c: Color.Yellow });
        }
    } else {
        LOG("\\n🔧 Native Hook 工具: 未加载", { c: Color.Yellow });
        LOG("  运行 loadNativeSupport() 尝试加载", { c: Color.Gray });
    }
    
    LOG("\\n🎯 智能工具:", { c: Color.Green });
    LOG("  smartTrace(target, options) / intelligentHookDispatcher(targetIdentifier, hookOptions) - 智能识别并Hook目标", { c: Color.White });
    LOG("    示例: smartTrace('com.example.MainActivity')", { c: Color.Yellow });
    LOG("    新示例: intelligentHookDispatcher('com.example.MainActivity', {enableStackTrace: true})", { c: Color.Yellow });
    LOG("    示例: smartTrace('malloc', {showArgs: true})", { c: Color.Yellow });
    
    LOG("\\n🛠️  工具函数:", { c: Color.Green });
    LOG("  printStack() / printJavaCallStack(showComplete, maxLines) - 打印Java调用栈", { c: Color.White });
    if (typeof printNativeStack !== 'undefined') {
        LOG("  printNativeStack() - 打印Native调用栈", { c: Color.White });
    }
    
    LOG("\\n🔥 高级追踪功能 (基于 r0tracer):", { c: Color.Red });
    LOG("  bypassTracerPidDetection() - 绕过TracerPid反调试检测", { c: Color.White });
    LOG("  inspectObjectFields(obj, context) - 检查对象所有字段详情", { c: Color.White });
    LOG("  advancedMethodTracing(method, enableFields, enableColor) - 高级方法追踪", { c: Color.White });
    LOG("    示例: advancedMethodTracing('com.example.Class.method', true, true)", { c: Color.Yellow });
    LOG("  batchHookWithFilters(whitelist, blacklist, targetClass) - 批量Hook（黑白名单过滤）", { c: Color.White });
    LOG("    示例: batchHookWithFilters('com.example', 'test', null)", { c: Color.Yellow });
    LOG("  hookAllApplicationClasses(strictFilter) - Hook所有应用业务类", { c: Color.White });
    LOG("    示例: hookAllApplicationClasses(true)", { c: Color.Yellow });
    
    LOG("\\n📋 任务管理系统 (参考 objection):", { c: Color.Red });
    LOG("  jobs() - 显示所有活跃的Hook任务", { c: Color.White });
    LOG("  job(id) - 显示指定任务的详细信息", { c: Color.White });
    LOG("  kill(id) - 取消指定的Hook任务", { c: Color.White });
    LOG("  killall() - 取消所有Hook任务", { c: Color.White });
    LOG("  pause(id) / resume(id) - 暂停/恢复任务", { c: Color.White });
    LOG("  jobstats() - 显示任务统计信息", { c: Color.White });
    LOG("  history() - 显示任务历史记录", { c: Color.White });
    LOG("  cleanup() - 清理已完成的任务", { c: Color.White });
    LOG("  jobhelp() - 显示任务管理详细帮助", { c: Color.White });
    
    LOG("\\n🎯 带任务管理的Hook函数:", { c: Color.Green });
    LOG("  traceMethodWithJob(method, showStack, retVal) - 可管理的方法Hook", { c: Color.White });
    LOG("  traceClassWithJob(className) - 可管理的类Hook", { c: Color.White });
    LOG("  advancedMethodTracingWithJob(method, fields, color) - 可管理的高级追踪", { c: Color.White });
    LOG("  batchHookWithJob(whitelist, blacklist, targetClass) - 可管理的批量Hook", { c: Color.White });
    LOG("    示例: var jobId = traceMethodWithJob('com.example.Class.method', true)", { c: Color.Yellow });
    LOG("          kill(jobId)  // 取消这个Hook", { c: Color.Yellow });
    LOG("  LOG(message, options) - 增强的日志输出", { c: Color.White });
    LOG("  loadNativeSupport() - 加载Native Hook工具", { c: Color.White });
    LOG("  help() - 显示此帮助", { c: Color.White });
    
    LOG("\\n💡 使用提示:", { c: Color.Green });
    LOG("  • 使用 Tab 键自动补全函数名和包名", { c: Color.Gray });
    LOG("  • 支持链式调用和复杂表达式", { c: Color.Gray });
    LOG("  • 输入 q 或 exit 退出程序", { c: Color.Gray });
    LOG("  • 所有函数都支持丰富的参数选项", { c: Color.Gray });
    LOG("  • 建议先使用smartTrace()进行智能识别", { c: Color.Gray });
    LOG("  • 长期监控建议使用带Job的函数版本", { c: Color.Gray });
    LOG("\\n" + "=".repeat(75) + "\\n", { c: Color.Gray });
}

// RPC exports for interactive shell
rpc.exports = {
    // 帮助和核心
    help: help,
    eval: function(code) {
        try {
            return eval(code);
        } catch (e) {
            LOG("❌ 错误: " + e.message, { c: Color.Red });
            return null;
        }
    },
    
    // Java Hook 函数
    traceClass: traceClass,
    hookAllMethodsInJavaClass: hookAllMethodsInJavaClass,
    traceMethod: traceMethod,
    hookJavaMethodWithTracing: hookJavaMethodWithTracing,
    findClasses: findClasses,
    enumAllClasses: enumAllClasses,
    describeJavaClass: describeJavaClass,
    printStack: printStack,
    findTragetClassLoader: findTragetClassLoader,
    findStrInMap: findStrInMap,
    
    // 高级追踪功能（基于 r0tracer）
    bypassTracerPidDetection: typeof bypassTracerPidDetection !== 'undefined' ? bypassTracerPidDetection : function() { 
        LOG("bypassTracerPidDetection 需要高级追踪工具", { c: Color.Yellow }); 
    },
    inspectObjectFields: typeof inspectObjectFields !== 'undefined' ? inspectObjectFields : function() { 
        LOG("inspectObjectFields 需要高级追踪工具", { c: Color.Yellow }); 
    },
    advancedMethodTracing: typeof advancedMethodTracing !== 'undefined' ? advancedMethodTracing : function() { 
        LOG("advancedMethodTracing 需要高级追踪工具", { c: Color.Yellow }); 
    },
    batchHookWithFilters: typeof batchHookWithFilters !== 'undefined' ? batchHookWithFilters : function() { 
        LOG("batchHookWithFilters 需要高级追踪工具", { c: Color.Yellow }); 
    },
    hookAllApplicationClasses: typeof hookAllApplicationClasses !== 'undefined' ? hookAllApplicationClasses : function() { 
        LOG("hookAllApplicationClasses 需要高级追踪工具", { c: Color.Yellow }); 
    },
    
    // 旧任务管理系统已禁用，现在使用新的Python端任务管理
    // jobs, kill, killall等命令现在通过session.py中的_handle_task_commands处理
    
    // 旧的带任务管理的Hook函数已禁用，使用新的hookmethod/hookclass命令
    
    // 旧的定位Hook函数已移除，现在使用新的hookbase64/hooktoast等命令
    // 这些命令通过session.py中的新任务管理系统处理
    
    // 智能工具
    smartTrace: smartTrace,
    intelligentHookDispatcher: intelligentHookDispatcher,
    loadNativeSupport: typeof loadNativeSupport !== 'undefined' ? loadNativeSupport : function() { 
        LOG("loadNativeSupport 功能未实现", { c: Color.Yellow }); 
    },
    
    // Native Hook 函数 (如果可用)
    nativeHookNativeFunction: typeof nativeHookNativeFunction !== 'undefined' ? nativeHookNativeFunction : function() { 
        LOG("Native Hook 工具未加载，请运行 loadNativeSupport()"); 
    },
    nativeFindModules: typeof nativeFindModules !== 'undefined' ? nativeFindModules : function() { 
        LOG("nativeFindModules 需要 Native Hook 工具", { c: Color.Yellow }); 
    },
    nativeFindExports: typeof nativeFindExports !== 'undefined' ? nativeFindExports : function() { 
        LOG("nativeFindExports 需要 Native Hook 工具", { c: Color.Yellow }); 
    },
    nativeSearchMemory: typeof nativeSearchMemory !== 'undefined' ? nativeSearchMemory : function() { 
        LOG("nativeSearchMemory 需要 Native Hook 工具", { c: Color.Yellow }); 
    },
    printNativeStack: typeof printNativeStack !== 'undefined' ? printNativeStack : function() { 
        LOG("printNativeStack 需要 Native Hook 工具", { c: Color.Yellow }); 
    },
    
    // 高级Native Hook函数
    nativeHookDlopenFamily: typeof nativeHookDlopenFamily !== 'undefined' ? nativeHookDlopenFamily : function() { 
        LOG("nativeHookDlopenFamily 需要 Native Hook 工具", { c: Color.Yellow }); 
    },
    nativeHookJNIFunctions: typeof nativeHookJNIFunctions !== 'undefined' ? nativeHookJNIFunctions : function() { 
        LOG("nativeHookJNIFunctions 需要 Native Hook 工具", { c: Color.Yellow }); 
    },
    nativeHookCryptoFunctions: typeof nativeHookCryptoFunctions !== 'undefined' ? nativeHookCryptoFunctions : function() { 
        LOG("nativeHookCryptoFunctions 需要 Native Hook 工具", { c: Color.Yellow }); 
    },
    nativeHookNetworkFunctions: typeof nativeHookNetworkFunctions !== 'undefined' ? nativeHookNetworkFunctions : function() { 
        LOG("nativeHookNetworkFunctions 需要 Native Hook 工具", { c: Color.Yellow }); 
    },
    nativeHookAntiDebug: typeof nativeHookAntiDebug !== 'undefined' ? nativeHookAntiDebug : function() { 
        LOG("nativeHookAntiDebug 需要 Native Hook 工具", { c: Color.Yellow }); 
    },
    nativeAnalyzeSO: typeof nativeAnalyzeSO !== 'undefined' ? nativeAnalyzeSO : function() { 
        LOG("nativeAnalyzeSO 需要 Native Hook 工具", { c: Color.Yellow }); 
    },
    nativeEnableAllHooks: typeof nativeEnableAllHooks !== 'undefined' ? nativeEnableAllHooks : function() { 
        LOG("nativeEnableAllHooks 需要 Native Hook 工具", { c: Color.Yellow }); 
    },
    nativeQuickHookCrypto: typeof nativeQuickHookCrypto !== 'undefined' ? nativeQuickHookCrypto : function() { 
        LOG("nativeQuickHookCrypto 需要 Native Hook 工具", { c: Color.Yellow }); 
    },
    nativeQuickHookNetwork: typeof nativeQuickHookNetwork !== 'undefined' ? nativeQuickHookNetwork : function() { 
        LOG("nativeQuickHookNetwork 需要 Native Hook 工具", { c: Color.Yellow }); 
    },
    nativeQuickAnalyzeApp: typeof nativeQuickAnalyzeApp !== 'undefined' ? nativeQuickAnalyzeApp : function() { 
        LOG("nativeQuickAnalyzeApp 需要 Native Hook 工具", { c: Color.Yellow }); 
    },
    
    // 工具函数
    uniqBy: uniqBy,
    bytesToString: bytesToString,
    LOG: LOG,
    Color: Color
};

// 自动包装函数，添加任务管理
if (typeof HookJobManager !== 'undefined') {
    LOG("\\n🤖 启用自动任务追踪...", { c: Color.Blue });
    
    // 旧的定位Hook函数已移除，现使用新的任务管理系统
    var remainingHookFunctions = [
        'hookArrayList', 'hookNewStringUTF', 'hookFileOperations', 
        'enableAllHooks'
    ];
    
    remainingHookFunctions.forEach(function(funcName) {
        if (typeof global[funcName] === 'function') {
            var originalFunc = global[funcName];
            global[funcName] = function() {
                var args = Array.prototype.slice.call(arguments);
                var taskId = HookJobManager.autoRegisterHook(funcName, args);
                try {
                    var result = originalFunc.apply(this, args);
                    // 对于hook函数，优先返回任务ID；对于其他函数，返回原始结果
                    if (funcName.startsWith('hook') || funcName.startsWith('enable')) {
                        return taskId;
                    } else {
                        return result;
                    }
                } catch (e) {
                    if (taskId) {
                        var job = HookJobManager.getJob(taskId);
                        if (job) job.updateStatus('failed', e);
                    }
                    throw e;
                }
            };
        }
    });
    
    // 包装Java Hook函数
    var javaHookFunctions = ['traceMethod', 'findClasses', 'enumAllClasses', 'describeJavaClass'];
    javaHookFunctions.forEach(function(funcName) {
        if (typeof global[funcName] === 'function') {
            var originalFunc = global[funcName];
            global[funcName] = function() {
                var args = Array.prototype.slice.call(arguments);
                var taskId = HookJobManager.autoRegisterHook(funcName, args);
                try {
                    var result = originalFunc.apply(this, args);
                    return taskId;
                } catch (e) {
                    if (taskId) {
                        var job = HookJobManager.getJob(taskId);
                        if (job) job.updateStatus('failed', e);
                    }
                    throw e;
                }
            };
        }
    });
    
    LOG("✅ 自动任务追踪已启用", { c: Color.Green });
} else {
    LOG("⚠️  任务管理器未加载，跳过自动任务追踪", { c: Color.Yellow });
}

LOG("\\n🚀 fridac 已就绪!", { c: Color.Green });
LOG("💡 输入 help() 查看可用函数", { c: Color.Cyan });
LOG("💡 输入 q 或 exit 退出程序\\n", { c: Color.Cyan });

}); // End of Java.perform
'''
    
    return wrapper_start + js_content + wrapper_end
