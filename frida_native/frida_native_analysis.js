// Frida Native SO 文件分析工具
// 完整的 SO 文件分析功能，识别导出/导入函数，特别是 JNI 相关函数

/**
 * 分析 SO 文件，识别导出/导入函数，特别是 JNI 相关函数
 * @param {string} soName - SO 文件名
 * @param {object|number} options - 配置选项对象或旧版 showExports 参数
 *   options.showExports {number} - 是否显示导出函数 (默认 1)
 *   options.showImports {number} - 是否显示导入函数 (默认 0)
 *   options.limit {number} - 显示数量限制，0 表示全部显示 (默认 0)
 *   options.outputFile {string} - 输出文件路径，不指定则不输出文件
 *   options.jniOnly {number} - 是否只显示 JNI 相关函数 (默认 0)
 *   options.showSymbols {number} - 是否显示符号详情 (默认 1)
 * @example
 *   nativeAnalyzeSO('libnative.so')  // 基本分析
 *   nativeAnalyzeSO('libnative.so', { showExports: 1, showImports: 1, limit: 0, outputFile: '/data/local/tmp/so_analysis.txt' })
 *   nativeAnalyzeSO('libnative.so', { jniOnly: 1 })  // 只显示 JNI 函数
 */
function nativeAnalyzeSO(soName, options, showImportsCompat) {
    // 兼容旧版调用方式：nativeAnalyzeSO(soName, showExports, showImports)
    var config = {
        showExports: 1,
        showImports: 0,
        limit: 0,       // 0 表示全部显示
        outputFile: null,
        jniOnly: 0,
        showSymbols: 1  // 显示符号详细信息
    };
    
    if (typeof options === 'object' && options !== null) {
        // 新版对象参数
        config.showExports = options.showExports !== undefined ? options.showExports : 1;
        config.showImports = options.showImports !== undefined ? options.showImports : 0;
        config.limit = options.limit !== undefined ? options.limit : 0;
        config.outputFile = options.outputFile || null;
        config.jniOnly = options.jniOnly !== undefined ? options.jniOnly : 0;
        config.showSymbols = options.showSymbols !== undefined ? options.showSymbols : 1;
    } else if (typeof options === 'number') {
        // 旧版兼容：nativeAnalyzeSO(soName, showExports, showImports)
        config.showExports = options;
        config.showImports = showImportsCompat || 0;
    }
    
    var outputLines = [];
    var moduleBase = null;
    
    function output(line, alwaysConsole) {
        outputLines.push(line);
        if (!config.outputFile || alwaysConsole) {
            console.log(line);
        }
    }
    
    function isJniStaticFunction(name) {
        return name.startsWith('Java_');
    }
    
    function isJniOnLoad(name) {
        return name === 'JNI_OnLoad' || name === 'JNI_OnUnload';
    }
    
    function parseJniMethodName(javaName) {
        // 解析 Java_com_example_MyClass_methodName 格式
        if (!javaName.startsWith('Java_')) return null;
        var parts = javaName.substring(5).split('_');
        if (parts.length < 2) return null;
        var methodName = parts[parts.length - 1];
        var className = parts.slice(0, -1).join('.');
        return { className: className, methodName: methodName };
    }
    
    // 计算相对偏移
    function getOffset(address) {
        if (!moduleBase) return '0x0';
        try {
            var offset = ptr(address).sub(moduleBase);
            return '0x' + offset.toString(16);
        } catch (e) {
            return '0x?';
        }
    }
    
    // 获取函数详细信息（符号、参数等）
    function getFunctionDetails(address, name) {
        var details = {
            offset: getOffset(address),
            symbolName: null,
            demangled: null,
            argCount: null,
            prototype: null,
            moduleName: null
        };
        
        try {
            var sym = DebugSymbol.fromAddress(ptr(address));
            if (sym && sym.name) {
                details.symbolName = sym.name;
                details.moduleName = sym.moduleName || null;
                
                // 尝试解析 C++ 符号 (demangle)
                // C++ mangled 名称通常以 _Z 开头
                if (sym.name.startsWith('_Z')) {
                    details.demangled = demangleCppSymbol(sym.name);
                    // 从 demangled 名称解析参数
                    var parsed = parsePrototype(details.demangled);
                    if (parsed) {
                        details.argCount = parsed.argCount;
                        details.prototype = parsed.prototype;
                    }
                }
            }
        } catch (e) {
            // 忽略符号解析错误
        }
        
        // 对于 JNI 函数，我们知道基本签名
        if (isJniStaticFunction(name)) {
            // JNI 静态函数签名: jtype Java_package_Class_method(JNIEnv *env, jobject/jclass obj, ...)
            details.prototype = details.prototype || 'jtype ' + name + '(JNIEnv *env, jobject thiz, ...)';
            details.argCount = details.argCount || '2+';
        } else if (name === 'JNI_OnLoad') {
            details.prototype = 'jint JNI_OnLoad(JavaVM *vm, void *reserved)';
            details.argCount = 2;
        } else if (name === 'JNI_OnUnload') {
            details.prototype = 'void JNI_OnUnload(JavaVM *vm, void *reserved)';
            details.argCount = 2;
        }
        
        return details;
    }
    
    // 简单的 C++ demangle（处理常见情况）
    function demangleCppSymbol(mangled) {
        // 使用 Frida 的内置 demangle（如果可用）
        try {
            // 检查是否有 __cxa_demangle
            var cxaDemangle = Module.findExportByName(null, '__cxa_demangle');
            if (cxaDemangle) {
                var demangleFunc = new NativeFunction(cxaDemangle, 'pointer', ['pointer', 'pointer', 'pointer', 'pointer']);
                var mangledPtr = Memory.allocUtf8String(mangled);
                var status = Memory.alloc(4);
                var result = demangleFunc(mangledPtr, ptr(0), ptr(0), status);
                if (!result.isNull() && Memory.readInt(status) === 0) {
                    var demangled = Memory.readCString(result);
                    // 释放内存
                    var freeFunc = new NativeFunction(Module.findExportByName(null, 'free'), 'void', ['pointer']);
                    freeFunc(result);
                    return demangled;
                }
            }
        } catch (e) {
            // demangle 失败，返回原始符号
        }
        return null;
    }
    
    // 解析函数原型获取参数信息
    function parsePrototype(prototype) {
        if (!prototype) return null;
        try {
            // 简单解析: 查找括号内的参数
            var match = prototype.match(/\(([^)]*)\)/);
            if (match) {
                var args = match[1].trim();
                if (args === '' || args === 'void') {
                    return { argCount: 0, prototype: prototype };
                }
                // 按逗号分割，但要注意模板参数
                var argList = [];
                var depth = 0;
                var current = '';
                for (var i = 0; i < args.length; i++) {
                    var c = args[i];
                    if (c === '<' || c === '(') depth++;
                    else if (c === '>' || c === ')') depth--;
                    else if (c === ',' && depth === 0) {
                        if (current.trim()) argList.push(current.trim());
                        current = '';
                        continue;
                    }
                    current += c;
                }
                if (current.trim()) argList.push(current.trim());
                return { argCount: argList.length, prototype: prototype, args: argList };
            }
        } catch (e) {}
        return null;
    }
    
    // 格式化函数详情输出
    function formatFunctionDetails(func, index, detailed) {
        var details = detailed ? getFunctionDetails(func.address, func.name) : { offset: getOffset(func.address) };
        var lines = [];
        
        lines.push("  [" + index + "] " + func.name);
        lines.push("      📍 地址: " + func.address + "  |  偏移: " + details.offset);
        
        if (detailed) {
            if (details.demangled) {
                lines.push("      📝 Demangled: " + details.demangled);
            }
            if (details.prototype) {
                lines.push("      📋 原型: " + details.prototype);
            }
            if (details.argCount !== null) {
                lines.push("      🔢 参数: " + details.argCount + " 个");
            }
        }
        
        return { lines: lines, details: details };
    }
    
    try {
        var module = Process.getModuleByName(soName);
        if (!module) {
            console.log("[-] 找不到SO文件: " + soName);
            return null;
        }
        
        moduleBase = module.base;
        
        output("╔══════════════════════════════════════════════════════════════════════════════╗", true);
        output("║                        📦 SO 文件分析报告                                    ║", true);
        output("╚══════════════════════════════════════════════════════════════════════════════╝", true);
        output("");
        output("📁 文件名: " + soName);
        output("📍 基址: " + module.base);
        output("📏 大小: " + module.size + " bytes (" + (module.size / 1024).toFixed(2) + " KB)");
        output("📂 路径: " + module.path);
        output("");
        
        var allExports = module.enumerateExports();
        var allImports = module.enumerateImports();
        
        // 分类导出函数
        var jniStaticFuncs = [];
        var jniOnLoadFuncs = [];
        var otherExports = [];
        
        allExports.forEach(function(exp) {
            if (isJniStaticFunction(exp.name)) {
                jniStaticFuncs.push(exp);
            } else if (isJniOnLoad(exp.name)) {
                jniOnLoadFuncs.push(exp);
            } else {
                otherExports.push(exp);
            }
        });
        
        // 统计信息
        output("━━━━━━━━━━━━━━━━━━━━━━━━━━━ 📊 统计信息 ━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        output("  📤 导出函数总数: " + allExports.length);
        output("  📥 导入函数总数: " + allImports.length);
        output("  ☕ JNI 静态注册函数: " + jniStaticFuncs.length + " 个 (以 Java_ 开头)");
        output("  🚀 JNI_OnLoad/OnUnload: " + jniOnLoadFuncs.length + " 个");
        if (jniOnLoadFuncs.length > 0) {
            output("  ⚠️  存在 JNI_OnLoad，可能有动态注册函数（需 spawn 启动时 hook RegisterNatives 才能捕获）");
        }
        output("");
        
        // JNI_OnLoad 信息
        if (jniOnLoadFuncs.length > 0) {
            output("━━━━━━━━━━━━━━━━━━━━━━━━━━━ 🚀 JNI 初始化函数 ━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            jniOnLoadFuncs.forEach(function(func, idx) {
                var result = formatFunctionDetails(func, idx + 1, config.showSymbols);
                result.lines.forEach(function(line) { output(line); });
            });
            output("");
            output("  💡 提示: JNI_OnLoad 中通常会调用 RegisterNatives 进行动态注册");
            output("  💡 使用 spawn 模式 + traceRegisterNatives 可捕获动态注册的函数");
            output("");
        }
        
        // JNI 静态注册函数
        if (jniStaticFuncs.length > 0) {
            output("━━━━━━━━━━━━━━━━━━━━━━━━━━━ ☕ JNI 静态注册函数 ━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            var jniLimit = config.limit > 0 ? Math.min(config.limit, jniStaticFuncs.length) : jniStaticFuncs.length;
            for (var i = 0; i < jniLimit; i++) {
                var func = jniStaticFuncs[i];
                var parsed = parseJniMethodName(func.name);
                var details = getFunctionDetails(func.address, func.name);
                
                output("  [" + (i + 1) + "] " + func.name);
                output("      📍 地址: " + func.address + "  |  偏移: " + details.offset);
                if (parsed) {
                    output("      📦 Java类: " + parsed.className);
                    output("      📝 方法名: " + parsed.methodName);
                }
                if (details.prototype) {
                    output("      📋 原型: " + details.prototype);
                }
                output("      🔢 参数: JNIEnv*, jobject/jclass, ... (至少2个)");
                output("");
            }
            if (config.limit > 0 && jniStaticFuncs.length > config.limit) {
                output("  ... 还有 " + (jniStaticFuncs.length - config.limit) + " 个 JNI 静态函数");
            }
        }
        
        // 其他导出函数
        if (config.showExports && !config.jniOnly && otherExports.length > 0) {
            output("━━━━━━━━━━━━━━━━━━━━━━━━━━━ 📤 其他导出函数 ━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            var exportLimit = config.limit > 0 ? Math.min(config.limit, otherExports.length) : otherExports.length;
            for (var i = 0; i < exportLimit; i++) {
                var exp = otherExports[i];
                var details = config.showSymbols ? getFunctionDetails(exp.address, exp.name) : { offset: getOffset(exp.address) };
                
                output("  [" + (i + 1) + "] " + exp.name + " (" + exp.type + ")");
                output("      📍 地址: " + exp.address + "  |  偏移: " + details.offset);
                if (config.showSymbols) {
                    if (details.demangled) {
                        output("      📝 Demangled: " + details.demangled);
                    }
                    if (details.prototype) {
                        output("      📋 原型: " + details.prototype);
                    }
                    if (details.argCount !== null) {
                        output("      🔢 参数: " + details.argCount + " 个");
                    }
                }
                output("");
            }
            if (config.limit > 0 && otherExports.length > config.limit) {
                output("  ... 还有 " + (otherExports.length - config.limit) + " 个导出函数");
            }
        }
        
        // 导入函数
        if (config.showImports && allImports.length > 0) {
            output("━━━━━━━━━━━━━━━━━━━━━━━━━━━ 📥 导入函数 ━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            var importLimit = config.limit > 0 ? Math.min(config.limit, allImports.length) : allImports.length;
            for (var i = 0; i < importLimit; i++) {
                var imp = allImports[i];
                output("  [" + (i + 1) + "] " + imp.name);
                output("      📍 地址: " + imp.address + "  |  来自: " + (imp.module || 'unknown'));
                if (imp.type) {
                    output("      📦 类型: " + imp.type);
                }
                output("");
            }
            if (config.limit > 0 && allImports.length > config.limit) {
                output("  ... 还有 " + (allImports.length - config.limit) + " 个导入函数");
            }
        }
        
        output("╔══════════════════════════════════════════════════════════════════════════════╗");
        output("║                              ✅ 分析完成                                     ║");
        output("╚══════════════════════════════════════════════════════════════════════════════╝");
        output("");
        output("💡 提示:");
        output("  - 偏移地址可用于 IDA/Ghidra 静态分析定位");
        output("  - JNI 静态函数可直接 hook: Interceptor.attach(Module.findExportByName('" + soName + "', 'funcName'), {...})");
        output("  - 动态注册函数需要 spawn 模式启动: fridac -f <package> --hook traceRegisterNatives");
        
        // 输出到文件
        if (config.outputFile) {
            try {
                var content = outputLines.join('\n');
                // 构建详细的函数列表用于程序化处理
                var functionList = [];
                allExports.forEach(function(exp) {
                    var details = getFunctionDetails(exp.address, exp.name);
                    functionList.push({
                        name: exp.name,
                        address: exp.address.toString(),
                        offset: details.offset,
                        type: exp.type,
                        isJni: isJniStaticFunction(exp.name),
                        isJniOnLoad: isJniOnLoad(exp.name),
                        demangled: details.demangled,
                        prototype: details.prototype,
                        argCount: details.argCount
                    });
                });
                
                // 通过 send 消息发送给 Python 端写入文件
                send({
                    type: 'so_analysis_output',
                    outputFile: config.outputFile,
                    content: content,
                    soName: soName,
                    stats: {
                        totalExports: allExports.length,
                        totalImports: allImports.length,
                        jniStaticFuncs: jniStaticFuncs.length,
                        hasJniOnLoad: jniOnLoadFuncs.length > 0
                    },
                    functions: functionList
                });
                console.log("\n📄 分析结果已发送，将写入: " + config.outputFile);
            } catch (e) {
                console.log("[-] 输出文件失败: " + e.message);
            }
        }
        
        // 返回分析结果对象，方便程序化使用
        return {
            module: {
                name: soName,
                base: module.base.toString(),
                size: module.size,
                path: module.path
            },
            jniStaticFunctions: jniStaticFuncs.map(function(f) {
                var details = getFunctionDetails(f.address, f.name);
                return { 
                    name: f.name, 
                    address: f.address.toString(), 
                    offset: details.offset,
                    parsed: parseJniMethodName(f.name),
                    prototype: details.prototype
                };
            }),
            hasJniOnLoad: jniOnLoadFuncs.length > 0,
            jniOnLoadAddress: jniOnLoadFuncs.length > 0 ? jniOnLoadFuncs[0].address.toString() : null,
            jniOnLoadOffset: jniOnLoadFuncs.length > 0 ? getOffset(jniOnLoadFuncs[0].address) : null,
            totalExports: allExports.length,
            totalImports: allImports.length
        };
        
    } catch (e) {
        console.log("[-] SO文件分析失败: " + e.message);
        return null;
    }
}
