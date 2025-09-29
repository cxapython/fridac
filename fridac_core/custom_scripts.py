"""
fridac 自定义脚本管理器
自动扫描、解析和加载用户自定义的JavaScript脚本
提供完整的生命周期管理和热重载功能
"""

import os
import re
import json
import time
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
from datetime import datetime

from .logger import log_info, log_success, log_warning, log_error, log_debug

@dataclass
class CustomFunction:
    """自定义函数信息"""
    name: str
    description: str
    example: str
    script_path: str
    function_code: str
    parameters: List[str]
    last_modified: float
    task_capable: bool = True  # 是否支持任务管理

@dataclass 
class CustomScript:
    """自定义脚本信息"""
    file_path: str
    file_name: str
    functions: Dict[str, CustomFunction]
    last_modified: float
    load_time: datetime
    error_message: Optional[str] = None

class CustomScriptManager:
    """
    自定义脚本管理器
    
    功能：
    1. 自动扫描 scripts/ 目录
    2. 解析 JavaScript 函数定义和注释
    3. 动态生成 RPC 导出
    4. 集成任务管理
    5. 支持热重载
    6. 提供自动补全和帮助信息
    """
    
    def __init__(self, base_dir: str):
        """
        初始化自定义脚本管理器
        
        Args:
            base_dir: fridac 项目根目录
        """
        self.base_dir = base_dir
        self.scripts_dir = os.path.join(base_dir, 'scripts')
        self.scripts: Dict[str, CustomScript] = {}
        self.functions: Dict[str, CustomFunction] = {}
        
        # 确保scripts目录存在
        if not os.path.exists(self.scripts_dir):
            os.makedirs(self.scripts_dir)
            log_info(f"✅ 已创建自定义脚本目录: {self.scripts_dir}")
            self._create_example_scripts()
        
        log_info(f"🎯 自定义脚本管理器初始化完成，监控目录: {self.scripts_dir}")
    
    def _create_example_scripts(self):
        """创建示例脚本"""
        example_script = '''/**
 * 自定义加密检测脚本
 * @description 检测应用中的加密操作
 * @author fridac-user
 */

/**
 * Hook应用的所有加密相关方法
 * @description 自动检测并Hook常见的加密方法，如MD5、SHA、AES等
 * @example hookAllCrypto(true)
 * @param {boolean} showStack - 是否显示调用栈
 */
function hookAllCrypto(showStack) {
    showStack = showStack || false;
    
    try {
        LOG("🔐 开始Hook所有加密方法...", { c: Color.Cyan });
        
        // Hook MessageDigest
        var MessageDigest = Java.use("java.security.MessageDigest");
        var digest_update = MessageDigest.update.overload('[B');
        digest_update.implementation = function(input) {
            var algorithm = this.getAlgorithm();
            LOG("🔍 MessageDigest." + algorithm + " 被调用", { c: Color.Yellow });
            LOG("  输入数据长度: " + input.length + " bytes", { c: Color.White });
            
            if (showStack) {
                printStack();
            }
            
            // 发送任务统计事件
            if (typeof TASK_ID !== 'undefined') {
                notifyTaskHit({
                    operation: "crypto_digest",
                    algorithm: algorithm,
                    input_length: input.length
                });
            }
            
            return digest_update.call(this, input);
        };
        
        // Hook Cipher
        var Cipher = Java.use("javax.crypto.Cipher");
        var cipher_init = Cipher.init.overload('int', 'java.security.Key');
        cipher_init.implementation = function(mode, key) {
            var transformation = this.getAlgorithm();
            var modeStr = (mode === 1) ? "ENCRYPT" : (mode === 2) ? "DECRYPT" : "UNKNOWN";
            LOG("🔍 Cipher." + transformation + " 初始化: " + modeStr, { c: Color.Yellow });
            
            if (showStack) {
                printStack();
            }
            
            if (typeof TASK_ID !== 'undefined') {
                notifyTaskHit({
                    operation: "crypto_cipher",
                    transformation: transformation,
                    mode: modeStr
                });
            }
            
            return cipher_init.call(this, mode, key);
        };
        
        LOG("✅ 加密方法Hook设置完成", { c: Color.Green });
        return true;
        
    } catch (error) {
        LOG("❌ Hook加密方法失败: " + error.message, { c: Color.Red });
        if (typeof TASK_ID !== 'undefined') {
            notifyTaskError(error);
        }
        return false;
    }
}

/**
 * 快速检测敏感字符串
 * @description 在内存中搜索包含敏感信息的字符串
 * @example findSensitiveStrings(['password', 'token', 'secret'])
 * @param {Array} keywords - 要搜索的关键词数组
 */
function findSensitiveStrings(keywords) {
    keywords = keywords || ['password', 'token', 'secret', 'key', 'auth'];
    
    try {
        LOG("🔍 开始搜索敏感字符串...", { c: Color.Cyan });
        
        var results = [];
        
        // 搜索堆内存
        Java.choose("java.lang.String", {
            onMatch: function(instance) {
                try {
                    var str = instance.toString();
                    for (var i = 0; i < keywords.length; i++) {
                        if (str.toLowerCase().indexOf(keywords[i].toLowerCase()) !== -1) {
                            results.push({
                                keyword: keywords[i],
                                content: str,
                                length: str.length
                            });
                            
                            if (results.length <= 10) { // 限制输出数量
                                LOG("🔍 发现敏感字符串 [" + keywords[i] + "]: " + str, { c: Color.Yellow });
                            }
                        }
                    }
                } catch (e) {
                    // 忽略无法访问的字符串
                }
            },
            onComplete: function() {
                LOG("✅ 搜索完成，找到 " + results.length + " 个敏感字符串", { c: Color.Green });
                
                if (typeof TASK_ID !== 'undefined') {
                    notifyTaskHit({
                        operation: "sensitive_search",
                        keywords: keywords,
                        results_count: results.length
                    });
                }
            }
        });
        
        return results;
        
    } catch (error) {
        LOG("❌ 搜索敏感字符串失败: " + error.message, { c: Color.Red });
        if (typeof TASK_ID !== 'undefined') {
            notifyTaskError(error);
        }
        return [];
    }
}

/**
 * 监控网络请求中的敏感数据
 * @description Hook网络请求，检测其中是否包含敏感信息
 * @example monitorSensitiveNetwork(['password', 'card'])
 * @param {Array} sensitiveFields - 敏感字段名称数组
 */
function monitorSensitiveNetwork(sensitiveFields) {
    sensitiveFields = sensitiveFields || ['password', 'passwd', 'pwd', 'token', 'key', 'secret', 'card'];
    
    try {
        LOG("🌐 开始监控敏感网络数据...", { c: Color.Cyan });
        
        // Hook HttpURLConnection
        var HttpURLConnection = Java.use("java.net.HttpURLConnection");
        var getOutputStream = HttpURLConnection.getOutputStream.overload();
        
        getOutputStream.implementation = function() {
            var url = this.getURL().toString();
            LOG("🌐 网络请求: " + url, { c: Color.Blue });
            
            // 检查URL中是否包含敏感字段
            for (var i = 0; i < sensitiveFields.length; i++) {
                if (url.toLowerCase().indexOf(sensitiveFields[i]) !== -1) {
                    LOG("⚠️ 发现敏感URL参数: " + sensitiveFields[i], { c: Color.Red });
                    
                    if (typeof TASK_ID !== 'undefined') {
                        notifyTaskHit({
                            operation: "sensitive_network",
                            field: sensitiveFields[i],
                            url: url,
                            type: "url_parameter"
                        });
                    }
                }
            }
            
            return getOutputStream.call(this);
        };
        
        LOG("✅ 敏感网络监控设置完成", { c: Color.Green });
        return true;
        
    } catch (error) {
        LOG("❌ 设置敏感网络监控失败: " + error.message, { c: Color.Red });
        if (typeof TASK_ID !== 'undefined') {
            notifyTaskError(error);
        }
        return false;
    }
}
'''
        
        example_path = os.path.join(self.scripts_dir, 'crypto_detector.js')
        with open(example_path, 'w', encoding='utf-8') as f:
            f.write(example_script)
        
        log_success(f"✅ 已创建示例脚本: {example_path}")
    
    def scan_scripts(self) -> int:
        """
        扫描scripts目录，加载所有JavaScript脚本
        
        Returns:
            成功加载的脚本数量
        """
        if not os.path.exists(self.scripts_dir):
            log_warning(f"⚠️ 脚本目录不存在: {self.scripts_dir}")
            return 0
        
        loaded_count = 0
        error_count = 0

        # 递归扫描 scripts/ 子目录，支持按文件夹分类
        for dirpath, _dirnames, filenames in os.walk(self.scripts_dir):
            for filename in filenames:
                if not filename.endswith('.js'):
                    continue

                file_path = os.path.join(dirpath, filename)
                # 使用相对路径作为脚本唯一键，避免同名文件冲突
                rel_key = os.path.relpath(file_path, self.scripts_dir)

                try:
                    if self._load_script(file_path, rel_key):
                        loaded_count += 1
                    else:
                        error_count += 1
                except Exception as e:
                    log_error(f"❌ 加载脚本失败 {rel_key}: {e}")
                    error_count += 1
        
        log_success(f"✅ 脚本扫描完成: 成功 {loaded_count}, 失败 {error_count}")
        return loaded_count
    
    def _load_script(self, file_path: str, key_name: Optional[str] = None) -> bool:
        """
        加载单个脚本文件
        
        Args:
            file_path: 脚本文件路径
            
        Returns:
            是否加载成功
        """
        try:
            # 以相对路径作为唯一键，避免同名文件冲突
            rel_key = key_name or os.path.relpath(file_path, self.scripts_dir)
            stat_info = os.stat(file_path)
            last_modified = stat_info.st_mtime
            
            # 检查是否需要重新加载
            if rel_key in self.scripts:
                existing = self.scripts[rel_key]
                if existing.last_modified >= last_modified:
                    return True  # 文件未变化，跳过
            
            with open(file_path, 'r', encoding='utf-8') as f:
                script_content = f.read()
            
            # 解析函数
            functions = self._parse_functions(script_content, file_path)
            
            if not functions:
                # 修复未定义变量 filename，改为使用文件名
                log_debug(f"⚠️ 脚本中未找到函数定义: {os.path.basename(file_path)}")
                return False
            
            # 创建脚本对象
            script = CustomScript(
                file_path=file_path,
                file_name=os.path.basename(file_path),
                functions=functions,
                last_modified=last_modified,
                load_time=datetime.now()
            )
            
            # 保存到管理器
            self.scripts[rel_key] = script
            
            # 更新函数索引
            for func_name, func_info in functions.items():
                self.functions[func_name] = func_info
            
            log_success(f"✅ 已加载脚本: {rel_key} ({len(functions)} 个函数)")
            return True
            
        except Exception as e:
            log_error(f"❌ 加载脚本失败 {file_path}: {e}")
            return False
    
    def _parse_functions(self, script_content: str, file_path: str) -> Dict[str, CustomFunction]:
        """
        解析JavaScript脚本中的函数定义
        
        Args:
            script_content: 脚本内容
            file_path: 脚本文件路径
            
        Returns:
            函数信息字典
        """
        functions = {}
        
        # 匹配函数定义的正则表达式
        # 支持标准函数定义和带JSDoc注释的函数
        function_pattern = r'(?:/\*\*[\s\S]*?\*/\s*)?function\s+(\w+)\s*\(([^)]*)\)\s*\{'
        
        for match in re.finditer(function_pattern, script_content, re.MULTILINE):
            func_name = match.group(1)

            # 过滤内部工具函数：以双下划线开头的不对外展示/导出
            if func_name.startswith('__'):
                log_debug(f"⏭️ 跳过内部函数: {func_name}")
                continue
            params_str = match.group(2).strip()
            
            # 解析参数
            parameters = []
            if params_str:
                parameters = [p.strip() for p in params_str.split(',')]
            
            # 提取JSDoc注释
            start_pos = match.start()
            preceding_text = script_content[:start_pos]
            
            description = self._extract_description(preceding_text)
            example = self._extract_example(preceding_text) 
            
            # 提取函数体（简化版，找到匹配的大括号）
            function_start = match.start()
            function_code = self._extract_function_body(script_content, function_start)
            
            # 默认描述和示例
            if not description:
                description = f"自定义函数: {func_name}"
            if not example:
                example_params = ', '.join([f'arg{i+1}' for i in range(len(parameters))])
                example = f"{func_name}({example_params})"
            
            function_info = CustomFunction(
                name=func_name,
                description=description,
                example=example,
                script_path=file_path,
                function_code=function_code,
                parameters=parameters,
                last_modified=time.time(),
                task_capable=True  # 默认支持任务管理
            )
            
            functions[func_name] = function_info
            log_debug(f"📝 解析函数: {func_name}({', '.join(parameters)})")
        
        return functions
    
    def _extract_description(self, preceding_text: str) -> str:
        """从JSDoc注释中提取描述"""
        # 查找最近的JSDoc块
        jsdoc_pattern = r'/\*\*\s*(.*?)\s*\*/'
        matches = list(re.finditer(jsdoc_pattern, preceding_text, re.DOTALL))
        
        if not matches:
            return ""
        
        last_match = matches[-1]
        comment_text = last_match.group(1)
        
        # 查找@description标签
        desc_pattern = r'@description\s+([^\n@]+)'
        desc_match = re.search(desc_pattern, comment_text)
        if desc_match:
            return desc_match.group(1).strip()
        
        # 如果没有@description，使用第一行作为描述
        lines = comment_text.split('\n')
        for line in lines:
            line = line.strip().lstrip('*').strip()
            if line and not line.startswith('@'):
                return line
        
        return ""
    
    def _extract_example(self, preceding_text: str) -> str:
        """从JSDoc注释中提取示例"""
        # 查找最近的JSDoc块
        jsdoc_pattern = r'/\*\*\s*(.*?)\s*\*/'
        matches = list(re.finditer(jsdoc_pattern, preceding_text, re.DOTALL))
        
        if not matches:
            return ""
        
        last_match = matches[-1]
        comment_text = last_match.group(1)
        
        # 查找@example标签
        example_pattern = r'@example\s+([^\n@]+)'
        example_match = re.search(example_pattern, comment_text)
        if example_match:
            return example_match.group(1).strip()
        
        return ""
    
    def _extract_function_body(self, script_content: str, start_pos: int) -> str:
        """提取函数体代码"""
        # 找到函数开始的大括号
        brace_start = script_content.find('{', start_pos)
        if brace_start == -1:
            return ""
        
        # 计算匹配的大括号
        brace_count = 0
        in_string = False
        escape_next = False
        quote_char = None
        
        for i in range(brace_start, len(script_content)):
            char = script_content[i]
            
            if escape_next:
                escape_next = False
                continue
            
            if char == '\\':
                escape_next = True
                continue
            
            if not in_string:
                if char in ['"', "'"]:
                    in_string = True
                    quote_char = char
                elif char == '{':
                    brace_count += 1
                elif char == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        return script_content[start_pos:i+1]
            else:
                if char == quote_char:
                    in_string = False
                    quote_char = None
        
        return script_content[start_pos:]  # 如果没找到匹配的括号，返回到文件末尾
    
    def get_all_functions(self) -> Dict[str, CustomFunction]:
        """获取所有自定义函数"""
        return self.functions.copy()
    
    def get_function(self, func_name: str) -> Optional[CustomFunction]:
        """获取指定的自定义函数"""
        return self.functions.get(func_name)
    
    def generate_script_imports(self) -> str:
        """
        生成自定义脚本的导入代码
        
        Returns:
            JavaScript导入代码
        """
        if not self.functions:
            return ""
        
        imports = []
        imports.append("// ===== 自定义脚本导入 =====")
        
        for script_name, script in self.scripts.items():
            if script.error_message:
                imports.append(f"// 跳过有错误的脚本: {script_name}")
                continue
            
            imports.append(f"\n// 来自: {script_name}")
            
            # 读取脚本内容
            try:
                with open(script.file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # 移除JSDoc注释以减少大小
                content = re.sub(r'/\*\*[\s\S]*?\*/', '', content)
                imports.append(content)
                
            except Exception as e:
                imports.append(f"// 读取脚本失败: {e}")
        
        imports.append("\n// ===== 自定义脚本导入结束 =====")
        return '\n'.join(imports)
    
    def generate_rpc_exports(self) -> str:
        """
        生成自定义函数的RPC导出代码
        
        Returns:
            JavaScript RPC导出代码
        """
        if not self.functions:
            return ""
        
        exports = []
        exports.append("// ===== 自定义函数 RPC 导出 =====")
        
        for func_name, func_info in self.functions.items():
            if func_name.startswith('__'):
                continue
            exports.append(f"    {func_name}: typeof {func_name} !== 'undefined' ? {func_name} : function() {{ ")
            exports.append(f"        LOG('❌ 自定义函数 {func_name} 未加载或有错误', {{ c: Color.Red }}); ")
            exports.append(f"        return false; ")
            exports.append(f"    }},")
        
        return '\n'.join(exports)
    
    def generate_help_info(self) -> List[Tuple[str, str, str]]:
        """
        生成帮助信息
        
        Returns:
            (函数名, 描述, 示例) 的列表
        """
        help_info = []
        
        for func_name, func_info in self.functions.items():
            if func_name.startswith('__'):
                continue
            help_info.append((
                func_name,
                func_info.description,
                func_info.example
            ))
        
        return help_info
    
    def reload_scripts(self) -> int:
        """
        重新加载所有脚本
        
        Returns:
            重新加载的脚本数量
        """
        log_info("🔄 开始重新加载自定义脚本...")
        
        # 清除现有数据
        old_count = len(self.functions)
        self.scripts.clear()
        self.functions.clear()
        
        # 重新扫描
        new_count = self.scan_scripts()
        
        log_success(f"🔄 脚本重载完成: {old_count} → {new_count} 个函数")
        return new_count
    
    def get_stats(self) -> Dict[str, Any]:
        """获取统计信息"""
        return {
            'scripts_count': len(self.scripts),
            'functions_count': len(self.functions),
            'scripts_dir': self.scripts_dir,
            'last_scan': datetime.now().isoformat()
        }
