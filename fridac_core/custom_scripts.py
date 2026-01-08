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

# 尝试导入 esprima 用于 JavaScript AST 解析
try:
    import esprima
    HAS_ESPRIMA = True
except ImportError:
    HAS_ESPRIMA = False

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
    1. 自动扫描多个 scripts/ 目录
    2. 解析 JavaScript 函数定义和注释
    3. 动态生成 RPC 导出
    4. 集成任务管理
    5. 支持热重载
    6. 提供自动补全和帮助信息
    
    脚本目录优先级（后加载的覆盖先加载的）：
    1. 安装目录/scripts/
    2. ~/.fridac/scripts/
    3. 当前目录/scripts/
    """
    
    def __init__(self, base_dir: str):
        """
        初始化自定义脚本管理器
        
        Args:
            base_dir: fridac 项目根目录
        """
        self.base_dir = base_dir
        self.scripts_dirs = self._get_scripts_dirs()
        self.scripts: Dict[str, CustomScript] = {}
        self.functions: Dict[str, CustomFunction] = {}
        
        # 确保至少一个scripts目录存在
        primary_scripts_dir = os.path.join(base_dir, 'scripts')
        if not os.path.exists(primary_scripts_dir):
            os.makedirs(primary_scripts_dir)
            self._create_example_scripts()
    
    def _get_scripts_dirs(self) -> List[str]:
        """
        获取所有脚本目录
        
        Returns:
            脚本目录列表（按优先级排序，后加载覆盖先加载）
        """
        dirs = []
        
        # 1. 安装目录/scripts/
        install_scripts = os.path.join(self.base_dir, 'scripts')
        dirs.append(install_scripts)
        
        # 2. ~/.fridac/scripts/（用户全局脚本）
        user_scripts = os.path.expanduser('~/.fridac/scripts')
        if user_scripts not in dirs:
            dirs.append(user_scripts)
        
        # 3. 当前目录/scripts/（项目特定脚本）
        cwd_scripts = os.path.join(os.getcwd(), 'scripts')
        if cwd_scripts not in dirs and cwd_scripts != install_scripts:
            dirs.append(cwd_scripts)
        
        # 4. FRIDAC_SCRIPTS_PATH 环境变量（可指定多个，用:分隔）
        env_paths = os.environ.get('FRIDAC_SCRIPTS_PATH', '')
        if env_paths:
            for p in env_paths.split(':'):
                p = p.strip()
                if p and p not in dirs:
                    dirs.append(p)
        
        return dirs
    
    @property
    def scripts_dir(self) -> str:
        """兼容旧代码，返回主脚本目录"""
        return self.scripts_dirs[0] if self.scripts_dirs else os.path.join(self.base_dir, 'scripts')
    
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
        扫描所有scripts目录，加载JavaScript脚本
        
        扫描顺序（后加载的同名函数会覆盖先加载的）：
        1. 安装目录/scripts/
        2. ~/.fridac/scripts/
        3. 当前目录/scripts/
        4. FRIDAC_SCRIPTS_PATH 环境变量指定的目录
        
        Returns:
            成功加载的脚本数量
        """
        loaded_count = 0
        error_count = 0
        scanned_dirs = 0

        for scripts_dir in self.scripts_dirs:
            if not os.path.exists(scripts_dir):
                continue
            
            scanned_dirs += 1

            # 递归扫描 scripts/ 子目录，支持按文件夹分类
            for dirpath, _dirnames, filenames in os.walk(scripts_dir):
                for filename in filenames:
                    if not filename.endswith('.js'):
                        continue

                    file_path = os.path.join(dirpath, filename)
                    # 使用相对路径作为脚本唯一键
                    rel_key = os.path.relpath(file_path, scripts_dir)

                    try:
                        if self._load_script(file_path, rel_key):
                            loaded_count += 1
                        else:
                            error_count += 1
                    except Exception as e:
                        log_error(f"❌ 加载脚本失败 {rel_key}: {e}")
                        error_count += 1
        
        # 只在加载了自定义脚本时显示汇总信息
        if loaded_count > 0:
            # 收集所有自定义函数名
            custom_funcs = [name for name in self.functions.keys() if not name.startswith('__')]
            if custom_funcs:
                log_success(f"🔧 自定义脚本: {len(self.scripts)} 个, 函数: {', '.join(custom_funcs)}")
        
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
            
            return True
            
        except Exception as e:
            log_error(f"❌ 加载脚本失败 {file_path}: {e}")
            return False
    
    def _parse_functions(self, script_content: str, file_path: str) -> Dict[str, CustomFunction]:
        """
        解析JavaScript脚本中的函数定义（仅获取最外层函数）
        
        Args:
            script_content: 脚本内容
            file_path: 脚本文件路径
            
        Returns:
            函数信息字典
        """
        functions = {}
        
        # 优先使用 AST 解析，回退到正则表达式
        if HAS_ESPRIMA:
            functions = self._parse_functions_with_ast(script_content, file_path)
        else:
            functions = self._parse_functions_with_regex(script_content, file_path)
            
        return functions
    
    def _parse_functions_with_ast(self, script_content: str, file_path: str) -> Dict[str, CustomFunction]:
        """
        使用 AST 解析 JavaScript 函数（仅最外层函数）
        
        Args:
            script_content: 脚本内容
            file_path: 脚本文件路径
            
        Returns:
            函数信息字典
        """
        functions = {}
        
        try:
            # 解析 JavaScript 代码为 AST
            ast = esprima.parseScript(script_content, {'attachComments': True, 'range': True, 'comments': True})
            
            # 遍历顶层声明，只获取函数声明
            for node in ast.body:
                if node.type == 'FunctionDeclaration':
                    func_name = node.id.name
                    
                    # 过滤内部工具函数：以双下划线开头的不对外展示/导出
                    if func_name.startswith('__'):
                        continue
                    
                    # 获取参数列表
                    parameters = [param.name for param in node.params if hasattr(param, 'name')]
                    
                    # 获取函数在源码中的位置
                    start_pos, end_pos = node.range
                    function_code = script_content[start_pos:end_pos]
                    
                    # 提取 JSDoc 注释（从 AST 的 leadingComments 或全局 comments）
                    description = ""
                    example = ""
                    
                    # 尝试从节点的 leadingComments 获取
                    if hasattr(node, 'leadingComments') and node.leadingComments:
                        for comment in node.leadingComments:
                            if comment.type == 'Block' and comment.value.strip().startswith('*'):
                                # JSDoc 注释
                                comment_text = comment.value
                                description = self._extract_description_from_comment(comment_text)
                                example = self._extract_example_from_comment(comment_text)
                                break
                    
                    # 如果没有找到，尝试从全局 comments 中查找
                    if not description and hasattr(ast, 'comments') and ast.comments:
                        func_start = node.range[0]
                        # 查找函数前面最近的 JSDoc 注释
                        closest_comment = None
                        for comment in ast.comments:
                            if (comment.type == 'Block' and 
                                comment.value.strip().startswith('*') and 
                                hasattr(comment, 'range') and
                                comment.range[1] < func_start):
                                closest_comment = comment
                        
                        if closest_comment:
                            comment_text = closest_comment.value
                            description = self._extract_description_from_comment(comment_text)
                            example = self._extract_example_from_comment(comment_text)
                    
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
                        task_capable=True
                    )
                    
                    functions[func_name] = function_info
                    
        except Exception as e:
            log_warning(f"⚠️ AST 解析失败，回退到正则表达式: {e}")
            return self._parse_functions_with_regex(script_content, file_path)
            
        return functions
    
    def _parse_functions_with_regex(self, script_content: str, file_path: str) -> Dict[str, CustomFunction]:
        """
        使用正则表达式解析 JavaScript 函数（仅最外层函数）
        
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
                continue
                
            # 检查是否为最外层函数（不在其他函数内部）
            if not self._is_top_level_function(script_content, match.start()):
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
    
    def _extract_description_from_comment(self, comment_text: str) -> str:
        """从JSDoc注释文本中提取描述"""
        # 查找@description标签
        desc_pattern = r'@description\s+([^\n@]+)'
        desc_match = re.search(desc_pattern, comment_text)
        if desc_match:
            return desc_match.group(1).strip()
        
        # 如果没有@description，提取第一行非空注释作为描述
        lines = comment_text.split('\n')
        for line in lines:
            line = line.strip(' */')
            if line and not line.startswith('@'):
                return line.strip()
        
        return ""
    
    def _extract_example_from_comment(self, comment_text: str) -> str:
        """从JSDoc注释文本中提取示例"""
        # 查找@example标签
        example_pattern = r'@example\s+([^\n@]+)'
        example_match = re.search(example_pattern, comment_text)
        if example_match:
            return example_match.group(1).strip()
        
        return ""
    
    def _is_top_level_function(self, script_content: str, func_start: int) -> bool:
        """
        检查函数是否为顶层函数（不在其他函数内部）
        
        Args:
            script_content: 脚本内容
            func_start: 函数开始位置
            
        Returns:
            是否为顶层函数
        """
        # 简单的大括号计数方法
        brace_count = 0
        in_string = False
        escape_next = False
        quote_char = None
        
        for i in range(func_start):
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
            else:
                if char == quote_char:
                    in_string = False
                    quote_char = None
        
        # 如果大括号计数为0，说明是顶层函数
        return brace_count == 0
    
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
                # 确保脚本内容以换行结尾，避免和下一个脚本连在一起
                if not content.endswith('\n'):
                    content += '\n'
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
    
    def list_available_scripts(self) -> List[Dict[str, Any]]:
        """列出所有可用的自定义脚本"""
        print("\n" + "=" * 60)
        print("📦 可用的自定义脚本")
        print("=" * 60)
        
        script_list = []
        idx = 1
        
        for scripts_dir in self.scripts_dirs:
            if not os.path.exists(scripts_dir):
                continue
            
            print(f"\n📁 {scripts_dir}")
            print("-" * 50)
            
            for dirpath, _dirnames, filenames in os.walk(scripts_dir):
                for filename in sorted(filenames):
                    if not filename.endswith('.js'):
                        continue
                    
                    file_path = os.path.join(dirpath, filename)
                    rel_path = os.path.relpath(file_path, scripts_dir)
                    
                    desc, funcs = "", []
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                        desc_match = re.search(r'@description\s+(.+?)(?:\n|\*)', content)
                        if desc_match:
                            desc = desc_match.group(1).strip()[:50]
                        func_matches = re.findall(r'function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(', content)
                        funcs = [f for f in func_matches if not f.startswith('_')][:3]
                    except:
                        pass
                    
                    script_list.append({
                        'index': idx, 'name': filename.replace('.js', ''),
                        'path': rel_path, 'full_path': file_path,
                        'description': desc, 'functions': funcs
                    })
                    
                    print(f"  [{idx:2d}] {rel_path}")
                    if desc:
                        print(f"       {desc}")
                    if funcs:
                        print(f"       函数: {', '.join(funcs)}")
                    idx += 1
        
        print("\n" + "=" * 60)
        print(f"共 {len(script_list)} 个脚本")
        print("\n💡 使用: fridac --scripts ssl_bypass,anti_anti_debug")
        print("         fridac --no-scripts  # 不加载自定义脚本")
        print("         fridac -s            # 交互式选择")
        print("=" * 60 + "\n")
        return script_list
    
    def select_scripts_interactive(self) -> List[str]:
        """交互式选择要加载的脚本"""
        script_list = []
        idx = 1
        
        for scripts_dir in self.scripts_dirs:
            if not os.path.exists(scripts_dir):
                continue
            for dirpath, _dirnames, filenames in os.walk(scripts_dir):
                for filename in sorted(filenames):
                    if not filename.endswith('.js'):
                        continue
                    file_path = os.path.join(dirpath, filename)
                    desc = ""
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            content = f.read(500)
                        desc_match = re.search(r'@description\s+(.+?)(?:\n|\*)', content)
                        if desc_match:
                            desc = desc_match.group(1).strip()[:40]
                    except:
                        pass
                    script_list.append({'index': idx, 'name': filename.replace('.js', ''),
                                        'full_path': file_path, 'description': desc})
                    idx += 1
        
        if not script_list:
            log_warning("没有找到可用的自定义脚本")
            return []
        
        print("\n" + "=" * 60)
        print("📦 选择要加载的脚本 (输入编号，逗号分隔)")
        print("=" * 60)
        for s in script_list:
            desc_str = f" - {s['description']}" if s['description'] else ""
            print(f"  [{s['index']:2d}] {s['name']}{desc_str}")
        print("-" * 60)
        print("  [ 0] 全部加载  [-1] 不加载")
        print("=" * 60)
        
        try:
            selection = input("\n选择 (如 1,3,5): ").strip()
            if selection == '0' or selection == '':
                return [s['name'] for s in script_list]
            elif selection == '-1':
                return []
            else:
                selected = []
                for part in selection.split(','):
                    part = part.strip()
                    if '-' in part and not part.startswith('-'):
                        start, end = part.split('-')
                        for i in range(int(start), int(end) + 1):
                            for s in script_list:
                                if s['index'] == i:
                                    selected.append(s['name'])
                    else:
                        for s in script_list:
                            if s['index'] == int(part):
                                selected.append(s['name'])
                if selected:
                    log_success(f"✅ 已选择: {', '.join(selected)}")
                return selected
        except:
            log_warning("选择取消，加载全部")
            return [s['name'] for s in script_list]
