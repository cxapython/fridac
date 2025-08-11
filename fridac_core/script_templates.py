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
        // 最小化 emitEvent 实现
        try {
            var evt = { type: 'task_hit', ts: Date.now(), task_id: TASK_ID, items: { message: String(message) } };
            try { evt.pid = Process.id; } catch(_){}
            try { evt.tid = Process.getCurrentThreadId(); } catch(_){}
            send(evt);
        } catch(_) {}
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

// 结构化事件最小实现（避免 emitEvent 未定义导致脚本报错）
if (typeof emitEvent === 'undefined') {
    var emitEvent = function(eventType, fields) {
        try {
            var evt = fields || {};
            evt.type = eventType || evt.type || 'event';
            evt.ts = Date.now();
            try { evt.pid = Process.id; } catch(_){ }
            try { evt.tid = Process.getCurrentThreadId(); } catch(_){ }
            send(evt);
        } catch (e) {
            try { send({ type: 'event', error: e.message }); } catch(_){ }
        }
    };
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
// 统一结构化事件发射器（若未提供则定义本地版本）
var emitEvent = (typeof emitEvent === 'function') ? emitEvent : function(eventType, fields) {
    try {
        var evt = fields || {};
        evt.type = eventType || evt.type || 'event';
        evt.ts = Date.now();
        try { evt.pid = Process.id; } catch(_){ }
        try { evt.tid = Process.getCurrentThreadId(); } catch(_){ }
        send(evt);
    } catch (e) {
        try { send({ type: 'event', error: e.message }); } catch(_){ }
    }
};
try { if (typeof global !== 'undefined') global.emitEvent = emitEvent; } catch(_){ }

function notifyTaskHit(details) {
    if (typeof TASK_ID !== 'undefined') {
        emitEvent('task_hit', {
            task_id: TASK_ID,
            items: details || {}
        });
    }
}

function notifyTaskError(error) {
    if (typeof TASK_ID !== 'undefined') {
        emitEvent('task_error', {
            task_id: TASK_ID,
            items: { error: error && error.message ? error.message : String(error) }
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
        
        # 在JS字符串内使用转义换行符，避免插入真实换行导致语法错误
        newline_char = '\\n'
        
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
        
        // Hook方法（重载兼容）
        var fullMethodName = "{class_name}.{method_name}";
        LOG("🎯 正在Hook方法: " + fullMethodName, {{ c: Color.Cyan }});

        // 参数类型辅助
        function __getArgType(value) {{
            try {{
                if (value === null) return 'null';
                if (typeof value === 'undefined') return 'undefined';
                if (value && typeof value.getClass === 'function') {{
                    try {{ return String(value.getClass().getName()); }} catch(_) {{}}
                }}
                if (value && value.$className) {{
                    try {{ return String(value.$className); }} catch(_) {{}}
                }}
                if (value && value.class && typeof value.class.getName === 'function') {{
                    try {{ return String(value.class.getName()); }} catch(_) {{}}
                }}
                var t = typeof value;
                if (t === 'object') {{
                    try {{ return Object.prototype.toString.call(value); }} catch(_) {{}}
                }}
                return t;
            }} catch (_) {{
                return 'unknown';
            }}
        }}

        var __methodWrapper = targetClass.{method_name};
        if (!__methodWrapper) {{
            LOG("❌ 未找到方法: " + fullMethodName, {{ c: Color.Red }});
            notifyTaskError(new Error("Method not found: " + fullMethodName));
            return;
        }}

        var __overloads = __methodWrapper.overloads || [];
        if (__overloads.length > 0) {{
            LOG("🔀 发现 " + __overloads.length + " 个重载，逐个设置Hook...", {{ c: Color.Blue }});
            for (var i = 0; i < __overloads.length; i++) {{
                try {{
                    (function(__over) {{
                        __over.implementation = function() {{
                            LOG("\\n*** 进入 " + fullMethodName, {{ c: Color.Green }});

                            // 显示调用栈
                            {f"printStack();" if show_stack else ""}

                            // 打印参数（含类型）
                            if (arguments.length > 0) {{
                                LOG("📥 参数:", {{ c: Color.Blue }});
                                for (var j = 0; j < arguments.length; j++) {{
                                    var __t = __getArgType(arguments[j]);
                                    LOG("  arg[" + j + "] (" + __t + "): " + arguments[j], {{ c: Color.White }});
                                }}
                            }}

                            var retval;
                            { ("retval = " + str(custom_return) + ";") if custom_return is not None else "retval = __over.apply(this, arguments);" }

                            LOG("📤 返回值: " + retval, {{ c: Color.Blue }});
                            LOG("🏁 退出 " + fullMethodName + "{newline_char}", {{ c: Color.Green }});

                            notifyTaskHit({{
                                method: fullMethodName,
                                args_count: arguments.length,
                                return_value: (retval !== undefined && retval !== null) ? retval.toString() : "null"
                            }});

                            return retval;
                        }};
                    }})(__overloads[i]);
                }} catch(_e) {{ }}
            }}
        }} else {{
            // 无重载信息兜底
            __methodWrapper.implementation = function() {{
                LOG("\\n*** 进入 " + fullMethodName, {{ c: Color.Green }});

                {f"printStack();" if show_stack else ""}

                if (arguments.length > 0) {{
                    LOG("📥 参数:", {{ c: Color.Blue }});
                    for (var k = 0; k < arguments.length; k++) {{
                        var __t2 = __getArgType(arguments[k]);
                        LOG("  arg[" + k + "] (" + __t2 + "): " + arguments[k], {{ c: Color.White }});
                    }}
                }}

                var retval = this.{method_name}.apply(this, arguments);
                {f"retval = {custom_return};" if custom_return is not None else ""}

                LOG("📤 返回值: " + retval, {{ c: Color.Blue }});
                LOG("🏁 退出 " + fullMethodName + "{newline_char}", {{ c: Color.Green }});

                notifyTaskHit({{
                    method: fullMethodName,
                    args_count: arguments.length,
                    return_value: (retval !== undefined && retval !== null) ? retval.toString() : "null"
                }});

                return retval;
            }};
        }}

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
        
        # 在JS字符串内使用转义换行符，避免插入真实换行导致语法错误
        newline_char = '\\n'
        
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
        stack_lines = options.get('stack_lines')
        
        hook_implementations = {
            'base64': self._get_base64_hook_impl(show_stack, stack_lines),
            'toast': self._get_toast_hook_impl(show_stack, stack_lines),
            'hashmap': self._get_hashmap_hook_impl(options.get('target_key', ''), show_stack, stack_lines),
            'jsonobject': self._get_json_hook_impl(show_stack, stack_lines),
            'arraylist': self._get_arraylist_hook_impl(show_stack, stack_lines),
            'loadlibrary': self._get_loadlibrary_hook_impl(show_stack, stack_lines),
            'newstringutf': self._get_newstringutf_hook_impl(show_stack, stack_lines),
            'fileoperations': self._get_fileoperations_hook_impl(show_stack, stack_lines),
            'edittext': self._get_edittext_hook_impl(show_stack, stack_lines),
            'log': self._get_log_hook_impl(show_stack, stack_lines),
            'url': self._get_url_hook_impl(show_stack, stack_lines),
            'fetch': self._get_fetch_hook_impl(options.get('filter', ''))
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
    
    def _get_base64_hook_impl(self, show_stack: bool, stack_lines: Optional[int]) -> str:
        """获取Base64 Hook实现"""
        return f'''
        // Hook Base64编码
        var Base64 = Java.use("android.util.Base64");
        var _enc_str = Base64.encodeToString.overload('[B', 'int');
        _enc_str.implementation = function(input, flags) {{
            var result = _enc_str.call(this, input, flags);
            LOG("🔍 Base64编码: " + result, {{ c: Color.Cyan }});
            {f"printStack(false, {stack_lines});" if show_stack and stack_lines is not None else ("printStack();" if show_stack else "")}
            
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
            {f"printStack(false, {stack_lines});" if show_stack and stack_lines is not None else ("printStack();" if show_stack else "")}
            
            notifyTaskHit({{
                operation: "base64_decode", 
                input: str,
                result_length: result.length
            }});
            
            return result;
        }};
'''
    
    def _get_toast_hook_impl(self, show_stack: bool, stack_lines: Optional[int]) -> str:
        """获取Toast Hook实现"""
        return f'''
        // Hook Toast显示
        var Toast = Java.use("android.widget.Toast");
        var _makeText = Toast.makeText.overload('android.content.Context', 'java.lang.CharSequence', 'int');
        _makeText.implementation = function(context, text, duration) {{
            LOG("🔍 Toast消息: " + text, {{ c: Color.Cyan }});
            {f"printStack(false, {stack_lines});" if show_stack and stack_lines is not None else ("printStack();" if show_stack else "")}
            
            notifyTaskHit({{
                operation: "toast_show",
                message: text.toString(),
                duration: duration
            }});
            
            return _makeText.call(this, context, text, duration);
        }};
'''
    
    def _get_hashmap_hook_impl(self, search_key: str, show_stack: bool, stack_lines: Optional[int]) -> str:
        """获取HashMap Hook实现"""
        key_filter = f'''
            if (key && key.toString().includes("{search_key}")) {{
                LOG("🔍 HashMap操作 [匹配键]: " + key + " = " + value, {{ c: Color.Cyan }});
                {f"printStack(false, {stack_lines});" if show_stack and stack_lines is not None else ("printStack();" if show_stack else "")}
                
                notifyTaskHit({{
                    operation: "hashmap_put",
                    key: key.toString(),
                    value: value ? value.toString() : "null",
                    matched: true
                }});
            }}
        ''' if search_key else f'''
            LOG("🔍 HashMap操作: " + key + " = " + value, {{ c: Color.Cyan }});
            {f"printStack(false, {stack_lines});" if show_stack and stack_lines is not None else ("printStack();" if show_stack else "")}
            
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
    
    def _get_json_hook_impl(self, show_stack: bool, stack_lines: Optional[int]) -> str:
        """获取JSON Hook实现"""
        return f'''
        // Hook JSONObject
        var JSONObject = Java.use("org.json.JSONObject");
        var _toString = JSONObject.toString.overload();
        _toString.implementation = function() {{
            var result = _toString.call(this);
            LOG("🔍 JSON对象: " + result, {{ c: Color.Cyan }});
            {f"printStack(false, {stack_lines});" if show_stack and stack_lines is not None else ("printStack();" if show_stack else "")}
            
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
        
        # 在JS字符串内使用转义换行符，避免插入真实换行导致语法错误
        newline_char = '\\n'
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
    
    def _get_arraylist_hook_impl(self, show_stack: bool, stack_lines: Optional[int]) -> str:
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
                {f"printStackTrace();" if show_stack and stack_lines is None else (f"printStack(false, {stack_lines});" if show_stack else "")}
            }}
            return _add.call(this, obj);
        }};
        '''
    
    def _get_loadlibrary_hook_impl(self, show_stack: bool, stack_lines: Optional[int]) -> str:
        """LoadLibrary Hook实现"""
        stack_code = "printStackTrace();" if show_stack else ""
        return f'''
        var system = Java.use("java.lang.System");
        var _loadLibrary = system.loadLibrary.overload('java.lang.String');
        _loadLibrary.implementation = function (libname) {{
            LOG("🔗 System.loadLibrary被调用", {{ c: Color.Cyan }});
            LOG("  库名: " + libname, {{ c: Color.Yellow }});
            {f"printStackTrace();" if show_stack and stack_lines is None else (f"printStack(false, {stack_lines});" if show_stack else "")}
            return _loadLibrary.call(this, libname);
        }};
        '''
    
    def _get_newstringutf_hook_impl(self, show_stack: bool, stack_lines: Optional[int]) -> str:
        """NewStringUTF Hook实现"""
        # 预构造调用栈片段以避免 f-string 花括号歧义
        if show_stack:
            if stack_lines is None:
                stack_snippet = "LOG(\"📚 Native调用栈:\", {{ c: Color.Cyan }}); console.log(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\\n'));"
            else:
                stack_snippet = f"LOG(\\\"📚 Java调用栈:\\\", {{ c: Color.Cyan }}); printStack(false, {stack_lines});"
        else:
            stack_snippet = ""

        return f'''
        var newStringUTF = Module.findExportByName("libart.so", "_ZN3art3JNI12NewStringUTFEP7_JNIEnvPKc");
        if (!newStringUTF) {{
            newStringUTF = Module.findExportByName("libdvm.so", "NewStringUTF");
        }}
        if (newStringUTF) {{
            Interceptor.attach(newStringUTF, {{
                onEnter: function(args) {{
                    var str = Memory.readUtf8String(args[1]);
                    LOG("🔤 JNI NewStringUTF被调用", {{ c: Color.Cyan }});
                    LOG("  字符串: " + str, {{ c: Color.Yellow }});
                    {stack_snippet}
                }}
            }});
        }}
        '''
    
    def _get_fileoperations_hook_impl(self, show_stack: bool, stack_lines: Optional[int]) -> str:
        """File Operations Hook实现"""
        stack_code = "printStackTrace();" if show_stack else ""
        return f'''
        var file = Java.use("java.io.File");
        var _exists = file.exists.overload();
        _exists.implementation = function() {{
            var result = _exists.call(this);
            LOG("📁 File.exists被调用", {{ c: Color.Cyan }});
            LOG("  文件路径: " + this.getAbsolutePath(), {{ c: Color.Yellow }});
            {f"printStackTrace();" if show_stack and stack_lines is None else (f"printStack(false, {stack_lines});" if show_stack else "")}
            return result;
        }};
        '''
    
    def _get_edittext_hook_impl(self, show_stack: bool, stack_lines: Optional[int]) -> str:
        """EditText Hook实现"""
        stack_code = "printStackTrace();" if show_stack else ""
        return f'''
        var EditText = Java.use("android.widget.EditText");
        EditText.setText.overload('java.lang.CharSequence').implementation = function(text) {{
            LOG("✏️ EditText.setText被调用", {{ c: Color.Cyan }});
            LOG("  设置文本: " + text, {{ c: Color.Yellow }});
            {f"printStackTrace();" if show_stack and stack_lines is None else (f"printStack(false, {stack_lines});" if show_stack else "")}
            return this.setText(text);
        }};
        '''
    
    def _get_log_hook_impl(self, show_stack: bool, stack_lines: Optional[int]) -> str:
        """Log Hook实现"""
        stack_code = "printStackTrace();" if show_stack else ""
        return f'''
        var Log = Java.use("android.util.Log");
        var _d = Log.d.overload('java.lang.String', 'java.lang.String');
        _d.implementation = function(tag, msg) {{
            LOG("📜 Log.d被调用", {{ c: Color.Cyan }});
            LOG("  Tag: " + tag + ", Message: " + msg, {{ c: Color.White }});
            {f"printStackTrace();" if show_stack and stack_lines is None else (f"printStack(false, {stack_lines});" if show_stack else "")}
            return _d.call(this, tag, msg);
        }};
        '''
    
    def _get_url_hook_impl(self, show_stack: bool, stack_lines: Optional[int]) -> str:
        """URL Hook实现"""
        stack_code = "printStackTrace();" if show_stack else ""
        return f'''
        var URL = Java.use("java.net.URL");
        var URL_init_str = URL.$init.overload('java.lang.String');
        var __url_hook_count = 0;
        var __url_hook_last_ts = 0;
        URL_init_str.implementation = function(spec) {{
            __url_hook_count++;
            var now = Date.now();
            var shouldLog = (__url_hook_count <= 20) || ((__url_hook_count % 50) === 0) || (now - __url_hook_last_ts >= 2000);
            if (shouldLog) {{
                LOG("🌐 URL创建: " + spec, {{ c: Color.Cyan }});
                {f"printStackTrace();" if show_stack and stack_lines is None else (f"printStack(false, {stack_lines});" if show_stack else "")}
                __url_hook_last_ts = now;
            }}
            var retval = URL_init_str.call(this, spec);
            return retval;
        }};
        '''

    def _get_fetch_hook_impl(self, filter_str: str) -> str:
        """fetch 抓包实现（任务脚本内自包含 OkHttp3 + HttpURLConnection）"""
        filter_arg = (filter_str or '').replace("'", "\\'")
        filter_js_value = "'" + filter_arg + "'" if filter_arg else 'null'
        script = '''
        try {
            var __filter = __FRIDAC_FILTER_PLACEHOLDER__;
            // 通知宿主初始化日志
            try { send({ type: 'fetch_start', ts: Date.now(), items: { filter: __filter, task_id: TASK_ID } }); } catch(_) {}

            function __useClass(name) {
                try { return Java.use(name); } catch (e) {
                    if ((e.message||'').indexOf('ClassNotFoundException') !== -1) {
                        try { var ld = (typeof findTragetClassLoader==='function') ? findTragetClassLoader(name) : null; if (ld) return Java.ClassFactory.get(ld).use(name); } catch(_){}
                    }
                    return null;
                }
            }

            function __stack(maxLines) {
                try { var ex=Java.use('java.lang.Exception').$new(); var tr=ex.getStackTrace(); var lim=maxLines>0?maxLines:20; var out=[],n=0; for (var i=0;i<tr.length&&n<lim;i++){ var el=tr[i].toString(); if(el.indexOf('java.lang.Exception')===-1 && el.indexOf('android.util.Log')===-1 && el.indexOf('dalvik.system')===-1){ out.push(String(el)); n++; } } return out; } catch(_){ return []; }
            }

            function __charset(h, ct) { try { var s=(ct||h['Content-Type']||h['content-type']||'').toLowerCase(); var i=s.indexOf('charset='); if(i!==-1){ var cs=s.substring(i+8).trim(); var j=cs.indexOf(';'); if(j!==-1) cs=cs.substring(0,j); return cs||null; } } catch(_){ } return null; }
            function __bytesToString(bytes, cs) { try { var S=Java.use('java.lang.String'); if(cs) { var C=Java.use('java.nio.charset.Charset'); return S.$new(bytes, C.forName(cs)).toString(); } return S.$new(bytes).toString(); } catch(e) { return ''; } }

            function __py(method, url, headers, cookie, body, ct) { 
                try { 
                    var low=(method||'GET').toLowerCase(); 
                    var fn=(['get','post','put','delete','patch','head','options'].indexOf(low)!==-1)?low:'request'; 
                    var args=[]; 
                    if(fn==='request'){ 
                        args.push(JSON.stringify(method)); 
                        args.push(JSON.stringify(url)); 
                    } else { 
                        args.push(JSON.stringify(url)); 
                    } 
                    args.push('headers='+JSON.stringify(headers||{})); 
                    if(cookie){ 
                        try { 
                            var parts=String(cookie).split(';'); 
                            var cobj={}; 
                            for(var i=0;i<parts.length;i++){ 
                                var kv=parts[i].trim(); 
                                if(!kv) continue; 
                                var idx=kv.indexOf('='); 
                                if(idx>0) cobj[kv.substring(0,idx).trim()]=kv.substring(idx+1).trim(); 
                            } 
                            args.push('cookies='+JSON.stringify(cobj)); 
                        } catch(_) { } 
                    } 
                    if(body && (low==='post'||low==='put'||low==='patch'||low==='delete')){ 
                        var content=(ct||headers['Content-Type']||headers['content-type']||'').toLowerCase(); 
                        var tb=String(body).trim(); 
                        if(content.indexOf('application/json')!==-1 && ((tb.startsWith('{')&&tb.endsWith('}'))||(tb.startsWith('[')&&tb.endsWith(']')))) 
                            args.push('json='+tb); 
                        else 
                            args.push('data='+JSON.stringify(body)); 
                    } 
                    return (fn==='request')?('requests.request('+args.join(', ')+')'):('requests.'+fn+'('+args.join(', ')+')'); 
                } catch(e) { 
                    return 'requests.get(' + JSON.stringify(url) + ')'; 
                } 
            }

            function __emit(library, method, url, headers, cookie, py, body, ct) {
                var stack = __stack(20);
                LOG('🌐 捕获请求('+library+'): '+method+' '+url, { c: Color.Cyan });
                LOG('🐍 '+py, { c: Color.White });
                printStack();
                send({ type:'fetch_request', ts: Date.now(), items: { library: library, method: method, url: url, headers: headers, cookies: cookie||null, python: py, body: body||null, contentType: ct||null, task_id: TASK_ID, stack: stack } });
            }

            function __installOkHttp3() {
                var ok = false;
                try {
                    var candidates = ['okhttp3.RealCall','okhttp3.internal.connection.RealCall'];
                    for (var i = 0; i < candidates.length; i++) {
                        var cn = candidates[i];
                        var C = null;
                        try { C = __useClass(cn); } catch (e0) { C = null; }
                        if (!C) { continue; }

                        // execute()
                        try {
                            var ex = C.execute.overload();
                            ex.implementation = function() {
                                try {
                                    var req = null;
                                    try { req = this.request(); } catch (e1) { try { req = this.originalRequest(); } catch (e1b) {} }
                                    if (!req) return ex.call(this);
                                    var m = 'GET'; try { m = String(req.method()); } catch (e2) {}
                                    var u = ''; try { u = String(req.url().toString()); } catch (e3) {}
                                    var h = {}; try { var headers = req.headers(); var names = headers.names(); var it = names.iterator(); while (it.hasNext()) { var n = String(it.next()); h[n] = String(headers.get(n)); } } catch (e4) {}
                                    if (__filter) { var hay = u + ' ' + JSON.stringify(h); if (hay.indexOf(__filter) === -1) return ex.call(this); }
                                    var cookie = h['Cookie'] || h['cookie'] || '';
                                    var body = '', ct = '';
                                    try {
                                        var b = req.body();
                                        if (b) {
                                            try { var mt = b.contentType(); ct = mt ? String(mt.toString()) : ''; } catch (e5) {}
                                            try {
                                                var Buffer = Java.use('okio.Buffer');
                                                var buf = Buffer.$new();
                                                b.writeTo(buf);
                                                try { var bytes = buf.readByteArray(); var cs = __charset(h, ct) || 'utf-8'; body = __bytesToString(bytes, cs); }
                                                catch (e6) { try { body = String(buf.readUtf8()); } catch (e7) { body = ''; } }
                                            } catch (e8) {}
                                        }
                                    } catch (e9) {}
                                    var py = __py(m, u, h, cookie, body, ct);
                                    __emit('okhttp', m, u, h, cookie, py, body, ct);
                                } catch (e10) {}
                                return ex.call(this);
                            };
                        } catch (e11) {}

                        // enqueue(Callback)
                        try {
                            var en = C.enqueue.overload('okhttp3.Callback');
                            en.implementation = function(cb) {
                                try {
                                    var req = null;
                                    try { req = this.request(); } catch (e12) { try { req = this.originalRequest(); } catch (e12b) {} }
                                    if (!req) return en.call(this, cb);
                                    var m = 'GET'; try { m = String(req.method()); } catch (e13) {}
                                    var u = ''; try { u = String(req.url().toString()); } catch (e14) {}
                                    var h = {}; try { var headers = req.headers(); var names = headers.names(); var it = names.iterator(); while (it.hasNext()) { var n = String(it.next()); h[n] = String(headers.get(n)); } } catch (e15) {}
                                    if (__filter) { var hay = u + ' ' + JSON.stringify(h); if (hay.indexOf(__filter) === -1) return en.call(this, cb); }
                                    var cookie = h['Cookie'] || h['cookie'] || '';
                                    var py = __py(m, u, h, cookie, null, null);
                                    __emit('okhttp', m, u, h, cookie, py, null, null);
                                } catch (e16) {}
                                return en.call(this, cb);
                            };
                        } catch (e17) {}

                        ok = true;
                    }
                } catch (e18) {}
                if (ok) LOG('✅ OkHttp3 Hook 已启用', { c: Color.Green }); else LOG('ℹ️ 未检测到 OkHttp3', { c: Color.Gray });
            }

            function __installHttpURLConnection() {
                var H = null;
                try { H = __useClass('java.net.HttpURLConnection'); } catch (e) { H = null; }
                if (!H) { LOG('ℹ️ 未检测到 HttpURLConnection', { c: Color.Gray }); return; }

                // getInputStream
                try {
                    var gis = H.getInputStream.overload();
                    gis.implementation = function() {
                        try {
                            var m = ''; try { m = String(this.getRequestMethod()); } catch (_) {}
                            var u = ''; try { u = String(this.getURL().toString()); } catch (_) {}
                            var h = {};
                            try {
                                var map = this.getRequestProperties();
                                var it = map.entrySet().iterator();
                                while (it.hasNext()) {
                                    var e = it.next();
                                    var k = e.getKey();
                                    var key = k ? String(k) : '';
                                    if (!key) continue;
                                    var list = e.getValue();
                                    var vals = [];
                                    if (list) { var size = list.size(); for (var i = 0; i < size; i++) vals.push(String(list.get(i))); }
                                    h[key] = vals.join(', ');
                                }
                            } catch (_) {}
                            if (__filter) { var hay = u + ' ' + JSON.stringify(h); if (hay.indexOf(__filter) === -1) return gis.call(this); }
                            var cookie = h['Cookie'] || h['cookie'] || '';
                            var py = __py(m || 'GET', u, h, cookie, null, null);
                            __emit('httpurlconnection', m || 'GET', u, h, cookie, py, null, null);
                        } catch (_) {}
                        return gis.call(this);
                    };
                } catch (_) {}

                // getOutputStream
                try {
                    var gos = H.getOutputStream.overload();
                    gos.implementation = function() {
                        try {
                            var m = ''; try { m = String(this.getRequestMethod()); } catch (_) {}
                            var u = ''; try { u = String(this.getURL().toString()); } catch (_) {}
                            var h = {};
                            try {
                                var map = this.getRequestProperties();
                                var it = map.entrySet().iterator();
                                while (it.hasNext()) {
                                    var e = it.next();
                                    var k = e.getKey();
                                    var key = k ? String(k) : '';
                                    if (!key) continue;
                                    var list = e.getValue();
                                    var vals = [];
                                    if (list) { var size = list.size(); for (var i = 0; i < size; i++) vals.push(String(list.get(i))); }
                                    h[key] = vals.join(', ');
                                }
                            } catch (_) {}
                            if (__filter) { var hay = u + ' ' + JSON.stringify(h); if (hay.indexOf(__filter) === -1) return gos.call(this); }
                            var cookie = h['Cookie'] || h['cookie'] || '';
                            var py = __py(m || 'GET', u, h, cookie, null, null);
                            __emit('httpurlconnection', m || 'GET', u, h, cookie, py, null, null);
                        } catch (_) {}
                        return gos.call(this);
                    };
                } catch (_) {}

                // connect
                try {
                    var cn = H.connect.overload();
                    cn.implementation = function() {
                        try {
                            var m = ''; try { m = String(this.getRequestMethod()); } catch (_) {}
                            var u = ''; try { u = String(this.getURL().toString()); } catch (_) {}
                            var h = {};
                            try {
                                var map = this.getRequestProperties();
                                var it = map.entrySet().iterator();
                                while (it.hasNext()) {
                                    var e = it.next();
                                    var k = e.getKey();
                                    var key = k ? String(k) : '';
                                    if (!key) continue;
                                    var list = e.getValue();
                                    var vals = [];
                                    if (list) { var size = list.size(); for (var i = 0; i < size; i++) vals.push(String(list.get(i))); }
                                    h[key] = vals.join(', ');
                                }
                            } catch (_) {}
                            if (__filter) { var hay = u + ' ' + JSON.stringify(h); if (hay.indexOf(__filter) === -1) return cn.call(this); }
                            var cookie = h['Cookie'] || h['cookie'] || '';
                            var py = __py(m || 'GET', u, h, cookie, null, null);
                            __emit('httpurlconnection', m || 'GET', u, h, cookie, py, null, null);
                        } catch (_) {}
                        return cn.call(this);
                    };
                } catch (_) {}
            }

            Java.perform(function(){ try{ __installOkHttp3(); }catch(_){ } try{ __installHttpURLConnection(); }catch(_){ } });
            LOG('✅ fetch 任务已启动' + (__filter ? (' (过滤: 'ya_filter+')') : ''), { c: Color.Green });
        } catch (e) {
            LOG('❌ fetch 任务启动失败: ' + e.message, { c: Color.Red });
            notifyTaskError(e);
        }
        '''
        return script.replace('__FRIDAC_FILTER_PLACEHOLDER__', filter_js_value)