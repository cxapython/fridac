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

# 追踪输出文件格式 (包含 package name)
DEFAULT_TRACE_OUTPUT = "/data/data/{package}/qbdi_trace_{package}.log"


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
    
    # 检查文件存在且大小 > 5MB (正常的 libqdbi.so 约 10-18MB)
    if os.path.isfile(libqdbi_path) and os.path.getsize(libqdbi_path) > 5000000:  # > 5MB
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
    show_hexdump: bool = False      # 是否显示 hexdump 内容 (默认关闭)
    jni_trace: bool = False         # 是否启用 JNI 追踪 (默认关闭)
    syscall_trace: bool = False     # 是否启用 Syscall 追踪 (默认关闭)


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
        # 转换参数为 JS 整数
        hexdump_flag = 1 if config.show_hexdump else 0
        jni_trace_flag = 1 if config.jni_trace else 0
        syscall_trace_flag = 1 if config.syscall_trace else 0
        
        script = f'''// Small-Trace 追踪脚本 (由 fridac 生成)
// 目标: {config.so_name} @ 0x{config.offset:x} ({config.symbol or 'offset'})

(function() {{
    const TraceSoPath = "{LIBQDBI_DEVICE_PATH}";
    const SO_name = "{config.so_name}";
    const Symbol = "{config.symbol}";
    const so_offset = {hex(config.offset)};
    const Trace_Mode = {config.trace_mode};  // 0=符号, 1=偏移
    const args = {config.args_count};
    const show_hexdump = {hexdump_flag};  // hexdump 显示开关
    const jni_trace = {jni_trace_flag};    // JNI 追踪开关
    const syscall_trace = {syscall_trace_flag};  // Syscall 追踪开关
    
    let Calvin_Trace_symbol_ex = null;
    let Calvin_Trace_offset_ex = null;
    let Calvin_Trace_offset_full = null;
    let gqb_set_hexdump_enabled = null;
    let gqb_enable_jni_trace = null;
    let gqb_disable_jni_trace = null;
    let gqb_enable_syscall_trace = null;
    let gqb_disable_syscall_trace = null;
    let gqb_print_jni_stats = null;
    let gqb_print_syscall_stats = null;
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
    console.log("[*] Hexdump: " + (show_hexdump ? "开启" : "关闭"));
    console.log("[*] JNI 追踪: " + (jni_trace ? "开启" : "关闭"));
    console.log("[*] Syscall 追踪: " + (syscall_trace ? "开启" : "关闭"));
    console.log("");
    
    function setupJniSyscallTrace() {{
        // 设置 JNI 追踪
        if (jni_trace && gqb_enable_jni_trace) {{
            try {{
                const enableJni = new NativeFunction(gqb_enable_jni_trace, 'void', []);
                enableJni();
                console.log("[+] JNI 追踪已启用");
            }} catch (e) {{
                console.log("[-] JNI 追踪启用失败: " + e);
            }}
        }}
        
        // 设置 Syscall 追踪
        if (syscall_trace && gqb_enable_syscall_trace) {{
            try {{
                const enableSyscall = new NativeFunction(gqb_enable_syscall_trace, 'void', []);
                enableSyscall();
                console.log("[+] Syscall 追踪已启用");
            }} catch (e) {{
                console.log("[-] Syscall 追踪启用失败: " + e);
            }}
        }}
    }}
    
    function traceSymbolOrOffset(soName, symbolName, addr, mode) {{
        // 先设置 JNI/Syscall 追踪
        setupJniSyscallTrace();
        
        if (mode === 0) {{
            console.log("[*] 开始符号追踪: " + soName + " -> " + symbolName);
            if (Calvin_Trace_symbol_ex !== null) {{
                // 使用带 hexdump 参数的新函数
                const symbolFunc = new NativeFunction(Calvin_Trace_symbol_ex, 'int', ['pointer', 'pointer', 'int', 'int']);
                try {{
                    const agr1 = Memory.allocUtf8String(SO_name);
                    const agr2 = Memory.allocUtf8String(symbolName);
                    const result = symbolFunc(agr1, agr2, args, show_hexdump);
                    console.log("[+] 符号追踪启动，结果: " + result);
                }} catch (e) {{
                    console.log("[-] 符号追踪失败: " + e);
                }}
            }}
        }} else if (mode === 1) {{
            console.log("[*] 开始偏移量追踪: " + soName + " @ 0x" + addr.toString(16));
            
            // 优先使用带完整控制的新函数 Calvin_Trace_offset_full
            if (Calvin_Trace_offset_full !== null) {{
                const fullFunc = new NativeFunction(Calvin_Trace_offset_full, 'int', ['pointer', 'long', 'int', 'int', 'int', 'int']);
                try {{
                    const agr1 = Memory.allocUtf8String(SO_name);
                    const result = fullFunc(agr1, addr, args, show_hexdump, jni_trace, syscall_trace);
                    console.log("[+] 偏移量追踪启动 (完整模式)，结果: " + result);
                    printTraceInfo();
                }} catch (e) {{
                    console.log("[-] 完整追踪失败，尝试兼容模式: " + e);
                    fallbackTrace(addr);
                }}
            }} else if (Calvin_Trace_offset_ex !== null) {{
                fallbackTrace(addr);
            }}
        }}
    }}
    
    function fallbackTrace(addr) {{
        // 兼容旧版本 libqdbi.so
        const offsetFunc = new NativeFunction(Calvin_Trace_offset_ex, 'int', ['pointer', 'long', 'int', 'int']);
        try {{
            const agr1 = Memory.allocUtf8String(SO_name);
            const result = offsetFunc(agr1, addr, args, show_hexdump);
            console.log("[+] 偏移量追踪启动 (兼容模式)，结果: " + result);
            printTraceInfo();
        }} catch (e) {{
            console.log("[-] 偏移量追踪失败: " + e);
        }}
    }}
    
    function printTraceInfo() {{
        console.log("");
        console.log("═══════════════════════════════════════════════════════════════");
        console.log("  Small-Trace 已启动！");
        console.log("  追踪输出保存在设备: /data/data/<package>/qbdi_trace_<package>.log");
        if (jni_trace) {{
            console.log("  📱 JNI 追踪: 自动检测 FindClass, GetMethodID, RegisterNatives 等");
        }}
        if (syscall_trace) {{
            console.log("  🔧 Syscall 追踪: 自动检测 openat, read, write, mmap 等");
        }}
        console.log("  查看命令: adb logcat | grep -iE 'SmallTrace|GQB|QBDI|JNI|SVC'");
        console.log("═══════════════════════════════════════════════════════════════");
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
            
            // 获取追踪函数
            Calvin_Trace_symbol_ex = Module.findExportByName(TraceSoPath, 'Calvin_Trace_symbol_ex');
            Calvin_Trace_offset_ex = Module.findExportByName(TraceSoPath, 'Calvin_Trace_offset_ex');
            Calvin_Trace_offset_full = Module.findExportByName(TraceSoPath, 'Calvin_Trace_offset_full');
            gqb_set_hexdump_enabled = Module.findExportByName(TraceSoPath, 'gqb_set_hexdump_enabled');
            
            // 获取 JNI/Syscall 追踪函数
            gqb_enable_jni_trace = Module.findExportByName(TraceSoPath, 'gqb_enable_jni_trace');
            gqb_disable_jni_trace = Module.findExportByName(TraceSoPath, 'gqb_disable_jni_trace');
            gqb_enable_syscall_trace = Module.findExportByName(TraceSoPath, 'gqb_enable_syscall_trace');
            gqb_disable_syscall_trace = Module.findExportByName(TraceSoPath, 'gqb_disable_syscall_trace');
            gqb_print_jni_stats = Module.findExportByName(TraceSoPath, 'gqb_print_jni_stats');
            gqb_print_syscall_stats = Module.findExportByName(TraceSoPath, 'gqb_print_syscall_stats');
            
            console.log("[*] Calvin_Trace_symbol_ex: " + Calvin_Trace_symbol_ex);
            console.log("[*] Calvin_Trace_offset_ex: " + Calvin_Trace_offset_ex);
            console.log("[*] Calvin_Trace_offset_full: " + Calvin_Trace_offset_full);
            if (jni_trace) console.log("[*] gqb_enable_jni_trace: " + gqb_enable_jni_trace);
            if (syscall_trace) console.log("[*] gqb_enable_syscall_trace: " + gqb_enable_syscall_trace);
            
            if ((Trace_Mode === 0 && Calvin_Trace_symbol_ex) || (Trace_Mode === 1 && Calvin_Trace_offset_ex)) {{
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
                            
                            Calvin_Trace_symbol_ex = Module.findExportByName(TraceSoPath, 'Calvin_Trace_symbol_ex');
                            Calvin_Trace_offset_ex = Module.findExportByName(TraceSoPath, 'Calvin_Trace_offset_ex');
                            Calvin_Trace_offset_full = Module.findExportByName(TraceSoPath, 'Calvin_Trace_offset_full');
                            
                            // 获取 JNI/Syscall 追踪函数
                            gqb_enable_jni_trace = Module.findExportByName(TraceSoPath, 'gqb_enable_jni_trace');
                            gqb_enable_syscall_trace = Module.findExportByName(TraceSoPath, 'gqb_enable_syscall_trace');
                            gqb_print_jni_stats = Module.findExportByName(TraceSoPath, 'gqb_print_jni_stats');
                            gqb_print_syscall_stats = Module.findExportByName(TraceSoPath, 'gqb_print_syscall_stats');
                            
                            if ((Trace_Mode === 0 && Calvin_Trace_symbol_ex) || (Trace_Mode === 1 && (Calvin_Trace_offset_full || Calvin_Trace_offset_ex))) {{
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
        
        # 日志文件名包含 package name
        remote_path = f"/data/data/{package_name}/qbdi_trace_{package_name}.log"
        
        # 先复制到 /sdcard (需要 root)
        self._run_adb_shell(f'cp {remote_path} /sdcard/qbdi_trace_{package_name}.log', as_root=True)
        
        # 拉取到本地
        code, stdout, stderr = self._run_adb('pull', f'/sdcard/qbdi_trace_{package_name}.log', output_file)
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


# ===== QBDI Trace 文件解析器 =====

@dataclass
class TraceInstruction:
    """单条指令记录"""
    address: int          # 绝对地址
    offset: int           # 模块内偏移
    mnemonic: str         # 指令助记符
    operands: str         # 操作数
    reg_changes: str      # 寄存器变化
    line_num: int         # 行号
    # v2.0 新增字段
    seq: int = 0          # 指令序号
    depth: int = 0        # 调用深度
    op_type: str = ""     # 操作类型 (A/L/M/B/C/R)


@dataclass
class MemoryAccess:
    """内存访问记录"""
    access_type: str      # 'read' 或 'write'
    address: int          # 访问地址
    inst_address: int     # 指令地址
    data_size: int        # 数据大小
    data_value: int       # 数据值
    line_num: int         # 行号
    # v2.0 新增字段
    src_reg: str = ""           # 源寄存器名（仅写入）
    src_reg_value: int = 0      # 源寄存器值（仅写入）


@dataclass
class FunctionCall:
    """函数调用记录"""
    target_address: int   # 目标地址
    enter_line: int       # 入口行号
    leave_line: int       # 出口行号
    instructions: int     # 指令数量
    mem_reads: int        # 内存读取次数
    mem_writes: int       # 内存写入次数


class QBDITraceAnalyzer:
    """
    QBDI Trace 文件解析器（支持 v1.0 和 v2.0 格式）
    
    v1.0 文件结构：
    1. 头部: [hook] target=0x... argc=...
    2. 入口: ====== ENTER 0x... ======
    3. 指令: 0x地址  偏移  汇编指令  ;寄存器变化
    4. 内存: memory read/write at 0x..., ...
    5. Dump: hexdump 格式的内存块
    6. 出口: ====== LEAVE 0x... ======
    7. 结果: [gqb] vm.call ok=..., ret=...
    
    v2.0 新增格式：
    - 头部注释: # QBDI Trace v2.0 ...
    - 指令: #序号 [D深度] [类型] 0x地址 偏移 汇编 ;多寄存器变化
    - 内存: MEM_read/write @0x地址 size=大小 val=值
    - 源寄存器: SRC_REG=X8 val=0x...
    """
    
    # v2.0 正则表达式
    # 注意：日志中使用 tab 分隔，需要用 \s+ 匹配
    INSTRUCTION_V2_RE = re.compile(
        r'^#(\d+)\s+'                         # 指令序号
        r'\[D(\d+)\]\s+'                      # 调用深度
        r'(?:\[([ALMCBR])\]\s+)?'             # 操作类型（可选）
        r'(0x[0-9a-fA-F]+)\s+'                # 绝对地址
        r'(0x[0-9a-fA-F]+)\s+'                # 偏移
        r'([a-zA-Z][a-zA-Z0-9.]*)'            # 指令助记符
        r'(.*)$'                              # 操作数和寄存器变化
    )
    
    # v2.0 内存访问正则（行被 strip 后不要求前导空格）
    MEMORY_V2_RE = re.compile(
        r'^MEM_(read|write)\s+@(0x[0-9a-fA-F]+)\s+'
        r'size=(\d+)\s+val=([0-9a-fA-F]+)'
    )
    
    # v2.0 源寄存器正则
    SRC_REG_RE = re.compile(
        r'^SRC_REG=([XWxw]\d+)\s+val=(0x[0-9a-fA-F]+)'
    )
    
    def __init__(self, trace_file: str):
        self.trace_file = trace_file
        self.target_address: Optional[int] = None
        self.argc: int = 0
        self.return_value: Optional[int] = None
        self.call_success: bool = False
        
        self.instructions: List[TraceInstruction] = []
        self.memory_accesses: List[MemoryAccess] = []
        self.function_calls: List[FunctionCall] = []
        
        # 统计信息
        self.total_lines: int = 0
        self.instruction_count: int = 0
        self.mem_read_count: int = 0
        self.mem_write_count: int = 0
        
        # 模块地址范围 (用于计算偏移)
        self.modules: Dict[str, Tuple[int, int]] = {}  # name -> (base, end)
        
        # 指令分布
        self.instruction_types: Dict[str, int] = {}  # mnemonic -> count
        
        # 内存访问热点
        self.mem_access_hotspots: Dict[int, int] = {}  # address -> access_count
        
        # v2.0 新增
        self.trace_version: str = "1.0"
        self.op_type_counts: Dict[str, int] = {}  # 操作类型统计
        self.max_depth: int = 0  # 最大调用深度
        self._last_inst_address: int = 0  # 最近指令地址（用于关联内存访问）
    
    def parse(self, quick_mode: bool = False) -> bool:
        """
        解析 trace 文件（支持 v1.0 和 v2.0 格式）
        
        Args:
            quick_mode: True=仅统计不存储详细数据 (大文件推荐)
        """
        if not os.path.exists(self.trace_file):
            log_error(f"文件不存在: {self.trace_file}")
            return False
        
        log_info(f"📊 解析 QBDI Trace 文件...")
        log_info(f"   文件: {self.trace_file}")
        
        current_func_enter_line = 0
        current_func_instructions = 0
        current_func_reads = 0
        current_func_writes = 0
        
        try:
            with open(self.trace_file, 'r', errors='ignore') as f:
                for line_num, line in enumerate(f, 1):
                    self.total_lines += 1
                    line = line.strip()
                    
                    # 跳过空行
                    if not line:
                        continue
                    
                    # 0. 检测版本和跳过注释
                    # 注意：v2.0 指令行也以 # 开头 (#123 [D1] ...)，需要区分
                    if line.startswith('#'):
                        if len(line) > 1 and line[1].isdigit():
                            # 这是 v2.0 指令行，不跳过
                            pass
                        else:
                            # 这是注释行
                            if 'QBDI Trace v2' in line:
                                self.trace_version = "2.0"
                            continue
                    
                    # 1. 解析头部 [hook]
                    if line.startswith('[hook]'):
                        self._parse_hook_header(line)
                        continue
                    
                    # 2. 解析函数入口
                    if line.startswith('====== ENTER') or 'ENTER' in line and '======' in line:
                        addr_match = re.search(r'ENTER\s+(0x[0-9a-fA-F]+)', line)
                        if addr_match:
                            addr = int(addr_match.group(1), 16)
                            current_func_enter_line = line_num
                            current_func_instructions = 0
                            current_func_reads = 0
                            current_func_writes = 0
                        continue
                    
                    # 3. 解析函数出口
                    if 'LEAVE' in line and '======' in line:
                        addr_match = re.search(r'LEAVE\s+(0x[0-9a-fA-F]+)', line)
                        if addr_match:
                            addr = int(addr_match.group(1), 16)
                            self.function_calls.append(FunctionCall(
                                target_address=addr,
                                enter_line=current_func_enter_line,
                                leave_line=line_num,
                                instructions=current_func_instructions,
                                mem_reads=current_func_reads,
                                mem_writes=current_func_writes
                            ))
                        continue
                    
                    # 4a. v2.0 指令格式: #序号 [D深度] [类型] 0x地址 ...
                    v2_match = self.INSTRUCTION_V2_RE.match(line)
                    if v2_match:
                        self.instruction_count += 1
                        current_func_instructions += 1
                        inst = self._parse_instruction_v2(v2_match, line_num)
                        if inst:
                            mnemonic = inst.mnemonic.split('.')[0]
                            self.instruction_types[mnemonic] = self.instruction_types.get(mnemonic, 0) + 1
                            if inst.op_type:
                                self.op_type_counts[inst.op_type] = self.op_type_counts.get(inst.op_type, 0) + 1
                            self.max_depth = max(self.max_depth, inst.depth)
                            self._last_inst_address = inst.address
                            if not quick_mode:
                                self.instructions.append(inst)
                        continue
                    
                    # 4b. v1.0 指令格式: 0x地址 偏移 汇编
                    if line.startswith('0x') and '\t' in line:
                        self.instruction_count += 1
                        current_func_instructions += 1
                        inst = self._parse_instruction(line, line_num)
                        if inst:
                            mnemonic = inst.mnemonic.split('.')[0]
                            self.instruction_types[mnemonic] = self.instruction_types.get(mnemonic, 0) + 1
                            self._last_inst_address = inst.address
                            if not quick_mode:
                                self.instructions.append(inst)
                        continue
                    
                    # 5a. v2.0 内存访问: MEM_read/write @0x...
                    v2_mem_match = self.MEMORY_V2_RE.match(line)
                    if v2_mem_match:
                        access = self._parse_memory_access_v2(v2_mem_match, line_num)
                        if access:
                            if access.access_type == 'read':
                                self.mem_read_count += 1
                                current_func_reads += 1
                            else:
                                self.mem_write_count += 1
                                current_func_writes += 1
                            page_addr = access.address & ~0xFFF
                            self.mem_access_hotspots[page_addr] = self.mem_access_hotspots.get(page_addr, 0) + 1
                            if not quick_mode:
                                self.memory_accesses.append(access)
                        continue
                    
                    # 5b. v2.0 源寄存器: SRC_REG=X8 val=0x...
                    src_reg_match = self.SRC_REG_RE.match(line)
                    if src_reg_match:
                        if self.memory_accesses:
                            self.memory_accesses[-1].src_reg = src_reg_match.group(1).upper()
                            self.memory_accesses[-1].src_reg_value = int(src_reg_match.group(2), 16)
                        continue
                    
                    # 5c. v1.0 内存访问: memory read/write at 0x...
                    if line.startswith('memory read') or line.startswith('memory write'):
                        access = self._parse_memory_access(line, line_num)
                        if access:
                            if access.access_type == 'read':
                                self.mem_read_count += 1
                                current_func_reads += 1
                            else:
                                self.mem_write_count += 1
                                current_func_writes += 1
                            page_addr = access.address & ~0xFFF
                            self.mem_access_hotspots[page_addr] = self.mem_access_hotspots.get(page_addr, 0) + 1
                            if not quick_mode:
                                self.memory_accesses.append(access)
                        continue
                    
                    # 6. 解析结果
                    if line.startswith('[gqb] vm.call'):
                        self._parse_result(line)
                        continue
            
            log_success(f"✅ 解析完成 (格式: v{self.trace_version})")
            return True
            
        except Exception as e:
            log_error(f"解析失败: {e}")
            import traceback
            log_debug(traceback.format_exc())
            return False
    
    def _parse_hook_header(self, line: str):
        """解析 [hook] 头部"""
        # [hook] target=0x7dd0462244 argc=5
        target_match = re.search(r'target=(0x[0-9a-fA-F]+)', line)
        argc_match = re.search(r'argc=(\d+)', line)
        if target_match:
            self.target_address = int(target_match.group(1), 16)
        if argc_match:
            self.argc = int(argc_match.group(1))
    
    def _parse_instruction_v2(self, match: re.Match, line_num: int) -> Optional[TraceInstruction]:
        """解析 v2.0 指令行"""
        # #12345 [D1] [A] 0x7dd0462244    0x21244    add x8, x9, x10    ;X8=0x0->0x100
        try:
            seq = int(match.group(1))
            depth = int(match.group(2))
            op_type = match.group(3) or ""
            address = int(match.group(4), 16)
            offset = int(match.group(5), 16)
            mnemonic = match.group(6)
            rest = match.group(7)
            
            # 分离操作数和寄存器变化
            if ';' in rest:
                operands, reg_changes = rest.rsplit(';', 1)
            else:
                operands, reg_changes = rest, ''
            
            return TraceInstruction(
                address=address,
                offset=offset,
                mnemonic=mnemonic,
                operands=operands.strip(),
                reg_changes=reg_changes.strip(),
                line_num=line_num,
                seq=seq,
                depth=depth,
                op_type=op_type
            )
        except Exception:
            return None
    
    def _parse_instruction(self, line: str, line_num: int) -> Optional[TraceInstruction]:
        """解析 v1.0 指令行"""
        # 0x0000007dd0462244	0x21244			ldr	x16, #8	;X16=0x0 -> 0x7e9c983100
        try:
            parts = line.split('\t')
            if len(parts) < 3:
                return None
            
            address = int(parts[0], 16)
            offset = int(parts[1], 16)
            
            # 汇编部分可能有分号注释
            asm_and_comment = '\t'.join(parts[2:])
            if ';' in asm_and_comment:
                asm_part, reg_changes = asm_and_comment.rsplit(';', 1)
            else:
                asm_part, reg_changes = asm_and_comment, ''
            
            # 分离助记符和操作数
            asm_parts = asm_part.strip().split(None, 1)
            mnemonic = asm_parts[0] if asm_parts else ''
            operands = asm_parts[1] if len(asm_parts) > 1 else ''
            
            return TraceInstruction(
                address=address,
                offset=offset,
                mnemonic=mnemonic,
                operands=operands,
                reg_changes=reg_changes.strip(),
                line_num=line_num
            )
        except Exception:
            return None
    
    def _parse_memory_access_v2(self, match: re.Match, line_num: int) -> Optional[MemoryAccess]:
        """解析 v2.0 内存访问行"""
        #   MEM_write @0x7ffc1fc0 size=8 val=ff01000000000000
        try:
            access_type = match.group(1)  # 'read' or 'write'
            address = int(match.group(2), 16)
            data_size = int(match.group(3))
            data_value = int(match.group(4), 16)
            
            return MemoryAccess(
                access_type=access_type,
                address=address,
                inst_address=self._last_inst_address,
                data_size=data_size,
                data_value=data_value,
                line_num=line_num
            )
        except Exception:
            return None
    
    def _parse_memory_access(self, line: str, line_num: int) -> Optional[MemoryAccess]:
        """解析 v1.0 内存访问行"""
        # memory read at 0x7dd046224c, instruction address = 0x7dd0462244, data size = 8, data value = 0031989c7e000000
        try:
            access_type = 'read' if 'memory read' in line else 'write'
            
            addr_match = re.search(r'at\s+(0x[0-9a-fA-F]+)', line)
            inst_match = re.search(r'instruction address\s*=\s*(0x[0-9a-fA-F]+)', line)
            size_match = re.search(r'data size\s*=\s*(\d+)', line)
            value_match = re.search(r'data value\s*=\s*([0-9a-fA-F]+)', line)
            
            if not all([addr_match, inst_match, size_match, value_match]):
                return None
            
            return MemoryAccess(
                access_type=access_type,
                address=int(addr_match.group(1), 16),
                inst_address=int(inst_match.group(1), 16),
                data_size=int(size_match.group(1)),
                data_value=int(value_match.group(1), 16),
                line_num=line_num
            )
        except Exception:
            return None
    
    def _parse_result(self, line: str):
        """解析结果行"""
        # [gqb] vm.call ok=1, ret=0x1
        ok_match = re.search(r'ok=(\d+)', line)
        ret_match = re.search(r'ret=(0x[0-9a-fA-F]+)', line)
        if ok_match:
            self.call_success = ok_match.group(1) == '1'
        if ret_match:
            self.return_value = int(ret_match.group(1), 16)
    
    def print_summary(self):
        """打印分析摘要"""
        log_info("")
        log_info("╔════════════════════════════════════════════════════════════╗")
        log_info(f"║           QBDI Trace 分析报告 (v{self.trace_version})                      ║")
        log_info("╚════════════════════════════════════════════════════════════╝")
        
        # 基本信息
        log_info("")
        log_info("📋 基本信息:")
        log_info(f"   目标地址: {hex(self.target_address) if self.target_address else 'N/A'}")
        log_info(f"   参数数量: {self.argc}")
        log_info(f"   执行结果: {'✅ 成功' if self.call_success else '❌ 失败'}")
        if self.return_value is not None:
            log_info(f"   返回值: {hex(self.return_value)} ({self.return_value})")
        
        # 统计信息
        log_info("")
        log_info("📊 统计信息:")
        log_info(f"   总行数: {self.total_lines:,}")
        log_info(f"   指令数: {self.instruction_count:,}")
        log_info(f"   内存读: {self.mem_read_count:,}")
        log_info(f"   内存写: {self.mem_write_count:,}")
        log_info(f"   函数调用: {len(self.function_calls)}")
        
        # v2.0 特有统计
        if self.trace_version == "2.0" and self.op_type_counts:
            log_info("")
            log_info("🏷️  操作类型分布 (v2.0):")
            op_names = {'A': '算术', 'L': '逻辑', 'M': '内存', 'B': '分支', 'C': '调用', 'R': '返回'}
            for op_code in ['A', 'L', 'M', 'B', 'C', 'R']:
                count = self.op_type_counts.get(op_code, 0)
                if count > 0:
                    pct = count * 100 / self.instruction_count if self.instruction_count > 0 else 0
                    name = op_names.get(op_code, op_code)
                    log_info(f"   [{op_code}] {name}: {count:,} ({pct:.1f}%)")
            log_info(f"   最大调用深度: {self.max_depth}")
        
        # 指令类型 Top 10
        log_info("")
        log_info("📈 指令类型 Top 10:")
        sorted_types = sorted(self.instruction_types.items(), key=lambda x: x[1], reverse=True)[:10]
        for i, (mnemonic, count) in enumerate(sorted_types, 1):
            pct = count * 100 / self.instruction_count if self.instruction_count > 0 else 0
            bar = '█' * int(pct / 5) + '░' * (20 - int(pct / 5))
            log_info(f"   {i:2d}. {mnemonic:8s} {count:8,} ({pct:5.1f}%) {bar}")
        
        # 内存访问热点
        if self.mem_access_hotspots:
            log_info("")
            log_info("🔥 内存访问热点 (Top 5 页):")
            sorted_hotspots = sorted(self.mem_access_hotspots.items(), key=lambda x: x[1], reverse=True)[:5]
            for addr, count in sorted_hotspots:
                log_info(f"   {hex(addr)}: {count:,} 次访问")
        
        # 函数调用信息
        if self.function_calls:
            log_info("")
            log_info("📞 函数调用概览:")
            for i, call in enumerate(self.function_calls[:5], 1):
                log_info(f"   {i}. {hex(call.target_address)}")
                log_info(f"      指令: {call.instructions:,}, 内存读: {call.mem_reads:,}, 内存写: {call.mem_writes:,}")
                log_info(f"      行范围: {call.enter_line:,} - {call.leave_line:,}")
            if len(self.function_calls) > 5:
                log_info(f"   ... 还有 {len(self.function_calls) - 5} 个调用")
    
    def find_instruction_at_offset(self, offset: int) -> List[TraceInstruction]:
        """根据偏移查找指令"""
        return [inst for inst in self.instructions if inst.offset == offset]
    
    def find_memory_access_at_address(self, address: int) -> List[MemoryAccess]:
        """根据地址查找内存访问"""
        return [ma for ma in self.memory_accesses if ma.address == address]
    
    def get_instruction_at_line(self, line_num: int) -> Optional[TraceInstruction]:
        """根据行号获取指令"""
        for inst in self.instructions:
            if inst.line_num == line_num:
                return inst
        return None
    
    def export_instructions_to_file(self, output_file: str, offset_filter: int = None):
        """导出指令到文件 (可选按偏移过滤)"""
        with open(output_file, 'w') as f:
            f.write("# QBDI Trace Instructions Export\n")
            f.write(f"# Source: {self.trace_file}\n")
            f.write(f"# Target: {hex(self.target_address) if self.target_address else 'N/A'}\n")
            f.write("#\n")
            f.write("# Line | Address          | Offset   | Instruction\n")
            f.write("# " + "-" * 70 + "\n")
            
            for inst in self.instructions:
                if offset_filter is not None and inst.offset != offset_filter:
                    continue
                f.write(f"{inst.line_num:6d} | {hex(inst.address):18s} | {hex(inst.offset):8s} | {inst.mnemonic} {inst.operands}\n")
                if inst.reg_changes:
                    f.write(f"       |                    |          | ; {inst.reg_changes}\n")
        
        log_success(f"✅ 指令已导出到: {output_file}")


def analyze_trace_file(trace_file: str, quick_mode: bool = True) -> Optional[QBDITraceAnalyzer]:
    """
    分析 trace 文件的便捷函数
    
    Args:
        trace_file: trace 文件路径
        quick_mode: True=快速模式(仅统计), False=完整模式(存储所有数据)
    
    Returns:
        QBDITraceAnalyzer 实例
    """
    analyzer = QBDITraceAnalyzer(trace_file)
    if analyzer.parse(quick_mode=quick_mode):
        analyzer.print_summary()
        return analyzer
    return None

