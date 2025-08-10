// Frida Native Hook 高级工具类
// 集成各种SO库Hook技术和通用Native Hook方案

// ============= 配置和工具函数 =============
var NativeConfig = {
    enableStackTrace: true,
    maxStackDepth: 20,
    logLevel: 'info',
    hexDumpSize: 64,
    maxStringLength: 1024
};

// ============= 字节和数据转换工具 =============
function bytesToString(bytes, encoding) {
    encoding = encoding || 'utf8';
    try {
        if (typeof bytes === 'object' && bytes.readCString) {
            return bytes.readCString();
        }
        if (bytes instanceof ArrayBuffer) {
            bytes = new Uint8Array(bytes);
        }
        if (bytes instanceof Uint8Array) {
            var str = '';
            for (var i = 0; i < bytes.length && i < NativeConfig.maxStringLength; i++) {
                str += String.fromCharCode(bytes[i]);
            }
            return str;
        }
        return bytes.toString();
    } catch (e) {
        return '[无法转换的字节数据: ' + e.message + ']';
    }
}

function stringToBytes(str) {
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
        bytes.push(str.charCodeAt(i));
    }
    return bytes;
}

function hexDump(ptr, size) {
    size = size || NativeConfig.hexDumpSize;
    try {
        return hexdump(ptr, { length: size, ansi: true });
    } catch (e) {
        return '[无法dump内存: ' + e.message + ']';
    }
}

function safeReadMemory(address, size, type) {
    type = type || 'bytes';
    try {
        var targetPtr = ptr(address);
        switch (type) {
            case 'bytes':
                return targetPtr.readByteArray(size);
            case 'string':
                return targetPtr.readCString();
            case 'utf8':
                return targetPtr.readUtf8String();
            case 'int':
                return targetPtr.readInt();
            case 'uint':
                return targetPtr.readUInt();
            case 'pointer':
                return targetPtr.readPointer();
            case 'float':
                return targetPtr.readFloat();
            case 'double':
                return targetPtr.readDouble();
            default:
                return targetPtr.readByteArray(size);
        }
    } catch (e) {
        return '[读取内存失败: ' + e.message + ']';
    }
}

// ============= 颜色和日志工具 =============
var Color = {
    RESET: "\x1b[39;49;00m", 
    Black: "0;01", 
    Blue: "4;01", 
    Cyan: "6;01", 
    Gray: "7;11", 
    Green: "2;01", 
    Purple: "5;01", 
    Red: "1;01", 
    Yellow: "3;01",
    Light: {
        Black: "0;11", Blue: "4;11", Cyan: "6;11", Gray: "7;01", 
        Green: "2;11", Purple: "5;11", Red: "1;11", Yellow: "3;11"
    }
};

var LOG = function (input, kwargs) {
    // 统一通过 send() 输出，避免ANSI颜色残留导致的“m/undefined”噪音
    try {
        var text;
        if (input === null || typeof input === 'undefined') {
            text = '';
        } else if (typeof input === 'object') {
            if (input instanceof ArrayBuffer || input instanceof Uint8Array) {
                text = '[字节数据]';
            } else {
                try { text = JSON.stringify(input); } catch (_) { text = String(input); }
            }
        } else {
            text = String(input);
        }
        send(text);
    } catch (e) {
        try { send(String(input)); } catch (_) {}
    }
};

// ============= 栈跟踪工具 =============
function printNativeStack() {
    LOG("Native StackTrace:\n", { c: Color.Gray });
    try {
        LOG(Thread.backtrace(this.context, Backtracer.ACCURATE)
            .map(DebugSymbol.fromAddress).join('\n'), { c: Color.Gray });
    } catch (e) {
        LOG("无法获取native栈跟踪: " + e.message, { c: Color.Red });
    }
}

function printJsStack() {
    LOG("JavaScript StackTrace:\n", { c: Color.Gray });
    try {
        var stack = new Error().stack;
        LOG(stack, { c: Color.Gray });
    } catch (e) {
        LOG("无法获取JS栈跟踪: " + e.message, { c: Color.Red });
    }
}

// ============= 模块和符号查找工具 =============
function nativeFindModules(pattern) {
    var modules = Process.enumerateModules();
    var foundModules = [];
    
    modules.forEach(function(module) {
        if (!pattern || module.name.match(pattern) || module.path.match(pattern)) {
            foundModules.push({
                name: module.name,
                base: module.base,
                size: module.size,
                path: module.path
            });
        }
    });
    
    return foundModules;
}

function nativeFindExports(moduleName, pattern) {
    var exports = [];
    try {
        var module = Process.getModuleByName(moduleName);
        var moduleExports = module.enumerateExports();
        
        moduleExports.forEach(function(exp) {
            if (!pattern || exp.name.match(pattern)) {
                exports.push({
                    name: exp.name,
                    address: exp.address,
                    type: exp.type
                });
            }
        });
    } catch (e) {
        LOG("查找导出函数失败: " + e.message, { c: Color.Red });
    }
    
    return exports;
}

function nativeFindImports(moduleName, pattern) {
    var imports = [];
    try {
        var module = Process.getModuleByName(moduleName);
        var moduleImports = module.enumerateImports();
        
        moduleImports.forEach(function(imp) {
            if (!pattern || imp.name.match(pattern)) {
                imports.push({
                    name: imp.name,
                    address: imp.address,
                    module: imp.module
                });
            }
        });
    } catch (e) {
        LOG("查找导入函数失败: " + e.message, { c: Color.Red });
    }
    
    return imports;
}

function nativeFindSymbols(moduleName, pattern) {
    var symbols = [];
    try {
        var module = Process.getModuleByName(moduleName);
        var moduleSymbols = module.enumerateSymbols();
        
        moduleSymbols.forEach(function(symbol) {
            if (!pattern || symbol.name.match(pattern)) {
                symbols.push({
                    name: symbol.name,
                    address: symbol.address,
                    type: symbol.type
                });
            }
        });
    } catch (e) {
        LOG("查找符号失败: " + e.message, { c: Color.Red });
    }
    
    return symbols;
}

// ============= SO库加载监控 =============
function nativeHookDlopenFamily(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    
    try {
        // Hook dlopen
        var dlopen = Module.findExportByName(null, "dlopen");
        if (dlopen) {
            Interceptor.attach(dlopen, {
                onEnter: function(args) {
                    var library = Memory.readCString(args[0]);
                    console.log("[+] dlopen 加载库: " + library);
                    this.library = library;
                    
                    if (needStack) {
                        console.log("调用栈:");
                        console.log(Thread.backtrace(this.context, Backtracer.ACCURATE)
                            .map(DebugSymbol.fromAddress).join('\n'));
                    }
                },
                onLeave: function(retval) {
                    console.log("[+] dlopen 返回句柄: " + retval + " (库: " + this.library + ")");
                }
            });
        }
        
        // Hook dlsym
        var dlsym = Module.findExportByName(null, "dlsym");
        if (dlsym) {
            Interceptor.attach(dlsym, {
                onEnter: function(args) {
                    var symbol = Memory.readCString(args[1]);
                    console.log("[+] dlsym 查找符号: " + symbol);
                    this.symbol = symbol;
                    
                    if (needStack) {
                        console.log("调用栈:");
                        console.log(Thread.backtrace(this.context, Backtracer.ACCURATE)
                            .map(DebugSymbol.fromAddress).join('\n'));
                    }
                },
                onLeave: function(retval) {
                    console.log("[+] dlsym 返回地址: " + retval + " (符号: " + this.symbol + ")");
                }
            });
        }
        
        console.log("[+] dlopen/dlsym Hook已启用");
    } catch (e) {
        console.log("[-] dlopen/dlsym Hook失败: " + e.message);
    }
}

// ============= JNI函数Hook =============
function nativeHookJNIFunctions(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    
    try {
        // Hook RegisterNatives
        var jniEnv = Java.vm.tryGetEnv();
        if (jniEnv) {
            var registerNatives = jniEnv.registerNatives;
            jniEnv.registerNatives = function(clazz, methods, nMethods) {
                console.log("[+] RegisterNatives 被调用");
                console.log("  类: " + clazz);
                console.log("  方法数量: " + nMethods);
                
                if (needStack) {
                    console.log("调用栈:");
                    console.log(Thread.backtrace(this.context, Backtracer.ACCURATE)
                        .map(DebugSymbol.fromAddress).join('\n'));
                }
                
                return registerNatives.call(this, clazz, methods, nMethods);
            };
        }
        
        // Hook NewStringUTF (更详细版本)
        var newStringUTF = Module.findExportByName("libart.so", "_ZN3art3JNI12NewStringUTFEP7_JNIEnvPKc");
        if (!newStringUTF) {
            newStringUTF = Module.findExportByName("libdvm.so", "NewStringUTF");
        }
        
        if (newStringUTF) {
            Interceptor.attach(newStringUTF, {
                onEnter: function(args) {
                    var str = Memory.readCString(args[1]);
                    console.log("[+] NewStringUTF: " + str);
                    this.str = str;
                    
                    if (needStack) {
                        console.log("调用栈:");
                        console.log(Thread.backtrace(this.context, Backtracer.ACCURATE)
                            .map(DebugSymbol.fromAddress).join('\n'));
                    }
                },
                onLeave: function(retval) {
                    console.log("[+] NewStringUTF 返回: " + retval + " (字符串: " + this.str + ")");
                }
            });
        }
        
        console.log("[+] JNI函数Hook已启用");
    } catch (e) {
        console.log("[-] JNI函数Hook失败: " + e.message);
    }
}

// ============= 常见加密算法Hook =============
function nativeHookCryptoFunctions(algorithm, showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    algorithm = algorithm || 'all'; // 支持: aes, des, md5, sha, base64, all
    
    try {
        // AES相关函数
        if (algorithm === 'aes' || algorithm === 'all') {
            var aesLibs = ['libcrypto.so', 'libssl.so', 'libc.so'];
            var aesFunctions = ['AES_encrypt', 'AES_decrypt', 'AES_set_encrypt_key', 'AES_set_decrypt_key'];
            
            aesLibs.forEach(function(lib) {
                aesFunctions.forEach(function(func) {
                    var addr = Module.findExportByName(lib, func);
                    if (addr) {
                        Interceptor.attach(addr, {
                            onEnter: function(args) {
                                console.log("[+] " + func + " 在 " + lib + " 被调用");
                                if (func.includes('encrypt') || func.includes('decrypt')) {
                                    console.log("  输入数据: " + hexdump(args[0], { length: 16 }));
                                }
                                
                                if (needStack) {
                                    console.log("调用栈:");
                                    console.log(Thread.backtrace(this.context, Backtracer.ACCURATE)
                                        .map(DebugSymbol.fromAddress).join('\n'));
                                }
                            },
                            onLeave: function(retval) {
                                console.log("[+] " + func + " 执行完成");
                            }
                        });
                        console.log("[+] Hook " + func + " 在 " + lib);
                    }
                });
            });
        }
        
        // DES相关函数
        if (algorithm === 'des' || algorithm === 'all') {
            var desFunctions = ['DES_encrypt1', 'DES_decrypt3', 'DES_set_key'];
            desFunctions.forEach(function(func) {
                var addr = Module.findExportByName(null, func);
                if (addr) {
                    Interceptor.attach(addr, {
                        onEnter: function(args) {
                            console.log("[+] DES函数 " + func + " 被调用");
                            
                            if (needStack) {
                                console.log("调用栈:");
                                console.log(Thread.backtrace(this.context, Backtracer.ACCURATE)
                                    .map(DebugSymbol.fromAddress).join('\n'));
                            }
                        }
                    });
                    console.log("[+] Hook DES函数: " + func);
                }
            });
        }
        
        // MD5相关函数
        if (algorithm === 'md5' || algorithm === 'all') {
            var md5Functions = ['MD5_Init', 'MD5_Update', 'MD5_Final', 'MD5'];
            md5Functions.forEach(function(func) {
                var addr = Module.findExportByName(null, func);
                if (addr) {
                    Interceptor.attach(addr, {
                        onEnter: function(args) {
                            console.log("[+] MD5函数 " + func + " 被调用");
                            if (func === 'MD5_Update') {
                                console.log("  数据长度: " + args[2]);
                                console.log("  数据内容: " + hexdump(args[1], { length: Math.min(32, args[2].toInt32()) }));
                            }
                            
                            if (needStack) {
                                console.log("调用栈:");
                                console.log(Thread.backtrace(this.context, Backtracer.ACCURATE)
                                    .map(DebugSymbol.fromAddress).join('\n'));
                            }
                        }
                    });
                    console.log("[+] Hook MD5函数: " + func);
                }
            });
        }
        
        // SHA相关函数
        if (algorithm === 'sha' || algorithm === 'all') {
            var shaFunctions = ['SHA1_Init', 'SHA1_Update', 'SHA1_Final', 'SHA256_Init', 'SHA256_Update', 'SHA256_Final'];
            shaFunctions.forEach(function(func) {
                var addr = Module.findExportByName(null, func);
                if (addr) {
                    Interceptor.attach(addr, {
                        onEnter: function(args) {
                            console.log("[+] SHA函数 " + func + " 被调用");
                            if (func.includes('Update')) {
                                console.log("  数据长度: " + args[2]);
                                console.log("  数据内容: " + hexdump(args[1], { length: Math.min(32, args[2].toInt32()) }));
                            }
                            
                            if (needStack) {
                                console.log("调用栈:");
                                console.log(Thread.backtrace(this.context, Backtracer.ACCURATE)
                                    .map(DebugSymbol.fromAddress).join('\n'));
                            }
                        }
                    });
                    console.log("[+] Hook SHA函数: " + func);
                }
            });
        }
        
        console.log("[+] 加密算法Hook已启用 (算法: " + algorithm + ")");
    } catch (e) {
        console.log("[-] 加密算法Hook失败: " + e.message);
    }
}

// ============= 网络函数Hook =============
function nativeHookNetworkFunctions(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    
    try {
        // Hook connect
        var connect = Module.findExportByName(null, "connect");
        if (connect) {
            Interceptor.attach(connect, {
                onEnter: function(args) {
                    var sockfd = args[0].toInt32();
                    var addr = args[1];
                    
                    // 解析sockaddr结构
                    var family = Memory.readU16(addr);
                    if (family === 2) { // AF_INET
                        var port = (Memory.readU8(addr.add(2)) << 8) + Memory.readU8(addr.add(3));
                        var ip = Memory.readU8(addr.add(4)) + "." + 
                                Memory.readU8(addr.add(5)) + "." + 
                                Memory.readU8(addr.add(6)) + "." + 
                                Memory.readU8(addr.add(7));
                        console.log("[+] connect: " + ip + ":" + port + " (socket: " + sockfd + ")");
                    }
                    
                    if (needStack) {
                        console.log("调用栈:");
                        console.log(Thread.backtrace(this.context, Backtracer.ACCURATE)
                            .map(DebugSymbol.fromAddress).join('\n'));
                    }
                }
            });
        }
        
        // Hook send/recv
        var send = Module.findExportByName(null, "send");
        if (send) {
            Interceptor.attach(send, {
                onEnter: function(args) {
                    var sockfd = args[0].toInt32();
                    var len = args[2].toInt32();
                    console.log("[+] send: socket=" + sockfd + ", len=" + len);
                    if (len > 0 && len < 1024) {
                        console.log("  数据: " + hexdump(args[1], { length: Math.min(len, 64) }));
                    }
                    
                    if (needStack) {
                        console.log("调用栈:");
                        console.log(Thread.backtrace(this.context, Backtracer.ACCURATE)
                            .map(DebugSymbol.fromAddress).join('\n'));
                    }
                }
            });
        }
        
        var recv = Module.findExportByName(null, "recv");
        if (recv) {
            Interceptor.attach(recv, {
                onEnter: function(args) {
                    this.sockfd = args[0].toInt32();
                    this.buf = args[1];
                    this.len = args[2].toInt32();
                },
                onLeave: function(retval) {
                    var received = retval.toInt32();
                    if (received > 0) {
                        console.log("[+] recv: socket=" + this.sockfd + ", received=" + received);
                        if (received < 1024) {
                            console.log("  数据: " + hexdump(this.buf, { length: Math.min(received, 64) }));
                        }
                    }
                }
            });
        }
        
        console.log("[+] 网络函数Hook已启用");
    } catch (e) {
        console.log("[-] 网络函数Hook失败: " + e.message);
    }
}

// ============= SO文件分析工具 =============
function nativeAnalyzeSO(soName, showExports, showImports) {
    showExports = showExports || 1;
    showImports = showImports || 0;
    
    try {
        var module = Process.getModuleByName(soName);
        if (!module) {
            console.log("[-] 找不到SO文件: " + soName);
            return;
        }
        
        console.log("[+] SO文件分析: " + soName);
        console.log("  基址: " + module.base);
        console.log("  大小: " + module.size + " bytes");
        console.log("  路径: " + module.path);
        
        if (showExports) {
            console.log("\n[+] 导出函数:");
            var exports = module.enumerateExports();
            exports.slice(0, 20).forEach(function(exp) { // 只显示前20个
                console.log("  " + exp.name + " @ " + exp.address + " (类型: " + exp.type + ")");
            });
            if (exports.length > 20) {
                console.log("  ... 还有 " + (exports.length - 20) + " 个导出函数");
            }
        }
        
        if (showImports) {
            console.log("\n[+] 导入函数:");
            var imports = module.enumerateImports();
            imports.slice(0, 20).forEach(function(imp) { // 只显示前20个
                console.log("  " + imp.name + " @ " + imp.address + " (来自: " + imp.module + ")");
            });
            if (imports.length > 20) {
                console.log("  ... 还有 " + (imports.length - 20) + " 个导入函数");
            }
        }
        
        console.log("[+] SO文件分析完成");
    } catch (e) {
        console.log("[-] SO文件分析失败: " + e.message);
    }
}

// ============= 反调试检测Hook =============
function nativeHookAntiDebug(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    
    try {
        // Hook ptrace
        var ptrace = Module.findExportByName(null, "ptrace");
        if (ptrace) {
            Interceptor.attach(ptrace, {
                onEnter: function(args) {
                    var request = args[0].toInt32();
                    console.log("[+] ptrace 被调用, request: " + request);
                    
                    if (needStack) {
                        console.log("调用栈:");
                        console.log(Thread.backtrace(this.context, Backtracer.ACCURATE)
                            .map(DebugSymbol.fromAddress).join('\n'));
                    }
                },
                onLeave: function(retval) {
                    console.log("[+] ptrace 返回: " + retval);
                    // 可以修改返回值来绕过反调试
                    // retval.replace(ptr(0)); // 返回0表示成功
                }
            });
        }
        
        // Hook kill (用于检测调试器)
        var kill = Module.findExportByName(null, "kill");
        if (kill) {
            Interceptor.attach(kill, {
                onEnter: function(args) {
                    var pid = args[0].toInt32();
                    var sig = args[1].toInt32();
                    console.log("[+] kill 被调用: PID=" + pid + ", 信号=" + sig);
                    
                    if (needStack) {
                        console.log("调用栈:");
                        console.log(Thread.backtrace(this.context, Backtracer.ACCURATE)
                            .map(DebugSymbol.fromAddress).join('\n'));
                    }
                }
            });
        }
        
        // Hook /proc/self/status 文件读取
        var fopen = Module.findExportByName(null, "fopen");
        if (fopen) {
            Interceptor.attach(fopen, {
                onEnter: function(args) {
                    var filename = Memory.readCString(args[0]);
                    if (filename.includes("/proc/") || filename.includes("status") || filename.includes("stat")) {
                        console.log("[+] 可疑文件访问: " + filename);
                        this.suspicious = true;
                        
                        if (needStack) {
                            console.log("调用栈:");
                            console.log(Thread.backtrace(this.context, Backtracer.ACCURATE)
                                .map(DebugSymbol.fromAddress).join('\n'));
                        }
                    }
                },
                onLeave: function(retval) {
                    if (this.suspicious) {
                        console.log("[+] fopen 返回: " + retval);
                    }
                }
            });
        }
        
        console.log("[+] 反调试检测Hook已启用");
    } catch (e) {
        console.log("[-] 反调试检测Hook失败: " + e.message);
    }
}

// ============= Native Hook工具 =============
function nativeHookNativeFunction(address, options) {
    options = options || {};
    var showArgs = options.showArgs !== false;
    var showReturn = options.showReturn !== false;
    var showStack = options.showStack || false;
    var argTypes = options.argTypes || [];
    var returnType = options.returnType || 'pointer';
    var onEnter = options.onEnter;
    var onLeave = options.onLeave;
    
    try {
        var targetAddress = typeof address === 'string' ? Module.findExportByName(null, address) : ptr(address);
        if (!targetAddress) {
            LOG("找不到函数地址: " + address, { c: Color.Red });
            return null;
        }
        
        LOG("Hook函数: " + address + " @ " + targetAddress, { c: Color.Green });
        
        return Interceptor.attach(targetAddress, {
            onEnter: function(args) {
                LOG("\n*** 进入函数 " + address + " @ " + targetAddress, { c: Color.Yellow });
                
                if (showStack) {
                    printNativeStack();
                }
                
                if (showArgs && args.length > 0) {
                    LOG("参数:", { c: Color.Cyan });
                    for (var i = 0; i < args.length && i < 10; i++) {
                        var argType = argTypes[i] || 'pointer';
                        var argValue = args[i];
                        var displayValue = argValue;
                        
                        try {
                            switch (argType) {
                                case 'string':
                                    displayValue = argValue.readCString();
                                    break;
                                case 'int':
                                    displayValue = argValue.toInt32();
                                    break;
                                case 'uint':
                                    displayValue = argValue.toUInt32();
                                    break;
                                case 'bytes':
                                    displayValue = hexDump(argValue, 32);
                                    break;
                                default:
                                    displayValue = argValue;
                            }
                        } catch (e) {
                            displayValue = argValue + " [读取失败]";
                        }
                        
                        LOG("  arg[" + i + "] (" + argType + "): " + displayValue);
                    }
                }
                
                if (onEnter) {
                    onEnter.call(this, args);
                }
            },
            onLeave: function(retval) {
                if (showReturn) {
                    var displayReturn = retval;
                    try {
                        switch (returnType) {
                            case 'string':
                                displayReturn = retval.readCString();
                                break;
                            case 'int':
                                displayReturn = retval.toInt32();
                                break;
                            case 'uint':
                                displayReturn = retval.toUInt32();
                                break;
                            default:
                                displayReturn = retval;
                        }
                    } catch (e) {
                        displayReturn = retval + " [读取失败]";
                    }
                    
                    LOG("返回值 (" + returnType + "): " + displayReturn, { c: Color.Green });
                }
                
                if (onLeave) {
                    onLeave.call(this, retval);
                }
                
                LOG("*** 退出函数 " + address + "\n", { c: Color.Yellow });
            }
        });
    } catch (e) {
        LOG("Hook失败: " + e.message, { c: Color.Red });
        return null;
    }
}

function nativeHookModuleFunctions(moduleName, pattern, options) {
    options = options || {};
    var hooks = [];
    
    try {
        var exports = nativeFindExports(moduleName, pattern);
        LOG("在模块 " + moduleName + " 中找到 " + exports.length + " 个匹配的导出函数", { c: Color.Green });
        
        exports.forEach(function(exp) {
            var hook = nativeHookNativeFunction(exp.address, options);
            if (hook) {
                hooks.push({
                    name: exp.name,
                    address: exp.address,
                    hook: hook
                });
            }
        });
    } catch (e) {
        LOG("批量Hook失败: " + e.message, { c: Color.Red });
    }
    
    return hooks;
}

// ============= 内存相关工具 =============
function nativeSearchMemory(pattern, options) {
    options = options || {};
    var protection = options.protection || 'r--';
    var ranges = options.ranges || Process.enumerateRanges(protection);
    
    var results = [];
    
    ranges.forEach(function(range) {
        try {
            var matches = Memory.scan(range.base, range.size, pattern, {
                onMatch: function(address, size) {
                    results.push({
                        address: address,
                        size: size,
                        range: range
                    });
                },
                onError: function(reason) {
                    // 忽略错误
                },
                onComplete: function() {
                    // 扫描完成
                }
            });
        } catch (e) {
            // 忽略无法扫描的内存区域
        }
    });
    
    return results;
}

function nativePatchMemory(address, bytes) {
    try {
        var targetPtr = ptr(address);
        Memory.protect(targetPtr, bytes.length, 'rwx');
        Memory.writeByteArray(targetPtr, bytes);
        LOG("内存补丁成功: " + address, { c: Color.Green });
        return true;
    } catch (e) {
        LOG("内存补丁失败: " + e.message, { c: Color.Red });
        return false;
    }
}

function nativeAllocateMemory(size, protection) {
    protection = protection || 'rwx';
    try {
        var memory = Memory.alloc(size);
        if (protection !== 'rwx') {
            Memory.protect(memory, size, protection);
        }
        LOG("分配内存成功: " + memory + " (大小: " + size + ")", { c: Color.Green });
        return memory;
    } catch (e) {
        LOG("分配内存失败: " + e.message, { c: Color.Red });
        return null;
    }
}

// ============= 工具函数 =============
function uniqBy(array, key) {
    var seen = {};
    return array.filter(function(item) {
        var k = key(item);
        return seen.hasOwnProperty(k) ? false : (seen[k] = true);
    });
}

function nativeDescribeModule(moduleName) {
    try {
        var module = Process.getModuleByName(moduleName);
        var info = {
            name: module.name,
            base: module.base,
            size: module.size,
            path: module.path,
            exports: findExports(moduleName).length,
            imports: findImports(moduleName).length
        };
        
        LOG(JSON.stringify(info, null, 2), { c: Color.Cyan });
        return info;
    } catch (e) {
        LOG("描述模块失败: " + e.message, { c: Color.Red });
        return null;
    }
}

function nativeDescribeFunction(address) {
    try {
        var targetPtr = ptr(address);
        var symbol = DebugSymbol.fromAddress(targetPtr);
        var info = {
            address: targetPtr,
            symbol: symbol.toString(),
            module: symbol.moduleName,
            name: symbol.name,
            offset: symbol.offset
        };
        
        LOG(JSON.stringify(info, null, 2), { c: Color.Cyan });
        return info;
    } catch (e) {
        LOG("描述函数失败: " + e.message, { c: Color.Red });
        return null;
    }
}

// ============= 一键启用所有Native Hook =============
function nativeEnableAllHooks(showStack) {
    showStack = showStack || 0;
    
    console.log("[+] 启用所有Native Hook...");
    
    nativeHookDlopenFamily(showStack);
    nativeHookJNIFunctions(showStack);
    nativeHookCryptoFunctions('all', showStack);
    nativeHookNetworkFunctions(showStack);
    nativeHookAntiDebug(showStack);
    
    console.log("[+] 所有Native Hook已启用!");
}

// ============= 便捷函数包装 =============
function nativeQuickHookSO(soName) {
    // 快速分析并Hook一个SO文件的主要函数
    // 备注：需要手动指定要Hook的函数，因为每个SO都不同
    console.log("[-] nativeQuickHookSO 需要手动实现");
    console.log("    原因: 每个SO文件的函数都不同，无法通用化");
    console.log("    建议: 使用 nativeAnalyzeSO('" + soName + "', 1, 1) 先分析，然后手动Hook感兴趣的函数");
}

function nativeQuickHookCrypto(algorithm) {
    // 快速Hook指定的加密算法
    algorithm = algorithm || 'all';
    nativeHookCryptoFunctions(algorithm, 1);
}

function nativeQuickHookNetwork() {
    // 快速Hook网络相关函数
    nativeHookNetworkFunctions(1);
}

function nativeQuickAnalyzeApp() {
    // 快速分析应用的基本信息
    console.log("[+] 应用基本信息分析:");
    
    try {
        var modules = Process.enumerateModules();
        console.log("  已加载模块数量: " + modules.length);
        
        // 显示主要的SO文件
        var soFiles = modules.filter(function(m) { 
            return m.name.endsWith('.so') && !m.name.startsWith('lib'); 
        });
        
        console.log("  应用SO文件:");
        soFiles.slice(0, 10).forEach(function(m) {
            console.log("    " + m.name + " @ " + m.base);
        });
        
        if (soFiles.length > 10) {
            console.log("    ... 还有 " + (soFiles.length - 10) + " 个SO文件");
        }
        
    } catch (e) {
        console.log("[-] 应用分析失败: " + e.message);
    }
}

// ============= 导出函数 =============
// 基础工具
global.bytesToString = bytesToString;
global.stringToBytes = stringToBytes;
global.hexDump = hexDump;
global.safeReadMemory = safeReadMemory;
global.Color = Color;
global.LOG = LOG;
global.printNativeStack = printNativeStack;
global.printJsStack = printJsStack;

// 模块和符号查找
global.nativeFindModules = nativeFindModules;
global.nativeFindExports = nativeFindExports;
global.nativeFindImports = nativeFindImports;
global.nativeFindSymbols = nativeFindSymbols;

// Hook工具
global.nativeHookNativeFunction = nativeHookNativeFunction;
global.nativeHookModuleFunctions = nativeHookModuleFunctions;

// 高级Hook功能
global.nativeHookDlopenFamily = nativeHookDlopenFamily;
global.nativeHookJNIFunctions = nativeHookJNIFunctions;
global.nativeHookCryptoFunctions = nativeHookCryptoFunctions;
global.nativeHookNetworkFunctions = nativeHookNetworkFunctions;
global.nativeHookAntiDebug = nativeHookAntiDebug;

// 分析工具
global.nativeAnalyzeSO = nativeAnalyzeSO;
global.nativeQuickAnalyzeApp = nativeQuickAnalyzeApp;

// 内存操作
global.nativeSearchMemory = nativeSearchMemory;
global.nativePatchMemory = nativePatchMemory;
global.nativeAllocateMemory = nativeAllocateMemory;

// 便捷函数
global.nativeEnableAllHooks = nativeEnableAllHooks;
global.nativeQuickHookSO = nativeQuickHookSO;
global.nativeQuickHookCrypto = nativeQuickHookCrypto;
global.nativeQuickHookNetwork = nativeQuickHookNetwork;

// 工具函数
global.uniqBy = uniqBy;
global.nativeDescribeModule = nativeDescribeModule;
global.nativeDescribeFunction = nativeDescribeFunction;

LOG("Native Hook 高级工具类加载完成!", { c: Color.Green });
