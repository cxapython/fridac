/**
 * 查找Native函数地址工具
 * @description 定位Java层native方法的实现细节,支持静态注册和动态注册两种方式
 * 
 * 功能说明:
 * - 在Java层调用的native方法都要注册,注册方式有两种静态注册和动态注册
 * - 当调用Java通过System.loadLibrary()方法加载So时,系统自动检测并执行So中的JNI_OnLoad函数
 * - 如果找到了,调用其中的RegisterNatives()完成注册
 * - 如果找不到,JVM会使用静态注册方式查找native方法
 * - 静态注册的native方法在so文件的导出表中符号名需要符合Java_包名_类名_方法名(.替换为_)
 * 
 * 实现效果:已知一个native方法的名称,通过脚本得到他在哪个So里面,So基地址以及在So中的偏移
 * (方便在So中定位到此native方法的实现)或者得到地址(地址是动态的,要计算出偏移)和注册方式(静态/动态注册)
 * 
 * 输入: Java层的native方法名称和类名
 * 输出: Library::::::So名称,SoBaseAddress::::::So基地址,RegisterWay::::::动态注册/静态注册,
 *       FuncOffset::::::函数在So中的偏移,FuncAddress::::::函数地址,
 *       FunSymbolName::::::函数符号名(Java_包名_类名_方法名(静态注册)/sub_函数在So中的偏移(动态注册))
 * 
 * 注意:不适用于有Frida检测的场景
 * 
 * @example findNativeFuncAddress("sign", "com.example.EncryptUtils")
 * @param {string} nativeFuncName - Java层的native方法名称
 * @param {string} targetClassName - Java类的完整路径(包名.类名)
 */
function findNativeFuncAddress(nativeFuncName, targetClassName) {
    // 直接执行，不需要 Java.perform（与原生 frida 脚本保持一致）
    _findNativeFuncAddressImpl(nativeFuncName, targetClassName);
}

function _findNativeFuncAddressImpl(nativeFuncName, targetClassName) {
    // 统一日志函数
    function __LOG(msg, opts = {}) {
        // 颜色映射表（字符串名称 -> ANSI 代码）
        var colorMap = {
            Cyan: '\x1b[36m',
            White: '\x1b[37m',
            Green: '\x1b[32m',
            Yellow: '\x1b[33m',
            Red: '\x1b[31m',
            Blue: '\x1b[34m',
            Magenta: '\x1b[35m',
            Gray: '\x1b[90m',
            Reset: '\x1b[0m',
            Bold: '\x1b[1m',
            Dim: '\x1b[2m'
        };
        
        // 优先使用 fridac 的 LOG 函数
        if (typeof LOG !== 'undefined' && typeof Color !== 'undefined') {
            // 将字符串颜色名转换为 Color 对象的值
            var colorOpts = {};
            if (opts.c && Color[opts.c]) {
                colorOpts.c = Color[opts.c];
            }
            LOG(msg, colorOpts);
            return;
        }
        
        // 回退：直接使用 send
        var color = opts.c ? colorMap[opts.c] || '' : '';
        var bold = opts.bold ? colorMap.Bold : '';
        var dim = opts.dim ? colorMap.Dim : '';
        var timestamp = new Date().toLocaleTimeString();
        var prefix = colorMap.Dim + '[' + timestamp + ']' + colorMap.Reset + ' 🔍 ';
        var formattedMsg = prefix + bold + color + msg + colorMap.Reset;
        try {
            send(formattedMsg);
        } catch (e) {
            console.log(formattedMsg);
        }
    }

    if (!nativeFuncName) {
        __LOG("❌ NativeFunction is Null", { c: "Red" });
        return;
    }
    if (!targetClassName) {
        __LOG("❌ targetClassName is Null", { c: "Red" });
        return;
    }

    __LOG("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", { c: "Cyan", bold: true });
    __LOG("🔍 开始查找Native函数地址", { c: "Cyan", bold: true });
    __LOG("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", { c: "Cyan", bold: true });
    __LOG(`📝 目标类: ${targetClassName}`, { c: "Yellow" });
    __LOG(`📝 目标方法: ${nativeFuncName}`, { c: "Yellow" });

    // 查找RegisterNatives地址
    let symbols = [];
    try {
        symbols = Module.enumerateSymbolsSync("libart.so");
    } catch (e) {
        __LOG("❌ 无法枚举libart.so符号: " + e.message, { c: "Red" });
        __LOG("💡 继续搜索静态注册方法...", { c: "Yellow" });
        // 即使找不到RegisterNatives,也继续搜索静态注册
    }

    let registerNativesAddr;
    let registerNativesName;
    if (symbols && symbols.length > 0) {
        for (const sym of symbols) {
        // 筛选掉不合适的地址
        if (sym.name.includes("RegisterNatives") && !sym.name.includes("CheckJNI")) {
            registerNativesAddr = sym.address;
            registerNativesName = sym.name;
            __LOG(`✅ 找到RegisterNatives符号: ${registerNativesName}@${registerNativesAddr}`, { c: "Green" });
            break;
        }
        }
    }
    
    if (!registerNativesAddr) {
        __LOG("⚠️ 未找到RegisterNatives地址,将仅搜索静态注册方法", { c: "Yellow" });
    }

    let found = false;
    
    // 使用Interceptor对RegisterNatives下挂钩(用于动态注册检测)
    if (registerNativesAddr) {
        Interceptor.attach(registerNativesAddr, {
            onEnter: function (args) {
                try {
                    // 获取类名
                    let clazz = Java.vm.tryGetEnv().getClassName(args[1]);
                    // 动态注册的方法指针
                    let methodsPtr = ptr(args[2]);
                    // 动态注册的方法数量
                    let methodCount = args[3].toInt32();
                    
                    // 遍历动态注册的每个JNI方法
                    for (let i = 0; i < methodCount; i++) {
                        let methodPtr = methodsPtr.add(i * Process.pointerSize * 3);
                        // 方法名称
                        let nativeMethodName = Memory.readCString(methodPtr.readPointer());
                        // 方法签名
                        let nativeFuncSign = Memory.readCString(methodPtr.add(Process.pointerSize).readPointer());
                        // 动态注册的方法的地址
                        let nativeFunPtr = methodPtr.add(Process.pointerSize * 2).readPointer();
                        
                        if (targetClassName === clazz && nativeMethodName === nativeFuncName) {
                            const module = Process.findModuleByAddress(nativeFunPtr);
                            const offset = nativeFunPtr.sub(module.base);
                            
                            __LOG("", {});
                            __LOG("╔═══════════════════════════════════════════════════════════════════", { c: "Green", bold: true });
                            __LOG("║ ✅ 找到动态注册的Native方法!", { c: "Green", bold: true });
                            __LOG("╠═══════════════════════════════════════════════════════════════════", { c: "Green", bold: true });
                            __LOG(`║ Library::::::${module.name}`, { c: "Yellow" });
                            __LOG(`║ SoBaseAddress::::::${module.base}`, { c: "Yellow" });
                            __LOG(`║ RegisterWay::::::动态注册`, { c: "Cyan", bold: true });
                            __LOG(`║ FuncOffset::::::${offset}`, { c: "White" });
                            __LOG(`║ FuncAddress::::::${nativeFunPtr}`, { c: "White" });
                            __LOG(`║ FunSymbolName::::::sub_${offset.toString(16)}`, { c: "White" });
                            __LOG(`║ 方法签名: ${nativeFuncSign}`, { c: "Dim" });
                            __LOG("╚═══════════════════════════════════════════════════════════════════", { c: "Green", bold: true });
                            
                            found = true;
                            return;
                        }
                    }
                } catch (e) {
                    // 忽略错误,继续处理
                }
            },
            onLeave: function(retval) {}
        });
    }

    // 搜索静态注册的方法
    let expectedSymbol = `Java_${targetClassName.replace(/\./g, '_')}_${nativeFuncName}`;
    __LOG(`🔍 搜索静态注册符号: ${expectedSymbol}`, { c: "Cyan" });
    
    // 使用异步方式搜索,避免阻塞
    try {
        const modules = Process.enumerateModulesSync();
        for (let i = 0; i < modules.length && !found; i++) {
            const module = modules[i];
            
            // 检查导出符号
            try {
                const exports = module.enumerateExportsSync();
                for (let j = 0; j < exports.length && !found; j++) {
                    const exp = exports[j];
                    if (exp.name === expectedSymbol) {
                        __LOG("", {});
                        __LOG("╔═══════════════════════════════════════════════════════════════════", { c: "Blue", bold: true });
                        __LOG("║ ✅ 找到静态注册的Native方法 (导出符号)!", { c: "Blue", bold: true });
                        __LOG("╠═══════════════════════════════════════════════════════════════════", { c: "Blue", bold: true });
                        __LOG(`║ Library::::::${module.name}`, { c: "Yellow" });
                        __LOG(`║ SoBaseAddress::::::${module.base}`, { c: "Yellow" });
                        __LOG(`║ RegisterWay::::::静态注册`, { c: "Cyan", bold: true });
                        __LOG(`║ FuncOffset::::::${exp.address.sub(module.base)}`, { c: "White" });
                        __LOG(`║ FuncAddress::::::${exp.address}`, { c: "White" });
                        __LOG(`║ FunSymbolName::::::${exp.name}`, { c: "White" });
                        __LOG("╚═══════════════════════════════════════════════════════════════════", { c: "Blue", bold: true });
                        found = true;
                        break;
                    }
                    if (exp.name.includes(expectedSymbol)) {
                        __LOG("", {});
                        __LOG("╔═══════════════════════════════════════════════════════════════════", { c: "Blue", bold: true });
                        __LOG("║ ✅ 找到静态注册的Native方法 (导出符号,部分匹配)!", { c: "Blue", bold: true });
                        __LOG("╠═══════════════════════════════════════════════════════════════════", { c: "Blue", bold: true });
                        __LOG(`║ Library::::::${module.name}`, { c: "Yellow" });
                        __LOG(`║ SoBaseAddress::::::${module.base}`, { c: "Yellow" });
                        __LOG(`║ RegisterWay::::::静态注册`, { c: "Cyan", bold: true });
                        __LOG(`║ FuncOffset::::::${exp.address.sub(module.base)}`, { c: "White" });
                        __LOG(`║ FuncAddress::::::${exp.address}`, { c: "White" });
                        __LOG(`║ FunSymbolName::::::${exp.name}`, { c: "White" });
                        __LOG("╚═══════════════════════════════════════════════════════════════════", { c: "Blue", bold: true });
                        found = true;
                        break;
                    }
                }
            } catch (e) {
                // 忽略错误,继续搜索
            }
            
            // 检查符号表
            if (!found) {
                try {
                    const symbols = module.enumerateSymbolsSync();
                    for (let j = 0; j < symbols.length && !found; j++) {
                        const sym = symbols[j];
                        if (sym.name === expectedSymbol) {
                            __LOG("", {});
                            __LOG("╔═══════════════════════════════════════════════════════════════════", { c: "Magenta", bold: true });
                            __LOG("║ ✅ 找到静态注册的Native方法 (符号表)!", { c: "Magenta", bold: true });
                            __LOG("╠═══════════════════════════════════════════════════════════════════", { c: "Magenta", bold: true });
                            __LOG(`║ Library::::::${module.name}`, { c: "Yellow" });
                            __LOG(`║ SoBaseAddress::::::${module.base}`, { c: "Yellow" });
                            __LOG(`║ RegisterWay::::::静态注册`, { c: "Cyan", bold: true });
                            __LOG(`║ FuncOffset::::::${sym.address.sub(module.base)}`, { c: "White" });
                            __LOG(`║ FuncAddress::::::${sym.address}`, { c: "White" });
                            __LOG(`║ FunSymbolName::::::${sym.name}`, { c: "White" });
                            __LOG("╚═══════════════════════════════════════════════════════════════════", { c: "Magenta", bold: true });
                            found = true;
                            break;
                        }
                        if (sym.name.includes(expectedSymbol)) {
                            __LOG("", {});
                            __LOG("╔═══════════════════════════════════════════════════════════════════", { c: "Magenta", bold: true });
                            __LOG("║ ✅ 找到静态注册的Native方法 (符号表,部分匹配)!", { c: "Magenta", bold: true });
                            __LOG("╠═══════════════════════════════════════════════════════════════════", { c: "Magenta", bold: true });
                            __LOG(`║ Library::::::${module.name}`, { c: "Yellow" });
                            __LOG(`║ SoBaseAddress::::::${module.base}`, { c: "Yellow" });
                            __LOG(`║ RegisterWay::::::静态注册`, { c: "Cyan", bold: true });
                            __LOG(`║ FuncOffset::::::${sym.address.sub(module.base)}`, { c: "White" });
                            __LOG(`║ FuncAddress::::::${sym.address}`, { c: "White" });
                            __LOG(`║ FunSymbolName::::::${sym.name}`, { c: "White" });
                            __LOG("╚═══════════════════════════════════════════════════════════════════", { c: "Magenta", bold: true });
                            found = true;
                            break;
                        }
                    }
                } catch (e) {
                    // 忽略错误,继续搜索
                }
            }
        }
    } catch (e) {
        __LOG("⚠️ 搜索模块时出错: " + e.message, { c: "Yellow" });
    }

    if (!found) {
        __LOG("", {});
        __LOG("❌ 未找到目标Native方法", { c: "Red", bold: true });
        __LOG("💡 提示:", { c: "Yellow" });
        __LOG("   1. 确保方法名和类名正确", { c: "White" });
        __LOG("   2. 确保对应的SO库已加载", { c: "White" });
        __LOG("   3. 如果是动态注册,可能需要等待应用启动完成后再调用", { c: "White" });
        __LOG("   4. 检查是否有Frida检测导致方法被隐藏", { c: "White" });
        __LOG("", {});
        __LOG("⏳ 已设置RegisterNatives Hook,等待动态注册...", { c: "Cyan" });
        __LOG("💡 如果方法还未注册,请等待应用完全启动后再次调用此函数", { c: "Yellow" });
    } else {
        __LOG("✅ 查找完成", { c: "Green", bold: true });
    }
    
    // 返回结果,表示函数已执行完成(不会阻塞)
    return found;
}
