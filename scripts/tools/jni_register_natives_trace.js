/**
 * JNI RegisterNatives 追踪
 * @description 追踪 ART/Runtime 中的 RegisterNatives/jniRegisterNativeMethods 调用，恢复 Java 方法 ↔ Native 实现的绑定关系
 * @example traceRegisterNatives()
 */
function traceRegisterNatives() {
    try {
        function hookOne(moduleName, symbol) {
            var addr = Module.findExportByName(moduleName, symbol);
            if (!addr) return false;
            Interceptor.attach(addr, {
                onEnter: function(args) {
                    this.env = args[0];
                    this.clazz = args[1];
                    this.methods = args[2];
                    this.count = args[3].toInt32 ? args[3].toInt32() : parseInt(args[3]);
                    try {
                        var clsName = '';
                        try {
                            var JNIEnv = Java.vm.getEnv();
                            clsName = JNIEnv.getClassName(this.clazz) || '';
                        } catch(_){}
                        LOG('🔗 RegisterNatives(class=' + clsName + ', count=' + this.count + ')', { c: Color.Cyan });
                        for (var i = 0; i < this.count; i++) {
                            try {
                                var off = i * (Process.pointerSize * 3);
                                var namePtr = Memory.readPointer(this.methods.add(off));
                                var sigPtr = Memory.readPointer(this.methods.add(off + Process.pointerSize));
                                var fnPtr  = Memory.readPointer(this.methods.add(off + Process.pointerSize * 2));
                                var name = Memory.readCString(namePtr);
                                var sig  = Memory.readCString(sigPtr);
                                var sy = DebugSymbol.fromAddress(fnPtr);
                                LOG('  • ' + name + sig + ' -> ' + fnPtr + ' (' + (sy && sy.name ? sy.name : 'unknown') + ')', { c: Color.White });
                            } catch(_){}
                        }
                    } catch(_){}
                }
            });
            LOG('✅ Hook RegisterNatives: ' + (moduleName || 'any') + '!' + symbol, { c: Color.Green });
            return true;
        }

        var hooked = false;
        // 通用导出名（部分 Android 版本）
        hooked = hookOne(null, 'RegisterNatives') || hooked;
        hooked = hookOne('libart.so', 'RegisterNatives') || hooked;
        // 旧路径
        hooked = hookOne('libandroid_runtime.so', 'jniRegisterNativeMethods') || hooked;

        if (!hooked) LOG('⚠️ 未找到 RegisterNatives 符号，可能需使用 nativeHookJNIFunctions()', { c: Color.Yellow });
        return hooked;
    } catch (e) {
        LOG('❌ traceRegisterNatives 失败: ' + e.message, { c: Color.Red });
        if (typeof TASK_ID !== 'undefined') { try { notifyTaskError(e); } catch(_){} }
        return false;
    }
}


