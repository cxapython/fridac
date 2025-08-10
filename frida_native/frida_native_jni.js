// Frida Native JNI/ART 相关 Hook

function nativeHookJNIFunctions(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    try {
        var jniEnv = Java.vm.tryGetEnv();
        if (jniEnv) {
            var registerNatives = jniEnv.registerNatives;
            jniEnv.registerNatives = function(clazz, methods, nMethods) {
                LOG("[+] RegisterNatives 被调用, 方法数量: " + nMethods);
                if (needStack) {
                    LOG(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n'));
                }
                return registerNatives.call(this, clazz, methods, nMethods);
            };
        }

        var newStringUTF = Module.findExportByName("libart.so", "_ZN3art3JNI12NewStringUTFEP7_JNIEnvPKc")
                         || Module.findExportByName("libdvm.so", "NewStringUTF");
        if (newStringUTF) {
            Interceptor.attach(newStringUTF, {
                onEnter: function(args) {
                    try {
                        var str = Memory.readCString(args[1]);
                        LOG("[+] NewStringUTF: " + str);
                        if (needStack) {
                            LOG(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n'));
                        }
                    } catch(_){}
                }
            });
        }

        LOG("[+] JNI函数Hook已启用");
    } catch (e) {
        LOG("[-] JNI函数Hook失败: " + e.message, { c: Color.Red });
    }
}

function nativeHookJNIAndART(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    try {
        var reg = Module.findExportByName(null, 'RegisterNatives');
        if (reg) {
            Interceptor.attach(reg, {
                onEnter: function(args) {
                    try {
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
                                LOG('#' + i + ' ' + nm + ' ' + sg + ' -> ' + sym);
                            } catch(_){}
                        }
                        if (needStack) LOG(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n'));
                    } catch(_){}
                }
            });
        }

        LOG('[+] JNI/ART 观测已启用', { c: Color.Green });
    } catch (e) {
        LOG('[-] JNI/ART 观测失败: ' + e.message, { c: Color.Red });
    }
}

