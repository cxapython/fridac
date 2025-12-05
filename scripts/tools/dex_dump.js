/**
 * DEX文件转储工具 - 从内存中提取并保存DEX文件
 * @description 通过Hook ART运行时的DefineClass函数来捕获和转储DEX文件到设备存储
 * @example dexDump()
 * @author fridac
 */
function dexDump() {
    try {
        LOG("🔍 开始DEX转储...", { c: Color.Cyan });
        
        // 内部辅助函数：获取进程名
        function get_self_process_name() {
            try {
                var openPtr = Module.getExportByName('libc.so', 'open');
                var open = new NativeFunction(openPtr, 'int', ['pointer', 'int']);
                
                var readPtr = Module.getExportByName("libc.so", "read");
                var read = new NativeFunction(readPtr, "int", ["int", "pointer", "int"]);
                
                var closePtr = Module.getExportByName('libc.so', 'close');
                var close = new NativeFunction(closePtr, 'int', ['int']);
                
                var path = Memory.allocUtf8String("/proc/self/cmdline");
                var fd = open(path, 0);
                if (fd != -1) {
                    var buffer = Memory.alloc(0x1000);
                    var result = read(fd, buffer, 0x1000);
                    close(fd);
                    result = ptr(buffer).readCString();
                    return result;
                }
                return "-1";
            } catch (e) {
                LOG("获取进程名失败: " + e.message, { c: Color.Red });
                return "-1";
            }
        }
        
        // 内部辅助函数：创建目录
        function mkdir(path) {
            try {
                var mkdirPtr = Module.getExportByName('libc.so', 'mkdir');
                var mkdir = new NativeFunction(mkdirPtr, 'int', ['pointer', 'int']);
                
                var opendirPtr = Module.getExportByName('libc.so', 'opendir');
                var opendir = new NativeFunction(opendirPtr, 'pointer', ['pointer']);
                
                var closedirPtr = Module.getExportByName('libc.so', 'closedir');
                var closedir = new NativeFunction(closedirPtr, 'int', ['pointer']);
                
                var cPath = Memory.allocUtf8String(path);
                var dir = opendir(cPath);
                if (dir != 0) {
                    closedir(dir);
                    return 0;
                }
                mkdir(cPath, 755);
                chmod(path);
            } catch (e) {
                LOG("创建目录失败: " + e.message, { c: Color.Red });
            }
        }
        
        // 内部辅助函数：设置权限
        function chmod(path) {
            try {
                var chmodPtr = Module.getExportByName('libc.so', 'chmod');
                var chmod = new NativeFunction(chmodPtr, 'int', ['pointer', 'int']);
                var cPath = Memory.allocUtf8String(path);
                chmod(cPath, 755);
            } catch (e) {
                LOG("设置权限失败: " + e.message, { c: Color.Red });
            }
        }
        
        // 查找libart.so模块
        var libart = Process.findModuleByName("libart.so");
        if (!libart) {
            LOG("❌ 未找到libart.so模块", { c: Color.Red });
            if (typeof notifyTaskError === 'function') {
                notifyTaskError(new Error("未找到libart.so模块"));
            }
            return false;
        }
        
        LOG("✅ 找到libart.so模块: " + libart.base, { c: Color.Green });
        
        // 查找DefineClass函数
        var addr_DefineClass = null;
        var symbols = libart.enumerateSymbols();
        
        for (var index = 0; index < symbols.length; index++) {
            var symbol = symbols[index];
            var symbol_name = symbol.name;
            
            // 查找DefineClass函数（Android 9的函数签名）
            if (symbol_name.indexOf("ClassLinker") >= 0 &&
                symbol_name.indexOf("DefineClass") >= 0 &&
                symbol_name.indexOf("Thread") >= 0 &&
                symbol_name.indexOf("DexFile") >= 0) {
                LOG("🎯 找到DefineClass: " + symbol_name + " @ " + symbol.address, { c: Color.Green });
                addr_DefineClass = symbol.address;
                break;
            }
        }
        
        if (!addr_DefineClass) {
            LOG("❌ 未找到DefineClass函数", { c: Color.Red });
            if (typeof notifyTaskError === 'function') {
                notifyTaskError(new Error("未找到DefineClass函数"));
            }
            return false;
        }
        
        // Hook DefineClass函数
        var dex_maps = {};
        var dex_count = 1;
        
        Interceptor.attach(addr_DefineClass, {
            onEnter: function(args) {
                try {
                    var dex_file = args[5];
                    // ptr(dex_file).add(Process.pointerSize) is "const uint8_t* const begin_;"
                    // ptr(dex_file).add(Process.pointerSize + Process.pointerSize) is "const size_t size_;"
                    var base = ptr(dex_file).add(Process.pointerSize).readPointer();
                    var size = ptr(dex_file).add(Process.pointerSize + Process.pointerSize).readUInt();
                    
                    if (dex_maps[base] == undefined) {
                        dex_maps[base] = size;
                        var magic = ptr(base).readCString();
                        
                        if (magic.indexOf("dex") == 0) {
                            var process_name = get_self_process_name();
                            if (process_name != "-1") {
                                var dex_dir_path = "/data/data/" + process_name + "/files/dex_dump_" + process_name;
                                mkdir(dex_dir_path);
                                var dex_path = dex_dir_path + "/class" + (dex_count == 1 ? "" : dex_count) + ".dex";
                                
                                LOG("📦 发现DEX文件: " + dex_path, { c: Color.Cyan });
                                
                                var fd = new File(dex_path, "wb");
                                if (fd && fd != null) {
                                    dex_count++;
                                    var dex_buffer = ptr(base).readByteArray(size);
                                    fd.write(dex_buffer);
                                    fd.flush();
                                    fd.close();
                                    
                                    LOG("✅ DEX转储成功: " + dex_path + " (大小: " + size + " 字节)", { c: Color.Green });
                                    
                                    if (typeof notifyTaskHit === 'function') {
                                        notifyTaskHit({
                                            operation: 'dex_dump',
                                            file_path: dex_path,
                                            size: size,
                                            count: dex_count - 1
                                        });
                                    }
                                } else {
                                    LOG("❌ 无法创建文件: " + dex_path, { c: Color.Red });
                                }
                            }
                        }
                    }
                } catch (e) {
                    LOG("DEX转储过程中出错: " + e.message, { c: Color.Red });
                }
            },
            onLeave: function(retval) {}
        });
        
        LOG("🎯 DefineClass Hook已设置，等待DEX文件加载...", { c: Color.Green });
        LOG("💾 DEX文件将保存到: /data/data/<package>/files/dex_dump_<package>/", { c: Color.Yellow });
        
        return true;
        
    } catch (e) {
        LOG("❌ DEX转储初始化失败: " + e.message, { c: Color.Red });
        if (typeof notifyTaskError === 'function') {
            notifyTaskError(e);
        }
        return false;
    }
}