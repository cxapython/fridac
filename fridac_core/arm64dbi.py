"""
fridac ARM64DBI 集成模块
基于 ARM64DBIDemo 的 SO 汇编追踪功能 (增强版)

功能：
1. 自动检测/推送 libarm64dbi.so
2. 生成追踪脚本
3. JNI 追踪、系统调用追踪、高性能日志
4. 完全兼容 smalltrace 命令

优势（相比 QBDI）：
- 纯 ARM64 原生实现，无需 QEMU
- 内置 JNI 调用追踪（自动解析参数）
- 内置系统调用追踪
- 高性能 mmap 日志（1分钟1.5GB）
- 更小的二进制文件（~25MB vs ~18MB）
"""

import os
import subprocess
import time
from typing import Optional, Tuple, Dict
from dataclasses import dataclass

from .logger import log_info, log_success, log_warning, log_error, log_debug

# ARM64DBI SO 路径配置
LIBARM64DBI_DEVICE_PATH = "/data/local/tmp/libarm64dbi.so"

# 追踪输出文件格式
DEFAULT_TRACE_OUTPUT = "/data/local/tmp/arm64dbi_trace.log"
DEFAULT_FAST_LOG_OUTPUT = "/data/local/tmp/arm64dbi_fast.log"


def get_binaries_dir() -> str:
    """获取本地 binaries 目录路径"""
    module_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(module_dir)
    return os.path.join(project_root, 'binaries')


def get_local_libarm64dbi(arch: str = 'arm64') -> Optional[str]:
    """
    检查本地是否有预置的 libarm64dbi.so
    
    Args:
        arch: CPU 架构 (目前仅支持 arm64)
        
    Returns:
        本地文件路径，不存在则返回 None
    """
    binaries_dir = get_binaries_dir()
    libarm64dbi_path = os.path.join(binaries_dir, arch, 'libarm64dbi.so')
    
    # 检查文件存在且大小 > 10MB (正常的 libarm64dbi.so 约 25MB)
    if os.path.isfile(libarm64dbi_path) and os.path.getsize(libarm64dbi_path) > 10000000:
        return libarm64dbi_path
    
    return None


@dataclass
class ARM64DBIConfig:
    """ARM64DBI 追踪配置"""
    so_name: str                    # 目标 SO 名称 (如 libnative.so)
    offset: int = 0                 # 函数偏移 (如 0x21244)
    symbol: str = ""                # 符号名 (如 encrypt)
    trace_mode: int = 1             # 0=符号追踪, 1=偏移追踪
    args_count: int = 5             # 函数参数数量
    output_file: str = ""           # 日志文件路径
    package_name: str = ""          # 应用包名
    
    # ARM64DBI 特有功能
    enable_jni_trace: bool = False      # JNI 追踪
    enable_syscall_trace: bool = False  # 系统调用追踪
    enable_hexdump: bool = False        # 内存 hexdump
    enable_fast_log: bool = False       # 高性能日志
    fast_log_size_mb: int = 256         # 高性能日志大小 (MB)


class ARM64DBIManager:
    """
    ARM64DBI 管理器
    
    功能：
    1. 检测/推送 libarm64dbi.so
    2. 生成追踪脚本
    3. 支持 JNI/Syscall 追踪
    4. 高性能日志
    """
    
    def __init__(self, device_id: Optional[str] = None):
        self.device_id = device_id
        self.libarm64dbi_ready = False
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
    
    def check_libarm64dbi(self) -> bool:
        """检查 libarm64dbi.so 是否存在"""
        log_info("🔍 检查 ARM64DBI 追踪库...")
        
        code, stdout, _ = self._run_adb_shell(f'ls -la {LIBARM64DBI_DEVICE_PATH}')
        if code == 0 and 'libarm64dbi.so' in stdout:
            # 检查文件大小 (正常应该 > 20MB)
            try:
                size = int(stdout.split()[4])
                if size > 20000000:
                    self.libarm64dbi_ready = True
                    log_success(f"✅ ARM64DBI 追踪库已就绪 ({size // 1024 // 1024}MB)")
                    return True
            except:
                pass
        
        log_warning("⚠️ ARM64DBI 追踪库未找到")
        return False
    
    def push_libarm64dbi(self) -> bool:
        """推送 libarm64dbi.so 到设备"""
        
        # 检查本地预置文件
        local_libarm64dbi = get_local_libarm64dbi('arm64')
        if local_libarm64dbi:
            log_info(f"📦 发现本地预置 libarm64dbi.so")
            log_info(f"   路径: {local_libarm64dbi}")
            log_info(f"   大小: {os.path.getsize(local_libarm64dbi) // 1024 // 1024}MB")
            
            # 推送到设备
            log_info("📲 推送到设备...")
            code, stdout, stderr = self._run_adb('push', local_libarm64dbi, LIBARM64DBI_DEVICE_PATH)
            if code == 0:
                # 设置权限
                self._run_adb_shell(f'chmod 755 {LIBARM64DBI_DEVICE_PATH}', as_root=True)
                log_success(f"✅ 已推送到: {LIBARM64DBI_DEVICE_PATH}")
                self.libarm64dbi_ready = True
                return True
            else:
                log_error(f"❌ 推送失败: {stderr}")
                return False
        
        log_error("❌ 未找到本地 libarm64dbi.so")
        log_info("   请从 ARM64DBIDemo 项目编译获取:")
        log_info("   1. cd ARM64DBIDemo && ./gradlew assembleRelease")
        log_info("   2. cp app/build/intermediates/stripped_native_libs/release/.../libarm64dbidemo.so")
        log_info("      fridac/binaries/arm64/libarm64dbi.so")
        return False
    
    def ensure_libarm64dbi(self) -> bool:
        """确保 libarm64dbi.so 可用"""
        if self.check_libarm64dbi():
            return True
        
        log_info("📥 需要推送 ARM64DBI 追踪库...")
        return self.push_libarm64dbi()
    
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
    
    def generate_trace_script(self, config: ARM64DBIConfig) -> str:
        """
        生成 ARM64DBI 追踪脚本
        
        Args:
            config: 追踪配置
            
        Returns:
            JavaScript 脚本内容
        """
        # 配置选项
        jni_trace = 'true' if config.enable_jni_trace else 'false'
        syscall_trace = 'true' if config.enable_syscall_trace else 'false'
        hexdump = 'true' if config.enable_hexdump else 'false'
        fast_log = 'true' if config.enable_fast_log else 'false'
        
        output_file = config.output_file or DEFAULT_TRACE_OUTPUT
        fast_log_path = DEFAULT_FAST_LOG_OUTPUT
        
        script = f'''// ARM64DBI 追踪脚本 (由 fridac 生成)
// 目标: {config.so_name} @ 0x{config.offset:x} ({config.symbol or 'offset'})
// 功能: JNI追踪={config.enable_jni_trace}, Syscall追踪={config.enable_syscall_trace}

(function() {{
    'use strict';
    
    const DBI_SO_PATH = "{LIBARM64DBI_DEVICE_PATH}";
    const SO_NAME = "{config.so_name}";
    const SYMBOL = "{config.symbol}";
    const OFFSET = {hex(config.offset)};
    const TRACE_MODE = {config.trace_mode};  // 0=符号, 1=偏移
    const ARGS_COUNT = {config.args_count};
    
    // ARM64DBI 特有配置
    const ENABLE_JNI_TRACE = {jni_trace};
    const ENABLE_SYSCALL_TRACE = {syscall_trace};
    const ENABLE_HEXDUMP = {hexdump};
    const ENABLE_FAST_LOG = {fast_log};
    const LOG_FILE = "{output_file}";
    const FAST_LOG_PATH = "{fast_log_path}";
    const FAST_LOG_SIZE_MB = {config.fast_log_size_mb};
    
    let funcs = {{}};
    let isLoaded = false;
    
    const LOG = {{
        info: (msg) => console.log(`[*] ${{msg}}`),
        ok: (msg) => console.log(`[+] ${{msg}}`),
        err: (msg) => console.log(`[-] ${{msg}}`),
        line: () => console.log("═══════════════════════════════════════════════════════════════")
    }};
    
    function loadDBI() {{
        if (isLoaded) return true;
        
        LOG.line();
        console.log("║     ARM64DBI v1.3.2 - 增强追踪 (JNI/Syscall)");
        LOG.line();
        LOG.info("目标 SO: " + SO_NAME);
        LOG.info("追踪模式: " + (TRACE_MODE === 0 ? "符号: " + SYMBOL : "偏移: 0x" + OFFSET.toString(16)));
        LOG.info("参数数量: " + ARGS_COUNT);
        LOG.info("JNI 追踪: " + (ENABLE_JNI_TRACE ? "✅ 开启" : "❌ 关闭"));
        LOG.info("Syscall 追踪: " + (ENABLE_SYSCALL_TRACE ? "✅ 开启" : "❌ 关闭"));
        LOG.info("Hexdump: " + (ENABLE_HEXDUMP ? "✅ 开启" : "❌ 关闭"));
        LOG.info("高性能日志: " + (ENABLE_FAST_LOG ? "✅ 开启" : "❌ 关闭"));
        console.log("");
        
        try {{
            LOG.info("加载追踪库: " + DBI_SO_PATH);
            const handle = Module.load(DBI_SO_PATH);
            LOG.ok("追踪库加载成功: " + handle.base);
            
            // 绑定函数
            const bindFunc = (name, retType, argTypes) => {{
                const ptr = Module.findExportByName(DBI_SO_PATH, name);
                if (ptr) {{
                    return new NativeFunction(ptr, retType, argTypes);
                }}
                LOG.err("函数未找到: " + name);
                return null;
            }};
            
            funcs.init = bindFunc("dbi_init", 'int', []);
            funcs.trace_offset = bindFunc("dbi_trace_offset", 'uint64', ['pointer', 'uint64', 'int']);
            funcs.trace_symbol = bindFunc("dbi_trace_symbol", 'uint64', ['pointer', 'pointer', 'int']);
            funcs.set_log_file = bindFunc("dbi_set_log_file", 'void', ['pointer']);
            funcs.cleanup = bindFunc("dbi_cleanup", 'void', []);
            funcs.version = bindFunc("dbi_version", 'pointer', []);
            funcs.set_hexdump = bindFunc("dbi_set_hexdump", 'void', ['int']);
            funcs.enable_syscall_trace = bindFunc("dbi_enable_syscall_trace", 'void', ['int']);
            funcs.enable_jni_trace = bindFunc("dbi_enable_jni_trace", 'void', ['int']);
            funcs.fast_log_open = bindFunc("dbi_fast_log_open", 'int', ['pointer', 'int']);
            funcs.fast_log_close = bindFunc("dbi_fast_log_close", 'void', []);
            funcs.print_stats = bindFunc("dbi_print_stats", 'void', []);
            
            // 初始化
            const ret = funcs.init();
            if (ret === 0) {{
                LOG.ok("ARM64DBI 初始化成功");
                
                // 打印版本
                if (funcs.version) {{
                    const ver = funcs.version().readCString();
                    LOG.ok("版本: " + ver);
                }}
                
                // 设置日志文件
                if (LOG_FILE) {{
                    const pathPtr = Memory.allocUtf8String(LOG_FILE);
                    funcs.set_log_file(pathPtr);
                    LOG.ok("日志文件: " + LOG_FILE);
                }}
                
                // 启用各种追踪
                if (ENABLE_HEXDUMP && funcs.set_hexdump) {{
                    funcs.set_hexdump(1);
                    LOG.ok("已启用 Hexdump");
                }}
                
                if (ENABLE_SYSCALL_TRACE && funcs.enable_syscall_trace) {{
                    funcs.enable_syscall_trace(1);
                    LOG.ok("已启用系统调用追踪");
                }}
                
                if (ENABLE_JNI_TRACE && funcs.enable_jni_trace) {{
                    funcs.enable_jni_trace(1);
                    LOG.ok("已启用 JNI 追踪");
                }}
                
                if (ENABLE_FAST_LOG && funcs.fast_log_open) {{
                    const pathPtr = Memory.allocUtf8String(FAST_LOG_PATH);
                    if (funcs.fast_log_open(pathPtr, FAST_LOG_SIZE_MB) === 0) {{
                        LOG.ok("已启用高性能日志: " + FAST_LOG_PATH);
                    }}
                }}
                
                isLoaded = true;
                return true;
            }} else {{
                LOG.err("初始化失败");
                return false;
            }}
        }} catch (e) {{
            LOG.err("加载追踪库失败: " + e);
            LOG.err("请检查: SELinux 是否已关闭 (adb shell su -c 'setenforce 0')");
            return false;
        }}
    }}
    
    function startTrace() {{
        if (!loadDBI()) return;
        
        const mod = Process.findModuleByName(SO_NAME);
        if (!mod) {{
            LOG.err("目标 SO 尚未加载: " + SO_NAME);
            LOG.info("等待 SO 加载...");
            
            // Hook dlopen 等待加载
            const android_dlopen_ext = Module.findExportByName('libc.so', 'android_dlopen_ext');
            let traced_so = null;
            
            Interceptor.attach(android_dlopen_ext, {{
                onEnter: function(args) {{
                    const path = args[0].readUtf8String();
                    if (path && path.indexOf(SO_NAME) !== -1) {{
                        LOG.info("目标 SO 加载中: " + path);
                        traced_so = path;
                    }}
                }},
                onLeave: function(retval) {{
                    if (traced_so) {{
                        LOG.ok("目标 SO 加载完毕");
                        setTimeout(doTrace, 500);
                        traced_so = null;
                    }}
                }}
            }});
            return;
        }}
        
        LOG.ok("目标 SO 已加载: " + mod.base);
        doTrace();
    }}
    
    function doTrace() {{
        let traced = null;
        
        if (TRACE_MODE === 0 && SYMBOL) {{
            LOG.info("开始符号追踪: " + SO_NAME + "::" + SYMBOL);
            const soNamePtr = Memory.allocUtf8String(SO_NAME);
            const symbolPtr = Memory.allocUtf8String(SYMBOL);
            traced = funcs.trace_symbol(soNamePtr, symbolPtr, ARGS_COUNT);
        }} else {{
            LOG.info("开始偏移追踪: " + SO_NAME + " @ 0x" + OFFSET.toString(16));
            const soNamePtr = Memory.allocUtf8String(SO_NAME);
            traced = funcs.trace_offset(soNamePtr, OFFSET, ARGS_COUNT);
        }}
        
        if (!traced.isNull()) {{
            LOG.ok("追踪已启动: " + traced);
            
            console.log("");
            LOG.line();
            console.log("  ARM64DBI 追踪已启动！");
            console.log("  日志文件: " + LOG_FILE);
            if (ENABLE_FAST_LOG) {{
                console.log("  高性能日志: " + FAST_LOG_PATH);
            }}
            console.log("  查看命令: adb logcat | grep -iE 'DBI|JNI|SVC'");
            console.log("");
            console.log("  调用追踪后的函数:");
            console.log("    var ret = traced(arg0, arg1, arg2, arg3, arg4)");
            console.log("");
            console.log("  打印统计:");
            console.log("    funcs.print_stats()");
            LOG.line();
            
            // 导出到全局
            global.traced = new NativeFunction(traced, 'uint64', ['uint64', 'uint64', 'uint64', 'uint64', 'uint64']);
            global.funcs = funcs;
        }} else {{
            LOG.err("追踪失败");
        }}
    }}
    
    // 启动追踪
    setTimeout(startTrace, 500);
    
}})();
'''
        return script
    
    def pull_trace_log(self, output_file: str, remote_path: str = DEFAULT_TRACE_OUTPUT) -> bool:
        """拉取追踪日志到本地"""
        log_info(f"📥 拉取追踪日志...")
        
        # 拉取到本地
        code, stdout, stderr = self._run_adb('pull', remote_path, output_file)
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


# 全局实例
_arm64dbi_manager: Optional[ARM64DBIManager] = None


def get_arm64dbi_manager(device_id: Optional[str] = None) -> ARM64DBIManager:
    """获取 ARM64DBIManager 单例"""
    global _arm64dbi_manager
    if _arm64dbi_manager is None:
        _arm64dbi_manager = ARM64DBIManager(device_id)
    return _arm64dbi_manager

