/**
 * 自动生成的方法 Hook (参考 traceMethod)
 * @description Hook 目标: com.tencent.mm.storage.k8.Ta
 * @example hook_com_tencent_mm_storage_k8_Ta()
 */
function hook_com_tencent_mm_storage_k8_Ta() {
    Java.perform(function() {
        try {
            var fullyQualifiedMethodName = 'com.tencent.mm.storage.k8.Ta';
            var lastDotIndex = fullyQualifiedMethodName.lastIndexOf('.');
            if (lastDotIndex === -1) {
                LOG('❌ 方法名格式错误，应为: 包.类.方法', { c: Color.Red });
                return;
            }

            var className = fullyQualifiedMethodName.substring(0, lastDotIndex);
            var methodName = fullyQualifiedMethodName.substring(lastDotIndex + 1);

            var targetClass = null;
            try {
                targetClass = Java.use(className);
            } catch (error) {
                if ((error.message || '').indexOf('ClassNotFoundException') !== -1) {
                    LOG('❌ 类未在默认ClassLoader中找到，搜索其他ClassLoader...', { c: Color.Yellow });
                    var loader = (typeof findTragetClassLoader === 'function') ? findTragetClassLoader(className) : null;
                    if (loader) {
                        targetClass = Java.ClassFactory.get(loader).use(className);
                        LOG('🎯 成功使用自定义ClassLoader加载类', { c: Color.Green });
                    } else {
                        LOG('❌ 在所有ClassLoader中都未找到类: ' + className, { c: Color.Red });
                        return;
                    }
                } else {
                    throw error;
                }
            }

            if (!targetClass || !targetClass[methodName]) {
                LOG('❌ 未找到方法: ' + fullyQualifiedMethodName, { c: Color.Red });
                return;
            }

            // 本地参数类型获取（与 frida_common_new.js 保持一致风格）
            function __getArgType(value) {
                try {
                    if (value === null) return 'null';
                    if (typeof value === 'undefined') return 'undefined';
                    if (value && typeof value.getClass === 'function') {
                        try { return String(value.getClass().getName()); } catch(_e) {}
                    }
                    if (value && value.$className) {
                        try { return String(value.$className); } catch(_e) {}
                    }
                    if (value && value.class && typeof value.class.getName === 'function') {
                        try { return String(value.class.getName()); } catch(_e) {}
                    }
                    var t = typeof value;
                    if (t === 'object') {
                        try { return Object.prototype.toString.call(value); } catch(_e) {}
                    }
                    return t;
                } catch (_ignored) {
                    return 'unknown';
                }
            }

            var wrapper = targetClass[methodName];
            var overloads = wrapper.overloads || [];

            if (overloads.length > 0) {
                LOG('🔀 发现 ' + overloads.length + ' 个重载，逐个设置Hook...', { c: Color.Blue });
                for (var i = 0; i < overloads.length; i++) {
                    try {
                        (function(over){
                            over.implementation = function() {
                                LOG("\n*** 进入 " + fullyQualifiedMethodName, { c: Color.Green });
                                try { printStack(); } catch(_s) {}
                                if (arguments.length > 0) {
                                    LOG('📥 参数:', { c: Color.Blue });
                                    for (var j = 0; j < arguments.length; j++) {
                                        var __t = __getArgType(arguments[j]);
                                        LOG('  arg[' + j + '] (' + __t + '): ' + arguments[j], { c: Color.White });
                                    }
                                }
                                var retval = over.apply(this, arguments);
                                LOG('📤 返回值: ' + retval, { c: Color.Blue });
                                LOG("🏁 退出 " + fullyQualifiedMethodName + "\n", { c: Color.Green });
                                return retval;
                            };
                        })(overloads[i]);
                    } catch (_e) {}
                }
            } else {
                // 兜底：无 overload 信息时直接设置
                wrapper.implementation = function() {
                    LOG("\n*** 进入 " + fullyQualifiedMethodName, { c: Color.Green });
                    try { printStack(); } catch(_s) {}
                    if (arguments.length > 0) {
                        LOG('📥 参数:', { c: Color.Blue });
                        for (var k = 0; k < arguments.length; k++) {
                            var __t2 = __getArgType(arguments[k]);
                            LOG('  arg[' + k + '] (' + __t2 + '): ' + arguments[k], { c: Color.White });
                        }
                    }
                    var retval2 = this[methodName].apply(this, arguments);
                    LOG('📤 返回值: ' + retval2, { c: Color.Blue });
                    LOG("🏁 退出 " + fullyQualifiedMethodName + "\n", { c: Color.Green });
                    return retval2;
                };
            }

            LOG('✅ 方法Hook设置成功: ' + fullyQualifiedMethodName, { c: Color.Green });
        } catch (e) {
            LOG('❌ 方法Hook设置失败: ' + e.message, { c: Color.Red });
        }
    });
}
