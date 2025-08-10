/**
 * 高级追踪功能
 * 实现了一些 fridacli 中缺失的功能
 */

/**
 * 反调试：绕过 TracerPid 检测
 * @returns {boolean} 是否成功设置绕过
 */
function bypassTracerPidDetection() {
    try {
        var fgetsPtr = Module.findExportByName("libc.so", "fgets");
        if (!fgetsPtr) {
            LOG("❌ 未找到 fgets 函数，跳过 TracerPid 绕过", { c: Color.Yellow });
            return false;
        }
        
        var fgets = new NativeFunction(fgetsPtr, 'pointer', ['pointer', 'int', 'pointer']);
        Interceptor.replace(fgetsPtr, new NativeCallback(function (buffer, size, fp) {
            var retval = fgets(buffer, size, fp);
            var bufstr = Memory.readUtf8String(buffer);
            if (bufstr.indexOf("TracerPid:") > -1) {
                Memory.writeUtf8String(buffer, "TracerPid:\t0");
                LOG("🔒 TracerPid 检测已绕过: " + Memory.readUtf8String(buffer), { c: Color.Green });
            }
            return retval;
        }, 'pointer', ['pointer', 'int', 'pointer']));
        
        LOG("✅ TracerPid 绕过设置成功", { c: Color.Green });
        return true;
    } catch (error) {
        LOG("❌ TracerPid 绕过设置失败: " + error.message, { c: Color.Red });
        return false;
    }
}

/**
 * 检查对象实例的所有字段值（增强版 inspectObject）
 * @param {Object} objectInstance - 要检查的对象实例
 * @param {string} contextInfo - 上下文信息
 * @returns {string} 格式化的字段信息
 */
function inspectObjectFields(objectInstance, contextInfo) {
    var isInstance = false;
    var objectClass = null;
    var outputInfo = contextInfo || "";
    
    try {
        // 判断是否为实例对象
        if (objectInstance.$handle === null || objectInstance.$handle === undefined) {
            objectClass = objectInstance.class;
        } else {
            var ClassWrapper = Java.use("java.lang.Class");
            objectClass = Java.cast(objectInstance.getClass(), ClassWrapper);
            isInstance = true;
        }
        
        outputInfo += "\n🔍 检查对象字段: " + (isInstance ? "实例对象" : "类对象") + " => " + objectClass.toString();
        outputInfo += "\n" + "=".repeat(80);
        
        var declaredFields = objectClass.getDeclaredFields();
        var fieldCount = 0;
        
        for (var fieldIndex = 0; fieldIndex < declaredFields.length; fieldIndex++) {
            var currentField = declaredFields[fieldIndex];
            var fieldString = currentField.toString();
            
            // 只处理静态字段或实例字段
            if (isInstance || fieldString.indexOf("static ") >= 0) {
                var className = objectClass.toString().trim().split(" ")[1];
                var fieldName = fieldString.split(className + ".").pop();
                var fieldType = fieldString.split(" ").slice(-2)[0];
                var fieldValue = undefined;
                
                try {
                    // 尝试获取字段值
                    if (objectInstance[fieldName] !== undefined) {
                        fieldValue = objectInstance[fieldName].value;
                    }
                    
                    // 格式化字段信息
                    var formattedValue = fieldValue;
                    if (typeof fieldValue === 'string' && fieldValue.length > 100) {
                        formattedValue = fieldValue.substring(0, 100) + "... (长度: " + fieldValue.length + ")";
                    } else if (typeof fieldValue === 'object' && fieldValue !== null) {
                        try {
                            formattedValue = JSON.stringify(fieldValue);
                            if (formattedValue.length > 200) {
                                formattedValue = formattedValue.substring(0, 200) + "... (对象被截断)";
                            }
                        } catch (jsonError) {
                            formattedValue = "[对象无法序列化]";
                        }
                    }
                    
                    outputInfo += "\n  📋 " + fieldType + " " + fieldName + " = " + formattedValue;
                    fieldCount++;
                    
                } catch (fieldAccessError) {
                    outputInfo += "\n  ❌ " + fieldType + " " + fieldName + " = [访问失败: " + fieldAccessError.message + "]";
                }
            }
        }
        
        outputInfo += "\n" + "=".repeat(80);
        outputInfo += "\n📊 总共检查了 " + fieldCount + " 个字段";
        
    } catch (inspectionError) {
        outputInfo += "\n❌ 对象检查失败: " + inspectionError.message;
    }
    
    return outputInfo;
}

/**
 * 高级方法追踪，包含详细的对象字段信息
 * @param {string} fullyQualifiedMethodName - 完整方法名
 * @param {boolean} enableFieldInspection - 是否启用字段检查
 * @param {boolean} enableColorOutput - 是否启用彩色输出
 * @returns {boolean} 是否成功设置追踪
 */
function advancedMethodTracing(fullyQualifiedMethodName, enableFieldInspection, enableColorOutput) {
    enableFieldInspection = enableFieldInspection || false;
    enableColorOutput = enableColorOutput || true;
    
    var methodDelimiterIndex = fullyQualifiedMethodName.lastIndexOf(".");
    if (methodDelimiterIndex === -1) {
        LOG("❌ 无效的方法名格式: " + fullyQualifiedMethodName, { c: Color.Red });
        return false;
    }
    
    var targetClassName = fullyQualifiedMethodName.slice(0, methodDelimiterIndex);
    var targetMethodName = fullyQualifiedMethodName.slice(methodDelimiterIndex + 1);
    
    try {
        var javaClassWrapper = Java.use(targetClassName);
        var methodOverloads = javaClassWrapper[targetMethodName].overloads;
        var overloadCount = methodOverloads.length;
        
        LOG("🎯 开始高级追踪: " + fullyQualifiedMethodName + " [" + overloadCount + " 个重载]", { c: Color.Cyan });
        
        for (var overloadIndex = 0; overloadIndex < overloadCount; overloadIndex++) {
            methodOverloads[overloadIndex].implementation = function() {
                var outputContent = "";
                
                // 创建分隔线
                var separatorLine = "=".repeat(100);
                outputContent += "\n" + separatorLine;
                
                // 对象字段检查（如果启用）
                if (enableFieldInspection) {
                    outputContent = inspectObjectFields(this, outputContent);
                }
                
                // 方法进入信息
                outputContent += "\n🎯 ===== 进入方法: " + fullyQualifiedMethodName + " =====";
                
                // 参数信息
                if (arguments.length > 0) {
                    outputContent += "\n📥 方法参数 (" + arguments.length + " 个):";
                    for (var argIndex = 0; argIndex < arguments.length; argIndex++) {
                        var argumentValue = arguments[argIndex];
                        var argumentType = typeof argumentValue;
                        var formattedArgValue = argumentValue;
                        
                        // 格式化参数值
                        if (argumentValue === null) {
                            formattedArgValue = "null";
                            argumentType = "null";
                        } else if (argumentValue === undefined) {
                            formattedArgValue = "undefined";
                            argumentType = "undefined";
                        } else if (argumentType === "string" && argumentValue.length > 100) {
                            formattedArgValue = argumentValue.substring(0, 100) + "... (长度: " + argumentValue.length + ")";
                        } else if (argumentType === "object") {
                            try {
                                formattedArgValue = JSON.stringify(argumentValue);
                                if (formattedArgValue.length > 200) {
                                    formattedArgValue = formattedArgValue.substring(0, 200) + "... (对象被截断)";
                                }
                            } catch (jsonError) {
                                formattedArgValue = "[对象序列化失败]";
                            }
                        }
                        
                        outputContent += "\n  [" + argIndex + "] (" + argumentType + ") " + formattedArgValue;
                    }
                } else {
                    outputContent += "\n📥 无参数";
                }
                
                // 调用栈信息
                try {
                    var stackTrace = Java.use("android.util.Log").getStackTraceString(Java.use("java.lang.Throwable").$new());
                    outputContent += "\n📚 调用栈:\n" + stackTrace;
                } catch (stackError) {
                    outputContent += "\n❌ 无法获取调用栈: " + stackError.message;
                }
                
                // 调用原方法
                var methodResult = this[targetMethodName].apply(this, arguments);
                
                // 返回值信息
                var returnValueType = typeof methodResult;
                var formattedReturnValue = methodResult;
                
                if (methodResult === null) {
                    formattedReturnValue = "null";
                    returnValueType = "null";
                } else if (methodResult === undefined) {
                    formattedReturnValue = "undefined";
                    returnValueType = "undefined";
                } else if (returnValueType === "string" && methodResult.length > 200) {
                    formattedReturnValue = methodResult.substring(0, 200) + "... (长度: " + methodResult.length + ")";
                } else if (returnValueType === "object") {
                    try {
                        formattedReturnValue = JSON.stringify(methodResult);
                        if (formattedReturnValue.length > 300) {
                            formattedReturnValue = formattedReturnValue.substring(0, 300) + "... (对象被截断)";
                        }
                    } catch (jsonError) {
                        formattedReturnValue = "[对象序列化失败]";
                    }
                }
                
                outputContent += "\n📤 返回值 (" + returnValueType + "): " + formattedReturnValue;
                outputContent += "\n🏁 ===== 退出方法: " + fullyQualifiedMethodName + " =====";
                outputContent += "\n" + separatorLine;
                
                // 彩色输出（如果启用）
                if (enableColorOutput) {
                    var colorIndex = Math.floor(Math.random() * 7);
                    var colors = [Color.Red, Color.Yellow, Color.Green, Color.Cyan, Color.Blue, Color.Purple, Color.Gray];
                    LOG(outputContent, { c: colors[colorIndex] });
                } else {
                    LOG(outputContent, { c: Color.White });
                }
                
                return methodResult;
            };
        }
        
        LOG("✅ 高级追踪设置成功: " + fullyQualifiedMethodName, { c: Color.Green });
        return true;
        
    } catch (tracingError) {
        LOG("❌ 高级追踪设置失败: " + tracingError.message, { c: Color.Red });
        return false;
    }
}

/**
 * 批量 Hook 功能：根据白名单和黑名单批量追踪类方法
 * @param {string} whitelistPattern - 白名单模式（包含的关键字）
 * @param {string} blacklistPattern - 黑名单模式（排除的关键字）
 * @param {string} targetClassForLoader - 特定类名，用于切换 ClassLoader
 * @returns {boolean} 是否成功设置批量 Hook
 */
function batchHookWithFilters(whitelistPattern, blacklistPattern, targetClassForLoader) {
    try {
        LOG("🎯 开始批量 Hook，白名单: '" + whitelistPattern + "'，黑名单: '" + blacklistPattern + "'", { c: Color.Cyan });
        
        // 如果指定了目标类，尝试切换 ClassLoader
        if (targetClassForLoader) {
            LOG("🔍 搜索 ClassLoader 以加载类: " + targetClassForLoader, { c: Color.Yellow });
            var classLoaderFound = false;
            
            Java.enumerateClassLoaders({
                onMatch: function(classLoader) {
                    try {
                        if (classLoader.findClass(targetClassForLoader)) {
                            LOG("✅ 找到合适的 ClassLoader: " + classLoader, { c: Color.Green });
                            Java.classFactory.loader = classLoader;
                            classLoaderFound = true;
                            LOG("🔄 ClassLoader 切换成功", { c: Color.Green });
                        }
                    } catch (classLoaderError) {
                        // 继续尝试其他 ClassLoader
                    }
                },
                onComplete: function() {
                    if (!classLoaderFound) {
                        LOG("⚠️ 未找到包含目标类的 ClassLoader，使用默认 ClassLoader", { c: Color.Yellow });
                    }
                }
            });
        }
        
        // 枚举所有已加载的类
        var allLoadedClasses = Java.enumerateLoadedClassesSync();
        var matchingClasses = [];
        
        // 过滤匹配的类
        allLoadedClasses.forEach(function(className) {
            var includeClass = true;
            
            // 白名单检查
            if (whitelistPattern && whitelistPattern !== "$") {
                includeClass = className.indexOf(whitelistPattern) >= 0;
            }
            
            // 黑名单检查
            if (includeClass && blacklistPattern && blacklistPattern !== "$") {
                includeClass = className.indexOf(blacklistPattern) < 0;
            }
            
            if (includeClass) {
                matchingClasses.push(className);
            }
        });
        
        LOG("📋 找到 " + matchingClasses.length + " 个匹配的类", { c: Color.Cyan });
        
        var successfulHooks = 0;
        var failedHooks = 0;
        
        // 对每个匹配的类进行 Hook
        matchingClasses.forEach(function(className, classIndex) {
            try {
                LOG("🔨 Hook 类 [" + (classIndex + 1) + "/" + matchingClasses.length + "]: " + className, { c: Color.Blue });
                
                if (hookAllMethodsInJavaClass(className)) {
                    successfulHooks++;
                } else {
                    failedHooks++;
                }
                
            } catch (classHookError) {
                LOG("❌ Hook 类失败: " + className + " - " + classHookError.message, { c: Color.Red });
                failedHooks++;
            }
        });
        
        LOG("📊 批量 Hook 完成: 成功 " + successfulHooks + " 个，失败 " + failedHooks + " 个", { c: Color.Green });
        return successfulHooks > 0;
        
    } catch (batchHookError) {
        LOG("❌ 批量 Hook 失败: " + batchHookError.message, { c: Color.Red });
        return false;
    }
}

/**
 * Hook 应用的所有业务类（排除系统类）
 * @param {boolean} enableStrictFiltering - 是否启用严格过滤
 * @returns {boolean} 是否成功设置
 */
function hookAllApplicationClasses(enableStrictFiltering) {
    enableStrictFiltering = enableStrictFiltering || true;
    
    try {
        LOG("🚀 开始 Hook 所有应用业务类...", { c: Color.Cyan });
        
        var hookedClassCount = 0;
        var skippedClassCount = 0;
        
        Java.enumerateClassLoaders({
            onMatch: function(classLoader) {
                try {
                    var loaderString = classLoader.toString();
                    
                    // 只处理应用相关的 ClassLoader（包含 base.apk 但不包含 .jar）
                    if (loaderString.indexOf("base.apk") >= 0 && loaderString.indexOf(".jar") < 0) {
                        LOG("🎯 找到应用 ClassLoader: " + classLoader, { c: Color.Green });
                        
                        // 切换到应用的 ClassLoader
                        Java.classFactory.loader = classLoader;
                        
                        // 获取应用的所有类
                        var applicationClasses = extractApplicationClasses(classLoader, enableStrictFiltering);
                        
                        LOG("📋 从此 ClassLoader 中找到 " + applicationClasses.length + " 个应用类", { c: Color.Cyan });
                        
                        applicationClasses.forEach(function(className, classIndex) {
                            try {
                                if (enableStrictFiltering) {
                                    // 严格过滤：排除常见的系统和第三方库
                                    if (className.indexOf("android.") >= 0 ||
                                        className.indexOf("androidx.") >= 0 ||
                                        className.indexOf("java.") >= 0 ||
                                        className.indexOf("javax.") >= 0 ||
                                        className.indexOf("kotlin.") >= 0 ||
                                        className.indexOf("com.google.") >= 0 ||
                                        className.indexOf("org.apache.") >= 0) {
                                        skippedClassCount++;
                                        return;
                                    }
                                }
                                
                                LOG("🔨 Hook 应用类 [" + (classIndex + 1) + "/" + applicationClasses.length + "]: " + className, { c: Color.Blue });
                                
                                if (hookAllMethodsInJavaClass(className)) {
                                    hookedClassCount++;
                                }
                                
                            } catch (appClassHookError) {
                                LOG("❌ Hook 应用类失败: " + className + " - " + appClassHookError.message, { c: Color.Yellow });
                            }
                        });
                    }
                } catch (classLoaderProcessError) {
                    LOG("⚠️ 处理 ClassLoader 时出错: " + classLoaderProcessError.message, { c: Color.Yellow });
                }
            },
            onComplete: function() {
                LOG("📊 应用类 Hook 完成: 成功 Hook " + hookedClassCount + " 个类，跳过 " + skippedClassCount + " 个系统类", { c: Color.Green });
            }
        });
        
        return hookedClassCount > 0;
        
    } catch (hookAllError) {
        LOG("❌ Hook 所有应用类失败: " + hookAllError.message, { c: Color.Red });
        return false;
    }
}

/**
 * 从 ClassLoader 中提取应用类列表
 * @param {Object} classLoader - ClassLoader 实例
 * @param {boolean} enableFiltering - 是否启用过滤
 * @returns {Array<string>} 应用类名列表
 */
function extractApplicationClasses(classLoader, enableFiltering) {
    var applicationClasses = [];
    
    try {
        // 跳过 BootClassLoader
        if (classLoader.$className.toString().indexOf("java.lang.BootClassLoader") >= 0) {
            return applicationClasses;
        }
        
        var baseDexClassLoaderClass = Java.use("dalvik.system.BaseDexClassLoader");
        var pathClassLoader = Java.cast(classLoader, baseDexClassLoaderClass);
        
        var dexPathListClass = Java.use("dalvik.system.DexPathList");
        var dexPathList = Java.cast(pathClassLoader.pathList.value, dexPathListClass);
        
        var dexFileClass = Java.use("dalvik.system.DexFile");
        var dexElementClass = Java.use("dalvik.system.DexPathList$Element");
        
        for (var elementIndex = 0; elementIndex < dexPathList.dexElements.value.length; elementIndex++) {
            var dexElement = Java.cast(dexPathList.dexElements.value[elementIndex], dexElementClass);
            
            if (dexElement.dexFile.value) {
                var dexFile = Java.cast(dexElement.dexFile.value, dexFileClass);
                var cookie = dexFile.mCookie.value;
                
                // 处理不同 Android 版本的 Cookie
                if (dexFile.mInternalCookie.value) {
                    cookie = dexFile.mInternalCookie.value;
                }
                
                var classNameList = dexElement.dexFile.value.getClassNameList(cookie);
                
                for (var classIndex = 0; classIndex < classNameList.length; classIndex++) {
                    var currentClassName = classNameList[classIndex];
                    
                    if (enableFiltering) {
                        // 基本过滤：排除明显的系统类
                        if (currentClassName.indexOf("android.") < 0 &&
                            currentClassName.indexOf("androidx.") < 0 &&
                            currentClassName.indexOf("java.") < 0 &&
                            currentClassName.indexOf("javax.") < 0) {
                            applicationClasses.push(currentClassName);
                        }
                    } else {
                        applicationClasses.push(currentClassName);
                    }
                }
            }
        }
        
    } catch (extractError) {
        LOG("❌ 提取应用类失败: " + extractError.message, { c: Color.Red });
    }
    
    return applicationClasses;
}

/**
 * 获取安全的对象句柄
 * @param {Object} targetObject - 目标对象
 * @returns {Object|null} 对象句柄或 null
 */
function getSafeObjectHandle(targetObject) {
    try {
        if (targetObject.hasOwnProperty('$handle') && targetObject.$handle !== undefined) {
            return targetObject.$handle;
        }
        
        if (targetObject.hasOwnProperty('$h') && targetObject.$h !== undefined) {
            return targetObject.$h;
        }
        
        return null;
    } catch (handleError) {
        return null;
    }
}

/**
 * 安全的属性检查
 * @param {Object} targetObject - 目标对象
 * @param {string} propertyName - 属性名
 * @returns {boolean} 是否拥有该属性
 */
function hasSafeProperty(targetObject, propertyName) {
    try {
        return targetObject.hasOwnProperty(propertyName) || propertyName in targetObject;
    } catch (propertyError) {
        try {
            return targetObject.hasOwnProperty(propertyName);
        } catch (fallbackError) {
            return false;
        }
    }
}

// 导出主要功能函数
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        bypassTracerPidDetection: bypassTracerPidDetection,
        inspectObjectFields: inspectObjectFields,
        advancedMethodTracing: advancedMethodTracing,
        batchHookWithFilters: batchHookWithFilters,
        hookAllApplicationClasses: hookAllApplicationClasses,
        extractApplicationClasses: extractApplicationClasses,
        getSafeObjectHandle: getSafeObjectHandle,
        hasSafeProperty: hasSafeProperty
    };
}

// ===== Frida 全局导出 =====
try {
    // 这些函数需要在交互式环境中可直接调用
    global.bypassTracerPidDetection = bypassTracerPidDetection;
    global.inspectObjectFields = inspectObjectFields;
    global.advancedMethodTracing = advancedMethodTracing;
    global.batchHookWithFilters = batchHookWithFilters;
    global.hookAllApplicationClasses = hookAllApplicationClasses;
    // 非交互主用的工具函数可按需导出
    global.extractApplicationClasses = extractApplicationClasses;
    global.getSafeObjectHandle = getSafeObjectHandle;
    global.hasSafeProperty = hasSafeProperty;
    if (typeof LOG === 'function') {
        LOG("🧩 高级追踪工具已加载并导出全局函数", { c: Color.Green });
    }
} catch (_) { /* 忽略导出失败以避免初始化中断 */ }
