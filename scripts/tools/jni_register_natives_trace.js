
    // 统一日志 - 美化版本（使用 send 确保输出重定向生效）
function __LOG(msg, opts = {}) {
    // 尝试使用全局 LOG 函数（如果可用）
    if (typeof LOG !== 'undefined') {
        LOG(msg, opts);
        return;
    }
    
    // 回退到 send 方式
    const colorMap = {
        Cyan: '\x1b[36m',
        White: '\x1b[37m',
        Green: '\x1b[32m',
        Yellow: '\x1b[33m',
        Red: '\x1b[31m',
        Blue: '\x1b[34m',
        Magenta: '\x1b[35m',
        Reset: '\x1b[0m',
        Bold: '\x1b[1m',
        Dim: '\x1b[2m'
    };
    const color = opts.c ? colorMap[opts.c] || '' : '';
    const bold = opts.bold ? colorMap.Bold : '';
    const dim = opts.dim ? colorMap.Dim : '';
    
    // 添加时间戳和美化前缀
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `${colorMap.Dim}[${timestamp}]${colorMap.Reset} 🔍 `;
    
    const formattedMsg = `${prefix}${bold}${color}${msg}${colorMap.Reset}`;
    
    // 使用 send 发送到 Python 端，确保输出重定向生效
    try {
        send(formattedMsg);
    } catch (e) {
        // 如果 send 失败，回退到 console.log
        console.log(formattedMsg);
    }
}
/**
 * 追踪 JNI RegisterNatives 调用，捕获早期 Native 方法注册
 * @description 在 spawn 模式下特别有用，可以捕获应用启动时的 Native 方法注册
 * @param {string} targetSo - 可选，指定要监控的 SO 库名称，为空则监控所有
 * @example traceRegisterNatives("mylib")
 */
function traceRegisterNatives(targetSo) {
    __LOG("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", { c: "Cyan", bold: true });
    __LOG("🚀 JNI RegisterNatives 追踪器启动", { c: "Cyan", bold: true });
    __LOG("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", { c: "Cyan", bold: true });
    __LOG("🔍 正在搜索 libart.so 中的 RegisterNatives 符号...", { c: "Yellow" });
    
    let symbols = Module.enumerateSymbolsSync("libart.so");
    let addrRegisterNatives = null;
    let foundCount = 0;
    
    for (let i = 0; i < symbols.length; i++) {
        let symbol = symbols[i];
        
        //_ZN3art3JNI15RegisterNativesEP7_JNIEnvP7_jclassPK15JNINativeMethodi
        if (symbol.name.indexOf("art") >= 0 &&
                symbol.name.indexOf("JNI") >= 0 && 
                symbol.name.indexOf("RegisterNatives") >= 0 && 
                symbol.name.indexOf("CheckJNI") < 0) {
            addrRegisterNatives = symbol.address;
            foundCount++;
            __LOG("✅ 发现符号: " + symbol.address + " -> " + symbol.name, { c: "Green" });
            __hook_RegisterNatives(addrRegisterNatives, targetSo)
        }
    }
    
    if (foundCount === 0) {
        __LOG("❌ 警告: 未找到任何 RegisterNatives 符号", { c: "Red", bold: true });
    } else {
        __LOG("🎯 成功挂钩 " + foundCount + " 个 RegisterNatives 符号", { c: "Green", bold: true });
        if (targetSo) {
            __LOG("🔎 过滤目标: " + targetSo, { c: "Magenta", bold: true });
        } else {
            __LOG("📡 监控所有 RegisterNatives 调用", { c: "Blue", bold: true });
        }
    }
    __LOG("⏳ 等待 RegisterNatives 调用...", { c: "Cyan" });

}   

function __hook_RegisterNatives(addrRegisterNatives, targetSo) {

    if (addrRegisterNatives != null) {
        Interceptor.attach(addrRegisterNatives, {
            onEnter: function (args) {
                // 获取调用者模块信息
                let callerModule = Process.findModuleByAddress(this.returnAddress);
                let callerName = callerModule ? callerModule.name : "unknown";
                
                // 如果指定了目标SO，进行过滤
                if (targetSo) {
                    let target = targetSo.toLowerCase();
                    let caller = callerName.toLowerCase();
                    if (!caller.includes(target) && 
                        !caller.includes(target + '.so') && 
                        !caller.includes('lib' + target) &&
                        !caller.includes('lib' + target + '.so')) {
                        return; // 跳过非目标SO的调用
                    }
                }
                let java_class = args[1];
                let class_name = "unknown_class";
                let method_count = parseInt(args[3]);
                
                // 尝试多种方法获取类名
                try {
                    // 方法1：直接使用 getClassName
                    class_name = Java.vm.tryGetEnv().getClassName(java_class);
                } catch (e1) {
                    try {
                        // 方法2：使用 Java.cast
                        let clazz = Java.cast(java_class, Java.use('java.lang.Class'));
                        class_name = clazz.getName();
                    } catch (e2) {
                        try {
                            // 方法3：使用 JNI 函数
                            let env = Java.vm.getEnv();
                            class_name = env.getClassName(java_class);
                        } catch (e3) {
                            class_name = "unknown_class";
                        }
                    }
                }
                
                // 美化的输出头部
                __LOG("", {});
                __LOG("╔═══════════════════════════════════════════════════════════════════", { c: "Cyan", bold: true });
                __LOG("║ 🎯 RegisterNatives 调用检测到!", { c: "Cyan", bold: true });
                __LOG("╠═══════════════════════════════════════════════════════════════════", { c: "Cyan", bold: true });
                __LOG("║ 📍 调用者: " + callerName, { c: "Yellow" });
                __LOG("║ 📍 地址: " + this.returnAddress, { c: "Yellow", dim: true });
                __LOG("║ 📝 Java类: " + class_name, { c: "Green", bold: true });
                __LOG("║ 🔢 方法数量: " + method_count, { c: "Magenta" });
                __LOG("╚═══════════════════════════════════════════════════════════════════", { c: "Cyan", bold: true });

                let methods_ptr = ptr(args[2]);

                // 美化的方法列表
                if (method_count > 0) {
                    __LOG("", {});
                    __LOG("📋 注册的Native方法列表:", { c: "Blue", bold: true });
                    __LOG("┌─────────────────────────────────────────────────────────────────", { c: "Blue" });
                }

                for (let i = 0; i < method_count; i++) {
                    let name_ptr = Memory.readPointer(methods_ptr.add(i * Process.pointerSize * 3));
                    let sig_ptr = Memory.readPointer(methods_ptr.add(i * Process.pointerSize * 3 + Process.pointerSize));
                    let fnPtr_ptr = Memory.readPointer(methods_ptr.add(i * Process.pointerSize * 3 + Process.pointerSize * 2));

                    let name = Memory.readCString(name_ptr);
                    let sig = Memory.readCString(sig_ptr);
                    let symbol = DebugSymbol.fromAddress(fnPtr_ptr);
                    
                    // 获取模块信息
                    let targetModule = Process.findModuleByAddress(fnPtr_ptr);
                    let moduleName = targetModule ? targetModule.name : "unknown";
                    let offset = targetModule ? "0x" + fnPtr_ptr.sub(targetModule.base).toString(16) : "0x0";
                    
                    __LOG("│ [" + (i + 1) + "] 🔧 " + name, { c: "Green", bold: true });
                    __LOG("│     📄 签名: " + sig, { c: "White" });
                    __LOG("│     🎯 地址: " + fnPtr_ptr + " (" + moduleName + "+" + offset + ")", { c: "Yellow" });
                    __LOG("│     🔍 符号: " + symbol, { c: "Cyan", dim: true });
                    if (i < method_count - 1) {
                        __LOG("│", { c: "Blue" });
                    }
                }
                
                if (method_count > 0) {
                    __LOG("└─────────────────────────────────────────────────────────────────", { c: "Blue" });
                    __LOG("✅ 成功注册 " + method_count + " 个Native方法到 " + class_name, { c: "Green", bold: true });
                }
            }
        });
    }
}       