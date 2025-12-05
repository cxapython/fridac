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
    // 将字节序列转换为字符串，并打印结果
    encoding = encoding || 'utf8';
    var result;
    try {
        if (typeof bytes === 'object' && bytes && bytes.readCString) {
            result = bytes.readCString();
        } else {
            if (bytes instanceof ArrayBuffer) {
                bytes = new Uint8Array(bytes);
            }
            if (bytes instanceof Uint8Array) {
                var str = '';
                for (var i = 0; i < bytes.length && i < NativeConfig.maxStringLength; i++) {
                    str += String.fromCharCode(bytes[i]);
                }
                result = str;
            } else {
                result = (bytes === null || typeof bytes === 'undefined') ? '' : bytes.toString();
            }
        }
    } catch (e) {
        result = '[无法转换的字节数据: ' + e.message + ']';
    }
    try { LOG('bytesToString => ' + String(result)); } catch (_) {}
    return result;
}

function stringToBytes(str) {
    // 将字符串转换为字节数组，并打印结果
    var bytes = [];
    try {
        str = (str === null || typeof str === 'undefined') ? '' : String(str);
        for (var i = 0; i < str.length; i++) {
            bytes.push(str.charCodeAt(i));
        }
    } catch (e) {
        // 出错时返回空数组
    }
    try { LOG('stringToBytes => len=' + bytes.length + ', bytes=' + JSON.stringify(bytes)); } catch (_) {}
    return bytes;
}

function hexDump(ptr, size) {
    // 执行内存十六进制转储，并打印结果
    size = size || NativeConfig.hexDumpSize;
    var out;
    try {
        out = hexdump(ptr, { length: size, ansi: true });
    } catch (e) {
        out = '[无法dump内存: ' + e.message + ']';
    }
    try { LOG('hexDump =>\n' + String(out)); } catch (_) {}
    return out;
}

function safeReadMemory(address, size, type) {
    // 安全读取内存内容，并打印结果摘要
    type = type || 'bytes';
    var value;
    try {
        var targetPtr = ptr(address);
        switch (type) {
            case 'bytes':
                value = targetPtr.readByteArray(size);
                break;
            case 'string':
                value = targetPtr.readCString();
                break;
            case 'utf8':
                value = targetPtr.readUtf8String();
                break;
            case 'int':
                value = targetPtr.readInt();
                break;
            case 'uint':
                value = targetPtr.readUInt();
                break;
            case 'pointer':
                value = targetPtr.readPointer();
                break;
            case 'float':
                value = targetPtr.readFloat();
                break;
            case 'double':
                value = targetPtr.readDouble();
                break;
            default:
                value = targetPtr.readByteArray(size);
                break;
        }
    } catch (e) {
        value = '[读取内存失败: ' + e.message + ']';
    }
    try {
        var summary;
        if (value && (value instanceof ArrayBuffer || value instanceof Uint8Array)) {
            var len = value.byteLength || value.length || 0;
            summary = '[bytes length=' + String(len) + ']';
        } else {
            summary = String(value);
        }
        LOG('safeReadMemory(' + String(type) + ') => ' + summary);
    } catch (_) {}
    return value;
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

// 统一结构化事件输出（发送JSON对象），不影响现有LOG
function emitEvent(eventType, fields) {
    try {
        var evt = fields || {};
        evt.type = eventType || evt.type || 'event';
        evt.ts = Date.now();
        try { evt.pid = Process.id; } catch(_){}
        try { evt.tid = Process.getCurrentThreadId(); } catch(_){}
        send(evt);
    } catch (e) {
        try { send({ type: 'event', error: e.message }); } catch(_){}
    }
}

// 安全读取C字符串（全局工具）
function safeCString(p) {
    try { return (!p || p.isNull && p.isNull()) ? 'NULL' : Memory.readCString(p); } catch (_) { return '[读取失败]'; }
}

// ============= 速率限制与寄存器采集（ARM/ARM64） =============
// 速率限制器：避免高频Hook导致刷屏（按键值与时间窗口控制）
var __rateLimiter = {
    buckets: {},
    shouldLog: function(key, maxPerInterval, intervalMs) {
        try {
            maxPerInterval = maxPerInterval || 10;
            intervalMs = intervalMs || 1000;
            var now = Date.now();
            var bucket = this.buckets[key];
            if (!bucket || (now - bucket.windowStart) > intervalMs) {
                this.buckets[key] = { windowStart: now, count: 1 };
                return true;
            }
            if (bucket.count < maxPerInterval) {
                bucket.count += 1;
                return true;
            }
            return false;
        } catch (_) { return true; }
    }
};

// 采集寄存器（自动适配 ARMv7/ARM64），仅采集前若干常用寄存器
function nativeCaptureRegisters(context) {
    var arch = Process.arch || 'arm64';
    var regs = {};
    try {
        if (arch.indexOf('arm64') !== -1 || arch.indexOf('aarch64') !== -1) {
            // ARM64: x0-x7, sp, lr, pc
            ['x0','x1','x2','x3','x4','x5','x6','x7','sp','lr','pc'].forEach(function(r){
                try { regs[r] = context[r]; } catch (_) {}
            });
        } else {
            // ARMv7: r0-r3, sp, lr, pc
            ['r0','r1','r2','r3','sp','lr','pc'].forEach(function(r){
                try { regs[r] = context[r]; } catch (_) {}
            });
        }
    } catch (e) {
        regs.error = e.message;
    }
    return regs;
}

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
                    try { if (!retval.isNull && retval.toString() === '0x0') return; __tryInvokeRehooks(this.library || ''); } catch(_){}
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
        
        // Hook android_dlopen_ext（更贴近 Android 链接器）
        var android_dlopen_ext = Module.findExportByName(null, "android_dlopen_ext");
        if (android_dlopen_ext) {
            Interceptor.attach(android_dlopen_ext, {
                onEnter: function(args) {
                    try {
                        var lib = args[0].isNull() ? "" : Memory.readCString(args[0]);
                        console.log("[+] android_dlopen_ext 加载库: " + lib);
                        if (needStack) {
                            console.log("调用栈:");
                            console.log(Thread.backtrace(this.context, Backtracer.ACCURATE)
                                .map(DebugSymbol.fromAddress).join('\n'));
                        }
                        this.library = lib;
                    } catch (_) {}
                },
                onLeave: function (retval) {
                    try { if (!retval.isNull && this.library) __tryInvokeRehooks(this.library); } catch(_){}
                }
            });
        }

        // 可选：枚举已加载模块（dl_iterate_phdr）
        var dl_iterate_phdr = Module.findExportByName(null, "dl_iterate_phdr");
        if (dl_iterate_phdr) {
            Interceptor.attach(dl_iterate_phdr, {
                onEnter: function(args) {
                    console.log("[+] dl_iterate_phdr 被调用（可能在枚举已加载模块）");
                }
            });
        }

        console.log("[+] dlopen/dlsym/android_dlopen_ext Hook已启用");
    } catch (e) {
        console.log("[-] dlopen/dlsym Hook失败: " + e.message);
    }
}

// ============= 自动重挂钩（按模块匹配触发） =============
var __rehookRegistry = [];
var __rehookExecuted = {};

function nativeRegisterRehook(name, match, fn) {
    try {
        __rehookRegistry.push({ name: name || ('hook_'+(__rehookRegistry.length+1)), match: match, fn: fn });
        console.log('[+] 已注册重挂钩: ' + name);
        return true;
    } catch (e) { return false; }
}

function __tryInvokeRehooks(libraryName) {
    try {
        __rehookRegistry.forEach(function(item){
            try {
                var key = item.name + '@' + libraryName;
                if (__rehookExecuted[key]) return;
                var ok = false;
                if (!item.match) ok = true;
                else if (typeof item.match === 'function') ok = !!item.match(libraryName);
                else if (item.match instanceof RegExp) ok = item.match.test(libraryName);
                else if (typeof item.match === 'string') ok = libraryName.indexOf(item.match) !== -1;
                if (ok && typeof item.fn === 'function') {
                    try { item.fn(libraryName); __rehookExecuted[key] = 1; } catch(_){}
                }
            } catch(_){}
        });
    } catch(_){}
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

// ============= JNI/ART 观测（RegisterNatives/字符串/数组/DEX加载） =============
function nativeHookJNIAndART(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;

    function logStack(ctx) {
        if (!needStack) return;
        try { LOG(Thread.backtrace(ctx, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n')); } catch(_){}
    }

    try {
        // RegisterNatives（解析 JNINativeMethod 表）
        var reg = Module.findExportByName(null, 'RegisterNatives');
        if (reg) {
            Interceptor.attach(reg, {
                onEnter: function(args) {
                    try {
                        var clazz = args[0];
                        var methods = args[1];
                        var nMethods = args[2].toInt32();
                        LOG('☕ RegisterNatives: 方法数量=' + nMethods);
                        for (var i = 0; i < Math.min(nMethods, 50); i++) {
                            try {
                                var base = methods.add(i * (Process.pointerSize * 3));
                                var namePtr = base.readPointer();
                                var sigPtr = base.add(Process.pointerSize).readPointer();
                                var fnPtr  = base.add(Process.pointerSize * 2).readPointer();
                                var nm = safeCString(namePtr);
                                var sg = safeCString(sigPtr);
                                var sym = DebugSymbol.fromAddress(fnPtr).toString();
                                LOG('  #' + i + ' ' + nm + ' ' + sg + ' -> ' + sym);
                            } catch (_) {}
                        }
                        logStack(this.context);
                    } catch (_) {}
                }
            });
            console.log('[+] Hook RegisterNatives');
        }

        // 字符串相关（libart/libdvm 符号，尽量兼容）
        var stringSymbols = [
            { pat: 'GetStringUTFChars', role: 'get' },
            { pat: 'ReleaseStringUTFChars', role: 'rel' },
            { pat: 'NewStringUTF', role: 'new' }
        ];
        ['libart.so','libdvm.so',null].forEach(function(lib){
            stringSymbols.forEach(function(s){
                var addr = Module.findExportByName(lib, s.pat);
                if (!addr && lib === 'libart.so') {
                    // 兼容C++符号名，尝试遍历匹配
                    try {
                        var mod = Process.getModuleByName('libart.so');
                        var syms = mod.enumerateSymbols().filter(function(x){ return x.name.indexOf(s.pat) !== -1; });
                        if (syms.length > 0) addr = syms[0].address;
                    } catch(_){}
                }
                if (!addr) return;
                Interceptor.attach(addr, {
                    onEnter: function(args) {
                        try {
                            if (s.role === 'get') {
                                this.jstr = args[1];
                            } else if (s.role === 'new') {
                                this.cstr = args[1];
                                LOG('☕ NewStringUTF: ' + safeCString(this.cstr));
                            }
                            logStack(this.context);
                        } catch(_){}
                    },
                    onLeave: function(retval) {
                        try {
                            if (s.role === 'get') {
                                var p = retval; // 返回 const char*
                                LOG('☕ GetStringUTFChars -> ' + safeCString(p));
                            }
                        } catch(_){}
                    }
                });
                console.log('[+] Hook JNI 字符串: ' + (lib||'any') + '!' + s.pat);
            });
        });

        // 字节数组（Get/ReleaseByteArrayElements）
        ['GetByteArrayElements','ReleaseByteArrayElements'].forEach(function(nm){
            var addr = Module.findExportByName('libart.so', nm) || Module.findExportByName('libdvm.so', nm) || Module.findExportByName(null, nm);
            if (!addr) return;
            Interceptor.attach(addr, {
                onEnter: function(args) {
                    try {
                        if (nm === 'GetByteArrayElements') {
                            this.jba = args[1];
                            this.isCopy = args[2];
                        }
                        logStack(this.context);
                    } catch(_){}
                },
                onLeave: function(retval) {
                    if (nm === 'GetByteArrayElements') {
                        try {
                            var ptrBytes = retval;
                            LOG('☕ GetByteArrayElements -> 指针=' + ptrBytes);
                        } catch(_){}
                    }
                }
            });
            console.log('[+] Hook JNI 字节数组: ' + nm);
        });

        // DexFile::Open（仅观测）
        try {
            var art = Process.getModuleByName('libart.so');
            var openSyms = art.enumerateSymbols().filter(function(s){ return s.name.indexOf('DexFile') !== -1 && s.name.indexOf('Open') !== -1; });
            openSyms.slice(0, 5).forEach(function(s){
                Interceptor.attach(s.address, {
                    onEnter: function(args) {
                        LOG('📦 DexFile::Open 触发: ' + s.name);
                        logStack(this.context);
                    }
                });
                console.log('[+] Hook ART: ' + s.name);
            });
        } catch(_){}

        LOG('[+] JNI/ART 观测已启用', { c: Color.Green });
    } catch (e) {
        LOG('[-] JNI/ART 观测失败: ' + e.message, { c: Color.Red });
    }
}

// ============= 反调试对抗开关（可选） =============
function nativeEnableAntiDebugBypass(options) {
    options = options || {};
    var bypassPtrace = options.bypassPtrace !== false; // 默认开启
    var spoofTracerPid = options.spoofTracerPid !== false; // 默认开启

    // 1) 伪造 ptrace 行为（让常见检测失效）
    if (bypassPtrace) {
        try {
            var ptrace = Module.findExportByName(null, 'ptrace');
            if (ptrace) {
                Interceptor.attach(ptrace, {
                    onEnter: function(args) {
                        this.request = args[0].toInt32();
                    },
                    onLeave: function(retval) {
                        try {
                            // 让 PTRACE_TRACEME 返回 0（表示未被跟踪），其他请求保持原样
                            if (this.request === 0) { // PTRACE_TRACEME == 0
                                retval.replace(ptr(0));
                            }
                        } catch(_){}
                    }
                });
                console.log('[+] 反调试: 已启用 ptrace 绕过');
            }
        } catch(_){}
    }

    // 2) 伪造 /proc/self/status 中 TracerPid
    if (spoofTracerPid) {
        try {
            var trackedFds = {};
            var openFn = Module.findExportByName(null, 'open');
            var readFn = Module.findExportByName(null, 'read');
            if (openFn) {
                Interceptor.attach(openFn, {
                    onEnter: function(args) {
                        try {
                            var path = Memory.readCString(args[0]);
                            this.isStatus = (path.indexOf('/proc/') !== -1 && path.indexOf('status') !== -1);
                        } catch(_) { this.isStatus = false; }
                    },
                    onLeave: function(retval) {
                        try {
                            var fd = retval.toInt32();
                            if (this.isStatus && fd > 2) { trackedFds[fd] = 1; }
                        } catch(_){}
                    }
                });
            }
            if (readFn) {
                Interceptor.attach(readFn, {
                    onEnter: function(args) {
                        this.fd = args[0].toInt32();
                        this.buf = args[1];
                        this.len = args[2].toInt32();
                    },
                    onLeave: function(retval) {
                        try {
                            var r = retval.toInt32();
                            if (r > 0 && trackedFds[this.fd]) {
                                // 就地替换 "TracerPid:  1234" 为 "TracerPid:  0   "（保持长度）
                                var s = Memory.readUtf8String(this.buf, r);
                                var idx = s.indexOf('TracerPid:');
                                if (idx !== -1) {
                                    var end = s.indexOf('\n', idx);
                                    if (end === -1) end = s.length;
                                    var prefix = s.substring(0, idx + 'TracerPid:'.length);
                                    var suffix = s.substring(end);
                                    var body = s.substring(idx + 'TracerPid:'.length, end);
                                    var replaced = prefix + body.replace(/[0-9]+/g, ' 0') + suffix;
                                    // 写回（长度不变时安全；过长则截断）
                                    var out = replaced.substr(0, r);
                                    Memory.writeUtf8String(this.buf, out);
                                }
                            }
                        } catch(_){}
                    }
                });
            }
            console.log('[+] 反调试: 已启用 TracerPid 伪造');
        } catch(_){}
    }

    LOG('[+] 反调试对抗开关已启用', { c: Color.Green });
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
        // 辅助: sockaddr 解析到字符串
        function sockaddrToString(addrPtr) {
            try {
                if (!addrPtr) return 'NULL';
                var family = Memory.readU16(addrPtr);
                if (family === 2) { // AF_INET
                    var port = (Memory.readU8(addrPtr.add(2)) << 8) + Memory.readU8(addrPtr.add(3));
                    var ip = [4,5,6,7].map(function(i){ return Memory.readU8(addrPtr.add(i)); }).join('.');
                    return ip + ':' + port;
                } else if (family === 10) { // AF_INET6 (简化显示为前两段)
                    return 'IPv6';
                } else if (family === 1) { // AF_UNIX
                    try { return 'unix:' + Memory.readCString(addrPtr.add(2)); } catch(_) { return 'unix'; }
                }
            } catch(_) {}
            return 'unknown';
        }

        // Hook connect（IPv4/IPv6/UNIX 简易解析）
        var connect = Module.findExportByName(null, "connect");
        if (connect) {
            Interceptor.attach(connect, {
                onEnter: function(args) {
                    try {
                        var sockfd = args[0].toInt32();
                        var addr = args[1];
                        var family = Memory.readU16(addr);
                        var peer = sockaddrToString(addr);
                        if (__rateLimiter.shouldLog('connect:'+peer, 50, 2000)) {
                            emitEvent('net_connect', { fd: sockfd, peer: peer });
                        }
                        if (needStack) {
                            LOG(Thread.backtrace(this.context, Backtracer.ACCURATE)
                                .map(DebugSymbol.fromAddress).join('\n'));
                        }
                    } catch (_) {}
                }
            });
        }

        // Hook send/recv
        var send = Module.findExportByName(null, "send");
        if (send) {
            Interceptor.attach(send, {
                onEnter: function(args) {
                    try {
                        var sockfd = args[0].toInt32();
                        var len = args[2].toInt32();
                        if (__rateLimiter.shouldLog('send:'+sockfd, 100, 1000)) {
                            emitEvent('net_send', { fd: sockfd, len: len });
                        }
                        if (len > 0 && len <= 1024 && __rateLimiter.shouldLog('send:dump', 10, 1000)) {
                            LOG(hexdump(args[1], { length: Math.min(len, 128) }));
                        }
                        if (needStack) {
                            LOG(Thread.backtrace(this.context, Backtracer.ACCURATE)
                                .map(DebugSymbol.fromAddress).join('\n'));
                        }
                    } catch (_) {}
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
                    try {
                        var received = retval.toInt32();
                        if (received > 0) {
                            if (__rateLimiter.shouldLog('recv:'+this.sockfd, 100, 1000)) {
                                emitEvent('net_recv', { fd: this.sockfd, len: received });
                            }
                            if (received <= 1024 && this.buf && __rateLimiter.shouldLog('recv:dump', 10, 1000)) {
                                LOG(hexdump(this.buf, { length: Math.min(received, 128) }));
                            }
                        }
                    } catch (_) {}
                }
            });
        }

        // Hook accept
        var accept = Module.findExportByName(null, 'accept');
        if (accept) {
            Interceptor.attach(accept, {
                onEnter: function(args) {
                    this.sockfd = args[0].toInt32();
                    this.addr = args[1];
                },
                onLeave: function(retval) {
                    try {
                        var cfd = retval.toInt32();
                        if (cfd >= 0) {
                            var peer = 'unknown';
                            try { if (this.addr && !this.addr.isNull()) peer = sockaddrToString(this.addr); } catch(_){ }
                            if (__rateLimiter.shouldLog('accept:'+cfd, 50, 1000)) {
                                emitEvent('net_accept', { fd: cfd, server_fd: this.sockfd, peer: peer });
                            }
                        }
                    } catch(_){}
                }
            });
        }

        // Hook sendmsg
        var sendmsg = Module.findExportByName(null, 'sendmsg');
        if (sendmsg) {
            Interceptor.attach(sendmsg, {
                onEnter: function(args) {
                    try { this.sockfd = args[0].toInt32(); } catch(_){ this.sockfd = -1; }
                },
                onLeave: function(retval) {
                    try {
                        var n = retval.toInt32();
                        if (n > 0) emitEvent('net_sendmsg', { fd: this.sockfd, len: n });
                    } catch(_){ }
                }
            });
        }

        // Hook recvmsg
        var recvmsg = Module.findExportByName(null, 'recvmsg');
        if (recvmsg) {
            Interceptor.attach(recvmsg, {
                onEnter: function(args) {
                    this.sockfd = args[0].toInt32();
                    this.msg = args[1];
                },
                onLeave: function(retval) {
                    try {
                        var n = retval.toInt32();
                        if (n > 0) {
                            emitEvent('net_recvmsg', { fd: this.sockfd, len: n });
                        }
                    } catch(_){ }
                }
            });
        }

        // Hook getaddrinfo（域名解析）
        var getaddrinfo = Module.findExportByName(null, "getaddrinfo");
        if (getaddrinfo) {
            Interceptor.attach(getaddrinfo, {
                onEnter: function(args) {
                    try {
                        var node = args[0].isNull() ? '' : Memory.readCString(args[0]);
                        var service = args[1].isNull() ? '' : Memory.readCString(args[1]);
                        if (__rateLimiter.shouldLog('getaddrinfo:'+node+':'+service, 50, 1000)) {
                            emitEvent('dns_query', { node: node, service: service });
                        }
                    } catch (_) {}
                }
            });
        }

        LOG("[+] 网络函数Hook已启用", { c: Color.Green });
    } catch (e) {
        LOG("[-] 网络函数Hook失败: " + e.message, { c: Color.Red });
    }
}

// ============= TLS 明文捕获（OpenSSL/BoringSSL） =============
function nativeHookTLSFunctions(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;

    try {
        var targets = [
            { lib: 'libssl.so', name: 'SSL_write', dir: 'send' },
            { lib: 'libssl.so', name: 'SSL_read', dir: 'recv' },
            { lib: null,        name: 'SSL_write', dir: 'send' },
            { lib: null,        name: 'SSL_read',  dir: 'recv' }
        ];

        targets.forEach(function(t) {
            var addr = Module.findExportByName(t.lib, t.name);
            if (!addr) return;
            Interceptor.attach(addr, {
                onEnter: function(args) {
                    this.buf = args[1];
                    this.len = args[2].toInt32 ? args[2].toInt32() : parseInt(args[2]);
                    this.dir = t.dir;

                    if (__rateLimiter.shouldLog(t.name + ':' + t.dir, 20, 1000)) {
                        LOG("🔐 " + t.name + "(" + t.dir + ") len=" + this.len);
                        if (needStack) {
                            try {
                                LOG(Thread.backtrace(this.context, Backtracer.ACCURATE)
                                    .map(DebugSymbol.fromAddress).join('\n'));
                            } catch (_) {}
                        }
                    }
                },
                onLeave: function(retval) {
                    try {
                        var n = retval.toInt32 ? retval.toInt32() : parseInt(retval);
                        if (n > 0 && n <= 4096 && this.buf) {
                            var dump = hexdump(this.buf, { length: Math.min(n, 256) });
                            if (__rateLimiter.shouldLog(t.name + ':dump', 10, 1000)) {
                                LOG("📦 TLS(" + this.dir + ") 数据(前256字节):\n" + dump);
                            }
                        }
                    } catch (_) {}
                }
            });
            console.log("[+] Hook TLS 函数: " + (t.lib || 'any') + "!" + t.name);
        });

    } catch (e) {
        console.log("[-] TLS Hook失败: " + e.message);
    }
}

// ============= Conscrypt/Android TLS 明文捕获（NativeCrypto JNI） =============
function nativeHookConscryptTLS(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;

    function hookAddr(addr, name, dir) {
        try {
            Interceptor.attach(addr, {
                onEnter: function(args) {
                    this.buf = args[2] || args[1];
                    this.len = (args[3] || args[2]);
                    try { this.n = this.len.toInt32 ? this.len.toInt32() : parseInt(this.len); } catch (_) { this.n = 0; }
                    this.dir = dir;
                    if (__rateLimiter.shouldLog('Conscrypt:'+name, 20, 1000)) {
                        LOG('🔐 Conscrypt '+name+'('+dir+') len=' + this.n);
                        if (needStack) {
                            try { LOG(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n')); } catch(_){}
                        }
                    }
                },
                onLeave: function(retval) {
                    try {
                        var r = retval.toInt32 ? retval.toInt32() : parseInt(retval);
                        if (r > 0 && r <= 4096 && this.buf && __rateLimiter.shouldLog('Conscrypt:'+name+':dump', 10, 1000)) {
                            LOG('📦 Conscrypt('+this.dir+') 前256字节:\n' + hexdump(this.buf, { length: Math.min(r, 256) }));
                        }
                    } catch (_) {}
                }
            });
            return true;
        } catch (e) { return false; }
    }

    try {
        var targets = [];
        // 常见模块名包含 conscrypt 或 javacrypto
        var modules = Process.enumerateModules();
        modules.forEach(function(m) {
            var name = (m.name || '').toLowerCase();
            if (name.indexOf('conscrypt') !== -1 || name.indexOf('javacrypto') !== -1) {
                try {
                    var exps = m.enumerateExports();
                    exps.forEach(function(e) {
                        var en = e.name || '';
                        if (/NativeCrypto.*SSL_(read|write)/.test(en) || /Java_.*NativeCrypto.*SSL_(read|write)/.test(en)) {
                            var dir = en.indexOf('write') !== -1 ? 'send' : 'recv';
                            targets.push({ addr: e.address, name: en, dir: dir, mod: m.name });
                        }
                    });
                } catch (_) {}
            }
        });

        if (targets.length === 0) {
            LOG('⚠️ 未找到 Conscrypt NativeCrypto 符号（可能系统实现不同）', { c: Color.Yellow });
        } else {
            targets.forEach(function(t) {
                if (hookAddr(t.addr, t.name, t.dir)) {
                    console.log('[+] Hook Conscrypt: ' + t.mod + '!' + t.name);
                }
            });
        }
    } catch (e) {
        LOG('[-] Conscrypt TLS Hook失败: ' + e.message, { c: Color.Red });
    }
}

// ============= BIO 旁路捕获（BIO_read/BIO_write） =============
function nativeHookBIOFunctions(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    try {
        [{name:'BIO_read', dir:'recv'}, {name:'BIO_write', dir:'send'}].forEach(function(t){
            var addr = Module.findExportByName(null, t.name) || Module.findExportByName('libssl.so', t.name);
            if (!addr) return;
            Interceptor.attach(addr, {
                onEnter: function(args) {
                    this.buf = args[1];
                    this.len = args[2].toInt32 ? args[2].toInt32() : parseInt(args[2]);
                    this.dir = t.dir;
                    if (__rateLimiter.shouldLog('BIO:'+t.name, 50, 1000)) {
                        LOG('🔎 '+t.name+'('+t.dir+') len=' + this.len);
                        if (needStack) {
                            try { LOG(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n')); } catch(_){}
                        }
                    }
                },
                onLeave: function(retval) {
                    try {
                        var n = retval.toInt32 ? retval.toInt32() : parseInt(retval);
                        if (n > 0 && n <= 4096 && this.buf && __rateLimiter.shouldLog('BIO:dump', 10, 1000)) {
                            LOG('📦 BIO('+this.dir+') 前256字节:\n' + hexdump(this.buf, { length: Math.min(n, 256) }));
                        }
                    } catch (_) {}
                }
            });
            console.log('[+] Hook BIO: ' + (addr.moduleName || 'any') + '!' + t.name);
        });
        LOG('[+] BIO 函数Hook已启用', { c: Color.Green });
    } catch (e) {
        LOG('[-] BIO 函数Hook失败: ' + e.message, { c: Color.Red });
    }
}

// ============= 加密原语捕获（EVP/Digest/HMAC/AES/RAND/PBKDF2） =============
function nativeHookCryptoPrimitives(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;

    function hook(name, lib, onEnter, onLeave) {
        try {
            var addr = Module.findExportByName(lib, name);
            if (!addr && lib !== null) addr = Module.findExportByName(null, name);
            if (!addr) return false;
            Interceptor.attach(addr, { onEnter: onEnter || function(){}, onLeave: onLeave || function(){} });
            console.log('[+] Hook 加密原语: ' + (lib || 'any') + '!' + name);
            return true;
        } catch (e) { return false; }
    }

    try {
        // EVP 对称加密初始化
        hook('EVP_EncryptInit_ex', 'libcrypto.so', function(args) {
            try {
                var key = args[3];
                var iv  = args[4];
                if (__rateLimiter.shouldLog('EVP_EncryptInit', 50, 2000)) {
                    LOG('🔐 EVP_EncryptInit_ex: key前32字节=' + hexdump(key, { length: 32 }) + '\niv=' + hexdump(iv, { length: 16 }));
                    if (needStack) LOG(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n'));
                }
            } catch (_) {}
        });
        hook('EVP_DecryptInit_ex', 'libcrypto.so', function(args) {
            try {
                var key = args[3];
                var iv  = args[4];
                if (__rateLimiter.shouldLog('EVP_DecryptInit', 50, 2000)) {
                    LOG('🔓 EVP_DecryptInit_ex: key前32字节=' + hexdump(key, { length: 32 }) + '\niv=' + hexdump(iv, { length: 16 }));
                    if (needStack) LOG(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n'));
                }
            } catch (_) {}
        });

        // EVP Update 阶段（仅截断）
        hook('EVP_EncryptUpdate', 'libcrypto.so', function(args) {
            try { var inPtr = args[3]; var inLen = args[4].toInt32(); if (inLen>0 && inLen<=4096 && __rateLimiter.shouldLog('EVP_EncUpd', 100, 1000)) LOG('📦 EVP_EncryptUpdate 输入: len=' + inLen + '\n' + hexdump(inPtr, { length: Math.min(inLen, 128) })); } catch(_){}
        });
        hook('EVP_DecryptUpdate', 'libcrypto.so', function(args) {
            try { var inPtr = args[3]; var inLen = args[4].toInt32(); if (inLen>0 && inLen<=4096 && __rateLimiter.shouldLog('EVP_DecUpd', 100, 1000)) LOG('📦 EVP_DecryptUpdate 输入: len=' + inLen + '\n' + hexdump(inPtr, { length: Math.min(inLen, 128) })); } catch(_){}
        });

        // 摘要计算
        hook('EVP_DigestInit_ex', 'libcrypto.so', function(args) {
            if (__rateLimiter.shouldLog('EVP_DigestInit', 50, 2000)) LOG('🔎 EVP_DigestInit_ex');
        });
        hook('EVP_DigestUpdate', 'libcrypto.so', function(args) {
            try { var data = args[1]; var len = args[2].toInt32(); if (len>0 && len<=2048 && __rateLimiter.shouldLog('EVP_DigestUpdate', 100, 1000)) LOG('📄 EVP_DigestUpdate: len='+len+'\n'+hexdump(data,{length:Math.min(len,128)})); } catch(_){}
        });
        hook('EVP_DigestFinal_ex', 'libcrypto.so', null, function(retval, state) {
            // 输出缓冲由调用者提供，这里只做阶段标记
            if (__rateLimiter.shouldLog('EVP_DigestFinal', 50, 2000)) LOG('✅ EVP_DigestFinal_ex 完成');
        });

        // HMAC
        hook('HMAC_Init_ex', 'libcrypto.so', function(args){
            try {
                var key = args[1]; var len = args[2].toInt32();
                if (__rateLimiter.shouldLog('HMAC_Init', 50, 2000)) LOG('🔑 HMAC_Init_ex: keyLen='+len+'\n'+hexdump(key,{length:Math.min(len,32)}));
            } catch(_){}
        });
        hook('HMAC_Update', 'libcrypto.so', function(args){
            try { var data = args[1]; var len = args[2].toInt32(); if (len>0 && len<=2048 && __rateLimiter.shouldLog('HMAC_Update',100,1000)) LOG('📄 HMAC_Update: len='+len+'\n'+hexdump(data,{length:Math.min(len,128)})); } catch(_){}
        });
        hook('HMAC_Final', 'libcrypto.so', function(args){ this.out = args[1]; this.outlen = args[2]; }, function(){
            try { var n = this.outlen.readU32(); if (n>0 && n<=64) LOG('✅ HMAC_Final: outLen='+n+'\n'+hexdump(this.out,{length:n})); } catch(_){}
        });

        // PBKDF2
        hook('PKCS5_PBKDF2_HMAC', 'libcrypto.so', function(args){
            try {
                var pass = args[0]; var passlen = args[1].toInt32();
                var salt = args[2]; var saltlen = args[3].toInt32();
                var iter = args[4].toInt32(); var keylen = args[6].toInt32();
                if (__rateLimiter.shouldLog('PBKDF2', 20, 5000)) {
                    LOG('🧪 PKCS5_PBKDF2_HMAC: iter='+iter+', keylen='+keylen);
                    LOG('  pass(截断):\n'+hexdump(pass,{length:Math.min(passlen,32)}));
                    LOG('  salt(截断):\n'+hexdump(salt,{length:Math.min(saltlen,32)}));
                }
            } catch(_){}
        }, function(retval){ try { LOG('✅ PBKDF2 完成'); } catch(_){} });

        // RAND
        hook('RAND_bytes', 'libcrypto.so', function(args){ this.buf=args[0]; this.len=args[1].toInt32(); }, function(retval){ try { if (this.len>0 && this.len<=64) LOG('🎲 RAND_bytes: len='+this.len+'\n'+hexdump(this.buf,{length:this.len})); } catch(_){} });

        // 低层 AES（补充，不与旧函数冲突）
        ;['AES_set_encrypt_key','AES_set_decrypt_key','AES_encrypt','AES_decrypt'].forEach(function(nm){
            hook(nm, 'libcrypto.so', function(args){ if (__rateLimiter.shouldLog(nm, 50, 2000)) LOG('🔧 '+nm+' 调用'); });
        });

        LOG('[+] 加密原语Hook已启用', { c: Color.Green });
    } catch (e) {
        LOG('[-] 加密原语Hook失败: '+ e.message, { c: Color.Red });
    }
}

// ============= 文件IO 监控（open/openat/read/write 等） =============
function nativeHookFileIOFunctions(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;

    try {
        var pairs = [
            { name: 'open' }, { name: 'openat' }, { name: 'creat' },
            { name: 'read' }, { name: 'write' },
            { name: 'fopen' }, { name: 'fread' }, { name: 'fwrite' }, { name: 'fclose' },
            { name: 'rename' }, { name: 'unlink' },
            { name: 'stat' }, { name: 'lstat' }, { name: 'fstat' }
        ];

        pairs.forEach(function(p) {
            var addr = Module.findExportByName(null, p.name);
            if (!addr) return;
            Interceptor.attach(addr, {
                onEnter: function(args) {
                    this.fn = p.name;
                    this.args = args;
                    if (!__rateLimiter.shouldLog('fs:' + p.name, 50, 1000)) return;
                    try {
                        if (p.name === 'open' || p.name === 'creat' || p.name === 'fopen') {
                            var path = Memory.readCString(args[0]);
                            LOG("📁 " + p.name + ": " + path);
                        } else if (p.name === 'openat') {
                            var dfd = args[0].toInt32();
                            var pth = Memory.readCString(args[1]);
                            LOG("📁 openat: dfd=" + dfd + ", path=" + pth);
                        } else if (p.name === 'read' || p.name === 'write') {
                            var fd = args[0].toInt32();
                            var len = args[2].toInt32();
                            LOG("📄 " + p.name + ": fd=" + fd + ", len=" + len);
                        } else if (p.name === 'rename') {
                            LOG("🔀 rename: " + Memory.readCString(args[0]) + " -> " + Memory.readCString(args[1]));
                        } else if (p.name === 'unlink') {
                            LOG("🗑️ unlink: " + Memory.readCString(args[0]));
                        }
                        if (needStack) {
                            LOG(Thread.backtrace(this.context, Backtracer.ACCURATE)
                                .map(DebugSymbol.fromAddress).join('\n'));
                        }
                    } catch (_) {}
                }
            });
            console.log("[+] Hook 文件IO: " + p.name);
        });
    } catch (e) {
        console.log("[-] 文件IO Hook失败: " + e.message);
    }
}

// ============= 进程/内存管理 Hook（mmap/mprotect/prctl/ptrace/exec* 等） =============
function nativeHookProcessMemoryFunctions(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;

    function decodeProt(p) {
        try {
            var v = p.toInt32 ? p.toInt32() : p;
            var flags = [];
            if (v & 1) flags.push('PROT_READ');
            if (v & 2) flags.push('PROT_WRITE');
            if (v & 4) flags.push('PROT_EXEC');
            if (flags.length === 0) flags.push('PROT_NONE');
            return flags.join('|');
        } catch (_) { return String(p); }
    }

    function safeCString(p) { try { return p.isNull() ? 'NULL' : Memory.readCString(p); } catch (_) { return '[读取失败]'; } }

    try {
        var mmap = Module.findExportByName(null, 'mmap');
        if (mmap) {
            Interceptor.attach(mmap, {
                onEnter: function(args) {
                    try {
                        var addr = args[0];
                        var length = args[1].toInt32();
                        var prot = decodeProt(args[2]);
                        LOG("🧩 mmap: addr=" + addr + ", len=" + length + ", prot=" + prot);
                        if (needStack) {
                            LOG(Thread.backtrace(this.context, Backtracer.ACCURATE)
                                .map(DebugSymbol.fromAddress).join('\n'));
                        }
                    } catch (_) {}
                }
            });
        }

        var mprotect = Module.findExportByName(null, 'mprotect');
        if (mprotect) {
            Interceptor.attach(mprotect, {
                onEnter: function(args) {
                    try {
                        var addr = args[0];
                        var length = args[1].toInt32();
                        var prot = decodeProt(args[2]);
                        LOG("🛡️ mprotect: addr=" + addr + ", len=" + length + ", prot=" + prot);
                    } catch (_) {}
                }
            });
        }

        var munmap = Module.findExportByName(null, 'munmap');
        if (munmap) {
            Interceptor.attach(munmap, {
                onEnter: function(args) {
                    try {
                        LOG("🧹 munmap: addr=" + args[0] + ", len=" + args[1].toInt32());
                    } catch (_) {}
                }
            });
        }

        var prctl = Module.findExportByName(null, 'prctl');
        if (prctl) {
            Interceptor.attach(prctl, {
                onEnter: function(args) {
                    try {
                        var option = args[0].toInt32();
                        LOG("⚙️ prctl: option=" + option);
                    } catch (_) {}
                }
            });
        }

        var ptrace = Module.findExportByName(null, 'ptrace');
        if (ptrace) {
            Interceptor.attach(ptrace, {
                onEnter: function(args) {
                    try {
                        var request = args[0].toInt32();
                        if (__rateLimiter.shouldLog('ptrace:'+request, 20, 2000)) {
                            LOG("🧪 ptrace: request=" + request);
                        }
                        if (needStack) {
                            LOG(Thread.backtrace(this.context, Backtracer.ACCURATE)
                                .map(DebugSymbol.fromAddress).join('\n'));
                        }
                    } catch (_) {}
                }
            });
        }

        var execve = Module.findExportByName(null, 'execve');
        if (execve) {
            Interceptor.attach(execve, {
                onEnter: function(args) {
                    try {
                        var path = safeCString(args[0]);
                        LOG("🚀 execve: " + path);
                    } catch (_) {}
                }
            });
        }

        var systemFn = Module.findExportByName(null, 'system');
        if (systemFn) {
            Interceptor.attach(systemFn, {
                onEnter: function(args) {
                    try { LOG("🚀 system: " + safeCString(args[0])); } catch (_) {}
                }
            });
        }

        LOG("[+] 进程/内存函数Hook已启用", { c: Color.Green });
    } catch (e) {
        LOG("[-] 进程/内存函数Hook失败: " + e.message, { c: Color.Red });
    }
}

// ============= 动态追踪与热点收敛（Stalker） =============
var __stalkerState = { running: false, modules: [], threads: [], samples: {}, timer: null };

function nativeStartStalker(options) {
    options = options || {};
    var modules = options.modules || []; // 模块白名单（名称包含或正则）
    var threads = options.threads || []; // 线程ID白名单（为空表示当前线程）
    var intervalMs = options.intervalMs || 2000; // 汇总上报周期

    function moduleAllowed(moduleName) {
        if (!modules || modules.length === 0) return true;
        try {
            for (var i=0;i<modules.length;i++) {
                var m = modules[i];
                if (m instanceof RegExp && m.test(moduleName)) return true;
                if (typeof m === 'string' && moduleName.indexOf(m) !== -1) return true;
            }
        } catch(_){}
        return false;
    }

    function followThread(tid) {
        try {
            Stalker.follow(tid, {
                events: { call: true },
                onCallSummary: function (summary) {
                    var addrs = Object.keys(summary);
                    for (var i=0;i<addrs.length;i++) {
                        try {
                            var addr = ptr(addrs[i]);
                            var sym = DebugSymbol.fromAddress(addr);
                            var mod = sym.moduleName || '';
                            if (!moduleAllowed(mod)) continue;
                            var key = (sym.name || addr.toString()) + '@' + mod;
                            __stalkerState.samples[key] = (__stalkerState.samples[key] || 0) + summary[addrs[i]];
                        } catch(_){}
                    }
                }
            });
        } catch (e) { LOG('Stalker 跟踪线程失败: '+e.message, { c: Color.Yellow }); }
    }

    if (__stalkerState.running) return false;
    __stalkerState.running = true;
    __stalkerState.modules = modules;
    __stalkerState.threads = threads;
    __stalkerState.samples = {};

    var tids = threads.length ? threads : [ Process.getCurrentThreadId() ];
    try { if (!threads.length) { Process.enumerateThreads().slice(0, 1).forEach(function(t){ tids[0] = t.id; }); } } catch(_){}
    tids.forEach(followThread);

    __stalkerState.timer = setInterval(function(){
        try {
            var top = [];
            Object.keys(__stalkerState.samples).forEach(function(k){ top.push({ key: k, count: __stalkerState.samples[k] }); });
            top.sort(function(a,b){ return b.count - a.count; });
            var report = top.slice(0, 30);
            emitEvent('stalker_summary', { items: report });
            __stalkerState.samples = {};
        } catch(_){}
    }, intervalMs);

    LOG('[+] Stalker 已启动', { c: Color.Green });
    return true;
}

function nativeStopStalker() {
    try {
        __stalkerState.running = false;
        try { Stalker.unfollow(); } catch(_){}
        if (__stalkerState.timer) { try { clearInterval(__stalkerState.timer); } catch(_){}; __stalkerState.timer = null; }
        emitEvent('stalker_summary', { items: [] });
        LOG('[+] Stalker 已停止', { c: Color.Green });
        return true;
    } catch (e) { LOG('停止 Stalker 失败: '+e.message, { c: Color.Red }); return false; }
}

// ============= 便捷总开关入口（ARM 套件） =============
function nativeEnableArmSuite(options) {
    options = options || {};
    var showStack = options.showStack ? 1 : 0;
    try {
        nativeHookDlopenFamily(showStack);
        nativeHookNetworkFunctions(showStack);
        nativeHookTLSFunctions(showStack);
        nativeHookConscryptTLS(showStack);
        nativeHookBIOFunctions(showStack);
        nativeHookFileIOFunctions(showStack);
        nativeHookProcessMemoryFunctions(showStack);
        nativeHookCryptoPrimitives(showStack);
        nativeHookJNIAndART(showStack);
        LOG('[+] ARM 套件已启用', { c: Color.Green });
    } catch (e) { LOG('ARM 套件启用失败: ' + e.message, { c: Color.Red }); }
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
function (address, options) {
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
// 新增高级Hook能力
global.nativeHookTLSFunctions = nativeHookTLSFunctions;
global.nativeHookConscryptTLS = nativeHookConscryptTLS;
global.nativeHookBIOFunctions = nativeHookBIOFunctions;
global.nativeHookFileIOFunctions = nativeHookFileIOFunctions;
global.nativeHookProcessMemoryFunctions = nativeHookProcessMemoryFunctions;
global.nativeHookCryptoPrimitives = nativeHookCryptoPrimitives;
global.nativeHookJNIAndART = nativeHookJNIAndART;
global.nativeEnableAntiDebugBypass = nativeEnableAntiDebugBypass;
global.nativeStartStalker = nativeStartStalker;
global.nativeStopStalker = nativeStopStalker;
global.nativeRegisterRehook = nativeRegisterRehook;
global.nativeEnableArmSuite = nativeEnableArmSuite;

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
