"""
fridac Frida脚本管理器模块
负责JavaScript脚本的加载、创建和管理
"""

import os

from .logger import log_error, log_debug, log_warning, log_info, log_success
from .custom_scripts import CustomScriptManager

def create_frida_script():
    """创建包含全部工具函数的 Frida 脚本"""
    # 在多处路径尝试查找 frida_common_new.js
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
    
    # 加载附加的脚本模块
    js_content += _load_native_hooks()
    js_content += _load_location_hooks()
    js_content += _load_okhttp_logger_plugin()
    js_content += _load_advanced_tracer()
    
    # 加载自定义脚本
    custom_scripts_content = _load_custom_scripts(script_path)
    js_content += custom_scripts_content
    
    # 添加交互式 Shell 初始化与 Java.perform 包装
    js_content = _wrap_with_java_perform(js_content)
    
    # 替换自定义函数导出占位符
    custom_manager = get_custom_script_manager()
    if custom_manager:
        custom_exports = custom_manager.generate_rpc_exports()
        js_content = js_content.replace('/* CUSTOM_EXPORTS_WILL_BE_INSERTED_HERE */', custom_exports)
    
    return js_content

def _load_native_hooks():
    """加载 Native Hook 工具"""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    # 优先加载模块化目录
    modular_dir = os.path.join(base_dir, 'frida_native')
    modular_files_order = [
        'frida_native_core.js',
        'frida_native_linker.js',
        'frida_native_jni.js',
        'frida_native_anti_debug.js',
        'frida_native_crypto.js',
        'frida_native_network.js',
        'frida_native_file_proc.js',
        'frida_native_stalker.js',
        'frida_native_analysis.js',
        'frida_native_suite.js'
    ]

    if os.path.isdir(modular_dir):
        try:
            contents = []
            for fname in modular_files_order:
                fpath = os.path.join(modular_dir, fname)
                if not os.path.exists(fpath):
                    log_warning("模块化Native文件缺失: {}".format(fpath))
                    continue
                with open(fpath, 'r', encoding='utf-8') as f:
                    contents.append(f.read())
            if contents:
                log_debug("已加载模块化 Native Hook 工具: {}".format(', '.join(modular_files_order)))
                return '\n\n// ===== Native Hook Tools (Modular) =====\n' + '\n\n'.join(contents)
        except Exception as e:
            log_warning("加载模块化 Native Hook 工具失败: {}".format(e))

    # 回退到单文件版本
    native_paths = [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'frida_native_common.js'),
        os.path.join(base_dir, 'frida_native_common.js'),
        os.path.join(os.path.expanduser('~'), 'fridaproject', 'frida_native_common.js'),
        'frida_native_common.js',
        './frida_native_common.js'
    ]

    for path in native_paths:
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    native_content = f.read()
                log_debug("已加载单文件 Native Hook 工具: {}".format(path))
                return '\n\n// ===== Native Hook Tools =====\n' + native_content
            except Exception as e:
                log_warning("加载 Native Hook 工具失败: {}".format(e))

    log_debug("未找到 Native Hook 工具，仅加载 Java Hook 工具")
    return ""

def _load_location_hooks():
    """加载定位类 Hook 工具"""
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

def _load_okhttp_logger_plugin():
    """加载 OkHttp Logger 插件 (独立JS)"""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    candidates = [
        os.path.join(base_dir, 'frida_okhttp_logger.js'),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'frida_okhttp_logger.js'),
        os.path.join(os.path.expanduser('~'), 'fridaproject', 'frida_okhttp_logger.js'),
        'frida_okhttp_logger.js',
        './frida_okhttp_logger.js'
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                with open(p, 'r', encoding='utf-8') as f:
                    content = f.read()
                log_debug("OkHttp Logger 插件已加载: {}".format(p))
                return '\n\n// ===== OkHttp Logger Plugin =====\n' + content
            except Exception as e:
                log_warning("加载 OkHttp Logger 插件失败: {}".format(e))
    log_debug("未找到 OkHttp Logger 插件，相关命令将不可用")
    return ""

def _load_advanced_tracer():
    """加载高级追踪工具"""
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

def _load_custom_scripts(script_path):
    """加载用户自定义脚本"""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    try:
        # 初始化自定义脚本管理器
        custom_manager = CustomScriptManager(base_dir)
        
        # 扫描并加载脚本
        loaded_count = custom_manager.scan_scripts()
        
        if loaded_count == 0:
            log_debug("未找到自定义脚本")
            return ""
        
        # 生成导入代码
        custom_imports = custom_manager.generate_script_imports()
        custom_exports = custom_manager.generate_rpc_exports()
        
        log_success(f"✅ 已加载 {loaded_count} 个自定义脚本，包含 {len(custom_manager.get_all_functions())} 个函数")
        
        # 将自定义脚本管理器保存为全局变量，供其他模块使用
        globals()['_custom_script_manager'] = custom_manager
        
        return f'''

// ===== 自定义脚本加载 =====
{custom_imports}

// 自定义函数导出占位符（实际注入发生在 rpc.exports 中）
/* CUSTOM_EXPORTS_PLACEHOLDER */

// 存储自定义导出以便后续替换
var CUSTOM_EXPORTS_CODE = `{custom_exports}`;

'''
        
    except Exception as e:
        log_error(f"加载自定义脚本失败: {e}")
        return ""

def get_custom_script_manager():
    """获取自定义脚本管理器实例"""
    return globals().get('_custom_script_manager', None)

    

def _wrap_with_java_perform(js_content):
    """用 Java.perform 包裹 JavaScript 内容并添加 Shell 初始化"""
    
    wrapper_start = '''
// 顶层RPC兜底：确保 eval 始终可用（即便 Java.perform 内部导出失败或未初始化）
try {
    if (typeof rpc === 'undefined') { var rpc = {}; }
    if (typeof rpc.exports === 'undefined') { rpc.exports = {}; }
    if (typeof rpc.exports.eval === 'undefined') {
        rpc.exports.eval = function(code) {
            try {
                // 直接在顶层求值
                var value = eval(code);
                return (value === undefined || value === null) ? true : value;
            } catch (e1) {
                try {
                    // 回退到 Java.perform 环境中求值
                    var __ret = undefined;
                    Java.perform(function() {
                        try { __ret = eval(code); } catch (_) { __ret = undefined; }
                    });
                    return (__ret === undefined || __ret === null) ? true : __ret;
                } catch (e2) {
                    // 兜底：返回错误字符串
                    return 'error: ' + String(e1 && e1.message ? e1.message : e1);
                }
            }
        };
    }
} catch (_) {}

Java.perform(function() {
    try {
        // banner 由 Python 端打印
    } catch(_) {}
    // ===== 兼容层：为模块化 Native 工具补齐旧版便捷函数 =====
    try {
        if (typeof global === 'undefined') { global = this; }
        // 1) nativeEnableAllHooks → 使用 ARM 套件
        if (typeof nativeEnableAllHooks === 'undefined' && typeof nativeEnableArmSuite === 'function') {
            global.nativeEnableAllHooks = function(showStack) {
                try { nativeEnableArmSuite({ showStack: !!showStack }); LOG('[+] 兼容层: 已启用所有Native Hook', { c: Color.Green }); } catch (e) { try { LOG('❌ 兼容层(nativeEnableAllHooks)失败: ' + e.message, { c: Color.Red }); } catch(_){} }
                return true;
            };
        }
        // 2) nativeQuickHookCrypto → 调用 crypto Hook
        if (typeof nativeQuickHookCrypto === 'undefined' && typeof nativeHookCryptoFunctions === 'function') {
            global.nativeQuickHookCrypto = function(algorithm) {
                try { nativeHookCryptoFunctions(algorithm || 'all', 1); LOG('[+] 兼容层: 已启用加密Hook(' + (algorithm||'all') + ')', { c: Color.Green }); } catch (e) { try { LOG('❌ nativeQuickHookCrypto失败: ' + e.message, { c: Color.Red }); } catch(_){} }
                return true;
            };
        }
        // 3) nativeQuickHookNetwork → 调用网络 Hook
        if (typeof nativeQuickHookNetwork === 'undefined' && typeof nativeHookNetworkFunctions === 'function') {
            global.nativeQuickHookNetwork = function() {
                try { nativeHookNetworkFunctions(1); LOG('[+] 兼容层: 已启用网络Hook', { c: Color.Green }); } catch (e) { try { LOG('❌ nativeQuickHookNetwork失败: ' + e.message, { c: Color.Red }); } catch(_){} }
                return true;
            };
        }
        // 4) nativeQuickAnalyzeApp → 简要模块信息
        if (typeof nativeQuickAnalyzeApp === 'undefined') {
            global.nativeQuickAnalyzeApp = function() {
                try { var modules = Process.enumerateModulesSync ? Process.enumerateModulesSync() : Process.enumerateModules(); LOG('📦 已加载模块数量: ' + (modules && modules.length ? modules.length : '未知'), { c: Color.Cyan }); } catch (e) { try { LOG('❌ nativeQuickAnalyzeApp失败: ' + e.message, { c: Color.Red }); } catch(_){} }
                return true;
            };
        }
        // 5) 动态库延迟加载重挂钩规则（TLS/Conscrypt）
        if (typeof nativeRegisterRehook === 'function') {
            try { nativeRegisterRehook('rehook_tls', function(name){ var n=(name||'').toLowerCase(); return n.indexOf('ssl')!==-1 || n.indexOf('boringssl')!==-1; }, function(){ try { if (typeof nativeHookTLSFunctions==='function') nativeHookTLSFunctions(1); } catch(_){} }); } catch(_){ }
            try { nativeRegisterRehook('rehook_conscrypt', function(name){ var n=(name||'').toLowerCase(); return n.indexOf('conscrypt')!==-1; }, function(){ try { if (typeof nativeHookConscryptTLS==='function') nativeHookConscryptTLS(1); } catch(_){} }); } catch(_){ }
        }
    } catch (_){ }
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
    LOG("    fetch([filter]) - 抓取常见网络请求并生成Python代码", { c: Color.White });
    LOG("    OkHttp Logger:", { c: Color.Blue });
    LOG("      okhttpFind() - 检测OkHttp(2/3)", { c: Color.White });
    LOG("      okhttpSwitchLoader('<okhttp3.OkHttpClient>') - 切换ClassLoader", { c: Color.White });
    LOG("      okhttpHold() - 启用OkHttp拦截(hold)", { c: Color.White });
    LOG("      okhttpHistory() - 查看可重放请求列表", { c: Color.White });
    LOG("      okhttpResend(index) - 重放指定请求", { c: Color.White });
    LOG("      okhttpClear() - 清空历史", { c: Color.White });
    LOG("      okhttpStart([filter|string|options]) - 一键启动（可选过滤、可选ClassLoader样本）", { c: Color.White });
    
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
            LOG("    nativeHookProcessMemoryFunctions(showStack) - Hook 进程/内存管理函数", { c: Color.White });
            LOG("    nativeHookJNIAndART(showStack) - 观测 JNI/ART (RegisterNatives/字符串/数组/DEX)", { c: Color.White });
            LOG("    nativeEnableAntiDebugBypass(options) - 启用反调试对抗开关 (ptrace/TracerPid)", { c: Color.White });
            
            LOG("  🔐 加密Hook:", { c: Color.Blue });
            LOG("    nativeHookCryptoFunctions(algorithm, showStack) - Hook加密算法", { c: Color.White });
            LOG("      支持算法: aes, des, md5, sha, all", { c: Color.Yellow });
            LOG("    nativeHookCryptoPrimitives(showStack) - Hook EVP/HMAC/PBKDF2/RAND/AES 等原语", { c: Color.White });
            
            LOG("  🌐 网络Hook:", { c: Color.Blue });
            LOG("    nativeHookNetworkFunctions(showStack) - Hook网络函数", { c: Color.White });
            LOG("    nativeHookTLSFunctions(showStack) - Hook TLS 明文 (SSL_read/SSL_write)", { c: Color.White });
            LOG("    nativeHookConscryptTLS(showStack) - Hook Conscrypt NativeCrypto (Android TLS 明文)", { c: Color.White });
            LOG("    nativeHookBIOFunctions(showStack) - Hook BIO_read/BIO_write 旁路明文", { c: Color.White });
            
            LOG("  📁 文件/IO Hook:", { c: Color.Blue });
            LOG("    nativeHookFileIOFunctions(showStack) - Hook 文件IO函数 (open/read/write 等)", { c: Color.White });

            LOG("  📊 分析工具:", { c: Color.Blue });
            LOG("    nativeAnalyzeSO(soName, showExports, showImports) - 分析SO文件", { c: Color.White });
            
            LOG("  ⚡ 便捷函数:", { c: Color.Blue });
            LOG("    nativeQuickHookCrypto(algorithm) - 快速Hook加密算法", { c: Color.White });
            LOG("    nativeQuickHookNetwork() - 快速Hook网络相关", { c: Color.White });
            LOG("    nativeQuickAnalyzeApp() - 快速分析应用信息", { c: Color.White });
            LOG("    nativeEnableAllHooks(showStack) - 一键启用所有Native Hook", { c: Color.White });
            LOG("      示例: nativeEnableAllHooks(1)  // 启用所有并显示调用栈", { c: Color.Yellow });
            LOG("    nativeEnableArmSuite({showStack}) - 一键启用ARM套件 (linker/TLS/Conscrypt/BIO/文件/进程/加密/JNI)", { c: Color.White });
            LOG("    nativeStartStalker({modules,threads,intervalMs}) - 启动Stalker采样", { c: Color.White });
            LOG("    nativeStopStalker() - 停止Stalker并输出汇总", { c: Color.White });
            LOG("    nativeRegisterRehook(name, match, fn) - 注册重挂钩规则 (模块加载后自动执行)", { c: Color.White });
        }
    } else {
        LOG("\\n🔧 Native Hook 工具: 未加载", { c: Color.Yellow });
        LOG("  运行 loadNativeSupport() 尝试加载", { c: Color.Gray });
    }
    
    LOG("\\n🎯 智能工具:", { c: Color.Green });
    LOG("  intelligentHookDispatcher(targetIdentifier, hookOptions) - 智能识别并Hook目标", { c: Color.White });
    LOG("    示例: intelligentHookDispatcher('com.example.MainActivity', {enableStackTrace: true})", { c: Color.Yellow });
    
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
    
    // 显示自定义函数（如果存在）
    try {
        if (typeof _custom_script_manager !== 'undefined' && _custom_script_manager) {
            var customFunctions = _custom_script_manager.get_all_functions();
            if (customFunctions && Object.keys(customFunctions).length > 0) {
                LOG("\\n🔧 自定义函数:", { c: Color.Green });
                Object.keys(customFunctions).forEach(function(funcName) {
                    var funcInfo = customFunctions[funcName];
                    LOG("  " + funcName + "() - " + funcInfo.description, { c: Color.White });
                    LOG("    示例: " + funcInfo.example, { c: Color.Yellow });
                });
                LOG("\\n💡 自定义脚本管理:", { c: Color.Green });
                LOG("  reload_scripts - 重新加载自定义脚本", { c: Color.White });
                LOG("  scripts目录: " + _custom_script_manager.scripts_dir, { c: Color.Gray });
            }
        }
    } catch (e) {
        // 忽略自定义函数显示错误
    }
    
    LOG("\\n💡 使用提示:", { c: Color.Green });
    LOG("  • 使用 Tab 键自动补全函数名和包名", { c: Color.Gray });
    LOG("  • 支持链式调用和复杂表达式", { c: Color.Gray });
    LOG("  • 输入 q 或 exit 退出程序", { c: Color.Gray });
    LOG("  • 所有函数都支持丰富的参数选项", { c: Color.Gray });
    LOG("  • 建议使用 intelligentHookDispatcher() 进行智能识别", { c: Color.Gray });
    LOG("  • 长期监控建议使用带Job的函数版本", { c: Color.Gray });
    LOG("  • 自定义脚本放在scripts/目录下，支持热重载", { c: Color.Gray });
    LOG("\\n" + "=".repeat(75) + "\\n", { c: Color.Gray });
}

// RPC exports for interactive shell
rpc.exports = {
    // 帮助和核心
    help: help,
    eval: function(code) {
        try {
            var value = eval(code);
            return (value === undefined || value === null) ? true : value;
        } catch (e) {
            LOG("❌ 错误: " + e.message, { c: Color.Red });
            return 'error: ' + String(e && e.message ? e.message : e);
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
    // OkHttp Logger (条件导出)
    okhttpfind: (typeof okhttpFind !== 'undefined') ? okhttpFind : function(){ LOG("okhttpFind 需要 frida_common_new.js 中的OkHttp功能", { c: Color.Yellow }); },
    okhttpswitchloader: (typeof okhttpSwitchLoader !== 'undefined') ? okhttpSwitchLoader : function(){ LOG("okhttpSwitchLoader 需要 frida_common_new.js 中的OkHttp功能", { c: Color.Yellow }); },
    okhttphold: (typeof okhttpHold !== 'undefined') ? okhttpHold : function(){ LOG("okhttpHold 需要 frida_common_new.js 中的OkHttp功能", { c: Color.Yellow }); },
    okhttphistory: (typeof okhttpHistory !== 'undefined') ? okhttpHistory : function(){ LOG("okhttpHistory 需要 frida_common_new.js 中的OkHttp功能", { c: Color.Yellow }); },
    okhttpresend: (typeof okhttpResend !== 'undefined') ? okhttpResend : function(){ LOG("okhttpResend 需要 frida_common_new.js 中的OkHttp功能", { c: Color.Yellow }); },
    okhttpclear: (typeof okhttpClear !== 'undefined') ? okhttpClear : function(){ LOG("okhttpClear 需要 frida_common_new.js 中的OkHttp功能", { c: Color.Yellow }); },
    okhttpstart: (typeof okhttpStart !== 'undefined') ? okhttpStart : function(){ LOG("okhttpStart 需要 OkHttp 插件", { c: Color.Yellow }); },
    
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
    intelligentHookDispatcher: intelligentHookDispatcher,
    loadNativeSupport: typeof loadNativeSupport !== 'undefined' ? loadNativeSupport : function() { 
        LOG("loadNativeSupport 功能未实现", { c: Color.Yellow }); 
    },
    
    // 自定义脚本函数（如果可用）
    traceRegisterNatives: typeof traceRegisterNatives !== 'undefined' ? traceRegisterNatives : function() { 
        LOG("traceRegisterNatives 需要自定义脚本工具", { c: Color.Yellow }); 
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
    
    // 工具函数（条件导出，避免未加载时报错）
    uniqBy: (typeof uniqBy !== 'undefined') ? uniqBy : function() { try { LOG('uniqBy 未加载（可能需要 Native 工具）', { c: Color.Yellow }); } catch(_) {} return null; },
    bytesToString: (typeof bytesToString !== 'undefined') ? bytesToString : function(arr) { try { if (typeof __bytesToString !== 'undefined') return __bytesToString(arr, null); } catch(_) {} try { return String(arr); } catch(__) { return ''; } },
    LOG: LOG,
    Color: Color,
    
    // ===== 自定义函数导出 =====
    /* CUSTOM_EXPORTS_WILL_BE_INSERTED_HERE */
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
    
    # 处理自定义函数导出
    final_content = wrapper_start + js_content + wrapper_end
    
    # 获取自定义脚本管理器并插入导出
    custom_manager = globals().get('_custom_script_manager', None)
    if custom_manager:
        custom_exports = custom_manager.generate_rpc_exports()
        final_content = final_content.replace(
            '/* CUSTOM_EXPORTS_WILL_BE_INSERTED_HERE */', 
            custom_exports
        )
    
    return final_content
