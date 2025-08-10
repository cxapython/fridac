/**
 * fridacli 定位Hook工具集 - 新版本 (无旧任务管理系统)
 * 专门用于定位特定组件和API调用的Hook工具
 * 
 * 特点：
 * - 移除了所有旧的HookJobManager依赖
 * - 简化的Hook实现
 * - 保持所有核心功能
 */

// 基础工具函数
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
        var text = (message === null || typeof message === 'undefined') ? '' : String(message);
        send(text);
    } catch (e) {
        try { send(String(message)); } catch (_) {}
    }
}

function printStackTrace() {
    try {
        var exception = Java.use("java.lang.Exception").$new();
        var trace = exception.getStackTrace();
        LOG("📚 调用堆栈:", { c: Color.Cyan });
        
        for (var i = 0; i < Math.min(trace.length, 8); i++) {
            var element = trace[i].toString();
            if (element.indexOf("java.lang.Exception") === -1 &&
                element.indexOf("android.util.Log") === -1 &&
                element.indexOf("dalvik.system") === -1) {
                LOG("📍 " + element, { c: Color.Gray });
            }
        }
    } catch (e) {
        LOG("⚠️ 无法获取堆栈信息: " + e.message, { c: Color.Yellow });
    }
}

// ===== Hook函数实现 =====

// 1. Base64编码定位
function hookBase64(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    
    Java.perform(function() {
        try {
            var base64 = Java.use("android.util.Base64");
            
            // Hook encodeToString方法
            base64.encodeToString.overload('[B', 'int').implementation = function (data, flags) {
                LOG("🔐 Base64.encodeToString被调用", { c: Color.Cyan });
                LOG("  原始数据长度: " + data.length + " bytes", { c: Color.Yellow });
                
                var result = this.encodeToString(data, flags);
                LOG("  编码结果: " + result, { c: Color.Green });
                
                if (needStack) {
                    printStackTrace();
                }
                return result;
            };
            
            // Hook decode方法  
            base64.decode.overload('java.lang.String', 'int').implementation = function(str, flags) {
                LOG("🔓 Base64.decode被调用", { c: Color.Cyan });
                LOG("  输入字符串: " + str, { c: Color.Yellow });
                
                var result = this.decode(str, flags);
                LOG("  解码结果长度: " + result.length + " bytes", { c: Color.Green });
                
                if (needStack) {
                    printStackTrace();
                }
                return result;
            };
            
            LOG("✅ Base64 Hook已启用", { c: Color.Green });
            
        } catch (error) {
            LOG("❌ Base64 Hook失败: " + error.message, { c: Color.Red });
        }
    });
}

// 2. Toast消息定位
function hookToast(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    
    Java.perform(function() {
        try {
            var Toast = Java.use("android.widget.Toast");
            
            Toast.makeText.overload('android.content.Context', 'java.lang.CharSequence', 'int').implementation = function(context, text, duration) {
                LOG("🍞 Toast.makeText被调用", { c: Color.Cyan });
                LOG("  消息内容: " + text, { c: Color.Yellow });
                LOG("  显示时长: " + duration, { c: Color.White });
                
                if (needStack) {
                    printStackTrace();
                }
                
                return this.makeText(context, text, duration);
            };
            
            LOG("✅ Toast Hook已启用", { c: Color.Green });
            
        } catch (error) {
            LOG("❌ Toast Hook失败: " + error.message, { c: Color.Red });
        }
    });
}

// 3. JSON对象定位
function hookJSONObject(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    
    Java.perform(function() {
        try {
            var JSONObject = Java.use("org.json.JSONObject");
            
            JSONObject.toString.overload().implementation = function() {
                var result = this.toString();
                LOG("📄 JSONObject.toString被调用", { c: Color.Cyan });
                LOG("  JSON内容: " + result, { c: Color.Yellow });
                
                if (needStack) {
                    printStackTrace();
                }
                
                return result;
            };
            
            LOG("✅ JSONObject Hook已启用", { c: Color.Green });
            
        } catch (error) {
            LOG("❌ JSONObject Hook失败: " + error.message, { c: Color.Red });
        }
    });
}

// 4. HashMap操作定位
function hookHashMap(targetKey, showStack) {
    targetKey = targetKey || "";
    showStack = showStack || 0;
    var needStack = showStack === 1;
    
    Java.perform(function() {
        try {
            var HashMap = Java.use("java.util.HashMap");
            
            HashMap.put.implementation = function(key, value) {
                var keyStr = key ? key.toString() : "null";
                var valueStr = value ? value.toString() : "null";
                
                // 如果指定了目标key，只记录匹配的
                if (targetKey && keyStr.indexOf(targetKey) !== -1) {
                    LOG("🗝️ HashMap.put [匹配] " + keyStr + " = " + valueStr, { c: Color.Cyan });
                    if (needStack) {
                        printStackTrace();
                    }
                } else if (!targetKey) {
                    LOG("🗝️ HashMap.put " + keyStr + " = " + valueStr, { c: Color.Cyan });
                    if (needStack) {
                        printStackTrace();
                    }
                }
                
                return this.put(key, value);
            };
            
            LOG("✅ HashMap Hook已启用" + (targetKey ? " (过滤: " + targetKey + ")" : ""), { c: Color.Green });
            
        } catch (error) {
            LOG("❌ HashMap Hook失败: " + error.message, { c: Color.Red });
        }
    });
}

// 5. EditText输入定位
function hookEditText(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    
    Java.perform(function() {
        try {
            var EditText = Java.use("android.widget.EditText");
            
            EditText.setText.overload('java.lang.CharSequence').implementation = function(text) {
                LOG("✏️ EditText.setText被调用", { c: Color.Cyan });
                LOG("  设置文本: " + text, { c: Color.Yellow });
                
                if (needStack) {
                    printStackTrace();
                }
                
                return this.setText(text);
            };
            
            LOG("✅ EditText Hook已启用", { c: Color.Green });
            
        } catch (error) {
            LOG("❌ EditText Hook失败: " + error.message, { c: Color.Red });
        }
    });
}

// 6. 日志定位
function hookLog(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    
    Java.perform(function() {
        try {
            var Log = Java.use("android.util.Log");
            
            // Hook各种级别的日志
            Log.d.overload('java.lang.String', 'java.lang.String').implementation = function(tag, msg) {
                LOG("📜 Log.d被调用", { c: Color.Cyan });
                LOG("  Tag: " + tag, { c: Color.White });
                LOG("  Message: " + msg, { c: Color.White });
                
                if (needStack) {
                    printStackTrace();
                }
                
                return this.d(tag, msg);
            };
            
            Log.i.overload('java.lang.String', 'java.lang.String').implementation = function(tag, msg) {
                LOG("📜 Log.i被调用", { c: Color.Cyan });
                LOG("  Tag: " + tag, { c: Color.White });
                LOG("  Message: " + msg, { c: Color.White });
                
                if (needStack) {
                    printStackTrace();
                }
                
                return this.i(tag, msg);
            };
            
            LOG("✅ Log Hook已启用", { c: Color.Green });
            
        } catch (error) {
            LOG("❌ Log Hook失败: " + error.message, { c: Color.Red });
        }
    });
}

// 7. ArrayList定位
function hookArrayList(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    
    Java.perform(function() {
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
            
        } catch (error) {
            LOG("❌ ArrayList Hook失败: " + error.message, { c: Color.Red });
        }
    });
}

// 8. System.loadLibrary定位
function hookLoadLibrary(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    
    Java.perform(function() {
        try {
            var system = Java.use("java.lang.System");
            
            system.loadLibrary.implementation = function (libname) {
                LOG("🔗 System.loadLibrary被调用", { c: Color.Cyan });
                LOG("  库名: " + libname, { c: Color.Yellow });
                
                if (needStack) {
                    printStackTrace();
                }
                
                return this.loadLibrary(libname);
            };
            
            LOG("✅ LoadLibrary Hook已启用", { c: Color.Green });
            
        } catch (error) {
            LOG("❌ LoadLibrary Hook失败: " + error.message, { c: Color.Red });
        }
    });
}

// 9. JNI NewStringUTF定位
function hookNewStringUTF(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    
    // 这是一个Native Hook，需要Native支持
    try {
        var newStringUTF = Module.findExportByName("libart.so", "_ZN3art3JNI12NewStringUTFEP7_JNIEnvPKc");
        if (!newStringUTF) {
            newStringUTF = Module.findExportByName("libdvm.so", "NewStringUTF");
        }
        
        if (newStringUTF) {
            Interceptor.attach(newStringUTF, {
                onEnter: function(args) {
                    var str = Memory.readUtf8String(args[1]);
                    LOG("🔤 JNI NewStringUTF被调用", { c: Color.Cyan });
                    LOG("  字符串: " + str, { c: Color.Yellow });
                    
                    if (needStack) {
                        LOG("📚 Native调用栈:", { c: Color.Cyan });
                        console.log(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n'));
                    }
                }
            });
            
            LOG("✅ NewStringUTF Hook已启用", { c: Color.Green });
        } else {
            LOG("❌ 未找到NewStringUTF函数", { c: Color.Red });
        }
        
    } catch (error) {
        LOG("❌ NewStringUTF Hook失败: " + error.message, { c: Color.Red });
    }
}

// 10. 文件操作定位
function hookFileOperations(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    
    Java.perform(function() {
        try {
            var file = Java.use("java.io.File");
            
            // Hook exists方法
            file.exists.implementation = function() {
                var result = this.exists();
                LOG("📁 File.exists被调用", { c: Color.Cyan });
                LOG("  文件路径: " + this.getAbsolutePath(), { c: Color.Yellow });
                LOG("  存在: " + result, { c: Color.Green });
                
                if (needStack) {
                    printStackTrace();
                }
                return result;
            };
            
            // Hook createNewFile方法
            file.createNewFile.implementation = function() {
                LOG("📁 File.createNewFile被调用", { c: Color.Cyan });
                LOG("  文件路径: " + this.getAbsolutePath(), { c: Color.Yellow });
                
                if (needStack) {
                    printStackTrace();
                }
                return this.createNewFile();
            };
            
            LOG("✅ File Operations Hook已启用", { c: Color.Green });
            
        } catch (error) {
            LOG("❌ File Operations Hook失败: " + error.message, { c: Color.Red });
        }
    });
}

// 11. URL创建定位
function hookURL(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    
    Java.perform(function() {
        try {
            var URL = Java.use("java.net.URL");
            
            URL.$init.overload('java.lang.String').implementation = function(spec) {
                LOG("🌐 URL创建", { c: Color.Cyan });
                LOG("  URL: " + spec, { c: Color.Yellow });
                
                if (needStack) {
                    printStackTrace();
                }
                
                return this.$init(spec);
            };
            
            LOG("✅ URL Hook已启用", { c: Color.Green });
            
        } catch (error) {
            LOG("❌ URL Hook失败: " + error.message, { c: Color.Red });
        }
    });
}

// ===== 有限导出 (仅工具函数) =====
// Hook函数不再全局导出，只能通过任务管理系统调用

// 导出工具函数
global.LOG = LOG;
global.Color = Color;
global.printStackTrace = printStackTrace;

// 为任务系统提供Hook函数引用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        hookBase64: hookBase64,
        hookToast: hookToast,
        hookJSONObject: hookJSONObject,
        hookHashMap: hookHashMap,
        hookEditText: hookEditText,
        hookLog: hookLog,
        hookURL: hookURL
    };
}

LOG("📍 Frida定位工具集已加载完成 (新版本)!", { c: Color.Green });