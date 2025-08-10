"""
fridacli 脚本模板系统
将现有的Hook函数转换为独立的脚本模板
保持所有核心逻辑不变，只是封装为独立Script
"""

import os
from typing import Dict, Any, Optional
from .task_manager import TaskType

class ScriptTemplateEngine:
    """
    脚本模板引擎
    
    负责生成独立的Frida脚本，每个脚本包含：
    1. 完整的Hook逻辑 (保持原有函数不变)
    2. 基础工具函数 (LOG, Color等)
    3. 任务通信机制
    """
    
    def __init__(self, base_script_dir: str):
        """
        初始化模板引擎
        
        Args:
            base_script_dir: 基础脚本目录路径
        """
        self.base_script_dir = base_script_dir
        self.base_functions = self._load_base_functions()
    
    def _load_base_functions(self) -> str:
        """
        加载基础工具函数
        
        Returns:
            基础函数的JavaScript代码
        """
        try:
            # 读取基础LOG函数和工具
            base_files = [
                'frida_common_new.js',  # 包含LOG, Color等基础函数 (新版本)
            ]
            
            base_code = ""
            for filename in base_files:
                filepath = os.path.join(self.base_script_dir, filename)
                if os.path.exists(filepath):
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()
                        # 提取基础工具函数部分 (LOG, Color, printStack等)
                        base_code += self._extract_utility_functions(content)
            
            # 添加任务通信函数
            base_code += self._get_task_communication_functions()
            
            return base_code
            
        except Exception as e:
            # 如果读取失败，使用最小化的基础函数
            return self._get_minimal_base_functions()
    
    def _extract_utility_functions(self, script_content: str) -> str:
        """
        从脚本中提取工具函数
        
        Args:
            script_content: 完整脚本内容
            
        Returns:
            工具函数部分
        """
        # 提取关键的工具函数
        utility_functions = []
        
        # 查找LOG函数定义
        if 'function LOG(' in script_content:
            start = script_content.find('function LOG(')
            if start != -1:
                # 查找函数结束
                bracket_count = 0
                in_function = False
                end = start
                for i, char in enumerate(script_content[start:], start):
                    if char == '{':
                        bracket_count += 1
                        in_function = True
                    elif char == '}':
                        bracket_count -= 1
                        if in_function and bracket_count == 0:
                            end = i + 1
                            break
                utility_functions.append(script_content[start:end])
        
        # 查找Color对象定义
        if 'var Color = {' in script_content:
            start = script_content.find('var Color = {')
            if start != -1:
                end = script_content.find('};', start) + 2
                utility_functions.append(script_content[start:end])
        
        # 查找printStack函数
        if 'function printStack(' in script_content:
            start = script_content.find('function printStack(')
            if start != -1:
                bracket_count = 0
                in_function = False
                end = start
                for i, char in enumerate(script_content[start:], start):
                    if char == '{':
                        bracket_count += 1
                        in_function = True
                    elif char == '}':
                        bracket_count -= 1
                        if in_function and bracket_count == 0:
                            end = i + 1
                            break
                utility_functions.append(script_content[start:end])
        
        return '\n\n'.join(utility_functions)
    
    def _get_minimal_base_functions(self) -> str:
        """
        获取最小化的基础函数 (备用方案)
        
        Returns:
            最小化基础函数代码
        """
        return '''
// 基础工具函数 (最小化版本)
var Color = {
    Red: "\\x1b[31m",
    Green: "\\x1b[32m", 
    Yellow: "\\x1b[33m",
    Blue: "\\x1b[34m",
    Cyan: "\\x1b[36m",
    White: "\\x1b[37m",
    Gray: "\\x1b[90m",
    Reset: "\\x1b[0m"
};

function LOG(message, options) {
    options = options || {};
    var color = options.c || Color.White;
    var output = color + message + Color.Reset;
    console.log(output);
    
    // 发送给任务管理器统计
    if (typeof TASK_ID !== 'undefined') {
        send({
            type: 'task_hit',
            task_id: TASK_ID,
            message: message,
            timestamp: Date.now()
        });
    }
}

function printStack() {
    try {
        var stack = Java.use("android.util.Log").getStackTraceString(Java.use("java.lang.Exception").$new());
        var lines = stack.split("\\n");
        LOG("📚 调用堆栈:", { c: Color.Cyan });
        for (var i = 0; i < Math.min(lines.length, 8); i++) {
            if (lines[i].trim()) {
                LOG("📍 " + lines[i].trim(), { c: Color.Gray });
            }
        }
    } catch (e) {
        LOG("⚠️ 无法获取堆栈信息: " + e.message, { c: Color.Yellow });
    }
}
'''
    
    def _get_task_communication_functions(self) -> str:
        """
        获取任务通信函数
        
        Returns:
            任务通信函数代码
        """
        return '''
// 任务通信函数
function notifyTaskHit(details) {
    if (typeof TASK_ID !== 'undefined') {
        send({
            type: 'task_hit',
            task_id: TASK_ID,
            details: details || {},
            timestamp: Date.now()
        });
    }
}

function notifyTaskError(error) {
    if (typeof TASK_ID !== 'undefined') {
        send({
            type: 'task_error',
            task_id: TASK_ID,
            error: error.toString(),
            timestamp: Date.now()
        });
    }
}
'''
    
    def generate_method_hook_script(self, class_name: str, method_name: str, 
                                  options: Dict[str, Any], task_id: int) -> str:
        """
        生成方法Hook脚本
        
        Args:
            class_name: 类名
            method_name: 方法名
            options: Hook选项
            task_id: 任务ID
            
        Returns:
            完整的脚本代码
        """
        show_stack = options.get('show_stack', False)
        custom_return = options.get('custom_return_value', None)
        
        # 避免在f-string中使用反斜杠 (Python 3.6兼容性)
        newline_char = '\n'
        
        script = f'''
// 任务ID (用于通信)
var TASK_ID = {task_id};

{self.base_functions}

// ===== 方法Hook核心逻辑 =====
Java.perform(function() {{
    try {{
        var targetClass = null;
        
        // 尝试加载类 (支持ClassLoader搜索)
        try {{
            targetClass = Java.use("{class_name}");
        }} catch (error) {{
            if (error.message.includes("ClassNotFoundException")) {{
                LOG("❌ 类未在默认ClassLoader中找到，搜索其他ClassLoader...", {{ c: Color.Yellow }});
                
                // 搜索其他ClassLoader (保持原有逻辑)
                var foundClass = null;
                Java.enumerateClassLoadersSync().forEach(function(loader) {{
                    try {{
                        var factory = Java.ClassFactory.get(loader);
                        foundClass = factory.use("{class_name}");
                        if (foundClass) {{
                            targetClass = foundClass;
                            LOG("🎯 成功使用自定义ClassLoader加载类", {{ c: Color.Green }});
                            return;
                        }}
                    }} catch (e) {{
                        // 忽略加载失败
                    }}
                }});
                
                if (!targetClass) {{
                    LOG("❌ 在所有ClassLoader中都未找到类: {class_name}", {{ c: Color.Red }});
                    notifyTaskError(new Error("Class not found: {class_name}"));
                    return;
                }}
            }} else {{
                throw error;
            }}
        }}
        
        // Hook方法 (保持原有逻辑)
        var fullMethodName = "{class_name}.{method_name}";
        LOG("🎯 正在Hook方法: " + fullMethodName, {{ c: Color.Cyan }});
        
        targetClass.{method_name}.implementation = function() {{
            LOG("\\n*** 进入 " + fullMethodName, {{ c: Color.Green }});
            
            // 显示调用栈
            {f"printStack();" if show_stack else ""}
            
            // 打印参数
            if (arguments.length > 0) {{
                LOG("📥 参数:", {{ c: Color.Blue }});
                for (var i = 0; i < arguments.length; i++) {{
                    LOG("  arg[" + i + "]: " + arguments[i], {{ c: Color.White }});
                }}
            }}
            
            // 调用原方法
            var retval = this.{method_name}.apply(this, arguments);
            
            // 自定义返回值
            {f"retval = {custom_return};" if custom_return is not None else ""}
            
            // 打印返回值
            LOG("📤 返回值: " + retval, {{ c: Color.Blue }});
            LOG("🏁 退出 " + fullMethodName + "{newline_char}", {{ c: Color.Green }});
            
            // 通知任务命中
            notifyTaskHit({{
                method: fullMethodName,
                args_count: arguments.length,
                return_value: retval ? retval.toString() : "null"
            }});
            
            return retval;
        }};
        
        LOG("✅ 方法Hook设置成功: " + fullMethodName, {{ c: Color.Green }});
        
    }} catch (error) {{
        LOG("❌ Hook设置失败: " + error.message, {{ c: Color.Red }});
        notifyTaskError(error);
    }}
}});
'''
        return script
    
    def generate_class_hook_script(self, class_name: str, options: Dict[str, Any], 
                                 task_id: int) -> str:
        """
        生成类Hook脚本 (Hook类的所有方法)
        
        Args:
            class_name: 类名
            options: Hook选项
            task_id: 任务ID
            
        Returns:
            完整的脚本代码
        """
        show_stack = options.get('show_stack', False)
        
        # 避免在f-string中使用反斜杠 (Python 3.6兼容性)
        newline_char = '\n'
        
        script = f'''
// 任务ID (用于通信)
var TASK_ID = {task_id};

{self.base_functions}

// ===== 类Hook核心逻辑 =====
Java.perform(function() {{
    try {{
        var targetClass = null;
        
        // 加载类 (复用方法Hook的逻辑)
        try {{
            targetClass = Java.use("{class_name}");
        }} catch (error) {{
            if (error.message.includes("ClassNotFoundException")) {{
                LOG("❌ 类未在默认ClassLoader中找到，搜索其他ClassLoader...", {{ c: Color.Yellow }});
                
                var foundClass = null;
                Java.enumerateClassLoadersSync().forEach(function(loader) {{
                    try {{
                        var factory = Java.ClassFactory.get(loader);
                        foundClass = factory.use("{class_name}");
                        if (foundClass) {{
                            targetClass = foundClass;
                            LOG("🎯 成功使用自定义ClassLoader加载类", {{ c: Color.Green }});
                            return;
                        }}
                    }} catch (e) {{
                        // 忽略
                    }}
                }});
                
                if (!targetClass) {{
                    LOG("❌ 在所有ClassLoader中都未找到类: {class_name}", {{ c: Color.Red }});
                    notifyTaskError(new Error("Class not found: {class_name}"));
                    return;
                }}
            }} else {{
                throw error;
            }}
        }}
        
        LOG("🎯 正在Hook类的所有方法: {class_name}", {{ c: Color.Cyan }});
        
        var methods = targetClass.class.getDeclaredMethods();
        var hookedCount = 0;
        
        methods.forEach(function(method) {{
            try {{
                var methodName = method.getName();
                
                // 跳过特殊方法
                if (methodName.includes("$") || methodName.includes("<")) {{
                    return;
                }}
                
                // Hook方法
                var originalImpl = targetClass[methodName];
                if (originalImpl) {{
                    targetClass[methodName].implementation = function() {{
                        var fullMethodName = "{class_name}." + methodName;
                        LOG("\\n*** 进入 " + fullMethodName, {{ c: Color.Green }});
                        
                        {f"printStack();" if show_stack else ""}
                        
                        if (arguments.length > 0) {{
                            LOG("📥 参数:", {{ c: Color.Blue }});
                            for (var i = 0; i < arguments.length; i++) {{
                                LOG("  arg[" + i + "]: " + arguments[i], {{ c: Color.White }});
                            }}
                        }}
                        
                        var retval = originalImpl.apply(this, arguments);
                        
                        LOG("📤 返回值: " + retval, {{ c: Color.Blue }});
                        LOG("🏁 退出 " + fullMethodName + "{newline_char}", {{ c: Color.Green }});
                        
                        notifyTaskHit({{
                            method: fullMethodName,
                            args_count: arguments.length,
                            return_value: retval ? retval.toString() : "null"
                        }});
                        
                        return retval;
                    }};
                    
                    hookedCount++;
                }}
            }} catch (e) {{
                // 忽略无法Hook的方法
            }}
        }});
        
        LOG("✅ 类Hook设置成功: " + hookedCount + " 个方法", {{ c: Color.Green }});
        
    }} catch (error) {{
        LOG("❌ 类Hook设置失败: " + error.message, {{ c: Color.Red }});
        notifyTaskError(error);
    }}
}});
'''
        return script
    
    def generate_location_hook_script(self, hook_type: str, options: Dict[str, Any], 
                                    task_id: int) -> str:
        """
        生成定位Hook脚本 (Base64, Toast等)
        
        Args:
            hook_type: Hook类型 (base64, toast, hashmap等)
            options: Hook选项
            task_id: 任务ID
            
        Returns:
            完整的脚本代码
        """
        show_stack = options.get('show_stack', False)
        
        hook_implementations = {
            'base64': self._get_base64_hook_impl(show_stack),
            'toast': self._get_toast_hook_impl(show_stack),
            'hashmap': self._get_hashmap_hook_impl(options.get('target_key', ''), show_stack),
            'jsonobject': self._get_json_hook_impl(show_stack),
            'arraylist': self._get_arraylist_hook_impl(show_stack),
            'loadlibrary': self._get_loadlibrary_hook_impl(show_stack),
            'newstringutf': self._get_newstringutf_hook_impl(show_stack),
            'fileoperations': self._get_fileoperations_hook_impl(show_stack),
            'edittext': self._get_edittext_hook_impl(show_stack),
            'log': self._get_log_hook_impl(show_stack),
            'url': self._get_url_hook_impl(show_stack)
        }
        
        hook_impl = hook_implementations.get(hook_type, '')
        if not hook_impl:
            raise ValueError(f"不支持的定位Hook类型: {hook_type}")
        
        # 兼容性补丁：部分实现使用 printStackTrace()
        # 若基础函数中未提供，则用 printStack() 或最小实现兜底
        compatibility_shim = '''
// 兼容: 提供 printStackTrace()，内部委托给 printStack()
if (typeof printStackTrace === 'undefined') {
    var printStackTrace = function() {
        try {
            if (typeof printStack === 'function') { printStack(); return; }
        } catch (e) {}
        try {
            var ex = Java.use("java.lang.Exception").$new();
            var Log = Java.use("android.util.Log");
            var stack = Log.getStackTraceString(ex);
            var lines = stack.split('\\n');
            for (var i = 0; i < Math.min(lines.length, 8); i++) {
                var line = lines[i].trim();
                if (line) {
                    if (typeof LOG === 'function') { LOG("📍 " + line); } else { try { send(line); } catch (_) {} }
                }
            }
        } catch (_) {}
    };
}
'''

        script = f'''
// 任务ID (用于通信)
var TASK_ID = {task_id};

{self.base_functions}

{compatibility_shim}

// ===== 定位Hook核心逻辑 =====
Java.perform(function() {{
    try {{
        LOG("🎯 正在设置定位Hook: {hook_type}", {{ c: Color.Cyan }});
        
        {hook_impl}
        
        LOG("✅ 定位Hook设置成功: {hook_type}", {{ c: Color.Green }});
        
    }} catch (error) {{
        LOG("❌ 定位Hook设置失败: " + error.message, {{ c: Color.Red }});
        notifyTaskError(error);
    }}
}});
'''
        return script
    
    def _get_base64_hook_impl(self, show_stack: bool) -> str:
        """获取Base64 Hook实现"""
        return f'''
        // Hook Base64编码
        var Base64 = Java.use("android.util.Base64");
        var _enc_str = Base64.encodeToString.overload('[B', 'int');
        _enc_str.implementation = function(input, flags) {{
            var result = _enc_str.call(this, input, flags);
            LOG("🔍 Base64编码: " + result, {{ c: Color.Cyan }});
            {f"printStack();" if show_stack else ""}
            
            notifyTaskHit({{
                operation: "base64_encode",
                result: result,
                input_length: input.length
            }});
            
            return result;
        }};
        
        // Hook Base64解码
        var _dec_str = Base64.decode.overload('java.lang.String', 'int');
        _dec_str.implementation = function(str, flags) {{
            var result = _dec_str.call(this, str, flags);
            LOG("🔍 Base64解码: " + str, {{ c: Color.Cyan }});
            {f"printStack();" if show_stack else ""}
            
            notifyTaskHit({{
                operation: "base64_decode", 
                input: str,
                result_length: result.length
            }});
            
            return result;
        }};
'''
    
    def _get_toast_hook_impl(self, show_stack: bool) -> str:
        """获取Toast Hook实现"""
        return f'''
        // Hook Toast显示
        var Toast = Java.use("android.widget.Toast");
        var _makeText = Toast.makeText.overload('android.content.Context', 'java.lang.CharSequence', 'int');
        _makeText.implementation = function(context, text, duration) {{
            LOG("🔍 Toast消息: " + text, {{ c: Color.Cyan }});
            {f"printStack();" if show_stack else ""}
            
            notifyTaskHit({{
                operation: "toast_show",
                message: text.toString(),
                duration: duration
            }});
            
            return _makeText.call(this, context, text, duration);
        }};
'''
    
    def _get_hashmap_hook_impl(self, search_key: str, show_stack: bool) -> str:
        """获取HashMap Hook实现"""
        key_filter = f'''
            if (key && key.toString().includes("{search_key}")) {{
                LOG("🔍 HashMap操作 [匹配键]: " + key + " = " + value, {{ c: Color.Cyan }});
                {f"printStack();" if show_stack else ""}
                
                notifyTaskHit({{
                    operation: "hashmap_put",
                    key: key.toString(),
                    value: value ? value.toString() : "null",
                    matched: true
                }});
            }}
        ''' if search_key else f'''
            LOG("🔍 HashMap操作: " + key + " = " + value, {{ c: Color.Cyan }});
            {f"printStack();" if show_stack else ""}
            
            notifyTaskHit({{
                operation: "hashmap_put",
                key: key ? key.toString() : "null",
                value: value ? value.toString() : "null"
            }});
        '''
        
        return f'''
        // Hook HashMap操作
        var HashMap = Java.use("java.util.HashMap");
        var _put = HashMap.put.overload('java.lang.Object', 'java.lang.Object');
        _put.implementation = function(key, value) {{
            var result = _put.call(this, key, value);
            {key_filter}
            return result;
        }};
'''
    
    def _get_json_hook_impl(self, show_stack: bool) -> str:
        """获取JSON Hook实现"""
        return f'''
        // Hook JSONObject
        var JSONObject = Java.use("org.json.JSONObject");
        var _toString = JSONObject.toString.overload();
        _toString.implementation = function() {{
            var result = _toString.call(this);
            LOG("🔍 JSON对象: " + result, {{ c: Color.Cyan }});
            {f"printStack();" if show_stack else ""}
            
            notifyTaskHit({{
                operation: "json_toString",
                content: result
            }});
            
            return result;
        }};
'''
    
    def generate_native_hook_script(self, target: str, options: Dict[str, Any], 
                                  task_id: int) -> str:
        """
        生成Native Hook脚本
        
        Args:
            target: Hook目标 (函数名或地址)
            options: Hook选项
            task_id: 任务ID
            
        Returns:
            完整的脚本代码
        """
        show_stack = options.get('show_stack', False)
        
        # 避免在f-string中使用反斜杠 (Python 3.6兼容性)
        newline_char = '\n'
        backslash_char = '\\'
        stack_trace_code = f"console.log(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('{backslash_char}n'));" if show_stack else ""
        
        script = f'''
// 任务ID (用于通信)
var TASK_ID = {task_id};

{self.base_functions}

// ===== Native Hook核心逻辑 =====
try {{
    LOG("🎯 正在设置Native Hook: {target}", {{ c: Color.Cyan }});
    
    var targetAddr = null;
    
    // 尝试获取函数地址
    if ("{target}".startsWith("0x")) {{
        targetAddr = ptr("{target}");
    }} else {{
        targetAddr = Module.findExportByName(null, "{target}");
        if (!targetAddr) {{
            // 搜索所有模块
            Process.enumerateModulesSync().forEach(function(module) {{
                var addr = Module.findExportByName(module.name, "{target}");
                if (addr) {{
                    targetAddr = addr;
                    LOG("🎯 在模块 " + module.name + " 中找到函数", {{ c: Color.Green }});
                    return;
                }}
            }});
        }}
    }}
    
    if (!targetAddr) {{
        LOG("❌ 未找到目标函数: {target}", {{ c: Color.Red }});
        send({{ type: 'task_error', task_id: TASK_ID, error: "Function not found: {target}" }});
    }} else {{
        // Hook函数
        Interceptor.attach(targetAddr, {{
            onEnter: function(args) {{
                LOG("{newline_char}*** 进入Native函数: {target}", {{ c: Color.Green }});
                {stack_trace_code}
                
                LOG("📥 参数:", {{ c: Color.Blue }});
                for (var i = 0; i < 4; i++) {{
                    LOG("  arg[" + i + "]: " + args[i], {{ c: Color.White }});
                }}
                
                notifyTaskHit({{
                    operation: "native_enter",
                    function: "{target}",
                    address: targetAddr.toString()
                }});
            }},
            
            onLeave: function(retval) {{
                LOG("📤 返回值: " + retval, {{ c: Color.Blue }});
                LOG("🏁 退出Native函数: {target}{newline_char}", {{ c: Color.Green }});
                
                notifyTaskHit({{
                    operation: "native_leave",
                    function: "{target}",
                    return_value: retval.toString()
                }});
            }}
        }});
        
        LOG("✅ Native Hook设置成功: {target}", {{ c: Color.Green }});
    }}
    
}} catch (error) {{
    LOG("❌ Native Hook设置失败: " + error.message, {{ c: Color.Red }});
    send({{ type: 'task_error', task_id: TASK_ID, error: error.toString() }});
}}
'''
        return script
    
    def generate_custom_script(self, script_code: str, task_id: int) -> str:
        """
        生成自定义脚本
        
        Args:
            script_code: 用户提供的脚本代码
            task_id: 任务ID
            
        Returns:
            完整的脚本代码
        """
        script = f'''
// 任务ID (用于通信)
var TASK_ID = {task_id};

{self.base_functions}

// ===== 用户自定义脚本 =====
try {{
    LOG("🎯 正在执行自定义脚本", {{ c: Color.Cyan }});
    
    {script_code}
    
    LOG("✅ 自定义脚本执行成功", {{ c: Color.Green }});
    
}} catch (error) {{
    LOG("❌ 自定义脚本执行失败: " + error.message, {{ c: Color.Red }});
    notifyTaskError(error);
}}
'''
        return script
    
    # ===== 缺失的Hook实现函数 =====
    
    def _get_arraylist_hook_impl(self, show_stack: bool) -> str:
        """ArrayList Hook实现"""
        stack_code = "printStackTrace();" if show_stack else ""
        return f'''
        var arrayList = Java.use("java.util.ArrayList");
        var _add = arrayList.add.overload('java.lang.Object');
        var __arr_add_count = 0;
        _add.implementation = function (obj) {{
            __arr_add_count++;
            if (__arr_add_count <= 20 || (__arr_add_count % 50) == 0) {{
                LOG("📋 ArrayList.add被调用", {{ c: Color.Cyan }});
                LOG("  添加对象: " + obj, {{ c: Color.Green }});
                {stack_code}
            }}
            return _add.call(this, obj);
        }};
        '''
    
    def _get_loadlibrary_hook_impl(self, show_stack: bool) -> str:
        """LoadLibrary Hook实现"""
        stack_code = "printStackTrace();" if show_stack else ""
        return f'''
        var system = Java.use("java.lang.System");
        var _loadLibrary = system.loadLibrary.overload('java.lang.String');
        _loadLibrary.implementation = function (libname) {{
            LOG("🔗 System.loadLibrary被调用", {{ c: Color.Cyan }});
            LOG("  库名: " + libname, {{ c: Color.Yellow }});
            {stack_code}
            return _loadLibrary.call(this, libname);
        }};
        '''
    
    def _get_newstringutf_hook_impl(self, show_stack: bool) -> str:
        """NewStringUTF Hook实现"""
        return '''
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
                }
            });
        }
        '''
    
    def _get_fileoperations_hook_impl(self, show_stack: bool) -> str:
        """File Operations Hook实现"""
        stack_code = "printStackTrace();" if show_stack else ""
        return f'''
        var file = Java.use("java.io.File");
        var _exists = file.exists.overload();
        _exists.implementation = function() {{
            var result = _exists.call(this);
            LOG("📁 File.exists被调用", {{ c: Color.Cyan }});
            LOG("  文件路径: " + this.getAbsolutePath(), {{ c: Color.Yellow }});
            {stack_code}
            return result;
        }};
        '''
    
    def _get_edittext_hook_impl(self, show_stack: bool) -> str:
        """EditText Hook实现"""
        stack_code = "printStackTrace();" if show_stack else ""
        return f'''
        var EditText = Java.use("android.widget.EditText");
        EditText.setText.overload('java.lang.CharSequence').implementation = function(text) {{
            LOG("✏️ EditText.setText被调用", {{ c: Color.Cyan }});
            LOG("  设置文本: " + text, {{ c: Color.Yellow }});
            {stack_code}
            return this.setText(text);
        }};
        '''
    
    def _get_log_hook_impl(self, show_stack: bool) -> str:
        """Log Hook实现"""
        stack_code = "printStackTrace();" if show_stack else ""
        return f'''
        var Log = Java.use("android.util.Log");
        var _d = Log.d.overload('java.lang.String', 'java.lang.String');
        _d.implementation = function(tag, msg) {{
            LOG("📜 Log.d被调用", {{ c: Color.Cyan }});
            LOG("  Tag: " + tag + ", Message: " + msg, {{ c: Color.White }});
            {stack_code}
            return _d.call(this, tag, msg);
        }};
        '''
    
    def _get_url_hook_impl(self, show_stack: bool) -> str:
        """URL Hook实现"""
        stack_code = "printStackTrace();" if show_stack else ""
        return f'''
        var URL = Java.use("java.net.URL");
        var URL_init_str = URL.$init.overload('java.lang.String');
        URL_init_str.implementation = function(spec) {{
            LOG("🌐 URL创建: " + spec, {{ c: Color.Cyan }});
            {stack_code}
            // 使用 call 调用原始构造，避免递归
            var retval = URL_init_str.call(this, spec);
            return retval;
        }};
        '''