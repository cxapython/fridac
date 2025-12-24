"""
fridac Small-Trace 集成模块
基于 QBDI 的 SO 汇编追踪功能

功能：
1. 自动检测/下载 libqdbi.so (优先使用本地预置文件)
2. 生成追踪脚本
3. 执行追踪并收集输出
"""

import os
import re
import subprocess
import time
import tempfile
from typing import Optional, Tuple, List, Dict
from dataclasses import dataclass

from .logger import log_info, log_success, log_warning, log_error, log_debug

# Small-Trace libqdbi.so 下载 URL
# 优先使用 fridac 项目自己的 release (更稳定)
LIBQDBI_DOWNLOAD_URL = "https://github.com/cxapython/fridac/releases/download/v1.0.0/libqdbi.so"
LIBQDBI_DOWNLOAD_URLS = [
    LIBQDBI_DOWNLOAD_URL,
    # 镜像站
    "https://ghproxy.com/" + LIBQDBI_DOWNLOAD_URL,
    "https://mirror.ghproxy.com/" + LIBQDBI_DOWNLOAD_URL,
    # 备用: Small-Trace 原始仓库
    "https://github.com/user-attachments/files/18245555/libqdbi.so.zip",
]

# 追踪库在设备上的路径
LIBQDBI_DEVICE_PATH = "/data/local/tmp/libqdbi.so"

# 追踪输出文件格式
DEFAULT_TRACE_OUTPUT = "/data/data/{package}/qbdi_trace.log"


def get_binaries_dir() -> str:
    """获取本地 binaries 目录路径"""
    module_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(module_dir)
    return os.path.join(project_root, 'binaries')


def get_local_libqdbi(arch: str = 'arm64') -> Optional[str]:
    """
    检查本地是否有预置的 libqdbi.so
    
    Args:
        arch: CPU 架构 (目前仅支持 arm64)
        
    Returns:
        本地文件路径，不存在则返回 None
    """
    binaries_dir = get_binaries_dir()
    libqdbi_path = os.path.join(binaries_dir, arch, 'libqdbi.so')
    
    if os.path.isfile(libqdbi_path) and os.path.getsize(libqdbi_path) > 15000000:  # > 15MB
        return libqdbi_path
    
    return None


@dataclass
class SmallTraceConfig:
    """Small-Trace 追踪配置"""
    so_name: str                    # 目标 SO 名称 (如 libjnicalculator.so)
    offset: int = 0                 # 函数偏移 (如 0x21244)
    symbol: str = ""                # 符号名 (如 encryptToMd5Hex)
    trace_mode: int = 1             # 0=符号追踪, 1=偏移追踪
    args_count: int = 5             # 函数参数数量
    output_file: str = ""           # 本地输出文件路径
    package_name: str = ""          # 应用包名 (用于定位追踪日志)


class SmallTraceManager:
    """
    Small-Trace 管理器
    
    功能：
    1. 检测/推送 libqdbi.so
    2. 生成追踪脚本
    3. 执行追踪
    4. 收集追踪输出
    """
    
    def __init__(self, device_id: Optional[str] = None):
        self.device_id = device_id
        self.libqdbi_ready = False
        self.current_package: Optional[str] = None
        
    def _run_adb(self, *args, check: bool = True, capture: bool = True) -> Tuple[int, str, str]:
        """执行 adb 命令"""
        cmd = ['adb']
        if self.device_id:
            cmd.extend(['-s', self.device_id])
        cmd.extend(args)
        
        try:
            result = subprocess.run(
                cmd,
                capture_output=capture,
                text=True,
                timeout=60
            )
            return result.returncode, result.stdout.strip(), result.stderr.strip()
        except subprocess.TimeoutExpired:
            return -1, '', 'Command timed out'
        except Exception as e:
            return -1, '', str(e)
    
    def _run_adb_shell(self, command: str, as_root: bool = False) -> Tuple[int, str, str]:
        """执行 adb shell 命令"""
        if as_root:
            command = f"su -c '{command}'"
        return self._run_adb('shell', command)
    
    def check_libqdbi(self) -> bool:
        """检查 libqdbi.so 是否存在"""
        log_info("🔍 检查 Small-Trace 追踪库...")
        
        code, stdout, _ = self._run_adb_shell(f'ls -la {LIBQDBI_DEVICE_PATH}')
        if code == 0 and 'libqdbi.so' in stdout:
            # 检查文件大小 (正常应该 > 15MB)
            try:
                size = int(stdout.split()[4])
                if size > 15000000:
                    self.libqdbi_ready = True
                    log_success(f"✅ Small-Trace 追踪库已就绪 ({size // 1024 // 1024}MB)")
                    return True
            except:
                pass
        
        log_warning("⚠️ Small-Trace 追踪库未找到")
        return False
    
    def download_libqdbi(self) -> bool:
        """下载并推送 libqdbi.so (优先使用本地预置文件)"""
        
        # === 优先检查本地预置文件 ===
        local_libqdbi = get_local_libqdbi('arm64')
        if local_libqdbi:
            log_info(f"📦 发现本地预置 libqdbi.so")
            log_info(f"   路径: {local_libqdbi}")
            log_info(f"   大小: {os.path.getsize(local_libqdbi) // 1024 // 1024}MB")
            
            # 推送到设备
            log_info("📲 推送到设备...")
            code, stdout, stderr = self._run_adb('push', local_libqdbi, LIBQDBI_DEVICE_PATH)
            if code == 0:
                # 设置权限
                self._run_adb_shell(f'chmod 755 {LIBQDBI_DEVICE_PATH}', as_root=True)
                log_success(f"✅ 已推送到: {LIBQDBI_DEVICE_PATH}")
                self.libqdbi_ready = True
                return True
            else:
                log_warning(f"⚠️ 推送本地文件失败: {stderr}，尝试在线下载...")
        
        # === 从网络下载 ===
        log_info("📥 准备下载 Small-Trace 追踪库 (libqdbi.so)...")
        
        # 创建临时目录
        temp_dir = tempfile.mkdtemp(prefix='smalltrace_')
        so_file = os.path.join(temp_dir, 'libqdbi.so')
        
        # 尝试下载
        downloaded = False
        
        for url in LIBQDBI_DOWNLOAD_URLS:
            log_info(f"   尝试: {url[:70]}...")
            
            # 判断是 .so 文件还是 .zip 文件
            is_zip = url.endswith('.zip')
            download_file = os.path.join(temp_dir, 'libqdbi.so.zip' if is_zip else 'libqdbi.so')
            
            try:
                result = subprocess.run(
                    ['curl', '-L', '-o', download_file, '-f', '--connect-timeout', '10', '--max-time', '300', url],
                    capture_output=True,
                    text=True,
                    timeout=330
                )
                if result.returncode == 0 and os.path.exists(download_file) and os.path.getsize(download_file) > 1000000:
                    # 如果是 zip 文件需要解压
                    if is_zip:
                        log_info("📦 解压...")
                        try:
                            result = subprocess.run(['unzip', '-o', download_file, '-d', temp_dir], capture_output=True, timeout=30)
                            if result.returncode != 0 or not os.path.exists(so_file):
                                log_debug("   解压失败，尝试下一个源...")
                                continue
                        except Exception as e:
                            log_debug(f"   解压失败: {e}")
                            continue
                    
                    downloaded = True
                    log_success("✅ 下载成功")
                    break
            except Exception as e:
                log_debug(f"   下载失败: {e}")
                continue
        
        if not downloaded or not os.path.exists(so_file):
            log_error("❌ 下载失败")
            log_info("   请手动下载 libqdbi.so:")
            log_info(f"   1. 访问: https://github.com/cxapython/fridac/releases")
            log_info(f"   2. 下载 libqdbi.so")
            log_info(f"   3. 放到: fridac/binaries/arm64/libqdbi.so")
            log_info(f"   或推送到设备: adb push libqdbi.so {LIBQDBI_DEVICE_PATH}")
            return False
        
        # 推送到设备
        log_info("📲 推送到设备...")
        code, stdout, stderr = self._run_adb('push', so_file, LIBQDBI_DEVICE_PATH)
        if code != 0:
            log_error(f"❌ 推送失败: {stderr}")
            return False
        
        # 设置权限
        self._run_adb_shell(f'chmod 755 {LIBQDBI_DEVICE_PATH}', as_root=True)
        
        # 清理
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)
        
        log_success(f"✅ Small-Trace 追踪库已推送到: {LIBQDBI_DEVICE_PATH}")
        self.libqdbi_ready = True
        return True
    
    def ensure_libqdbi(self) -> bool:
        """确保 libqdbi.so 可用"""
        if self.check_libqdbi():
            return True
        
        log_info("📥 需要下载 Small-Trace 追踪库...")
        return self.download_libqdbi()
    
    def disable_selinux(self) -> bool:
        """关闭 SELinux (临时)"""
        log_info("🔓 关闭 SELinux...")
        
        # 尝试关闭
        self._run_adb_shell('setenforce 0', as_root=True)
        
        # 检查状态
        code, stdout, _ = self._run_adb_shell('getenforce')
        if 'Permissive' in stdout or 'permissive' in stdout:
            log_success("✅ SELinux 已设为 Permissive")
            return True
        elif 'Disabled' in stdout or 'disabled' in stdout:
            log_success("✅ SELinux 已禁用")
            return True
        else:
            log_warning(f"⚠️ SELinux 状态: {stdout}")
            return False
    
    def generate_trace_script(self, config: SmallTraceConfig) -> str:
        """
        生成 Small-Trace 追踪脚本
        
        Args:
            config: 追踪配置
            
        Returns:
            JavaScript 脚本内容
        """
        script = f'''// Small-Trace 追踪脚本 (由 fridac 生成)
// 目标: {config.so_name} @ 0x{config.offset:x} ({config.symbol or 'offset'})

(function() {{
    const TraceSoPath = "{LIBQDBI_DEVICE_PATH}";
    const SO_name = "{config.so_name}";
    const Symbol = "{config.symbol}";
    const so_offset = {hex(config.offset)};
    const Trace_Mode = {config.trace_mode};  // 0=符号, 1=偏移
    const args = {config.args_count};
    
    let Calvin_Trace_symbol = null;
    let Calvin_Trace_offset = null;
    let isTraceSoLoaded = false;
    
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("     Small-Trace (QBDI) - SO 汇编追踪");
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("[*] 目标 SO: " + SO_name);
    console.log("[*] 追踪模式: " + (Trace_Mode === 0 ? "符号" : "偏移"));
    if (Trace_Mode === 0) {{
        console.log("[*] 目标符号: " + Symbol);
    }} else {{
        console.log("[*] 目标偏移: 0x" + so_offset.toString(16));
    }}
    console.log("[*] 参数数量: " + args);
    console.log("");
    
    function traceSymbolOrOffset(soName, symbolName, addr, mode) {{
        if (mode === 0) {{
            console.log("[*] 开始符号追踪: " + soName + " -> " + symbolName);
            if (Calvin_Trace_symbol !== null) {{
                const symbolFunc = new NativeFunction(Calvin_Trace_symbol, 'int', ['pointer', 'pointer', 'int']);
                try {{
                    const agr1 = Memory.allocUtf8String(SO_name);
                    const agr2 = Memory.allocUtf8String(symbolName);
                    const result = symbolFunc(agr1, agr2, args);
                    console.log("[+] 符号追踪启动，结果: " + result);
                }} catch (e) {{
                    console.log("[-] 符号追踪失败: " + e);
                }}
            }}
        }} else if (mode === 1) {{
            console.log("[*] 开始偏移量追踪: " + soName + " @ 0x" + addr.toString(16));
            if (Calvin_Trace_offset !== null) {{
                const offsetFunc = new NativeFunction(Calvin_Trace_offset, 'int', ['pointer', 'long', 'int']);
                try {{
                    const agr1 = Memory.allocUtf8String(SO_name);
                    const result = offsetFunc(agr1, addr, args);
                    console.log("[+] 偏移量追踪启动，结果: " + result);
                    
                    console.log("");
                    console.log("═══════════════════════════════════════════════════════════════");
                    console.log("  Small-Trace 已启动！");
                    console.log("  追踪输出保存在设备: /data/data/<package>/qbdi_trace.log");
                    console.log("  查看命令: adb logcat | grep -iE 'SmallTrace|GQB|QBDI'");
                    console.log("═══════════════════════════════════════════════════════════════");
                }} catch (e) {{
                    console.log("[-] 偏移量追踪失败: " + e);
                }}
            }}
        }}
    }}
    
    // 检查目标 SO 是否已加载
    const mod = Process.findModuleByName(SO_name);
    if (mod) {{
        console.log("[+] 目标 SO 已加载: " + mod.base);
        
        try {{
            console.log("[*] 加载追踪库: " + TraceSoPath);
            const trace_handle = Module.load(TraceSoPath);
            console.log("[+] 追踪库加载成功");
            isTraceSoLoaded = true;
            
            Calvin_Trace_symbol = Module.findExportByName(TraceSoPath, 'Calvin_Trace_symbol');
            Calvin_Trace_offset = Module.findExportByName(TraceSoPath, 'Calvin_Trace_offset');
            
            console.log("[*] Calvin_Trace_symbol: " + Calvin_Trace_symbol);
            console.log("[*] Calvin_Trace_offset: " + Calvin_Trace_offset);
            
            if ((Trace_Mode === 0 && Calvin_Trace_symbol) || (Trace_Mode === 1 && Calvin_Trace_offset)) {{
                traceSymbolOrOffset(SO_name, Symbol, so_offset, Trace_Mode);
            }} else {{
                console.log("[-] 追踪函数未找到");
            }}
        }} catch (e) {{
            console.log("[-] 加载追踪库失败: " + e);
            console.log("    可能原因: SELinux 权限问题");
            console.log("    请执行: adb shell su -c 'setenforce 0'");
        }}
    }} else {{
        console.log("[*] 目标 SO 尚未加载，等待加载...");
        
        const android_dlopen_ext = Module.findExportByName('libc.so', 'android_dlopen_ext');
        let traced_so = null;
        
        Interceptor.attach(android_dlopen_ext, {{
            onEnter: function(args) {{
                const path = args[0].readUtf8String();
                if (path && path.indexOf(SO_name) !== -1) {{
                    console.log("[*] 目标 SO 加载中: " + path);
                    traced_so = path;
                }}
            }},
            onLeave: function(retval) {{
                if (traced_so && !isTraceSoLoaded) {{
                    console.log("[+] 目标 SO 加载完毕");
                    
                    setTimeout(function() {{
                        try {{
                            const trace_handle = Module.load(TraceSoPath);
                            console.log("[+] 追踪库已加载");
                            isTraceSoLoaded = true;
                            
                            Calvin_Trace_symbol = Module.findExportByName(TraceSoPath, 'Calvin_Trace_symbol');
                            Calvin_Trace_offset = Module.findExportByName(TraceSoPath, 'Calvin_Trace_offset');
                            
                            if ((Trace_Mode === 0 && Calvin_Trace_symbol) || (Trace_Mode === 1 && Calvin_Trace_offset)) {{
                                traceSymbolOrOffset(traced_so, Symbol, so_offset, Trace_Mode);
                            }}
                        }} catch (e) {{
                            console.log("[-] 加载追踪库失败: " + e);
                        }}
                    }}, 500);
                }}
            }}
        }});
    }}
    
    console.log("[*] Small-Trace 脚本已加载");
}})();
'''
        return script
    
    def pull_trace_log(self, package_name: str, output_file: str) -> bool:
        """
        拉取追踪日志到本地
        
        Args:
            package_name: 应用包名
            output_file: 本地输出文件路径
            
        Returns:
            是否成功
        """
        log_info(f"📥 拉取追踪日志...")
        
        remote_path = f"/data/data/{package_name}/qbdi_trace.log"
        
        # 先复制到 /sdcard (需要 root)
        self._run_adb_shell(f'cp {remote_path} /sdcard/qbdi_trace.log', as_root=True)
        
        # 拉取到本地
        code, stdout, stderr = self._run_adb('pull', '/sdcard/qbdi_trace.log', output_file)
        if code != 0:
            # 尝试直接用 su 读取
            code, content, _ = self._run_adb_shell(f'cat {remote_path}', as_root=True)
            if code == 0 and content:
                with open(output_file, 'w') as f:
                    f.write(content)
                log_success(f"✅ 追踪日志已保存到: {output_file}")
                return True
            
            log_error(f"❌ 拉取失败: {stderr}")
            return False
        
        log_success(f"✅ 追踪日志已保存到: {output_file}")
        
        # 显示统计
        if os.path.exists(output_file):
            size = os.path.getsize(output_file)
            lines = sum(1 for _ in open(output_file, 'rb'))
            log_info(f"   文件大小: {size // 1024 // 1024}MB, 行数: {lines}")
        
        return True
    
    def get_trace_stats(self, output_file: str) -> Dict:
        """分析追踪日志统计信息"""
        stats = {
            'total_lines': 0,
            'instructions': 0,
            'memory_reads': 0,
            'memory_writes': 0,
            'functions_called': set()
        }
        
        if not os.path.exists(output_file):
            return stats
        
        try:
            with open(output_file, 'r', errors='ignore') as f:
                for line in f:
                    stats['total_lines'] += 1
                    if line.startswith('0x'):
                        stats['instructions'] += 1
                    elif 'memory read' in line:
                        stats['memory_reads'] += 1
                    elif 'memory write' in line:
                        stats['memory_writes'] += 1
        except Exception as e:
            log_error(f"分析追踪日志失败: {e}")
        
        return stats


# 全局实例
_smalltrace_manager: Optional[SmallTraceManager] = None


def get_smalltrace_manager(device_id: Optional[str] = None) -> SmallTraceManager:
    """获取 SmallTraceManager 单例"""
    global _smalltrace_manager
    if _smalltrace_manager is None:
        _smalltrace_manager = SmallTraceManager(device_id)
    return _smalltrace_manager


def parse_offset(offset_str: str) -> int:
    """解析偏移量字符串"""
    offset_str = offset_str.strip().lower()
    if offset_str.startswith('0x'):
        return int(offset_str, 16)
    elif offset_str.startswith('0o'):
        return int(offset_str, 8)
    elif offset_str.startswith('0b'):
        return int(offset_str, 2)
    else:
        # 尝试自动检测
        try:
            if any(c in offset_str for c in 'abcdef'):
                return int(offset_str, 16)
            return int(offset_str)
        except ValueError:
            return int(offset_str, 16)

