/**
 * fridacli Java Hook工具集 - 新版本 (无旧任务管理系统)
 * 提供Java应用Hook和调试的核心功能
 * 
 * 特点：
 * - 移除了所有旧的HookJobManager依赖
 * - 简化的Hook实现
 * - 保持所有核心功能
 */

// ===== 基础工具函数 =====

var Color = {
    Red: "\x1b[31m",
    Green: "\x1b[32m", 
    Yellow: "\x1b[33m",
    Blue: "\x1b[34m",
    Cyan: "\x1b[36m",
    White: "\x1b[37m",
    Gray: "\x1b[90m",
    Reset: "\x1b[0m"
};

function LOG(message, options) {
    try {
        // 统一通过 send() 向 Python 端输出，避免 ANSI 颜色转义产生的“m/undefined”噪音
        var text = (message === null || typeof message === 'undefined') ? '' : String(message);
        send(text);
    } catch (e) {
        // 兜底：即使 send 出错也不抛异常，避免打断执行
        try { send(String(message)); } catch (_) {}
    }
}

function printStack(showComplete, maxLines) {
    try {
        var exception = Java.use("java.lang.Exception").$new();
        var trace = exception.getStackTrace();
        LOG("📚 调用堆栈:", { c: Color.Cyan });
        
        var limit = showComplete ? trace.length : (typeof maxLines === 'number' && maxLines > 0 ? maxLines : 20);
        var printed = 0;
        for (var i = 0; i < trace.length && printed < limit; i++) {
            var element = trace[i].toString();
            if (element.indexOf("java.lang.Exception") === -1 &&
                element.indexOf("android.util.Log") === -1 &&
                element.indexOf("dalvik.system") === -1) {
                LOG("📍 " + element, { c: Color.Gray });
                printed++;
            }
        }
    } catch (e) {
        LOG("⚠️ 无法获取堆栈信息: " + e.message, { c: Color.Yellow });
    }
}

// 兼容别名：printJavaCallStack -> printStack
function printJavaCallStack(showComplete, maxLines) {
    try { printStack(showComplete, maxLines); } catch (_) { }
}

// 参数类型获取
function __getArgType(value) {
    try {
        if (value === null) return 'null';
        if (typeof value === 'undefined') return 'undefined';
        if (typeof value.getClass === 'function') {
            try { return String(value.getClass().getName()); } catch(_) {}
        }
        if (value && value.$className) {
            try { return String(value.$className); } catch(_) {}
        }
        if (value && value.class && typeof value.class.getName === 'function') {
            try { return String(value.class.getName()); } catch(_) {}
        }
        var t = typeof value;
        if (t === 'object') {
            try { return Object.prototype.toString.call(value); } catch(_) {}
        }
        return t;
    } catch (_) {
        return 'unknown';
    }
}

// ClassLoader 搜索功能
function findTragetClassLoader(className) {
    var foundLoader = null;
    try {
        Java.enumerateClassLoadersSync().forEach(function(loader) {
            try {
                var factory = Java.ClassFactory.get(loader);
                factory.use(className);
                foundLoader = loader;
                return;
            } catch (e) {
                // 忽略错误，继续查找
            }
        });
    } catch (e) {
        LOG("⚠️ 搜索ClassLoader时出错: " + e.message, { c: Color.Yellow });
    }
    return foundLoader;
}

// ===== 核心Hook函数 =====

// 智能追踪函数
function smartTrace(target) {
    LOG("🎯 智能追踪: " + target, { c: Color.Cyan });
    
    // 判断是类还是方法
    if (target.indexOf('.') !== -1 && 
        target.indexOf('(') === -1 && 
        target.match(/\.[a-z]/)) {
        // 看起来像方法 (com.example.Class.method)
        return traceMethod(target);
    } else {
        // 看起来像类 (com.example.Class)
        return traceClass(target);
    }
}

// 跟踪类的所有方法
function traceClass(className) {
    LOG("🏛️ 跟踪类: " + className, { c: Color.Cyan });
    
    Java.perform(function() {
        try {
            var targetClass = null;
            
            // 尝试加载类
            try {
                targetClass = Java.use(className);
            } catch (error) {
                if (error.message.includes("ClassNotFoundException")) {
                    LOG("❌ 类未在默认ClassLoader中找到，搜索其他ClassLoader...", { c: Color.Yellow });
                    var foundLoader = findTragetClassLoader(className);
                    if (foundLoader) {
                        targetClass = Java.ClassFactory.get(foundLoader).use(className);
                        LOG("🎯 成功使用自定义ClassLoader加载类", { c: Color.Green });
                    } else {
                        LOG("❌ 在所有ClassLoader中都未找到类: " + className, { c: Color.Red });
                        return;
                    }
                } else {
                    throw error;
                }
            }
            
            // Hook类的所有方法
            var methods = targetClass.class.getDeclaredMethods();
            var hookedCount = 0;
            
            methods.forEach(function(method) {
                try {
                    var methodName = method.getName();
                    
                    // 跳过特殊方法
                    if (methodName.includes("$") || methodName.includes("<")) {
                        return;
                    }
                    
                    var originalImpl = targetClass[methodName];
                    if (originalImpl) {
                        targetClass[methodName].implementation = function() {
                            var fullMethodName = className + "." + methodName;
                            LOG("\n*** 进入 " + fullMethodName, { c: Color.Green });
                            
                            // 打印参数
                            if (arguments.length > 0) {
                                LOG("📥 参数:", { c: Color.Blue });
                                for (var i = 0; i < arguments.length; i++) {
                                    LOG("  arg[" + i + "]: " + arguments[i], { c: Color.White });
                                }
                            }
                            
                            var retval = originalImpl.apply(this, arguments);
                            
                            LOG("📤 返回值: " + retval, { c: Color.Blue });
                            LOG("🏁 退出 " + fullMethodName + "\n", { c: Color.Green });
                            
                            return retval;
                        };
                        hookedCount++;
                    }
                } catch (e) {
                    // 忽略无法Hook的方法
                }
            });
            
            LOG("✅ 类Hook设置成功: " + hookedCount + " 个方法", { c: Color.Green });
            
        } catch (error) {
            LOG("❌ 类Hook设置失败: " + error.message, { c: Color.Red });
        }
    });
}

// 跟踪特定方法
function traceMethod(fullyQualifiedMethodName) {
    LOG("🎯 跟踪方法: " + fullyQualifiedMethodName, { c: Color.Cyan });

    // 解析类名和方法名
    var lastDotIndex = fullyQualifiedMethodName.lastIndexOf('.');
    if (lastDotIndex === -1) {
        LOG("❌ 方法名格式错误，应为: com.example.Class.method", { c: Color.Red });
        return;
    }

    var className = fullyQualifiedMethodName.substring(0, lastDotIndex);
    var methodName = fullyQualifiedMethodName.substring(lastDotIndex + 1);

    Java.perform(function() {
        try {
            var targetClass = null;

            // 尝试加载类，支持 ClassLoader 回退
            try {
                targetClass = Java.use(className);
            } catch (error) {
                if ((error.message || '').indexOf('ClassNotFoundException') !== -1) {
                    LOG("❌ 类未在默认ClassLoader中找到，搜索其他ClassLoader...", { c: Color.Yellow });
                    var foundLoader = findTragetClassLoader(className);
                    if (foundLoader) {
                        targetClass = Java.ClassFactory.get(foundLoader).use(className);
                        LOG("🎯 成功使用自定义ClassLoader加载类", { c: Color.Green });
                    } else {
                        LOG("❌ 在所有ClassLoader中都未找到类: " + className, { c: Color.Red });
                        return;
                    }
                } else {
                    throw error;
                }
            }

            if (!targetClass || !targetClass[methodName]) {
                LOG("❌ 未找到方法: " + fullyQualifiedMethodName, { c: Color.Red });
                return;
            }

            var methodWrapper = targetClass[methodName];
            var overloads = methodWrapper.overloads || [];

            // 当存在多个重载时，逐个设置 implementation；否则直接设置
            if (overloads.length > 0) {
                LOG("🔀 发现 " + overloads.length + " 个重载，逐个设置Hook...", { c: Color.Blue });
                for (var i = 0; i < overloads.length; i++) {
                    try {
                        (function(over){
                            over.implementation = function() {
                                LOG("\n*** 进入 " + fullyQualifiedMethodName, { c: Color.Green });

                            if (arguments.length > 0) {
                                LOG("📥 参数:", { c: Color.Blue });
                                for (var j = 0; j < arguments.length; j++) {
                                    var __t = __getArgType(arguments[j]);
                                    LOG("  arg[" + j + "] (" + __t + "): " + arguments[j], { c: Color.White });
                                }
                            }

                                // 直接调用该重载的原始实现，避免递归
                                var retval = over.apply(this, arguments);

                                LOG("📤 返回值: " + retval, { c: Color.Blue });
                                LOG("🏁 退出 " + fullyQualifiedMethodName + "\n", { c: Color.Green });
                                return retval;
                            };
                        })(overloads[i]);
                    } catch(_) {}
                }
            } else {
                // 无 overload 信息时的兜底
                methodWrapper.implementation = function() {
                    LOG("\n*** 进入 " + fullyQualifiedMethodName, { c: Color.Green });

                    if (arguments.length > 0) {
                        LOG("📥 参数:", { c: Color.Blue });
                        for (var k = 0; k < arguments.length; k++) {
                            var __t2 = __getArgType(arguments[k]);
                            LOG("  arg[" + k + "] (" + __t2 + "): " + arguments[k], { c: Color.White });
                        }
                    }

                    var retval2 = this[methodName].apply(this, arguments);
                    LOG("📤 返回值: " + retval2, { c: Color.Blue });
                    LOG("🏁 退出 " + fullyQualifiedMethodName + "\n", { c: Color.Green });
                    return retval2;
                };
            }

            LOG("✅ 方法Hook设置成功: " + fullyQualifiedMethodName, { c: Color.Green });

        } catch (error) {
            LOG("❌ 方法Hook设置失败: " + error.message, { c: Color.Red });
        }
    });
}

// 高级方法追踪 (带堆栈和字段信息)
function advancedMethodTracing(fullyQualifiedMethodName, enableStackTrace, enableFieldInfo) {
    enableStackTrace = enableStackTrace || false;
    enableFieldInfo = enableFieldInfo || false;
    
    LOG("🔥 高级追踪: " + fullyQualifiedMethodName, { c: Color.Cyan });
    
    var lastDotIndex = fullyQualifiedMethodName.lastIndexOf('.');
    if (lastDotIndex === -1) {
        LOG("❌ 方法名格式错误", { c: Color.Red });
        return;
    }
    
    var className = fullyQualifiedMethodName.substring(0, lastDotIndex);
    var methodName = fullyQualifiedMethodName.substring(lastDotIndex + 1);
    
    Java.perform(function() {
        try {
            var targetClass = Java.use(className);
            
            targetClass[methodName].implementation = function() {
                LOG("\n🔥 === 高级追踪开始 ===", { c: Color.Cyan });
                LOG("🎯 方法: " + fullyQualifiedMethodName, { c: Color.Yellow });
                
                // 显示堆栈
                if (enableStackTrace) {
                    printStack();
                }
                
                // 显示字段信息
                if (enableFieldInfo) {
                    try {
                        var fields = this.class.getDeclaredFields();
                        LOG("📋 对象字段:", { c: Color.Blue });
                        for (var i = 0; i < Math.min(fields.length, 5); i++) {
                            var field = fields[i];
                            LOG("  " + field.getName() + ": " + field.getType(), { c: Color.Gray });
                        }
                    } catch (e) {
                        LOG("⚠️ 无法获取字段信息", { c: Color.Yellow });
                    }
                }
                
                // 参数信息
                if (arguments.length > 0) {
                    LOG("📥 参数详情:", { c: Color.Blue });
                    for (var i = 0; i < arguments.length; i++) {
                        var arg = arguments[i];
                        var argType = arg ? arg.getClass().getName() : "null";
                        LOG("  arg[" + i + "] (" + argType + "): " + arg, { c: Color.White });
                    }
                }
                
                var retval = this[methodName].apply(this, arguments);
                
                LOG("📤 返回值: " + retval, { c: Color.Blue });
                LOG("🔥 === 高级追踪结束 ===\n", { c: Color.Cyan });
                
                return retval;
            };
            
            LOG("✅ 高级追踪已启用", { c: Color.Green });
            
        } catch (error) {
            LOG("❌ 高级追踪失败: " + error.message, { c: Color.Red });
        }
    });
}

// 查找类
function findClasses(pattern, showDetails) {
    showDetails = showDetails || false;
    var foundClasses = [];
    
    LOG("🔍 搜索类: " + pattern, { c: Color.Cyan });
    
    Java.perform(function() {
        // 使用同步API以避免在部分Frida版本中需要callbacks导致的"onMatch of undefined"错误
        var loadedClasses = [];
        try {
            loadedClasses = Java.enumerateLoadedClassesSync();
        } catch (_) {
            loadedClasses = [];
        }
        loadedClasses.forEach(function(className) {
            if (className.toLowerCase().indexOf(pattern.toLowerCase()) !== -1) {
                foundClasses.push(className);
                
                if (showDetails) {
                    try {
                        var clazz = Java.use(className);
                        var methods = clazz.class.getDeclaredMethods();
                        LOG("📦 " + className + " (" + methods.length + " 方法)", { c: Color.Green });
                    } catch (e) {
                        LOG("📦 " + className, { c: Color.Yellow });
                    }
                } else {
                    LOG("📦 " + className, { c: Color.Green });
                }
            }
        });
    });
    
    LOG("✅ 找到 " + foundClasses.length + " 个匹配的类", { c: Color.Blue });
    return foundClasses;
}

// 枚举包下的所有类
function enumAllClasses(packageName) {
    var packageClasses = [];
    
    LOG("📚 枚举包: " + packageName, { c: Color.Cyan });
    
    Java.perform(function() {
        // 使用同步API避免回调对象缺失导致的异常
        var loadedClasses = [];
        try {
            loadedClasses = Java.enumerateLoadedClassesSync();
        } catch (_) {
            loadedClasses = [];
        }
        loadedClasses.forEach(function(className) {
            if (className.indexOf(packageName) === 0) {
                packageClasses.push(className);
                LOG("📦 " + className, { c: Color.Green });
            }
        });
    });
    
    LOG("✅ 包 " + packageName + " 下共有 " + packageClasses.length + " 个类", { c: Color.Blue });
    return packageClasses;
}

// Hook Java方法 (带追踪)
function hookJavaMethodWithTracing(fullyQualifiedMethodName, enableStackTrace, customReturnValue) {
    enableStackTrace = enableStackTrace || false;
    
    var methodDelimiterIndex = fullyQualifiedMethodName.lastIndexOf(".");
    if (methodDelimiterIndex === -1) {
        LOG("❌ 无效的方法名格式: " + fullyQualifiedMethodName + " (应为: 包名.类名.方法名)", { c: Color.Red });
        return false;
    }

    var targetClassName = fullyQualifiedMethodName.slice(0, methodDelimiterIndex);
    var targetMethodName = fullyQualifiedMethodName.slice(methodDelimiterIndex + 1);
    
    Java.perform(function() {
        try {
            var javaClassHook = null;
            try {
                javaClassHook = Java.use(targetClassName);
            } catch (classLoadError) {
                if ((classLoadError.message || '').indexOf('ClassNotFoundException') !== -1) {
                    LOG("❌ 类未在默认ClassLoader中找到，搜索其他ClassLoader...", { c: Color.Yellow });
                    var customClassLoader = findTragetClassLoader(targetClassName);
                    if (customClassLoader) {
                        javaClassHook = Java.ClassFactory.get(customClassLoader).use(targetClassName);
                        LOG("🎯 成功使用自定义ClassLoader加载类", { c: Color.Green });
                    } else {
                        LOG("❌ 在所有ClassLoader中都未找到类: " + targetClassName, { c: Color.Red });
                        return;
                    }
                } else {
                    LOG("❌ 加载类时发生其他错误: " + classLoadError.message, { c: Color.Red });
                    return;
                }
            }

            if (!javaClassHook || !javaClassHook[targetMethodName]) {
                LOG("❌ 未找到方法: " + fullyQualifiedMethodName, { c: Color.Red });
                return;
            }

            var wrapper = javaClassHook[targetMethodName];
            var overloads = wrapper.overloads || [];

            if (overloads.length > 0) {
                LOG("🔀 发现 " + overloads.length + " 个重载，逐个设置Hook...", { c: Color.Blue });
                for (var i = 0; i < overloads.length; i++) {
                    try {
                        (function(over){
                            over.implementation = function () {
                                LOG("\n*** 进入 " + fullyQualifiedMethodName, { c: Color.Green });

                                if (enableStackTrace) {
                                    printStack();
                                }

                            if (arguments.length > 0) {
                                LOG("📥 参数:", { c: Color.Blue });
                                for (var j = 0; j < arguments.length; j++) {
                                    var __t = __getArgType(arguments[j]);
                                    LOG("  arg[" + j + "] (" + __t + "): " + arguments[j], { c: Color.White });
                                }
                            }

                                var result;
                                if (customReturnValue !== undefined) {
                                    LOG("🔄 使用自定义返回值: " + customReturnValue, { c: Color.Yellow });
                                    result = customReturnValue;
                                } else {
                                    // 调用该重载的原始实现
                                    result = over.apply(this, arguments);
                                }

                                LOG("📤 返回值: " + result, { c: Color.Blue });
                                LOG("🏁 退出 " + fullyQualifiedMethodName + "\n", { c: Color.Green });

                                return result;
                            };
                        })(overloads[i]);
                    } catch(_) {}
                }
            } else {
                // 兜底：无 overloads 信息时直接设置
                wrapper.implementation = function () {
                    LOG("\n*** 进入 " + fullyQualifiedMethodName, { c: Color.Green });

                    if (enableStackTrace) {
                        printStack();
                    }

                    if (arguments.length > 0) {
                        LOG("📥 参数:", { c: Color.Blue });
                        for (var k = 0; k < arguments.length; k++) {
                            LOG("  arg[" + k + "]: " + arguments[k], { c: Color.White });
                        }
                    }

                    var result2;
                    if (customReturnValue !== undefined) {
                        LOG("🔄 使用自定义返回值: " + customReturnValue, { c: Color.Yellow });
                        result2 = customReturnValue;
                    } else {
                        result2 = this[targetMethodName].apply(this, arguments);
                    }

                    LOG("📤 返回值: " + result2, { c: Color.Blue });
                    LOG("🏁 退出 " + fullyQualifiedMethodName + "\n", { c: Color.Green });

                    return result2;
                };
            }

            LOG("✅ 方法Hook设置成功: " + fullyQualifiedMethodName, { c: Color.Green });

        } catch (hookError) {
            LOG("❌ Hook设置失败: " + hookError.message, { c: Color.Red });
        }
    });
}

// Hook类的所有方法
function hookAllMethodsInJavaClass(fullyQualifiedClassName) {
    Java.perform(function() {
        try {
            var targetClass = null;
            
            try {
                targetClass = Java.use(fullyQualifiedClassName);
            } catch (error) {
                if (error.message.includes("ClassNotFoundException")) {
                    LOG("❌ 类未在默认ClassLoader中找到，搜索其他ClassLoader...", { c: Color.Yellow });
                    var foundLoader = findTragetClassLoader(fullyQualifiedClassName);
                    if (foundLoader) {
                        targetClass = Java.ClassFactory.get(foundLoader).use(fullyQualifiedClassName);
                        LOG("🎯 成功使用自定义ClassLoader加载类", { c: Color.Green });
                    } else {
                        LOG("❌ 在所有ClassLoader中都未找到类: " + fullyQualifiedClassName, { c: Color.Red });
                        return;
                    }
                } else {
                    throw error;
                }
            }

            var methods = targetClass.class.getDeclaredMethods();
            var hookedCount = 0;

            methods.forEach(function(method) {
                try {
                    var methodName = method.getName();
                    
                    if (methodName.includes("$") || methodName.includes("<")) {
                        return;
                    }
                    
                    var originalImpl = targetClass[methodName];
                    if (originalImpl) {
                        targetClass[methodName].implementation = function() {
                            var fullMethodName = fullyQualifiedClassName + "." + methodName;
                            LOG("\n*** 进入 " + fullMethodName, { c: Color.Green });
                            
                            if (arguments.length > 0) {
                                LOG("📥 参数:", { c: Color.Blue });
                                for (var i = 0; i < arguments.length; i++) {
                                    LOG("  arg[" + i + "]: " + arguments[i], { c: Color.White });
                                }
                            }
                            
                            var retval = originalImpl.apply(this, arguments);
                            
                            LOG("📤 返回值: " + retval, { c: Color.Blue });
                            LOG("🏁 退出 " + fullMethodName + "\n", { c: Color.Green });
                            
                            return retval;
                        };
                        hookedCount++;
                    }
                } catch (e) {
                    // 忽略无法Hook的方法
                }
            });

            LOG("✅ 类Hook设置成功: " + hookedCount + " 个方法", { c: Color.Green });

        } catch (error) {
            LOG("❌ 类Hook设置失败: " + error.message, { c: Color.Red });
        }
    });
}

// HashMap特定值查找Hook
function hookHashMapToFindValue(searchKey, enableStackTrace) {
    enableStackTrace = enableStackTrace || false;
    
    Java.perform(function() {
        try {
            var HashMap = Java.use("java.util.HashMap");
            
            HashMap.put.implementation = function(key, value) {
                var keyStr = key ? key.toString() : "null";
                var valueStr = value ? value.toString() : "null";
                
                if (keyStr.indexOf(searchKey) !== -1) {
                    LOG("🔍 HashMap匹配: " + keyStr + " = " + valueStr, { c: Color.Cyan });
                    
                    if (enableStackTrace) {
                        printStack();
                    }
                }
                
                return this.put(key, value);
            };
            
            LOG("✅ HashMap查找Hook已启用 (搜索: " + searchKey + ")", { c: Color.Green });
            
        } catch (error) {
            LOG("❌ HashMap Hook失败: " + error.message, { c: Color.Red });
        }
    });
}

// ===== 网络抓取与请求转换（fetch） =====
// 关键Hook点说明：
// - OkHttp: 优先Hook okhttp3.RealCall.execute() 与 enqueue(Callback)，在请求发送前提取 Request 信息
// - HttpURLConnection: 辅助Hook connect()/getInputStream()/getOutputStream() 以覆盖常见标准库网络请求
// - 输出：生成等价的 Python requests 代码，发送结构化事件给 Python 端写入日志，同时控制台打印与调用栈
// - 过滤：fetch(filterStr) 传入字符串，仅当 URL 或 Headers 含该字符串时才处理与输出
var __fetch_installed = false;
var __fetch_filter = null;

function __getStackArray(maxLines) {
    try {
        var exception = Java.use("java.lang.Exception").$new();
        var trace = exception.getStackTrace();
        var limit = typeof maxLines === 'number' && maxLines > 0 ? maxLines : 20;
        var frames = [];
        var printed = 0;
        for (var i = 0; i < trace.length && printed < limit; i++) {
            var element = trace[i].toString();
            if (element.indexOf("java.lang.Exception") === -1 &&
                element.indexOf("android.util.Log") === -1 &&
                element.indexOf("dalvik.system") === -1) {
                frames.push(element + "");
                printed++;
            }
        }
        return frames;
    } catch (_) {
        return [];
    }
}

function __useClass(className) {
    try {
        return Java.use(className);
    } catch (e) {
        if ((e.message || '').indexOf('ClassNotFoundException') !== -1) {
            try {
                var loader = findTragetClassLoader(className);
                if (loader) {
                    return Java.ClassFactory.get(loader).use(className);
                }
            } catch (_) {}
        }
        return null;
    }
}

function __parseCharsetFromHeaders(headersObj, contentTypeStr) {
    try {
        var ct = contentTypeStr || headersObj['Content-Type'] || headersObj['content-type'] || '';
        var idx = String(ct).toLowerCase().indexOf('charset=');
        if (idx !== -1) {
            var cs = ct.substring(idx + 8).trim();
            var semi = cs.indexOf(';');
            if (semi !== -1) cs = cs.substring(0, semi).trim();
            return cs || null;
        }
    } catch(_){}
    return null;
}

function __bytesToString(byteArray, charsetName) {
    try {
        var StringClz = Java.use('java.lang.String');
        if (charsetName && charsetName.length > 0) {
            var Charset = Java.use('java.nio.charset.Charset');
            var cs = Charset.forName(charsetName);
            return StringClz.$new(byteArray, cs).toString();
        }
        return StringClz.$new(byteArray).toString();
    } catch (e) {
        return '';
    }
}

function __genRequestsCode(method, url, headersObj, cookieStr, bodyStr, contentTypeStr) {
    try {
        var pythonHeaders = headersObj || {};
        var cookiesPy = null;
        if (cookieStr && String(cookieStr).length > 0) {
            try {
                var parts = String(cookieStr).split(';');
                var cobj = {};
                for (var i = 0; i < parts.length; i++) {
                    var kv = parts[i].trim();
                    if (!kv) continue;
                    var idx = kv.indexOf('=');
                    if (idx > 0) {
                        var k = kv.substring(0, idx).trim();
                        var v = kv.substring(idx + 1).trim();
                        if (k) cobj[k] = v;
                    }
                }
                cookiesPy = cobj;
            } catch (_) {}
        }
        var low = (method || 'GET').toLowerCase();
        var fn = (['get','post','put','delete','patch','head','options'].indexOf(low) !== -1) ? low : 'request';
        var args = [];
        if (fn === 'request') {
            args.push("'" + method + "'");
            args.push("'" + url + "'");
        } else {
            args.push("'" + url + "'");
        }
        // headers
        args.push("headers=" + JSON.stringify(pythonHeaders));
        if (cookiesPy) args.push("cookies=" + JSON.stringify(cookiesPy));
        // body
        if (bodyStr && (low === 'post' || low === 'put' || low === 'patch' || low === 'delete')) {
            var ct = (contentTypeStr || pythonHeaders['Content-Type'] || pythonHeaders['content-type'] || '').toLowerCase();
            if (ct.indexOf('application/json') !== -1) {
                // 尝试作为 JSON
                var trimmed = String(bodyStr).trim();
                if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                    args.push("json=" + trimmed);
                } else {
                    args.push("data=" + JSON.stringify(bodyStr));
                }
            } else {
                args.push("data=" + JSON.stringify(bodyStr));
            }
        }
        if (fn === 'request') {
            return "requests.request(" + args.join(', ') + ")";
        }
        return "requests." + fn + "(" + args.join(', ') + ")";
    } catch (e) {
        return "requests.get('" + url + "')";
    }
}

function __handleOkHttpCall(self) {
    try {
        var req = null;
        try { if (typeof self.request === 'function') req = self.request(); } catch(_){}
        if (!req) { try { if (typeof self.originalRequest === 'function') req = self.originalRequest(); } catch(_){ } }
        if (!req) return;

        var method = 'GET';
        try { method = String(req.method()); } catch(_){}
        var url = '';
        try { url = String(req.url().toString()); } catch(_){ }

        var headersObj = {};
        try {
            var headers = req.headers();
            var names = headers.names();
            var it = names.iterator();
            while (it.hasNext()) {
                var name = String(it.next());
                var value = String(headers.get(name));
                headersObj[name] = value;
            }
        } catch(_){ }

        var cookieStr = '';
        try { cookieStr = headersObj['Cookie'] || headersObj['cookie'] || ''; } catch(_){ }

        if (__fetch_filter) {
            var hay = url + ' ' + JSON.stringify(headersObj);
            if (hay.indexOf(__fetch_filter) === -1) return;
        }

        // 读取RequestBody
        var bodyStr = '';
        var contentTypeStr = '';
        try {
            var body = req.body();
            if (body) {
                try { var mt = body.contentType(); contentTypeStr = mt ? String(mt.toString()) : ''; } catch(_){ }
                try {
                    var BufferClz = Java.use('okio.Buffer');
                    var buff = BufferClz.$new();
                    body.writeTo(buff);
                    try {
                        // 先按 charset 转字节再转字符串
                        var bytes = buff.readByteArray();
                        var cs = __parseCharsetFromHeaders(headersObj, contentTypeStr) || 'utf-8';
                        bodyStr = __bytesToString(bytes, cs);
                    } catch(_) {
                        try { bodyStr = String(buff.readUtf8()); } catch(__) { bodyStr = ''; }
                    }
                } catch(_){ }
            }
        } catch(_){ }

        var py = __genRequestsCode(method, url, headersObj, cookieStr, bodyStr, contentTypeStr);
        var stackArr = __getStackArray(20);

        LOG('🌐 捕获请求(OkHttp): ' + method + ' ' + url, { c: Color.Cyan });
        LOG('🐍 ' + py, { c: Color.White });
        printStack();

        send({
            type: 'fetch_request',
            ts: Date.now(),
            items: {
                library: 'okhttp',
                method: method,
                url: url,
                headers: headersObj,
                cookies: cookieStr || null,
                python: py,
                body: bodyStr || null,
                contentType: contentTypeStr || null,
                stack: stackArr
            }
        });
    } catch (e) {
        LOG('⚠️ OkHttp 捕获失败: ' + e.message, { c: Color.Yellow });
    }
}

function __installOkHttpHooks() {
    var installedAny = false;
    var candidates = ['okhttp3.RealCall', 'okhttp3.internal.connection.RealCall'];
    for (var i = 0; i < candidates.length; i++) {
        try {
            var C = __useClass(candidates[i]);
            if (C.execute) {
                var execOver = C.execute.overload();
                execOver.implementation = function() {
                    try { __handleOkHttpCall(this); } catch(_){}
                    return execOver.call(this);
                };
                installedAny = true;
            }
            if (C.enqueue) {
                try {
                    var enqOver = C.enqueue.overload('okhttp3.Callback');
                    enqOver.implementation = function(cb) {
                        try { __handleOkHttpCall(this); } catch(_){}
                        return enqOver.call(this, cb);
                    };
                    installedAny = true;
                } catch(_){ }
            }
        } catch (_) { }
    }
    if (installedAny) {
        LOG('✅ OkHttp Hook 已启用', { c: Color.Green });
    } else {
        LOG('⚠️ 未找到 OkHttp RealCall 类', { c: Color.Yellow });
    }
}

function __installOkHttp2Hooks() {
    var installedAny = false;
    var candidates = ['com.squareup.okhttp.RealCall'];
    for (var i = 0; i < candidates.length; i++) {
        try {
            var C = __useClass(candidates[i]);
            if (C.execute) {
                var execOver = C.execute.overload();
                execOver.implementation = function() {
                    try { __handleOkHttpCall(this); } catch(_){}
                    return execOver.call(this);
                };
                installedAny = true;
            }
            if (C.enqueue) {
                try {
                    var enqOver = C.enqueue.overload('com.squareup.okhttp.Callback');
                    enqOver.implementation = function(cb) {
                        try { __handleOkHttpCall(this); } catch(_){}
                        return enqOver.call(this, cb);
                    };
                    installedAny = true;
                } catch(_){ }
            }
        } catch (_){ }
    }
    if (installedAny) {
        LOG('✅ OkHttp2 Hook 已启用', { c: Color.Green });
    } else {
        LOG('ℹ️ 未检测到 OkHttp2', { c: Color.Gray });
    }
}

function __handleHttpUrlConnection(conn) {
    try {
        var method = '';
        try { method = String(conn.getRequestMethod()); } catch(_){ }
        var url = '';
        try { url = String(conn.getURL().toString()); } catch(_){ }

        var headersObj = {};
        try {
            var map = conn.getRequestProperties();
            var es = map.entrySet();
            var it = es.iterator();
            while (it.hasNext()) {
                var entry = it.next();
                var kObj = entry.getKey();
                var key = kObj ? String(kObj) : '';
                if (!key) continue;
                var list = entry.getValue();
                var vals = [];
                if (list) {
                    var size = list.size();
                    for (var i = 0; i < size; i++) { vals.push(String(list.get(i))); }
                }
                headersObj[key] = vals.join(', ');
            }
        } catch(_){ }

        var cookieStr = '';
        try { cookieStr = headersObj['Cookie'] || headersObj['cookie'] || ''; } catch(_){ }

        if (__fetch_filter) {
            var hay = url + ' ' + JSON.stringify(headersObj);
            if (hay.indexOf(__fetch_filter) === -1) return;
        }

        var py = __genRequestsCode(method || 'GET', url, headersObj, cookieStr);
        var stackArr = __getStackArray(20);

        LOG('🌐 捕获请求(HttpURLConnection): ' + (method || 'GET') + ' ' + url, { c: Color.Cyan });
        LOG('🐍 ' + py, { c: Color.White });
        printStack();

        send({
            type: 'fetch_request',
            ts: Date.now(),
            items: {
                library: 'httpurlconnection',
                method: method || 'GET',
                url: url,
                headers: headersObj,
                cookies: cookieStr || null,
                python: py,
                stack: stackArr
            }
        });
    } catch (e) {
        LOG('⚠️ HttpURLConnection 捕获失败: ' + e.message, { c: Color.Yellow });
    }
}

function __installHttpURLConnectionHooks() {
    try {
        var HUC = __useClass('java.net.HttpURLConnection');
        // getInputStream
        try {
            var gis = HUC.getInputStream.overload();
            gis.implementation = function() {
                try { __handleHttpUrlConnection(this); } catch(_){}
                return gis.call(this);
            };
        } catch(_){ }
        // getOutputStream
        try {
            var gos = HUC.getOutputStream.overload();
            gos.implementation = function() {
                try { __handleHttpUrlConnection(this); } catch(_){}
                return gos.call(this);
            };
        } catch(_){ }
        // connect()
        try {
            var connOver = HUC.connect.overload();
            connOver.implementation = function() {
                try { __handleHttpUrlConnection(this); } catch(_){}
                return connOver.call(this);
            };
        } catch(_){ }
        LOG('✅ HttpURLConnection Hook 已启用', { c: Color.Green });
    } catch (e) {
        LOG('⚠️ 未找到 HttpURLConnection 类: ' + e.message, { c: Color.Yellow });
    }
}

function __installWebViewHooks() {
    try {
        var WV = __useClass('android.webkit.WebView');
        // loadUrl(String)
        try {
            var l1 = WV.loadUrl.overload('java.lang.String');
            l1.implementation = function(u) {
                var url = String(u);
                if (!__fetch_filter || (url + '').indexOf(__fetch_filter) !== -1) {
                    var py = __genRequestsCode('GET', url, {}, null, null, null);
                    var stackArr = __getStackArray(15);
                    LOG('🌐 WebView.loadUrl: ' + url, { c: Color.Cyan });
                    LOG('🐍 ' + py, { c: Color.White });
                    printStack();
                    send({ type: 'fetch_request', ts: Date.now(), items: { library: 'webview', method: 'GET', url: url, headers: {}, cookies: null, python: py, stack: stackArr } });
                }
                return l1.call(this, u);
            };
        } catch(_){ }
        // loadUrl(String, Map)
        try {
            var l2 = WV.loadUrl.overload('java.lang.String', 'java.util.Map');
            l2.implementation = function(u, m) {
                var url = String(u);
                var headersObj = {};
                try {
                    var it = m.entrySet().iterator();
                    while (it.hasNext()) {
                        var e = it.next();
                        headersObj[String(e.getKey())] = String(e.getValue());
                    }
                } catch(_){ }
                if (!__fetch_filter || (url + ' ' + JSON.stringify(headersObj)).indexOf(__fetch_filter) !== -1) {
                    var py = __genRequestsCode('GET', url, headersObj, null, null, null);
                    var stackArr = __getStackArray(15);
                    LOG('🌐 WebView.loadUrl(headers): ' + url, { c: Color.Cyan });
                    LOG('🐍 ' + py, { c: Color.White });
                    printStack();
                    send({ type: 'fetch_request', ts: Date.now(), items: { library: 'webview', method: 'GET', url: url, headers: headersObj, cookies: null, python: py, stack: stackArr } });
                }
                return l2.call(this, u, m);
            };
        } catch(_){ }
        // loadDataWithBaseURL
        try {
            var l3 = WV.loadDataWithBaseURL.overload('java.lang.String','java.lang.String','java.lang.String','java.lang.String','java.lang.String');
            l3.implementation = function(baseUrl, data, mime, enc, hist) {
                var url = String(baseUrl || '');
                if (url && (!__fetch_filter || url.indexOf(__fetch_filter) !== -1)) {
                    var headersObj = { 'Content-Type': String(mime || '') + (enc ? ('; charset=' + enc) : '') };
                    var py = __genRequestsCode('GET', url, headersObj, null, null, null);
                    var stackArr = __getStackArray(10);
                    LOG('🌐 WebView.loadDataWithBaseURL: ' + url, { c: Color.Cyan });
                    LOG('🐍 ' + py, { c: Color.White });
                    printStack();
                    send({ type: 'fetch_request', ts: Date.now(), items: { library: 'webview', method: 'GET', url: url, headers: headersObj, cookies: null, python: py, stack: stackArr } });
                }
                return l3.call(this, baseUrl, data, mime, enc, hist);
            };
        } catch(_){ }
        LOG('✅ WebView Hook 已启用', { c: Color.Green });
    } catch (e) {
        LOG('ℹ️ 未检测到 WebView: ' + e.message, { c: Color.Gray });
    }
}

function __installVolleyHooks() {
    try {
        var RQ = __useClass('com.android.volley.RequestQueue');
        var addOver = RQ.add.overload('com.android.volley.Request');
        addOver.implementation = function(req) {
            try {
                var methodInt = 0;
                try { methodInt = req.getMethod(); } catch(_){ }
                var methods = ['GET','POST','PUT','DELETE','HEAD','OPTIONS','TRACE','PATCH'];
                var method = methods[methodInt] || 'GET';
                var url = '';
                try { url = String(req.getUrl()); } catch(_){ }
                var headersObj = {};
                try {
                    var map = req.getHeaders();
                    var it = map.entrySet().iterator();
                    while (it.hasNext()) {
                        var e = it.next();
                        headersObj[String(e.getKey())] = String(e.getValue());
                    }
                } catch(_){ }
                var bodyStr = '';
                var ct = '';
                try { ct = String(req.getBodyContentType()); if (ct) { headersObj['Content-Type'] = headersObj['Content-Type'] || ct; } } catch(_){ }
                try {
                    var b = req.getBody();
                    if (b) {
                        var cs = __parseCharsetFromHeaders(headersObj, ct) || 'utf-8';
                        bodyStr = __bytesToString(b, cs);
                    }
                } catch(_){ }

                if (!__fetch_filter || (url + ' ' + JSON.stringify(headersObj)).indexOf(__fetch_filter) !== -1) {
                    var py = __genRequestsCode(method, url, headersObj, headersObj['Cookie'] || headersObj['cookie'] || null, bodyStr, ct);
                    var stackArr = __getStackArray(20);
                    LOG('🌐 捕获请求(Volley): ' + method + ' ' + url, { c: Color.Cyan });
                    LOG('🐍 ' + py, { c: Color.White });
                    printStack();
                    send({ type: 'fetch_request', ts: Date.now(), items: { library: 'volley', method: method, url: url, headers: headersObj, cookies: headersObj['Cookie'] || null, python: py, body: bodyStr || null, contentType: ct || null, stack: stackArr } });
                }
            } catch(_){ }
            return addOver.call(this, req);
        };
        LOG('✅ Volley Hook 已启用', { c: Color.Green });
    } catch (e) {
        LOG('ℹ️ 未检测到 Volley: ' + e.message, { c: Color.Gray });
    }
}

function __installApacheHttpClientHooks() {
    var installed = false;
    function hookClient(className) {
        try {
            var Cls = __useClass(className);
            try {
                var exec1 = Cls.execute.overload('org.apache.http.client.methods.HttpUriRequest');
                exec1.implementation = function(request) {
                    try {
                        var method = '';
                        try { method = String(request.getMethod()); } catch(_){ }
                        var url = '';
                        try { url = String(request.getURI().toString()); } catch(_){ }
                        var headersObj = {};
                        try {
                            var hdrs = request.getAllHeaders();
                            if (hdrs) {
                                for (var i = 0; i < hdrs.length; i++) {
                                    try { headersObj[String(hdrs[i].getName())] = String(hdrs[i].getValue()); } catch(__){}
                                }
                            }
                        } catch(_){ }
                        if (!__fetch_filter || (url + ' ' + JSON.stringify(headersObj)).indexOf(__fetch_filter) !== -1) {
                            var py = __genRequestsCode(method || 'GET', url, headersObj, headersObj['Cookie'] || headersObj['cookie'] || null, null, headersObj['Content-Type'] || null);
                            var stackArr = __getStackArray(20);
                            LOG('🌐 捕获请求(ApacheHttpClient): ' + (method || 'GET') + ' ' + url, { c: Color.Cyan });
                            LOG('🐍 ' + py, { c: Color.White });
                            printStack();
                            send({ type: 'fetch_request', ts: Date.now(), items: { library: 'apache_httpclient', method: method || 'GET', url: url, headers: headersObj, cookies: headersObj['Cookie'] || null, python: py, stack: stackArr } });
                        }
                    } catch(_){ }
                    return exec1.call(this, request);
                };
                installed = true;
            } catch(_){ }
        } catch(_){ }
    }
    hookClient('org.apache.http.impl.client.InternalHttpClient');
    if (!installed) hookClient('org.apache.http.impl.client.CloseableHttpClient');
    if (installed) {
        LOG('✅ Apache HttpClient Hook 已启用', { c: Color.Green });
    } else {
        LOG('ℹ️ 未检测到 Apache HttpClient', { c: Color.Gray });
    }
}

function fetch(filterStr) {
    try {
        __fetch_filter = (filterStr && String(filterStr)) ? String(filterStr) : null;
        // 通知Python端初始化日志文件
        try { send({ type: 'fetch_start', ts: Date.now(), items: { filter: __fetch_filter } }); } catch(_){ }
        Java.perform(function() {
            if (!__fetch_installed) {
                __installOkHttpHooks();
                __installOkHttp2Hooks();
                __installHttpURLConnectionHooks();
                __installWebViewHooks();
                __installVolleyHooks();
                __installApacheHttpClientHooks();
                __fetch_installed = true;
            } else {
                LOG('ℹ️ fetch 已启用，更新过滤条件: ' + (__fetch_filter || '(无)'), { c: Color.Cyan });
            }
        });
        LOG('✅ fetch 已启动' + (__fetch_filter ? ' (过滤: ' + __fetch_filter + ')' : ''), { c: Color.Green });
        return true;
    } catch (e) {
        LOG('❌ fetch 启动失败: ' + e.message, { c: Color.Red });
        return false;
    }
}

// ===== OkHttp Logger 功能（媲美 OkHttpLogger-Frida） =====
var __okhttp_state = { installed: false, loader: null, history: [], counter: 0 };

function __okhttp_use(className) {
    try {
        if (__okhttp_state.loader) {
            return Java.ClassFactory.get(__okhttp_state.loader).use(className);
        }
        return Java.use(className);
    } catch (e) {
        if ((e.message || '').indexOf('ClassNotFoundException') !== -1) {
            try {
                var l = findTragetClassLoader(className);
                if (l) { __okhttp_state.loader = l; return Java.ClassFactory.get(l).use(className); }
            } catch (_) {}
        }
        return null;
    }
}

function __okhttp_headers_to_obj(headers) {
    var obj = {};
    try {
        var names = headers.names();
        var it = names.iterator();
        while (it.hasNext()) { var n = String(it.next()); obj[n] = String(headers.get(n)); }
    } catch (_) {}
    return obj;
}

function __okhttp_log_request(callObj, req) {
    try {
        var method = 'GET'; try { method = String(req.method()); } catch(_){}
        var url = ''; try { url = String(req.url().toString()); } catch(_){ }
        var headersObj = {}; try { headersObj = __okhttp_headers_to_obj(req.headers()); } catch(_){}
        var cookieStr = headersObj['Cookie'] || headersObj['cookie'] || '';
        var bodyStr = '';
        var contentTypeStr = '';
        try {
            var body = req.body();
            if (body) {
                try { var mt = body.contentType(); contentTypeStr = mt ? String(mt.toString()) : ''; } catch(_){ }
                try {
                    var BufferClz = __okhttp_use('okio.Buffer');
                    if (BufferClz) {
                        var buff = BufferClz.$new();
                        body.writeTo(buff);
                        try {
                            var bytes = buff.readByteArray();
                            var cs = __parseCharsetFromHeaders(headersObj, contentTypeStr) || 'utf-8';
                            bodyStr = __bytesToString(bytes, cs);
                        } catch(_) {
                            try { bodyStr = String(buff.readUtf8()); } catch(__) { bodyStr = ''; }
                        }
                    }
                } catch(_){ }
            }
        } catch(_){ }

        LOG('\n┌' + '─'.repeat(100));
        LOG('| URL: ' + url);
        LOG('|');
        LOG('| Method: ' + method);
        LOG('|');
        LOG('| Headers:');
        try { Object.keys(headersObj).forEach(function(k){ LOG('|   ┌─' + k + ': ' + headersObj[k]); }); } catch(_){}
        if (bodyStr && bodyStr.length > 0) {
            LOG('|');
            LOG('| Body:');
            LOG('|   ' + (bodyStr.length > 4000 ? (bodyStr.substring(0, 4000) + ' ...') : bodyStr));
            LOG('|');
            LOG('|--> END ' + (contentTypeStr.toLowerCase().indexOf('text') === -1 && contentTypeStr.toLowerCase().indexOf('json') === -1 ? ' (binary body omitted -> isPlaintext)' : ''));
        } else {
            LOG('|');
            LOG('|--> END');
        }

        // 保存到历史
        var idx = (++__okhttp_state.counter);
        __okhttp_state.history.push({
            index: idx,
            ts: Date.now(),
            method: method,
            url: url,
            headers: headersObj,
            body: bodyStr || null,
            contentType: contentTypeStr || null,
            callRef: callObj || null,
            requestRef: req || null
        });

        // 事件
        try {
            send({ type: 'fetch_request', ts: Date.now(), items: { library: 'okhttp', method: method, url: url, headers: headersObj, cookies: cookieStr || null, python: __genRequestsCode(method, url, headersObj, cookieStr, bodyStr, contentTypeStr), body: bodyStr || null, contentType: contentTypeStr || null, index: idx } });
        } catch(_){}

        return idx;
    } catch (e) {
        LOG('⚠️ OkHttp 请求日志失败: ' + e.message, { c: Color.Yellow });
        return -1;
    }
}

function __okhttp_log_response(resp) {
    try {
        var code = 0; try { code = resp.code(); } catch(_){}
        var message = ''; try { message = String(resp.message()); } catch(_){}
        var url = ''; try { url = String(resp.request().url().toString()); } catch(_){}
        var headersObj = {}; try { headersObj = __okhttp_headers_to_obj(resp.headers()); } catch(_){}
        var bodyStr = null;
        try {
            if (typeof resp.peekBody === 'function') {
                var pb = resp.peekBody(1024 * 1024);
                try { bodyStr = String(pb.string()); } catch(eStr) {
                    try { var bytes = pb.bytes(); bodyStr = __bytesToString(bytes, __parseCharsetFromHeaders(headersObj, headersObj['Content-Type'] || '')); } catch(_) { bodyStr = null; }
                }
            }
        } catch(_){}

        LOG('|');
        LOG('| Status Code: ' + code + ' / ' + (message || ''));
        LOG('|');
        LOG('| Headers:');
        try { Object.keys(headersObj).forEach(function(k){ LOG('|   ┌─' + k + ': ' + headersObj[k]); }); } catch(_){}
        LOG('| ');
        if (bodyStr !== null) {
            LOG('| Body:');
            LOG('|   ' + (bodyStr.length > 4000 ? (bodyStr.substring(0, 4000) + ' ...') : bodyStr));
            LOG('| ');
        }
        LOG('|<-- END HTTP');
        LOG('└' + '─'.repeat(100));

        try { send({ type: 'fetch_response', ts: Date.now(), items: { library: 'okhttp', url: url, code: code, message: message, headers: headersObj, body: bodyStr } }); } catch(_){}
    } catch (e) {
        LOG('⚠️ OkHttp 响应日志失败: ' + e.message, { c: Color.Yellow });
    }
}

function okhttpFind() {
    try {
        var has3 = false, has2 = false;
        Java.perform(function(){
            try {
                var classes = Java.enumerateLoadedClassesSync();
                for (var i = 0; i < classes.length; i++) {
                    var cn = classes[i];
                    if (!has3 && cn.indexOf('okhttp3.') === 0) has3 = true;
                    if (!has2 && cn.indexOf('com.squareup.okhttp.') === 0) has2 = true;
                    if (has3 && has2) break;
                }
            } catch(_){ }
        });
        if (has3) {
            LOG('✅ 检测到 OkHttp3', { c: Color.Green });
        } else if (has2) {
            LOG('✅ 检测到 OkHttp2', { c: Color.Green });
        } else {
            LOG('❌ 未检测到 OkHttp', { c: Color.Red });
        }
        return { ok3: has3, ok2: has2 };
    } catch (e) {
        LOG('❌ okhttpFind 失败: ' + e.message, { c: Color.Red });
        return { ok3: false, ok2: false };
    }
}

function okhttpSwitchLoader(sampleClassName) {
    try {
        var l = findTragetClassLoader(sampleClassName);
        if (l) { __okhttp_state.loader = l; LOG('🎯 已切换 OkHttp ClassLoader', { c: Color.Green }); return true; }
        LOG('⚠️ 未找到可用的 ClassLoader', { c: Color.Yellow });
        return false;
    } catch (e) {
        LOG('❌ switchLoader 失败: ' + e.message, { c: Color.Red });
        return false;
    }
}

function __installOkHttpLoggerHooks() {
    if (__okhttp_state.installed) { LOG('ℹ️ OkHttp hold 已启用', { c: Color.Cyan }); return true; }
    var installed = false;
    Java.perform(function(){
        // OkHttp3 RealCall
        var RC = __okhttp_use('okhttp3.RealCall') || __okhttp_use('okhttp3.internal.connection.RealCall');
        if (RC) {
            try {
                var exec = RC.execute.overload();
                exec.implementation = function() {
                    var idx = -1;
                    try { var req = this.request ? this.request() : (this.originalRequest ? this.originalRequest() : null); if (req) idx = __okhttp_log_request(this, req); } catch(_){ }
                    var resp = exec.call(this);
                    try { __okhttp_log_response(resp); } catch(_){ }
                    // 记录响应到对应历史项
                    try { if (idx > 0) { var h = __okhttp_state.history.find(function(x){ return x.index === idx; }); if (h) h.responseRef = resp; } } catch(_){ }
                    return resp;
                };
                installed = true;
            } catch(_){ }
            try {
                var enq = RC.enqueue.overload('okhttp3.Callback');
                enq.implementation = function(cb) {
                    try { var req = this.request ? this.request() : (this.originalRequest ? this.originalRequest() : null); if (req) { __okhttp_log_request(this, req); } } catch(_){ }
                    return enq.call(this, cb);
                };
                installed = true;
            } catch(_){ }
        }
        // OkHttp2
        var RC2 = __okhttp_use('com.squareup.okhttp.RealCall');
        if (RC2) {
            try {
                var exec2 = RC2.execute.overload();
                exec2.implementation = function() {
                    try { var req = this.request ? this.request() : null; if (req) __okhttp_log_request(this, req); } catch(_){ }
                    var resp = exec2.call(this);
                    try { __okhttp_log_response(resp); } catch(_){ }
                    return resp;
                };
                installed = true;
            } catch(_){ }
            try {
                var enq2 = RC2.enqueue.overload('com.squareup.okhttp.Callback');
                enq2.implementation = function(cb) {
                    try { var req = this.request ? this.request() : null; if (req) __okhttp_log_request(this, req); } catch(_){ }
                    return enq2.call(this, cb);
                };
                installed = true;
            } catch(_){ }
        }
    });
    if (installed) { __okhttp_state.installed = true; LOG('✅ OkHttp hold 已启用', { c: Color.Green }); return true; }
    LOG('⚠️ 未找到 OkHttp RealCall 类', { c: Color.Yellow });
    return false;
}

function okhttpHold() { try { return __installOkHttpLoggerHooks(); } catch (e) { LOG('❌ hold 启动失败: ' + e.message, { c: Color.Red }); return false; } }

function okhttpHistory() {
    try {
        var list = __okhttp_state.history || [];
        if (!list.length) { LOG('ℹ️ 无历史记录', { c: Color.Gray }); return []; }
        for (var i = 0; i < list.length; i++) {
            var h = list[i];
            LOG('#' + h.index + ' ' + h.method + ' ' + h.url, { c: Color.Cyan });
        }
        return list.map(function(h){ return { index: h.index, method: h.method, url: h.url }; });
    } catch (e) { LOG('❌ history 失败: ' + e.message, { c: Color.Red }); return []; }
}

function okhttpResend(index) {
    try {
        var idx = parseInt(index);
        var h = (__okhttp_state.history || []).find(function(x){ return x.index === idx; });
        if (!h) { LOG('❌ 未找到历史项 #' + idx, { c: Color.Red }); return false; }
        var resp = null;
        try {
            if (h.callRef && typeof h.callRef.clone === 'function') {
                var cloned = h.callRef.clone();
                resp = cloned.execute();
            } else if (h.requestRef) {
                var Builder = __okhttp_use('okhttp3.OkHttpClient$Builder');
                if (Builder) {
                    var builder = Builder.$new();
                    var client = builder.build();
                    var call = client.newCall(h.requestRef);
                    resp = call.execute();
                }
            }
        } catch (e2) {
            LOG('⚠️ 重放失败: ' + e2.message, { c: Color.Yellow });
        }
        if (resp) { __okhttp_log_response(resp); return true; }
        LOG('❌ 重放失败，无法构造请求', { c: Color.Red });
        return false;
    } catch (e) { LOG('❌ resend 失败: ' + e.message, { c: Color.Red }); return false; }
}

function okhttpClear() { try { __okhttp_state.history = []; __okhttp_state.counter = 0; LOG('🧹 已清空 OkHttp 历史', { c: Color.Green }); return true; } catch (_) { return false; } }

// ===== 帮助函数 =====
function help() {
    LOG("\n📚 fridacli Hook工具帮助 (新版本)", { c: Color.Cyan });
    LOG("=" + "=".repeat(50), { c: Color.Gray });
    
    var commands = [
        ["smartTrace(target)", "智能追踪类或方法"],
        ["traceClass(className)", "跟踪类的所有方法"],
        ["traceMethod(className.method)", "跟踪特定方法"],
        ["advancedMethodTracing(method, stack, field)", "高级方法追踪"],
        ["findClasses(pattern, details)", "查找匹配的类"],
        ["enumAllClasses(package)", "枚举包下所有类"],
        ["hookbase64", "创建Base64 Hook任务"],
        ["hookurl", "创建URL Hook任务"],
        ["hooktoast", "创建Toast Hook任务"],
        ["fetch([filter])", "抓取网络请求，生成等价Python requests代码并保存日志，可选按字符串过滤"],
        ["okhttpFind()", "检测是否使用OkHttp (2/3)"],
        ["okhttpSwitchLoader('<okhttp3.OkHttpClient>')", "切换使用的ClassLoader"],
        ["okhttpHold()", "开启OkHttp拦截(hold)"],
        ["okhttpHistory()", "打印可重放的请求列表"],
        ["okhttpResend(index)", "按编号重放请求(同步执行)"],
        ["okhttpClear()", "清空历史记录"],
        ["help()", "显示此帮助"]
    ];
    
    commands.forEach(function(cmd) {
        LOG("🔧 " + cmd[0], { c: Color.Green });
        LOG("   " + cmd[1], { c: Color.White });
    });
    
    LOG("\n💡 提示: 新版本使用基于Script隔离的任务管理系统", { c: Color.Yellow });
    LOG("🎯 任务管理命令: tasks, killall, taskinfo, hookmethod, hookbase64等", { c: Color.Blue });
    LOG("=" + "=".repeat(50), { c: Color.Gray });
}

/**
 * 描述Java类的详细信息
 * @param {string} fullyQualifiedClassName - 完整的类名
 * @returns {object|null} 类的详细信息对象
 */
function describeJavaClassDetails(fullyQualifiedClassName) {
    try {
        var javaClassWrapper = Java.use(fullyQualifiedClassName);
        
        var declaredMethods = javaClassWrapper.class.getDeclaredMethods();
        var publicFields = javaClassWrapper.class.getFields();
        
        var classDescription = {
            className: fullyQualifiedClassName,
            methodCount: declaredMethods.length,
            fieldCount: publicFields.length,
            methods: declaredMethods.map(function(methodObject) {
                return methodObject.toString();
            }),
            fields: publicFields.map(function(fieldObject) {
                return fieldObject.toString();
            })
        };
        
        LOG("📋 类详细信息:", { c: Color.Cyan });
        LOG(JSON.stringify(classDescription, null, 2), { c: Color.White });
        
        return classDescription;
    } catch (classDescribeError) {
        LOG("❌ 无法描述类 '" + fullyQualifiedClassName + "': " + classDescribeError.message, { c: Color.Red });
        return null;
    }
}

/**
 * 智能Hook分发器，自动判断目标类型并选择合适的Hook方法
 * @param {string} targetIdentifier - 目标标识符（类名或方法名）
 * @param {object} hookOptions - Hook选项
 * @returns {*} Hook结果
 */
function intelligentHookDispatcher(targetIdentifier, hookOptions) {
    hookOptions = hookOptions || {};
    
    LOG("🤖 智能分析目标: " + targetIdentifier, { c: Color.Cyan });
    
    // 检测是否为 Java 类或方法
    if (targetIdentifier.includes('.') && targetIdentifier.match(/^[a-z]+\./)) {
        // 1. 检查是否包含方法签名（带括号）
        if (targetIdentifier.includes('(')) {
            LOG("🎯 检测到 Java 方法（包含方法签名），使用方法Hook", { c: Color.Green });
            return hookJavaMethodWithTracing(
                targetIdentifier, 
                hookOptions.enableStackTrace, 
                hookOptions.customReturnValue
            );
        }
        
        // 2. 检查是否明确指定为方法
        if (hookOptions.isMethodExplicit) {
            LOG("🎯 检测到 Java 方法（用户明确指定），使用方法Hook", { c: Color.Green });
            return hookJavaMethodWithTracing(
                targetIdentifier, 
                hookOptions.enableStackTrace, 
                hookOptions.customReturnValue
            );
        }
        
        // 3. 智能判断：基于常见的Android生命周期方法名
        var commonAndroidLifecycleMethods = [
            'onCreate', 'onResume', 'onPause', 'onDestroy', 
            'onStart', 'onStop', 'onRestart', 'onAttach', 
            'onDetach', 'onConfigurationChanged'
        ];
        
        var identifierParts = targetIdentifier.split('.');
        if (identifierParts.length >= 3) {
            var lastIdentifierPart = identifierParts[identifierParts.length - 1];
            
            // 只有当最后一部分明确是已知的方法名时，才当作方法处理
            if (commonAndroidLifecycleMethods.includes(lastIdentifierPart)) {
                LOG("🎯 检测到 Java 方法（智能识别生命周期方法），使用方法Hook", { c: Color.Green });
                return hookJavaMethodWithTracing(
                    targetIdentifier, 
                    hookOptions.enableStackTrace, 
                    hookOptions.customReturnValue
                );
            }
        }
        
        // 4. 默认当作类处理，Hook所有方法
        LOG("📚 检测到 Java 类，Hook所有方法", { c: Color.Blue });
        return hookAllMethodsInJavaClass(targetIdentifier);
    }
    
    // 检测是否为 Native 函数
    if (typeof nativeHookNativeFunction !== 'undefined') {
        LOG("🔧 检测到可能的 Native 函数，尝试 Native Hook", { c: Color.Purple });
        return nativeHookNativeFunction(targetIdentifier, hookOptions);
    } else {
        LOG("⚠️ Native Hook 工具未加载，请先运行 loadNativeSupport()", { c: Color.Yellow });
        return null;
    }
}

// 保持向后兼容性
var describeJavaClass = describeJavaClassDetails;
var findStrInMap = hookHashMapToFindValue;
var smartTrace = intelligentHookDispatcher;

// ===== 全局导出 =====
global.smartTrace = smartTrace;
global.intelligentHookDispatcher = intelligentHookDispatcher;
global.traceClass = traceClass;
global.traceMethod = traceMethod;
global.advancedMethodTracing = advancedMethodTracing;
global.findClasses = findClasses;
global.enumAllClasses = enumAllClasses;
global.describeJavaClass = describeJavaClass;
global.hookJavaMethodWithTracing = hookJavaMethodWithTracing;
global.hookAllMethodsInJavaClass = hookAllMethodsInJavaClass;
global.hookHashMapToFindValue = hookHashMapToFindValue;
global.findStrInMap = findStrInMap;
global.help = help;

// 导出工具函数
global.LOG = LOG;
global.Color = Color;
global.printStack = printStack;
global.printJavaCallStack = printJavaCallStack;
global.findTragetClassLoader = findTragetClassLoader;
global.fetch = fetch;
// OkHttp Logger 导出（插件提供时可用）
if (typeof okhttpFind !== 'undefined') global.okhttpFind = okhttpFind;
if (typeof okhttpSwitchLoader !== 'undefined') global.okhttpSwitchLoader = okhttpSwitchLoader;
if (typeof okhttpHold !== 'undefined') global.okhttpHold = okhttpHold;
if (typeof okhttpHistory !== 'undefined') global.okhttpHistory = okhttpHistory;
if (typeof okhttpResend !== 'undefined') global.okhttpResend = okhttpResend;
if (typeof okhttpClear !== 'undefined') global.okhttpClear = okhttpClear;
if (typeof okhttpStart !== 'undefined') global.okhttpStart = okhttpStart;

// 提供 loadNativeSupport 便捷函数（如果 Native 模块已自动加载则提示已就绪）
function loadNativeSupport() {
    try {
        var hasAnyNative =
            (typeof nativeHookNativeFunction === 'function') ||
            (typeof nativeFindModules === 'function') ||
            (typeof nativeHookNetworkFunctions === 'function') ||
            (typeof nativeHookDlopenFamily === 'function');
        if (hasAnyNative) {
            LOG("🟢 Native 支持已就绪", { c: Color.Green });
            return true;
        }
        LOG("🟡 未检测到 Native 工具，请确认已加载 frida_native_common.js 或 frida_native/* 模块", { c: Color.Yellow });
        return false;
    } catch (e) {
        LOG("❌ 检查 Native 支持失败: " + e.message, { c: Color.Red });
        return false;
    }
}
global.loadNativeSupport = loadNativeSupport;

LOG("🚀 fridacli Java Hook工具集已加载 (新版本)!", { c: Color.Green });