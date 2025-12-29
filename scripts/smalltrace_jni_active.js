/**
 * Small-Trace JNI 函数主动调用脚本 v1.1
 * 专门用于调用 JNI 函数 (带 JNIEnv*, jobject 参数)
 * 
 * @example traceAndCallJNI('libjnicalculator.so', 0x1ed98, 'hello', 'key123')
 * @example traceAndCallJNI('lib.so', 0x1000, 'data')  // 单参数
 */

const QDBI_PATH = "/data/local/tmp/libqdbi.so";

/**
 * 一体化 JNI 追踪+调用 (最简接口)
 * 支持 1-4 个 jstring 参数的 JNI 函数
 * 
 * @param {string} so - 目标 SO 名称
 * @param {number} offset - 函数偏移
 * @param {string} arg1 - 第一个字符串参数
 * @param {string} arg2 - 第二个字符串参数 (可选)
 * @param {string} arg3 - 第三个字符串参数 (可选)
 * @param {string} arg4 - 第四个字符串参数 (可选)
 * 
 * @example
 * // jstring func(JNIEnv*, jobject, jstring input, jstring key)
 * traceAndCallJNI('libjnicalculator.so', 0x1ed98, 'hello', '1234qwer')
 * 
 * // jstring func(JNIEnv*, jobject, jstring input)
 * traceAndCallJNI('libjnicalculator.so', 0x21244, 'hello')
 */
function traceAndCallJNI(so, offset, arg1, arg2, arg3, arg4) {
    // 收集非空参数
    var args = [];
    if (arg1 !== undefined) args.push(arg1);
    if (arg2 !== undefined) args.push(arg2);
    if (arg3 !== undefined) args.push(arg3);
    if (arg4 !== undefined) args.push(arg4);
    
    var argc = 2 + args.length;  // env + thiz + jstring args
    
    console.log("========================================");
    console.log("   Small-Trace JNI v1.1");
    console.log("   " + so + " @ 0x" + offset.toString(16));
    console.log("   参数: " + JSON.stringify(args));
    console.log("   argc: " + argc + " (env, thiz" + (args.length > 0 ? ", " + args.length + " jstrings" : "") + ")");
    console.log("========================================\n");
    
    // 1. 查找模块
    var mod = Process.findModuleByName(so);
    if (!mod) {
        console.log("[-] 模块未加载: " + so);
        console.log("[*] 使用 loadSo('" + so + "') 加载");
        return null;
    }
    var addr = mod.base.add(offset);
    console.log("[+] 目标地址: " + addr);
    
    // 2. 安装 QBDI Hook
    try {
        var qdbi = Module.load(QDBI_PATH);
        var trace = new NativeFunction(
            qdbi.getExportByName("Calvin_Trace_offset_ex"), 
            'int', 
            ['pointer', 'ulong', 'int', 'int']
        );
        var r = trace(Memory.allocUtf8String(so), offset, argc, 0);
        console.log("[+] QBDI Hook: " + (r === 0 ? "OK" : "FAIL(" + r + ")"));
    } catch (e) {
        console.log("[-] QBDI: " + e.message);
    }
    
    // 3. 调用 JNI 函数
    var resultStr = null;
    
    Java.perform(function() {
        try {
            // 获取 JNIEnv
            var env = Java.vm.getEnv();
            var envPtr = env.handle;
            console.log("[+] JNIEnv: " + envPtr);
            
            // 创建 jstring 参数
            var jstrRefs = [];
            var nativeArgs = [envPtr, NULL];  // env, thiz
            
            args.forEach(function(arg, i) {
                var jstr = env.newStringUtf(arg);
                jstrRefs.push(jstr);
                nativeArgs.push(jstr);
                console.log("[+] arg" + (i + 2) + " jstring: " + jstr + " = \"" + arg + "\"");
            });
            
            // 构建函数签名: pointer(pointer, pointer, pointer, ...)
            var argTypes = ['pointer', 'pointer'];  // env, thiz
            args.forEach(function() { argTypes.push('pointer'); });
            
            // 调用
            console.log("\n[*] 调用中...\n");
            var func = new NativeFunction(addr, 'pointer', argTypes);
            var result = func.apply(null, nativeArgs);
            
            console.log("[+] 返回值 (jstring): " + result);
            
            // 读取返回的 jstring
            if (!result.isNull()) {
                var chars = env.getStringUtfChars(result, NULL);
                if (chars && !chars.isNull()) {
                    resultStr = chars.readCString();
                    console.log("\n========================================");
                    console.log("   结果: \"" + resultStr + "\"");
                    console.log("========================================");
                    env.releaseStringUtfChars(result, chars);
                }
                env.deleteLocalRef(result);
            } else {
                console.log("[*] 返回 NULL");
            }
            
            // 清理
            jstrRefs.forEach(function(ref) {
                env.deleteLocalRef(ref);
            });
            
        } catch (e) {
            console.log("[-] 调用失败: " + e.message);
            console.log(e.stack);
        }
    });
    
    // 等待日志
    setTimeout(function() {
        console.log("\n[+] 追踪完成!");
        Java.perform(function() {
            try {
                var pkg = Java.use("android.app.ActivityThread")
                    .currentApplication().getPackageName();
                console.log("日志: /data/data/" + pkg + "/qbdi_trace_" + pkg + ".log");
                console.log("拉取: smalltrace_pull");
            } catch (e) {}
        });
    }, 1500);
    
    return resultStr;
}

/**
 * 加载 SO
 */
function loadSo(path, useJava) {
    var name = path.split('/').pop();
    if (!name.startsWith('lib')) name = 'lib' + name;
    if (!name.endsWith('.so')) name = name + '.so';
    
    if (Process.findModuleByName(name)) {
        console.log("[+] 已加载: " + name);
        return true;
    }
    
    if (useJava) {
        try {
            Java.perform(function() {
                var libName = name.replace(/^lib/, '').replace(/\.so$/, '');
                Java.use('java.lang.System').loadLibrary(libName);
            });
            console.log("[+] Java 加载成功: " + name);
            return true;
        } catch (e) {
            console.log("[-] Java 加载失败: " + e.message);
        }
    }
    
    try {
        var fullPath = path.indexOf('/') === -1 ? '/data/local/tmp/' + name : path;
        Module.load(fullPath);
        console.log("[+] Native 加载成功: " + name);
        return true;
    } catch (e) {
        console.log("[-] Native 加载失败: " + e.message);
        return false;
    }
}

/**
 * 列出模块
 */
function listModules(filter) {
    var count = 0;
    Process.enumerateModules().forEach(function(m) {
        if (!filter || m.name.toLowerCase().indexOf(filter.toLowerCase()) !== -1) {
            count++;
            console.log(count + ". " + m.name + " @ " + m.base);
        }
    });
    console.log("\n共 " + count + " 个模块");
}

/**
 * 查找导出符号的偏移
 */
function findExport(soName, symbolFilter) {
    var mod = Process.findModuleByName(soName);
    if (!mod) {
        console.log("[-] 模块未加载: " + soName);
        return;
    }
    
    var count = 0;
    mod.enumerateExports().forEach(function(exp) {
        if (!symbolFilter || exp.name.toLowerCase().indexOf(symbolFilter.toLowerCase()) !== -1) {
            var offset = exp.address.sub(mod.base);
            console.log(exp.name + " @ 0x" + offset.toString(16));
            count++;
        }
    });
    console.log("\n共 " + count + " 个符号");
}

/**
 * 通过符号名追踪 JNI 函数
 */
function traceJNIBySymbol(so, symbol, arg1, arg2, arg3, arg4) {
    var mod = Process.findModuleByName(so);
    if (!mod) {
        console.log("[-] 模块未加载: " + so);
        return null;
    }
    
    var addr = mod.findExportByName(symbol);
    if (!addr) {
        console.log("[-] 符号未找到: " + symbol);
        console.log("[*] 使用 findExport('" + so + "', 'keyword') 搜索");
        return null;
    }
    
    var offset = addr.sub(mod.base).toInt32();
    console.log("[+] " + symbol + " -> 0x" + offset.toString(16));
    
    return traceAndCallJNI(so, offset, arg1, arg2, arg3, arg4);
}

// 帮助
function jniHelp() {
    console.log("\n=== Small-Trace JNI v1.1 ===\n");
    console.log("核心函数:");
    console.log("  traceAndCallJNI(so, offset, arg1, arg2, ...)");
    console.log("    追踪并调用 JNI 函数，支持 1-4 个 jstring 参数\n");
    console.log("  traceJNIBySymbol(so, symbol, arg1, arg2, ...)");
    console.log("    通过符号名追踪\n");
    console.log("辅助函数:");
    console.log("  loadSo(path, useJava)     加载 SO");
    console.log("  listModules(filter)       列出模块");
    console.log("  findExport(so, keyword)   查找导出符号\n");
    console.log("示例:");
    console.log("  // encryptString2(env, thiz, input, key)");
    console.log("  traceAndCallJNI('libjnicalculator.so', 0x1ed98, 'hello', '1234qwer')");
    console.log("");
    console.log("  // encryptString(env, thiz, input)");
    console.log("  traceAndCallJNI('libjnicalculator.so', 0x21244, 'hello')");
    console.log("");
    console.log("  // 通过符号名");
    console.log("  traceJNIBySymbol('libjnicalculator.so', 'Java_com_example_jnicalculator_MainActivity_encryptString2', 'hello', 'key')");
}

console.log("[*] Small-Trace JNI 已加载，输入 jniHelp() 查看帮助");
