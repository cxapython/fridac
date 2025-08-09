// Frida Hook 常用定位招数大全
// 参考：https://blog.csdn.net/weixin_51111267/article/details/131712970

var Color = {
    RESET: "\x1b[39;49;00m", Black: "0;01", Blue: "4;01", Cyan: "6;01", Gray: "7;11", Green: "2;01", Purple: "5;01", Red: "1;01", Yellow: "3;01",
    Light: {
        Black: "0;11", Blue: "4;11", Cyan: "6;11", Gray: "7;01", Green: "2;11", Purple: "5;11", Red: "1;11", Yellow: "3;11"
    }
};

var LOG = function (input, kwargs) {
    kwargs = kwargs || {};
    var logLevel = kwargs['l'] || 'log', colorPrefix = '\x1b[3', colorSuffix = 'm';
    if (typeof input === 'object')
        input = JSON.stringify(input, null, kwargs['i'] ? 2 : null);
    if (kwargs['c'])
        input = colorPrefix + kwargs['c'] + colorSuffix + input + Color.RESET;
    console[logLevel](input);
};

// 打印调用栈的通用函数
function printStackTrace() {
    try {
        LOG(Java.use("android.util.Log").getStackTraceString(Java.use("java.lang.Exception").$new()), { c: Color.Gray });
    } catch (e) {
        LOG("打印调用栈失败: " + e.message, { c: Color.Red });
    }
}

// 1. Base64编码定位
function hookBase64(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    
    // 自动注册任务
    var taskId = null;
    if (typeof HookJobManager !== 'undefined') {
        taskId = HookJobManager.autoRegisterHook('hookBase64', [showStack]);
    }
    
    try {
        var base64 = Java.use("android.util.Base64");
        
        // Hook encodeToString方法
        base64.encodeToString.overload('[B', 'int').implementation = function (data, flags) {
            // 检查任务是否已被取消
            if (taskId && typeof HookJobManager !== 'undefined') {
                var job = HookJobManager.getJob(taskId);
                if (job && job.status === 'cancelled') {
                    // 任务已取消，静默执行原方法
                    return this.encodeToString(data, flags);
                }
                // 更新任务命中统计
                if (job && job.status === 'active') {
                    HookJobManager.updateAutoTaskHit(taskId, { executionTime: 1 });
                }
            }
            
            LOG("🔐 Base64.encodeToString被调用", { c: Color.Cyan });
            LOG("  原始数据: " + JSON.stringify(data), { c: Color.Yellow });
            
            var result = this.encodeToString(data, flags);
            LOG("  编码结果: " + result, { c: Color.Green });
            
            if (needStack) {
                printStackTrace();
            }
            return result;
        };
        
        // Hook decode方法
        base64.decode.overload('java.lang.String', 'int').implementation = function (str, flags) {
            // 检查任务是否已被取消
            if (taskId && typeof HookJobManager !== 'undefined') {
                var job = HookJobManager.getJob(taskId);
                if (job && job.status === 'cancelled') {
                    // 任务已取消，静默执行原方法
                    return this.decode(str, flags);
                }
                // 更新任务命中统计
                if (job && job.status === 'active') {
                    HookJobManager.updateAutoTaskHit(taskId, { executionTime: 1 });
                }
            }
            
            LOG("🔓 Base64.decode被调用", { c: Color.Cyan });
            LOG("  编码数据: " + str, { c: Color.Yellow });
            
            var result = this.decode(str, flags);
            LOG("  解码结果: " + JSON.stringify(result), { c: Color.Green });
            
            if (needStack) {
                printStackTrace();
            }
            return result;
        };
        
        LOG("✅ Base64 Hook已启用" + (taskId ? " (任务ID: #" + taskId + ")" : ""), { c: Color.Green });
        return taskId;
    } catch (e) {
        LOG("❌ Base64 Hook失败: " + e.message, { c: Color.Red });
        // 如果Hook失败，标记任务为失败状态
        if (taskId && typeof HookJobManager !== 'undefined') {
            var job = HookJobManager.getJob(taskId);
            if (job) {
                job.updateStatus('failed', e);
            }
        }
        return null;
    }
}

// 2. Toast显示定位
function hookToast(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    
    // 自动注册任务
    var taskId = null;
    if (typeof HookJobManager !== 'undefined') {
        taskId = HookJobManager.autoRegisterHook('hookToast', [showStack]);
    }
    
    try {
        var toast = Java.use("android.widget.Toast");
        
        toast.show.implementation = function() {
            // 检查任务是否已被取消
            if (taskId && typeof HookJobManager !== 'undefined') {
                var job = HookJobManager.getJob(taskId);
                if (job && job.status === 'cancelled') {
                    // 任务已取消，静默执行原方法
                    return this.show();
                }
                // 更新任务命中统计
                if (job && job.status === 'active') {
                    HookJobManager.updateAutoTaskHit(taskId, { executionTime: 1 });
                }
            }
            
            LOG("🍞 Toast.show被调用", { c: Color.Cyan });
            
            if (needStack) {
                printStackTrace();
            }
            return this.show();
        };
        
        LOG("✅ Toast Hook已启用" + (taskId ? " (任务ID: #" + taskId + ")" : ""), { c: Color.Green });
        return taskId;
    } catch (e) {
        LOG("❌ Toast Hook失败: " + e.message, { c: Color.Red });
        if (taskId && typeof HookJobManager !== 'undefined') {
            var job = HookJobManager.getJob(taskId);
            if (job) {
                job.updateStatus('failed', e);
            }
        }
        return null;
    }
}

// 3. JSONObject定位
function hookJSONObject(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    
    // 自动注册任务
    var taskId = null;
    if (typeof HookJobManager !== 'undefined') {
        taskId = HookJobManager.autoRegisterHook('hookJSONObject', [showStack]);
    }
    
    try {
        var jSONObject = Java.use("org.json.JSONObject");
        
        // Hook put方法
        jSONObject.put.overload('java.lang.String', 'java.lang.Object').implementation = function (key, value) {
            // 检查任务是否已被取消
            if (taskId && typeof HookJobManager !== 'undefined') {
                var job = HookJobManager.getJob(taskId);
                if (job && job.status === 'cancelled') {
                    // 任务已取消，静默执行原方法
                    return this.put(key, value);
                }
                // 更新任务命中统计
                if (job && job.status === 'active') {
                    HookJobManager.updateAutoTaskHit(taskId, { executionTime: 1 });
                }
            }
            
            LOG("📝 JSONObject.put被调用", { c: Color.Cyan });
            LOG("  Key: " + key, { c: Color.Yellow });
            LOG("  Value: " + value, { c: Color.Green });
            
            if (needStack) {
                printStackTrace();
            }
            return this.put(key, value);
        };
        
        // Hook getString方法
        jSONObject.getString.implementation = function (key) {
            // 检查任务是否已被取消
            if (taskId && typeof HookJobManager !== 'undefined') {
                var job = HookJobManager.getJob(taskId);
                if (job && job.status === 'cancelled') {
                    // 任务已取消，静默执行原方法
                    return this.getString(key);
                }
                // 更新任务命中统计
                if (job && job.status === 'active') {
                    HookJobManager.updateAutoTaskHit(taskId, { executionTime: 1 });
                }
            }
            
            LOG("📖 JSONObject.getString被调用", { c: Color.Cyan });
            LOG("  Key: " + key, { c: Color.Yellow });
            
            var result = this.getString(key);
            LOG("  Value: " + result, { c: Color.Green });
            
            if (needStack) {
                printStackTrace();
            }
            return result;
        };
        
        LOG("✅ JSONObject Hook已启用" + (taskId ? " (任务ID: #" + taskId + ")" : ""), { c: Color.Green });
        return taskId; // 返回任务ID
    } catch (e) {
        LOG("❌ JSONObject Hook失败: " + e.message, { c: Color.Red });
        // 如果Hook失败，标记任务为失败状态
        if (taskId && typeof HookJobManager !== 'undefined') {
            var job = HookJobManager.getJob(taskId);
            if (job) {
                job.updateStatus('failed', e);
            }
        }
        return null;
    }
}

// 4. HashMap定位（包含原有的findStrInMap功能）
function hookHashMap(targetKey, showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    var monitorAll = !targetKey; // 如果没有指定key，监控所有
    
    // 自动注册任务
    var taskId = null;
    if (typeof HookJobManager !== 'undefined') {
        taskId = HookJobManager.autoRegisterHook('hookHashMap', [targetKey, showStack]);
    }
    
    try {
        var hashMap = Java.use("java.util.HashMap");
        
        hashMap.put.implementation = function (key, value) {
            var keyStr = key ? key.toString() : "";
            var valueStr = value ? value.toString() : "";
            
            // 如果指定了targetKey，只显示匹配的；否则显示所有
            var shouldLog = monitorAll || (targetKey && keyStr.indexOf(targetKey) !== -1);
            
            if (shouldLog) {
                LOG("🗺️ HashMap.put被调用", { c: Color.Cyan });
                LOG("  Key: " + keyStr, { c: Color.Yellow });
                LOG("  Value: " + valueStr, { c: Color.Green });
                
                // 更新任务命中统计
                if (taskId && typeof HookJobManager !== 'undefined') {
                    HookJobManager.updateAutoTaskHit(taskId, { executionTime: 1 });
                }
                
                if (needStack) {
                    printStackTrace();
                }
            }
            
            return this.put(key, value);
        };
        
        // 同时监控LinkedHashMap
        try {
            var linkedHashMap = Java.use("java.util.LinkedHashMap");
            linkedHashMap.put.implementation = function (key, value) {
                var keyStr = key ? key.toString() : "";
                var valueStr = value ? value.toString() : "";
                
                var shouldLog = monitorAll || (targetKey && keyStr.indexOf(targetKey) !== -1);
                
                if (shouldLog) {
                    LOG("🗺️ LinkedHashMap.put被调用", { c: Color.Cyan });
                    LOG("  Key: " + keyStr, { c: Color.Yellow });
                    LOG("  Value: " + valueStr, { c: Color.Green });
                    
                    // 更新任务命中统计
                    if (taskId && typeof HookJobManager !== 'undefined') {
                        HookJobManager.updateAutoTaskHit(taskId, { executionTime: 1 });
                    }
                    
                    if (needStack) {
                        printStackTrace();
                    }
                }
                
                return this.put(key, value);
            };
        } catch (e) {
            LOG("LinkedHashMap hook失败: " + e.message, { c: Color.Red });
        }
        
        LOG("✅ HashMap Hook已启用" + (targetKey ? " (监控key: " + targetKey + ")" : " (监控所有)") + (taskId ? " (任务ID: #" + taskId + ")" : ""), { c: Color.Green });
        return taskId; // 返回任务ID
    } catch (e) {
        LOG("❌ HashMap Hook失败: " + e.message, { c: Color.Red });
        // 如果Hook失败，标记任务为失败状态
        if (taskId && typeof HookJobManager !== 'undefined') {
            var job = HookJobManager.getJob(taskId);
            if (job) {
                job.updateStatus('failed', e);
            }
        }
        return null;
    }
}

// 为了保持兼容性，保留原有的findStrInMap函数
function findStrInMap(key, showStack) {
    return hookHashMap(key, showStack);
}

// 5. EditText的getText方法定位
function hookEditText(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    
    // 自动注册任务
    var taskId = null;
    if (typeof HookJobManager !== 'undefined') {
        taskId = HookJobManager.autoRegisterHook('hookEditText', [showStack]);
    }
    
    try {
        var editText = Java.use("android.widget.EditText");
        
        editText.getText.overload().implementation = function () {
            // 检查任务是否已被取消
            if (taskId && typeof HookJobManager !== 'undefined') {
                var job = HookJobManager.getJob(taskId);
                if (job && job.status === 'cancelled') {
                    // 任务已取消，静默执行原方法
                    return this.getText();
                }
                // 更新任务命中统计
                if (job && job.status === 'active') {
                    HookJobManager.updateAutoTaskHit(taskId, { executionTime: 1 });
                }
            }
            
            var result = this.getText();
            result = Java.cast(result, Java.use("java.lang.CharSequence"));
            
            LOG("📝 EditText.getText被调用", { c: Color.Cyan });
            LOG("  内容: " + result.toString(), { c: Color.Green });
            
            if (needStack) {
                printStackTrace();
            }
            return result;
        };
        
        LOG("✅ EditText Hook已启用" + (taskId ? " (任务ID: #" + taskId + ")" : ""), { c: Color.Green });
        return taskId; // 返回任务ID
    } catch (e) {
        LOG("❌ EditText Hook失败: " + e.message, { c: Color.Red });
        // 如果Hook失败，标记任务为失败状态
        if (taskId && typeof HookJobManager !== 'undefined') {
            var job = HookJobManager.getJob(taskId);
            if (job) {
                job.updateStatus('failed', e);
            }
        }
        return null;
    }
}

// 6. ArrayList定位
function hookArrayList(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    
    try {
        var arrayList = Java.use("java.util.ArrayList");
        
        // Hook add方法
        arrayList.add.overload('java.lang.Object').implementation = function (obj) {
            LOG("📋 ArrayList.add被调用", { c: Color.Cyan });
            LOG("  添加对象: " + obj, { c: Color.Green });
            
            if (needStack) {
                printStackTrace();
            }
            return this.add(obj);
        };
        
        // Hook get方法
        arrayList.get.implementation = function (index) {
            var result = this.get(index);
            LOG("📋 ArrayList.get被调用", { c: Color.Cyan });
            LOG("  索引: " + index, { c: Color.Yellow });
            LOG("  值: " + result, { c: Color.Green });
            
            if (needStack) {
                printStackTrace();
            }
            return result;
        };
        
        LOG("✅ ArrayList Hook已启用", { c: Color.Green });
    } catch (e) {
        LOG("❌ ArrayList Hook失败: " + e.message, { c: Color.Red });
    }
}

// 7. System.loadLibrary定位
function hookLoadLibrary(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    
    // 自动注册任务
    var taskId = null;
    if (typeof HookJobManager !== 'undefined') {
        taskId = HookJobManager.autoRegisterHook('hookLoadLibrary', [showStack]);
    }
    
    try {
        var system = Java.use("java.lang.System");
        
        system.loadLibrary.implementation = function (libname) {
            // 检查任务是否已被取消
            if (taskId && typeof HookJobManager !== 'undefined') {
                var job = HookJobManager.getJob(taskId);
                if (job && job.status === 'cancelled') {
                    // 任务已取消，静默执行原方法
                    return this.loadLibrary(libname);
                }
                // 更新任务命中统计
                if (job && job.status === 'active') {
                    HookJobManager.updateAutoTaskHit(taskId, { executionTime: 1 });
                }
            }
            
            LOG("📚 System.loadLibrary被调用", { c: Color.Cyan });
            LOG("  库名: " + libname, { c: Color.Green });
            
            if (needStack) {
                printStackTrace();
            }
            return this.loadLibrary(libname);
        };
        
        system.load.implementation = function (filename) {
            // 检查任务是否已被取消
            if (taskId && typeof HookJobManager !== 'undefined') {
                var job = HookJobManager.getJob(taskId);
                if (job && job.status === 'cancelled') {
                    // 任务已取消，静默执行原方法
                    return this.load(filename);
                }
                // 更新任务命中统计
                if (job && job.status === 'active') {
                    HookJobManager.updateAutoTaskHit(taskId, { executionTime: 1 });
                }
            }
            
            LOG("📚 System.load被调用", { c: Color.Cyan });
            LOG("  文件路径: " + filename, { c: Color.Green });
            
            if (needStack) {
                printStackTrace();
            }
            return this.load(filename);
        };
        
        LOG("✅ System.loadLibrary Hook已启用" + (taskId ? " (任务ID: #" + taskId + ")" : ""), { c: Color.Green });
        return taskId; // 返回任务ID
    } catch (e) {
        LOG("❌ System.loadLibrary Hook失败: " + e.message, { c: Color.Red });
        // 如果Hook失败，标记任务为失败状态
        if (taskId && typeof HookJobManager !== 'undefined') {
            var job = HookJobManager.getJob(taskId);
            if (job) {
                job.updateStatus('failed', e);
            }
        }
        return null;
    }
}

// 8. NewStringUTF定位（JNI函数）
function hookNewStringUTF(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    
    try {
        var newStringUTF = Module.findExportByName("libart.so", "_ZN3art3JNI12NewStringUTFEP7_JNIEnvPKc");
        if (!newStringUTF) {
            newStringUTF = Module.findExportByName("libdvm.so", "NewStringUTF");
        }
        
        if (newStringUTF) {
            Interceptor.attach(newStringUTF, {
                onEnter: function(args) {
                    var str = Memory.readCString(args[1]);
                    LOG("🔤 NewStringUTF被调用", { c: Color.Cyan });
                    LOG("  字符串: " + str, { c: Color.Green });
                    
                    if (needStack) {
                        LOG("调用栈:", { c: Color.Gray });
                        LOG(Thread.backtrace(this.context, Backtracer.ACCURATE)
                            .map(DebugSymbol.fromAddress).join('\n'), { c: Color.Gray });
                    }
                }
            });
            LOG("✅ NewStringUTF Hook已启用", { c: Color.Green });
        } else {
            LOG("❌ 找不到NewStringUTF函数", { c: Color.Red });
        }
    } catch (e) {
        LOG("❌ NewStringUTF Hook失败: " + e.message, { c: Color.Red });
    }
}

// 9. 文件路径定位
function hookFileOperations(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    
    try {
        var file = Java.use("java.io.File");
        var fileInputStream = Java.use("java.io.FileInputStream");
        var fileOutputStream = Java.use("java.io.FileOutputStream");
        
        // Hook File构造函数
        file.$init.overload('java.lang.String').implementation = function (pathname) {
            LOG("📁 File创建", { c: Color.Cyan });
            LOG("  路径: " + pathname, { c: Color.Green });
            
            if (needStack) {
                printStackTrace();
            }
            return this.$init(pathname);
        };
        
        // Hook FileInputStream
        fileInputStream.$init.overload('java.lang.String').implementation = function (name) {
            LOG("📖 FileInputStream打开", { c: Color.Cyan });
            LOG("  文件: " + name, { c: Color.Green });
            
            if (needStack) {
                printStackTrace();
            }
            return this.$init(name);
        };
        
        // Hook FileOutputStream
        fileOutputStream.$init.overload('java.lang.String').implementation = function (name) {
            LOG("📝 FileOutputStream创建", { c: Color.Cyan });
            LOG("  文件: " + name, { c: Color.Green });
            
            if (needStack) {
                printStackTrace();
            }
            return this.$init(name);
        };
        
        LOG("✅ 文件操作 Hook已启用", { c: Color.Green });
    } catch (e) {
        LOG("❌ 文件操作 Hook失败: " + e.message, { c: Color.Red });
    }
}

// 10. Log输出定位
function hookLog(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    
    // 自动注册任务
    var taskId = null;
    if (typeof HookJobManager !== 'undefined') {
        taskId = HookJobManager.autoRegisterHook('hookLog', [showStack]);
    }
    
    try {
        var log = Java.use("android.util.Log");
        
        // Hook各种级别的Log
        var logMethods = ['d', 'e', 'i', 'v', 'w'];
            logMethods.forEach(function(method) {
            // 保存原始实现
            if (taskId && typeof HookJobManager !== 'undefined') {
                var job = HookJobManager.getJob(taskId);
                if (job) {
                    var originalLogMethod = log[method].overload('java.lang.String', 'java.lang.String').implementation;
                    job.originalImplementations.push({
                        target: log[method].overload('java.lang.String', 'java.lang.String'),
                        original: originalLogMethod,
                        description: "android.util.Log." + method + "(String,String)"
                    });
                }
            }
            
            log[method].overload('java.lang.String', 'java.lang.String').implementation = function (tag, msg) {
                // 若任务已取消则静默执行原方法
                if (taskId && typeof HookJobManager !== 'undefined') {
                    var jobLog = HookJobManager.getJob(taskId);
                    if (jobLog && jobLog.status === 'cancelled') {
                        return this[method](tag, msg);
                    }
                    if (jobLog && jobLog.status === 'active') {
                        HookJobManager.updateAutoTaskHit(taskId, { executionTime: 1 });
                    }
                }

                LOG("📜 Log." + method + "被调用", { c: Color.Cyan });
                LOG("  Tag: " + tag, { c: Color.Yellow });
                LOG("  Message: " + msg, { c: Color.Green });
                
                if (needStack) {
                    printStackTrace();
                }
                return this[method](tag, msg);
            };
        });
        
        LOG("✅ Log Hook已启用" + (taskId ? " (任务ID: #" + taskId + ")" : ""), { c: Color.Green });
        return taskId; // 返回任务ID
    } catch (e) {
        LOG("❌ Log Hook失败: " + e.message, { c: Color.Red });
        // 如果Hook失败，标记任务为失败状态
        if (taskId && typeof HookJobManager !== 'undefined') {
            var job = HookJobManager.getJob(taskId);
            if (job) {
                job.updateStatus('failed', e);
            }
        }
        return null;
    }
}

// 11. URL请求定位
function hookURL(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    
    // 自动注册任务
    var taskId = null;
    if (typeof HookJobManager !== 'undefined') {
        taskId = HookJobManager.autoRegisterHook('hookURL', [showStack]);
    }
    
    try {
        var url = Java.use("java.net.URL");
        var httpURLConnection = Java.use("java.net.HttpURLConnection");
        
        // 保存原始implementation到任务管理器
        if (taskId && typeof HookJobManager !== 'undefined') {
            var job = HookJobManager.getJob(taskId);
            if (job) {
                // 保存URL.$init原始实现
                var originalUrlInit = url.$init.overload('java.lang.String').implementation;
                job.originalImplementations.push({
                    target: url.$init.overload('java.lang.String'),
                    original: originalUrlInit,
                    description: "java.net.URL.$init(String)"
                });
            }
        }
        
        // Hook URL构造函数
        url.$init.overload('java.lang.String').implementation = function (spec) {
            // 若任务已取消则静默执行原方法
            if (taskId && typeof HookJobManager !== 'undefined') {
                var job = HookJobManager.getJob(taskId);
                if (job && job.status === 'cancelled') {
                    return this.$init(spec);
                }
                if (job && job.status === 'active') {
                    HookJobManager.updateAutoTaskHit(taskId, { executionTime: 1 });
                }
            }
            
            LOG("🌐 URL创建", { c: Color.Cyan });
            LOG("  URL: " + spec, { c: Color.Green });
            
            if (needStack) {
                printStackTrace();
            }
            return this.$init(spec);
        };
        
        // Hook HttpURLConnection
        try {
            // 保存HttpURLConnection.getResponseCode原始实现
            if (taskId && typeof HookJobManager !== 'undefined') {
                var job = HookJobManager.getJob(taskId);
                if (job) {
                    var originalGetResponseCode = httpURLConnection.getResponseCode.implementation;
                    job.originalImplementations.push({
                        target: httpURLConnection.getResponseCode,
                        original: originalGetResponseCode,
                        description: "java.net.HttpURLConnection.getResponseCode()"
                    });
                }
            }
            
            httpURLConnection.getResponseCode.implementation = function () {
                // 若任务已取消则静默执行原方法
                if (taskId && typeof HookJobManager !== 'undefined') {
                    var job2 = HookJobManager.getJob(taskId);
                    if (job2 && job2.status === 'cancelled') {
                        return this.getResponseCode();
                    }
                    if (job2 && job2.status === 'active') {
                        HookJobManager.updateAutoTaskHit(taskId, { executionTime: 1 });
                    }
                }
                
                var result = this.getResponseCode();
                LOG("🌐 HTTP请求", { c: Color.Cyan });
                LOG("  URL: " + this.getURL().toString(), { c: Color.Yellow });
                LOG("  响应码: " + result, { c: Color.Green });
                
                if (needStack) {
                    printStackTrace();
                }
                return result;
            };
        } catch (e) {
            LOG("HttpURLConnection hook部分失败: " + e.message, { c: Color.Red });
        }
        
        LOG("✅ URL Hook已启用" + (taskId ? " (任务ID: #" + taskId + ")" : ""), { c: Color.Green });
        return taskId; // 返回任务ID
    } catch (e) {
        LOG("❌ URL Hook失败: " + e.message, { c: Color.Red });
        // 如果Hook失败，标记任务为失败状态
        if (taskId && typeof HookJobManager !== 'undefined') {
            var job = HookJobManager.getJob(taskId);
            if (job) {
                job.updateStatus('failed', e);
            }
        }
        return null;
    }
}

// 一键启用所有Hook
function enableAllHooks(showStack) {
    showStack = showStack || 0;
    
    LOG("🚀 启用所有定位Hook...", { c: Color.Cyan });
    
    hookBase64(showStack);
    hookToast(showStack);
    hookJSONObject(showStack);
    hookHashMap(null, showStack); // 监控所有HashMap
    hookEditText(showStack);
    hookArrayList(showStack);
    hookLoadLibrary(showStack);
    hookNewStringUTF(showStack);
    hookFileOperations(showStack);
    hookLog(showStack);
    hookURL(showStack);
    
    LOG("🎉 所有定位Hook已启用!", { c: Color.Green });
}

// 导出函数供全局使用
global.hookBase64 = hookBase64;
global.hookToast = hookToast;
global.hookJSONObject = hookJSONObject;
global.hookHashMap = hookHashMap;
global.findStrInMap = findStrInMap; // 保持兼容性
global.hookEditText = hookEditText;
global.hookArrayList = hookArrayList;
global.hookLoadLibrary = hookLoadLibrary;
global.hookNewStringUTF = hookNewStringUTF;
global.hookFileOperations = hookFileOperations;
global.hookLog = hookLog;
global.hookURL = hookURL;
global.enableAllHooks = enableAllHooks;

LOG("📍 Frida定位工具集已加载完成!", { c: Color.Green });
