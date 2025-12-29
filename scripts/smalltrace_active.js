/**
 * Small-Trace 主动调用脚本 v3.0
 * 一体化：安装 QBDI 追踪 + 主动调用
 * 
 * @example traceAndCall('libjnicalculator.so', 0x21244, 'hello')
 * @example traceAndCall('libtarget.so', 0x1000, 'test', 3)  // 3个参数
 */

const QDBI_PATH = "/data/local/tmp/libqdbi.so";

/**
 * 一体化追踪+调用
 * @param {string} so - 目标 SO 名称
 * @param {number} offset - 函数偏移
 * @param {string} input - 输入字符串
 * @param {number} argc - 参数数量 (默认 5)
 */
function traceAndCall(so, offset, input, argc) {
    argc = argc || 5;
    
    console.log("========================================");
    console.log("   Small-Trace v3.0");
    console.log("   " + so + " @ 0x" + offset.toString(16));
    console.log("   输入: \"" + input + "\"");
    console.log("========================================\n");
    
    // 1. 查找模块
    var mod = Process.findModuleByName(so);
    if (!mod) {
        console.log("[-] 模块未加载: " + so);
        console.log("[*] 使用 loadSo() 加载");
        return false;
    }
    var addr = mod.base.add(offset);
    console.log("[+] 目标: " + addr);
    
    // 2. 安装 QBDI Hook
    try {
        var qdbi = Module.load(QDBI_PATH);
        var trace = new NativeFunction(qdbi.getExportByName("Calvin_Trace_offset_ex"), 'int', ['pointer', 'ulong', 'int', 'int']);
        var r = trace(Memory.allocUtf8String(so), offset, argc, 0);
        console.log("[+] QBDI: " + (r === 0 ? "OK" : "FAIL"));
    } catch (e) {
        console.log("[-] QBDI: " + e.message);
    }
    
    // 3. 准备参数
    var inPtr = Memory.allocUtf8String(input);
    var inLen = input.length;
    var outPtr = Memory.alloc(256);
    var ctxPtr = Memory.alloc(64);
    Memory.writeByteArray(outPtr, new Array(256).fill(0));
    
    console.log("\n[*] 参数: (\"" + input + "\", " + inLen + ", out, 0, ctx)");
    
    // 4. 调用 (尝试常见签名)
    console.log("[*] 调用中...\n");
    var ret = null;
    var sigs = [
        ['pointer', 'int', 'pointer', 'int', 'pointer'],  // 最常见
        ['pointer', 'int', 'pointer', 'pointer', 'int'],
        ['pointer', 'pointer', 'int', 'int', 'pointer'],
        ['pointer', 'int', 'pointer']  // 3参数
    ];
    
    for (var i = 0; i < sigs.length; i++) {
        try {
            var fn = new NativeFunction(addr, 'int', sigs[i]);
            if (sigs[i].length === 5) {
                ret = fn(inPtr, inLen, outPtr, 0, ctxPtr);
            } else if (sigs[i].length === 3) {
                ret = fn(inPtr, inLen, outPtr);
            }
            console.log("[+] 成功! ret=" + ret);
            break;
        } catch (e) {
            // 继续尝试下一个签名
        }
    }
    
    if (ret === null) {
        console.log("[-] 所有签名均失败");
        return false;
    }
    
    // 5. 显示结果
    try {
        var str = Memory.readCString(outPtr);
        if (str && str.length > 0 && str.length < 200) {
            console.log("    输出: \"" + str + "\"");
        }
        console.log(hexdump(Memory.readByteArray(outPtr, 64), { offset: 0, length: 64, header: true }));
    } catch (e) {}
    
    // 6. 等待日志
    console.log("\n[*] 等待日志...");
    setTimeout(function() {
        console.log("[+] 完成!");
        try {
            Java.perform(function() {
                var pkg = Java.use("android.app.ActivityThread").currentApplication().getPackageName();
                console.log("\n日志: /data/data/" + pkg + "/qbdi_trace_" + pkg + ".log");
                console.log("拉取: smalltrace_pull");
            });
        } catch (e) {}
    }, 1500);
    
    return ret;
}

/**
 * 加载 SO
 */
function loadSo(path, java) {
    var name = path.split('/').pop();
    if (!name.startsWith('lib')) name = 'lib' + name;
    if (!name.endsWith('.so')) name = name + '.so';
    
    if (Process.findModuleByName(name)) {
        console.log("[+] 已加载");
        return true;
    }
    
    if (java) {
        try {
            Java.perform(function() {
                Java.use('java.lang.System').loadLibrary(name.replace(/^lib|\.so$/g, ''));
            });
            console.log("[+] OK");
            return true;
        } catch (e) {
            console.log("[-] " + e);
        }
    }
    
    try {
        Module.load(path.indexOf('/') === -1 ? '/data/local/tmp/' + name : path);
        console.log("[+] OK");
        return true;
    } catch (e) {
        console.log("[-] " + e);
        return false;
    }
}

/**
 * 列出模块
 */
function listModules(f) {
    Process.enumerateModules().filter(function(m) {
        return !f || m.name.toLowerCase().indexOf(f.toLowerCase()) !== -1;
    }).forEach(function(m, i) {
        console.log((i + 1) + ". " + m.name + " @ " + m.base);
    });
}

/**
 * 自定义调用
 */
function callRaw(so, offset, ret, types, args) {
    var mod = Process.findModuleByName(so);
    if (!mod) return console.log("[-] 未加载");
    try {
        var fn = new NativeFunction(mod.base.add(offset), ret, types);
        var r = fn.apply(null, args);
        console.log("[+] ret=" + r);
        return r;
    } catch (e) {
        console.log("[-] " + e);
    }
}

// 帮助
function stHelp() {
    console.log("\n=== Small-Trace v3.0 ===\n");
    console.log("traceAndCall(so, offset, input, argc)  # 追踪+调用");
    console.log("loadSo(path, java)                     # 加载 SO");
    console.log("listModules(filter)                    # 列出模块");
    console.log("callRaw(so, off, ret, types, args)     # 自定义调用\n");
    console.log("示例: traceAndCall('libjnicalculator.so', 0x21244, 'hello')");
}
