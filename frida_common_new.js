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

function printStack() {
    try {
        var exception = Java.use("java.lang.Exception").$new();
        var trace = exception.getStackTrace();
        LOG("📚 调用堆栈:", { c: Color.Cyan });
        
        var printed = 0;
        for (var i = 0; i < trace.length && printed < 8; i++) {
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
            
            // Hook方法
            targetClass[methodName].implementation = function() {
                LOG("\n*** 进入 " + fullyQualifiedMethodName, { c: Color.Green });
                
                // 打印参数
                if (arguments.length > 0) {
                    LOG("📥 参数:", { c: Color.Blue });
                    for (var i = 0; i < arguments.length; i++) {
                        LOG("  arg[" + i + "]: " + arguments[i], { c: Color.White });
                    }
                }
                
                var retval = this[methodName].apply(this, arguments);
                
                LOG("📤 返回值: " + retval, { c: Color.Blue });
                LOG("🏁 退出 " + fullyQualifiedMethodName + "\n", { c: Color.Green });
                
                return retval;
            };
            
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
        Java.enumerateLoadedClasses().forEach(function(className) {
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
        Java.enumerateLoadedClasses().forEach(function(className) {
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
                if (classLoadError.message.includes("ClassNotFoundException")) {
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

            javaClassHook[targetMethodName].implementation = function () {
                LOG("\n*** 进入 " + fullyQualifiedMethodName, { c: Color.Green });

                if (enableStackTrace) {
                    printStack();
                }

                if (arguments.length > 0) {
                    LOG("📥 参数:", { c: Color.Blue });
                    for (var i = 0; i < arguments.length; i++) {
                        LOG("  arg[" + i + "]: " + arguments[i], { c: Color.White });
                    }
                }

                var result;
                if (customReturnValue !== undefined) {
                    LOG("🔄 使用自定义返回值: " + customReturnValue, { c: Color.Yellow });
                    result = customReturnValue;
                } else {
                    result = this[targetMethodName].apply(this, arguments);
                }

                LOG("📤 返回值: " + result, { c: Color.Blue });
                LOG("🏁 退出 " + fullyQualifiedMethodName + "\n", { c: Color.Green });

                return result;
            };

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
global.findTragetClassLoader = findTragetClassLoader;

LOG("🚀 fridacli Java Hook工具集已加载 (新版本)!", { c: Color.Green });