"""
fridac Ghidra 桥接模块
直接通过 HTTP API 与 Ghidra (GhidraMCP 插件) 交互
无需 AI/MCP，可在 fridac CLI 中直接使用

使用前提：
1. Ghidra 已安装 GhidraMCP 插件
2. 在 CodeBrowser 中打开二进制文件并启用插件
3. HTTP 服务器运行在 http://127.0.0.1:8080/ (可配置)

用法:
    from fridac_core.ghidra_bridge import GhidraBridge
    
    ghidra = GhidraBridge()  # 或 GhidraBridge("http://192.168.1.100:8080/")
    
    # 列出函数
    funcs = ghidra.list_functions()
    
    # 反编译函数
    code = ghidra.decompile("main")
    
    # 搜索字符串
    strings = ghidra.search_strings("password")
"""

import json
import requests
from typing import Optional, List, Dict, Any, Union
from urllib.parse import urljoin

from .logger import log_info, log_success, log_warning, log_error, log_debug


DEFAULT_GHIDRA_SERVER = "http://127.0.0.1:8080/"
DEFAULT_TIMEOUT = 30


class GhidraBridge:
    """Ghidra HTTP API 客户端"""
    
    def __init__(self, server_url: str = DEFAULT_GHIDRA_SERVER, timeout: int = DEFAULT_TIMEOUT):
        """
        初始化 Ghidra 桥接
        
        Args:
            server_url: Ghidra HTTP 服务器地址，默认 http://127.0.0.1:8080/
            timeout: 请求超时时间（秒）
        """
        self.server_url = server_url.rstrip('/') + '/'
        self.timeout = timeout
        self._connected = False
    
    def _get(self, endpoint: str, params: dict = None) -> Union[List[str], str]:
        """执行 GET 请求"""
        if params is None:
            params = {}
        
        url = urljoin(self.server_url, endpoint)
        
        try:
            response = requests.get(url, params=params, timeout=self.timeout)
            response.encoding = 'utf-8'
            if response.ok:
                self._connected = True
                return response.text.splitlines()
            else:
                return [f"错误 {response.status_code}: {response.text.strip()}"]
        except requests.exceptions.ConnectionError:
            return ["连接失败: Ghidra 服务器未运行或地址错误"]
        except requests.exceptions.Timeout:
            return ["请求超时"]
        except Exception as e:
            return [f"请求失败: {str(e)}"]
    
    def _post(self, endpoint: str, data: Union[dict, str]) -> str:
        """执行 POST 请求"""
        url = urljoin(self.server_url, endpoint)
        
        try:
            if isinstance(data, dict):
                response = requests.post(url, data=data, timeout=self.timeout)
            else:
                response = requests.post(url, data=data.encode("utf-8"), timeout=self.timeout)
            response.encoding = 'utf-8'
            if response.ok:
                self._connected = True
                return response.text.strip()
            else:
                return f"错误 {response.status_code}: {response.text.strip()}"
        except requests.exceptions.ConnectionError:
            return "连接失败: Ghidra 服务器未运行或地址错误"
        except requests.exceptions.Timeout:
            return "请求超时"
        except Exception as e:
            return f"请求失败: {str(e)}"
    
    def is_connected(self) -> bool:
        """检查是否已连接到 Ghidra"""
        try:
            result = self._get("methods", {"limit": 1})
            return not any("连接失败" in str(r) or "错误" in str(r) for r in result)
        except:
            return False
    
    # ============= 列表查询 =============
    
    def list_functions(self, offset: int = 0, limit: int = 100) -> List[str]:
        """列出所有函数名"""
        return self._get("methods", {"offset": offset, "limit": limit})
    
    def list_classes(self, offset: int = 0, limit: int = 100) -> List[str]:
        """列出所有类/命名空间"""
        return self._get("classes", {"offset": offset, "limit": limit})
    
    def list_namespaces(self, offset: int = 0, limit: int = 100) -> List[str]:
        """列出所有命名空间"""
        return self._get("namespaces", {"offset": offset, "limit": limit})
    
    def list_segments(self, offset: int = 0, limit: int = 100) -> List[str]:
        """列出所有内存段"""
        return self._get("segments", {"offset": offset, "limit": limit})
    
    def list_imports(self, offset: int = 0, limit: int = 100) -> List[str]:
        """列出导入符号"""
        return self._get("imports", {"offset": offset, "limit": limit})
    
    def list_exports(self, offset: int = 0, limit: int = 100) -> List[str]:
        """列出导出符号"""
        return self._get("exports", {"offset": offset, "limit": limit})
    
    def list_data(self, offset: int = 0, limit: int = 100) -> List[str]:
        """列出定义的数据标签"""
        return self._get("data", {"offset": offset, "limit": limit})
    
    def list_strings(self, offset: int = 0, limit: int = 2000, filter: str = None) -> List[str]:
        """
        列出程序中的字符串
        
        Args:
            offset: 分页偏移
            limit: 返回数量限制
            filter: 可选的过滤字符串
        """
        params = {"offset": offset, "limit": limit}
        if filter:
            params["filter"] = filter
        return self._get("strings", params)
    
    # ============= 反编译/反汇编 =============
    
    def decompile(self, name: str) -> str:
        """
        反编译指定函数（按名称）
        
        Args:
            name: 函数名
            
        Returns:
            反编译的 C 代码
        """
        return self._post("decompile", name)
    
    def decompile_at(self, address: str) -> str:
        """
        反编译指定地址的函数
        
        Args:
            address: 地址（如 "0x1400010a0"）
            
        Returns:
            反编译的 C 代码
        """
        lines = self._get("decompile_function", {"address": address})
        return "\n".join(lines)
    
    def disassemble(self, address: str) -> List[str]:
        """
        获取函数的汇编代码
        
        Args:
            address: 函数地址
            
        Returns:
            汇编指令列表
        """
        return self._get("disassemble_function", {"address": address})
    
    # ============= 函数查询 =============
    
    def get_function(self, address: str) -> str:
        """根据地址获取函数信息"""
        lines = self._get("get_function_by_address", {"address": address})
        return "\n".join(lines)
    
    def get_current_function(self) -> str:
        """获取 Ghidra 当前选中的函数"""
        lines = self._get("get_current_function")
        return "\n".join(lines)
    
    def get_current_address(self) -> str:
        """获取 Ghidra 当前选中的地址"""
        lines = self._get("get_current_address")
        return "\n".join(lines)
    
    def search_functions(self, query: str, offset: int = 0, limit: int = 100) -> List[str]:
        """
        搜索函数名
        
        Args:
            query: 搜索关键字（子串匹配）
            offset: 分页偏移
            limit: 返回数量限制
        """
        if not query:
            return ["错误: 需要提供搜索关键字"]
        return self._get("searchFunctions", {"query": query, "offset": offset, "limit": limit})
    
    # ============= 交叉引用 =============
    
    def xrefs_to(self, address: str, offset: int = 0, limit: int = 100) -> List[str]:
        """
        获取指向该地址的所有引用
        
        Args:
            address: 目标地址
        """
        return self._get("xrefs_to", {"address": address, "offset": offset, "limit": limit})
    
    def xrefs_from(self, address: str, offset: int = 0, limit: int = 100) -> List[str]:
        """
        获取从该地址发出的所有引用
        
        Args:
            address: 源地址
        """
        return self._get("xrefs_from", {"address": address, "offset": offset, "limit": limit})
    
    def function_xrefs(self, name: str, offset: int = 0, limit: int = 100) -> List[str]:
        """
        获取指向指定函数的所有引用
        
        Args:
            name: 函数名
        """
        return self._get("function_xrefs", {"name": name, "offset": offset, "limit": limit})
    
    def get_callee(self, address: str) -> List[str]:
        """
        获取函数调用的所有子函数
        
        Args:
            address: 函数地址
        """
        lines = self._get("get_callee", {"address": address})
        # 尝试解析 JSON
        try:
            body = "\n".join(lines).strip()
            if body.startswith("[") and body.endswith("]"):
                parsed = json.loads(body)
                if isinstance(parsed, list):
                    return parsed
        except:
            pass
        return lines
    
    # ============= 重命名操作 =============
    
    def rename_function(self, old_name: str, new_name: str) -> str:
        """重命名函数（按名称）"""
        return self._post("renameFunction", {"oldName": old_name, "newName": new_name})
    
    def rename_function_at(self, address: str, new_name: str) -> str:
        """重命名函数（按地址）"""
        return self._post("rename_function_by_address", {
            "function_address": address,
            "new_name": new_name
        })
    
    def rename_variable(self, function_name: str, old_name: str, new_name: str) -> str:
        """重命名函数内的局部变量"""
        return self._post("renameVariable", {
            "functionName": function_name,
            "oldName": old_name,
            "newName": new_name
        })
    
    def rename_data(self, address: str, new_name: str) -> str:
        """重命名数据标签"""
        return self._post("renameData", {"address": address, "newName": new_name})
    
    # ============= 注释操作 =============
    
    def set_comment(self, address: str, comment: str) -> str:
        """在反编译代码中设置注释"""
        return self._post("set_decompiler_comment", {"address": address, "comment": comment})
    
    def set_asm_comment(self, address: str, comment: str) -> str:
        """在汇编代码中设置注释"""
        return self._post("set_disassembly_comment", {"address": address, "comment": comment})
    
    # ============= 类型操作 =============
    
    def set_function_prototype(self, address: str, prototype: str) -> str:
        """
        设置函数原型
        
        Args:
            address: 函数地址
            prototype: 函数原型（如 "int main(int argc, char **argv)"）
        """
        return self._post("set_function_prototype", {
            "function_address": address,
            "prototype": prototype
        })
    
    def set_variable_type(self, function_address: str, variable_name: str, new_type: str) -> str:
        """设置局部变量类型"""
        return self._post("set_local_variable_type", {
            "function_address": function_address,
            "variable_name": variable_name,
            "new_type": new_type
        })
    
    def set_data_type(self, address: str, data_type: str, length: int = -1) -> str:
        """
        设置全局数据类型
        
        Args:
            address: 内存地址
            data_type: 数据类型（如 "int", "char*", "MyStruct"）
            length: 可选长度
        """
        data = {
            "address": address,
            "data_type": data_type,
            "clear_mode": "CHECK_FOR_SPACE"
        }
        if length > 0:
            data["length"] = str(length)
        return self._post("set_global_data_type", data)
    
    # ============= 内存操作 =============
    
    def get_bytes(self, address: str, size: int = 16) -> str:
        """
        读取内存字节
        
        Args:
            address: 起始地址
            size: 读取字节数
        """
        lines = self._get("get_bytes", {"address": address, "size": size})
        return "\n".join(lines)
    
    def set_bytes(self, address: str, bytes_hex: str) -> str:
        """
        写入内存字节
        
        Args:
            address: 目标地址
            bytes_hex: 十六进制字节（如 "90 90 90 90"）
        """
        return self._post("set_bytes", {"address": address, "bytes": bytes_hex})
    
    def search_bytes(self, bytes_hex: str, offset: int = 0, limit: int = 100) -> List[str]:
        """
        搜索字节序列
        
        Args:
            bytes_hex: 十六进制字节序列（如 "DEADBEEF" 或 "DE AD BE EF"）
        """
        return self._get("search_bytes", {"bytes": bytes_hex, "offset": offset, "limit": limit})
    
    # ============= 数据标签 =============
    
    def get_data(self, label: str) -> str:
        """获取数据标签信息"""
        lines = self._get("get_data_by_label", {"label": label})
        return "\n".join(lines)
    
    # ============= 结构体操作 =============
    
    def create_struct(self, name: str, members: List[Dict] = None, category: str = None, size: int = 0) -> str:
        """
        创建结构体
        
        Args:
            name: 结构体名称
            members: 成员列表 [{"name": "field1", "type": "int", "offset": 0, "comment": "..."}]
            category: 分类路径（如 "/my_structs"）
            size: 初始大小
        """
        data = {"name": name, "size": str(size)}
        if category:
            data["category"] = category
        if members:
            data["members"] = json.dumps(members)
        return self._post("create_struct", data)
    
    def get_struct(self, name: str, category: str = None) -> Dict:
        """获取结构体定义"""
        params = {"name": name}
        if category:
            params["category"] = category
        
        lines = self._get("get_struct", params)
        response_str = "\n".join(lines)
        
        try:
            return json.loads(response_str)
        except json.JSONDecodeError:
            return {"error": response_str}
    
    def add_struct_members(self, struct_name: str, members: List[Dict], category: str = None) -> str:
        """向结构体添加成员"""
        data = {"struct_name": struct_name, "members": json.dumps(members)}
        if category:
            data["category"] = category
        return self._post("add_struct_members", data)
    
    def remove_struct_members(self, struct_name: str, members: List[str], category: str = None) -> str:
        """从结构体删除成员"""
        data = {"struct_name": struct_name, "members": json.dumps(members)}
        if category:
            data["category"] = category
        return self._post("remove_struct_members", data)
    
    def clear_struct(self, struct_name: str, category: str = None) -> str:
        """清空结构体所有成员"""
        data = {"struct_name": struct_name}
        if category:
            data["category"] = category
        return self._post("clear_struct", data)
    
    # ============= 枚举操作 =============
    
    def create_enum(self, name: str, values: List[Dict] = None, category: str = None, size: int = 4) -> str:
        """
        创建枚举
        
        Args:
            name: 枚举名称
            values: 值列表 [{"name": "VALUE1", "value": 0, "comment": "..."}]
            category: 分类路径
            size: 枚举大小（字节）
        """
        data = {"name": name, "size": str(size)}
        if category:
            data["category"] = category
        if values:
            data["values"] = json.dumps(values)
        return self._post("create_enum", data)
    
    def get_enum(self, name: str, category: str = None) -> Dict:
        """获取枚举定义"""
        params = {"name": name}
        if category:
            params["category"] = category
        
        lines = self._get("get_enum", params)
        response_str = "\n".join(lines)
        
        try:
            return json.loads(response_str)
        except json.JSONDecodeError:
            return {"error": response_str}
    
    def add_enum_values(self, enum_name: str, values: List[Dict], category: str = None) -> str:
        """向枚举添加值"""
        data = {"enum_name": enum_name, "values": json.dumps(values)}
        if category:
            data["category"] = category
        return self._post("add_enum_values", data)
    
    def remove_enum_values(self, enum_name: str, values: List[str], category: str = None) -> str:
        """从枚举删除值"""
        data = {"enum_name": enum_name, "values": json.dumps(values)}
        if category:
            data["category"] = category
        return self._post("remove_enum_values", data)
    
    # ============= 书签 =============
    
    def add_bookmark(self, address: str, category: str, comment: str, type: str = "Note") -> str:
        """
        添加书签
        
        Args:
            address: 地址
            category: 书签分类
            comment: 书签注释
            type: 书签类型 (Note/Info/Warning/Error/Analysis)
        """
        return self._post("add_bookmark", {
            "address": address,
            "category": category,
            "comment": comment,
            "type": type,
            "format": "json"
        })


# ============= 便捷函数 =============

_default_bridge: Optional[GhidraBridge] = None


def get_ghidra(server_url: str = None) -> GhidraBridge:
    """
    获取全局 Ghidra 桥接实例
    
    Args:
        server_url: Ghidra 服务器地址，不指定则使用默认或已有实例
    """
    global _default_bridge
    
    if server_url:
        _default_bridge = GhidraBridge(server_url)
    elif _default_bridge is None:
        _default_bridge = GhidraBridge()
    
    return _default_bridge


def ghidra_connect(server_url: str = DEFAULT_GHIDRA_SERVER) -> bool:
    """
    连接到 Ghidra 服务器
    
    Args:
        server_url: Ghidra HTTP 服务器地址
        
    Returns:
        是否连接成功
    """
    global _default_bridge
    _default_bridge = GhidraBridge(server_url)
    
    if _default_bridge.is_connected():
        log_success(f"✅ 已连接到 Ghidra: {server_url}")
        return True
    else:
        log_error(f"❌ 无法连接到 Ghidra: {server_url}")
        log_info("   请确保：")
        log_info("   1. Ghidra 已安装 GhidraMCP 插件")
        log_info("   2. 在 CodeBrowser 中打开二进制文件")
        log_info("   3. 启用 GhidraMCP 插件 (File → Configure → Developer)")
        return False


# ============= CLI 交互式命令 =============

def ghidra_cli_help():
    """显示 Ghidra 命令帮助"""
    help_text = """
╔══════════════════════════════════════════════════════════════════════════════╗
║                          🔧 Ghidra 桥接命令                                  ║
╚══════════════════════════════════════════════════════════════════════════════╝

连接:
  ghidra_connect()                    - 连接默认地址 (127.0.0.1:8080)
  ghidra_connect("http://IP:PORT/")   - 连接指定地址

查询:
  ghidra.list_functions(limit=100)    - 列出函数
  ghidra.list_imports()               - 列出导入
  ghidra.list_exports()               - 列出导出
  ghidra.list_strings(filter="pass")  - 搜索字符串
  ghidra.search_functions("main")     - 搜索函数名

分析:
  ghidra.decompile("main")            - 反编译函数（按名称）
  ghidra.decompile_at("0x401000")     - 反编译函数（按地址）
  ghidra.disassemble("0x401000")      - 获取汇编代码
  ghidra.get_function("0x401000")     - 获取函数信息
  ghidra.get_current_function()       - 获取当前选中函数

交叉引用:
  ghidra.xrefs_to("0x401000")         - 谁引用了这个地址
  ghidra.xrefs_from("0x401000")       - 这个地址引用了谁
  ghidra.function_xrefs("main")       - 谁调用了这个函数
  ghidra.get_callee("0x401000")       - 这个函数调用了谁

修改:
  ghidra.rename_function("sub_401000", "decrypt_data")
  ghidra.rename_function_at("0x401000", "decrypt_data")
  ghidra.rename_variable("main", "var1", "buffer")
  ghidra.set_comment("0x401000", "这里解密数据")
  ghidra.set_function_prototype("0x401000", "int decrypt(char *data, int len)")

内存:
  ghidra.get_bytes("0x401000", 32)    - 读取字节
  ghidra.set_bytes("0x401000", "90 90")  - 写入字节 (NOP)
  ghidra.search_bytes("DEADBEEF")     - 搜索字节

结构体:
  ghidra.create_struct("MyStruct", [{"name": "field1", "type": "int"}])
  ghidra.get_struct("MyStruct")
  ghidra.add_struct_members("MyStruct", [{"name": "field2", "type": "char*"}])

提示:
  - 连接后可通过 ghidra 变量访问所有功能
  - 地址格式: "0x401000" 或 "401000"
"""
    print(help_text)


# 为 CLI 导出的简化函数
def ghidra_decompile(name_or_addr: str) -> str:
    """反编译函数"""
    g = get_ghidra()
    if name_or_addr.startswith("0x") or name_or_addr.replace("0x", "").isalnum():
        # 看起来像地址
        if all(c in "0123456789abcdefABCDEFx" for c in name_or_addr):
            return g.decompile_at(name_or_addr)
    return g.decompile(name_or_addr)


def ghidra_search_strings(keyword: str, limit: int = 100) -> List[str]:
    """搜索字符串"""
    return get_ghidra().list_strings(filter=keyword, limit=limit)


def ghidra_xrefs(address: str) -> Dict[str, List[str]]:
    """获取地址的交叉引用（双向）"""
    g = get_ghidra()
    return {
        "to": g.xrefs_to(address),
        "from": g.xrefs_from(address)
    }

