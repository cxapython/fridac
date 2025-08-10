// Frida Native 基础核心模块（配置、工具、日志、事件）
// 说明：该文件必须最先加载，为后续模块提供公共能力

// ============= 配置 =============
var NativeConfig = {
    enableStackTrace: true,
    maxStackDepth: 20,
    logLevel: 'info',
    hexDumpSize: 64,
    maxStringLength: 1024
};

// ============= 字节与字符串工具 =============
function bytesToString(bytes, encoding) {
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
    var bytes = [];
    try {
        str = (str === null || typeof str === 'undefined') ? '' : String(str);
        for (var i = 0; i < str.length; i++) {
            bytes.push(str.charCodeAt(i));
        }
    } catch (e) {}
    try { LOG('stringToBytes => len=' + bytes.length + ', bytes=' + JSON.stringify(bytes)); } catch (_) {}
    return bytes;
}

function hexDump(ptrValue, size) {
    size = size || NativeConfig.hexDumpSize;
    var out;
    try {
        out = hexdump(ptrValue, { length: size, ansi: true });
    } catch (e) {
        out = '[无法dump内存: ' + e.message + ']';
    }
    try { LOG('hexDump =>\n' + String(out)); } catch (_) {}
    return out;
}

function safeReadMemory(address, size, type) {
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

// ============= 颜色与日志 =============
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
    // 统一通过 send() 输出，避免ANSI颜色残留噪音
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

// 统一结构化事件发射器
function emitEvent(eventType, fields) {
    try {
        var evt = fields || {};
        evt.type = eventType || evt.type || 'event';
        evt.ts = Date.now();
        try { evt.pid = Process.id; } catch(_){ }
        try { evt.tid = Process.getCurrentThreadId(); } catch(_){ }
        send(evt);
    } catch (e) {
        try { send({ type: 'event', error: e.message }); } catch(_){ }
    }
}

// 安全读取C字符串
function safeCString(p) {
    try { return (!p || (p.isNull && p.isNull())) ? 'NULL' : Memory.readCString(p); } catch (_) { return '[读取失败]'; }
}

// ============= 限流器与寄存器采集 =============
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

function nativeCaptureRegisters(context) {
    var arch = Process.arch || 'arm64';
    var regs = {};
    try {
        if (arch.indexOf('arm64') !== -1 || arch.indexOf('aarch64') !== -1) {
            ['x0','x1','x2','x3','x4','x5','x6','x7','sp','lr','pc'].forEach(function(r){
                try { regs[r] = context[r]; } catch (_) {}
            });
        } else {
            ['r0','r1','r2','r3','sp','lr','pc'].forEach(function(r){
                try { regs[r] = context[r]; } catch (_) {}
            });
        }
    } catch (e) {
        regs.error = e.message;
    }
    return regs;
}

// ============= 栈打印 =============
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

// ============= 模块/符号查找（工具） =============
function nativeFindModules(pattern) {
    var modules = Process.enumerateModules();
    var foundModules = [];
    modules.forEach(function(module) {
        if (!pattern || module.name.match(pattern) || module.path.match(pattern)) {
            foundModules.push({ name: module.name, base: module.base, size: module.size, path: module.path });
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
                exports.push({ name: exp.name, address: exp.address, type: exp.type });
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
                imports.push({ name: imp.name, address: imp.address, module: imp.module });
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
                symbols.push({ name: symbol.name, address: symbol.address, type: symbol.type });
            }
        });
    } catch (e) {
        LOG("查找符号失败: " + e.message, { c: Color.Red });
    }
    return symbols;
}

