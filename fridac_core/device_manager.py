"""
fridac 设备管理器
自动检测、下载和启动 frida-server
"""

import os
import re
import subprocess
import time
import tempfile
import shutil
from typing import Optional, Tuple, List

from .logger import log_info, log_success, log_warning, log_error, log_debug

# frida-server 版本映射
FRIDA_VERSIONS = {
    '16': '16.0.11',  # 对应 Python 3.8+
    '14': '14.2.18',  # 对应 Python 3.6
}

# CPU 架构映射
ARCH_MAP = {
    'arm64-v8a': 'arm64',
    'armeabi-v7a': 'arm',
    'armeabi': 'arm',
    'x86_64': 'x86_64',
    'x86': 'x86',
}

# frida-server 下载 URL 模板
FRIDA_DOWNLOAD_URL = "https://github.com/frida/frida/releases/download/{version}/frida-server-{version}-android-{arch}.xz"

# 镜像站（如果 GitHub 下载慢）
FRIDA_MIRROR_URLS = [
    "https://ghproxy.com/https://github.com/frida/frida/releases/download/{version}/frida-server-{version}-android-{arch}.xz",
    "https://mirror.ghproxy.com/https://github.com/frida/frida/releases/download/{version}/frida-server-{version}-android-{arch}.xz",
]


def get_binaries_dir() -> str:
    """获取本地 binaries 目录路径"""
    # 获取当前模块所在目录
    module_dir = os.path.dirname(os.path.abspath(__file__))
    # fridac_core 的父目录是 fridac 项目根目录
    project_root = os.path.dirname(module_dir)
    return os.path.join(project_root, 'binaries')


def get_local_frida_server(arch: str, version: str) -> Optional[str]:
    """
    检查本地是否有预置的 frida-server
    
    Args:
        arch: CPU 架构 (arm64, arm, x86_64, x86)
        version: frida 版本 (如 16.0.11)
        
    Returns:
        本地文件路径，不存在则返回 None
    """
    binaries_dir = get_binaries_dir()
    arch_dir = os.path.join(binaries_dir, arch)
    
    # 可能的文件名格式
    possible_names = [
        f'frida-server-{version}',
        f'frida-server-{version}-android-{arch}',
        f'fs{version.replace(".", "")}',
    ]
    
    for name in possible_names:
        path = os.path.join(arch_dir, name)
        if os.path.isfile(path) and os.path.getsize(path) > 1000000:  # > 1MB
            return path
    
    return None


class DeviceManager:
    """
    设备管理器
    
    功能：
    1. 检测设备 root 状态
    2. 检测 CPU 架构
    3. 检测 frida-server 运行状态
    4. 自动下载和部署 frida-server
    5. 启动和管理 frida-server
    """
    
    def __init__(self):
        self.device_id: Optional[str] = None
        self.is_rooted: bool = False
        self.cpu_arch: Optional[str] = None
        self.frida_server_path: Optional[str] = None
        self.frida_server_running: bool = False
        self.client_frida_version: Optional[str] = None
        
    def _run_adb(self, *args, check: bool = True, capture: bool = True) -> Tuple[int, str, str]:
        """
        执行 adb 命令
        
        Returns:
            (返回码, stdout, stderr)
        """
        cmd = ['adb']
        if self.device_id:
            cmd.extend(['-s', self.device_id])
        cmd.extend(args)
        
        try:
            result = subprocess.run(
                cmd,
                capture_output=capture,
                text=True,
                timeout=30
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
    
    def check_adb_connection(self) -> bool:
        """检查 ADB 连接"""
        log_info("🔍 检查 ADB 连接...")
        
        code, stdout, stderr = self._run_adb('devices')
        if code != 0:
            log_error(f"❌ ADB 命令失败: {stderr}")
            return False
        
        lines = stdout.strip().split('\n')
        devices = []
        for line in lines[1:]:  # 跳过 "List of devices attached"
            if '\tdevice' in line:
                device_id = line.split('\t')[0]
                devices.append(device_id)
        
        if not devices:
            log_error("❌ 没有检测到已连接的设备")
            log_info("   请确保：")
            log_info("   1. USB 调试已开启")
            log_info("   2. 设备已通过 USB 连接或使用 adb connect")
            return False
        
        if len(devices) == 1:
            self.device_id = devices[0]
        else:
            # 多设备时让用户选择
            log_info(f"📱 检测到 {len(devices)} 个设备:")
            for i, dev in enumerate(devices):
                log_info(f"   [{i}] {dev}")
            try:
                choice = input("请选择设备编号 [0]: ").strip()
                idx = int(choice) if choice else 0
                self.device_id = devices[idx]
            except (ValueError, IndexError):
                self.device_id = devices[0]
        
        log_success(f"✅ 已连接设备: {self.device_id}")
        return True
    
    def check_root(self) -> bool:
        """检测设备是否 root"""
        log_info("🔍 检查 Root 权限...")
        
        # 方法1: 检查 su 命令
        code, stdout, stderr = self._run_adb_shell('which su')
        if code == 0 and stdout:
            # 尝试执行 su
            code2, stdout2, _ = self._run_adb_shell('su -c id')
            if code2 == 0 and 'uid=0' in stdout2:
                self.is_rooted = True
                log_success("✅ 设备已 Root (su)")
                return True
        
        # 方法2: 检查 Magisk
        code, stdout, _ = self._run_adb_shell('ls /data/adb/magisk')
        if code == 0:
            self.is_rooted = True
            log_success("✅ 设备已 Root (Magisk)")
            return True
        
        # 方法3: 直接测试 root shell
        code, stdout, _ = self._run_adb('shell', 'su', '-c', 'echo root_test')
        if code == 0 and 'root_test' in stdout:
            self.is_rooted = True
            log_success("✅ 设备已 Root")
            return True
        
        log_error("❌ 设备未 Root 或无法获取 Root 权限")
        log_info("   Frida 需要 Root 权限才能注入应用")
        return False
    
    def get_cpu_arch(self) -> Optional[str]:
        """获取设备 CPU 架构"""
        log_info("🔍 检测 CPU 架构...")
        
        code, stdout, _ = self._run_adb_shell('getprop ro.product.cpu.abi')
        if code == 0 and stdout:
            abi = stdout.strip()
            self.cpu_arch = ARCH_MAP.get(abi, abi)
            log_success(f"✅ CPU 架构: {abi} -> {self.cpu_arch}")
            return self.cpu_arch
        
        # 备用方法
        code, stdout, _ = self._run_adb_shell('uname -m')
        if code == 0 and stdout:
            arch = stdout.strip()
            if 'aarch64' in arch or 'arm64' in arch:
                self.cpu_arch = 'arm64'
            elif 'arm' in arch:
                self.cpu_arch = 'arm'
            elif 'x86_64' in arch:
                self.cpu_arch = 'x86_64'
            elif 'x86' in arch or 'i686' in arch:
                self.cpu_arch = 'x86'
            else:
                self.cpu_arch = arch
            log_success(f"✅ CPU 架构: {self.cpu_arch}")
            return self.cpu_arch
        
        log_error("❌ 无法检测 CPU 架构")
        return None
    
    def check_frida_server_running(self) -> bool:
        """检查 frida-server 是否运行"""
        log_info("🔍 检查 frida-server 状态...")
        
        # 检查端口 27042 是否被监听（最可靠的方式）
        code, stdout, _ = self._run_adb_shell("su -c 'netstat -tlnp 2>/dev/null | grep 27042'")
        if code == 0 and '27042' in stdout:
            self.frida_server_running = True
            log_success("✅ frida-server 正在运行")
            return True
        
        # 备用：检查 frida-server 或 fs[0-9]* 进程（排除系统进程）
        code, stdout, _ = self._run_adb_shell("ps -A | grep -E 'frida-server|/fs[0-9]'")
        if code == 0 and stdout.strip():
            # 过滤系统进程（如 fsnotify_mark 等）
            for line in stdout.strip().split('\n'):
                if 'frida-server' in line or '/fs1' in line or '/fs2' in line:
                    self.frida_server_running = True
                    log_success("✅ frida-server 正在运行")
                    return True
        
        self.frida_server_running = False
        log_warning("⚠️ frida-server 未运行")
        return False
    
    def find_existing_frida_server(self) -> Optional[str]:
        """查找已存在的 frida-server"""
        log_info("🔍 查找已有的 frida-server...")
        
        # 获取客户端版本用于匹配
        client_version = self._get_client_frida_version()
        version_suffix = client_version.replace('.', '')  # 如 16011
        client_major = self._get_client_frida_major()  # 如 16
        
        # 优先查找与客户端完全匹配的版本 (如 fs16011)
        exact_match = f'fs{version_suffix}'
        code, stdout, _ = self._run_adb_shell(f'ls -la /data/local/tmp/{exact_match} 2>/dev/null')
        if code == 0 and exact_match in stdout:
            self.frida_server_path = f'/data/local/tmp/{exact_match}'
            log_success(f"✅ 找到匹配版本: {exact_match}")
            return self.frida_server_path
        
        # 查找同主版本的 fs (如 fs16*)
        code, stdout, _ = self._run_adb_shell(f'ls -la /data/local/tmp/ | grep -E "^-.*fs{client_major}"')
        if code == 0 and stdout:
            lines = stdout.strip().split('\n')
            servers = []
            for line in lines:
                parts = line.split()
                if parts:
                    fname = parts[-1]
                    if fname.startswith(f'fs{client_major}'):
                        servers.append(fname)
            
            if servers:
                # 选择版本号最大的
                servers.sort(reverse=True)
                selected = servers[0]
                self.frida_server_path = f'/data/local/tmp/{selected}'
                log_success(f"✅ 找到兼容版本: {selected}")
                if len(servers) > 1:
                    log_info(f"   其他版本: {', '.join(servers[1:])}")
                return self.frida_server_path
        
        # 查找任意 fs* 版本（兼容其他主版本）
        code, stdout, _ = self._run_adb_shell('ls -la /data/local/tmp/ | grep -E "^-.*fs[0-9]"')
        if code == 0 and stdout:
            lines = stdout.strip().split('\n')
            servers = []
            for line in lines:
                parts = line.split()
                if parts:
                    fname = parts[-1]
                    if fname.startswith('fs') and len(fname) > 2 and fname[2].isdigit():
                        servers.append(fname)
            
            if servers:
                log_warning(f"⚠️ 未找到匹配版本，可用: {', '.join(servers)}")
                log_info(f"   客户端版本: {client_version}，建议下载匹配版本")
        
        # 查找 frida-server* 命名（兼容旧格式）
        code, stdout, _ = self._run_adb_shell('ls -la /data/local/tmp/frida-server* 2>/dev/null')
        if code == 0 and 'frida-server' in stdout:
            lines = stdout.strip().split('\n')
            for line in lines:
                parts = line.split()
                if parts:
                    fname = parts[-1]
                    if 'frida-server' in fname:
                        self.frida_server_path = fname if fname.startswith('/') else f'/data/local/tmp/{fname}'
                        log_success(f"✅ 找到 frida-server: {self.frida_server_path}")
                        return self.frida_server_path
        
        log_warning("⚠️ 未找到已有的 frida-server")
        return None
    
    def _get_client_frida_major(self) -> str:
        """获取客户端 frida 主版本号"""
        try:
            import frida
            version = frida.__version__
            self.client_frida_version = version
            major = version.split('.')[0]
            return major
        except Exception:
            return '16'  # 默认
    
    def _get_client_frida_version(self) -> str:
        """获取客户端 frida 完整版本"""
        try:
            import frida
            return frida.__version__
        except Exception:
            return FRIDA_VERSIONS.get('16', '16.0.11')
    
    def download_frida_server(self) -> Optional[str]:
        """下载 frida-server (优先使用本地预置文件)"""
        if not self.cpu_arch:
            log_error("❌ 未知 CPU 架构，无法下载")
            return None
        
        client_version = self._get_client_frida_version()
        major = client_version.split('.')[0]
        version_suffix = client_version.replace('.', '')
        remote_path = f'/data/local/tmp/fs{version_suffix}'
        
        # === 优先检查本地预置文件 ===
        local_server = get_local_frida_server(self.cpu_arch, client_version)
        if local_server:
            log_info(f"📦 发现本地预置 frida-server: {os.path.basename(local_server)}")
            log_info(f"   版本: {client_version}")
            log_info(f"   架构: {self.cpu_arch}")
            
            # 推送到设备
            log_info("📲 推送到设备...")
            code, stdout, stderr = self._run_adb('push', local_server, remote_path)
            if code == 0:
                # 设置权限
                self._run_adb_shell(f'chmod 755 {remote_path}', as_root=True)
                log_success(f"✅ 已推送到: {remote_path}")
                self.frida_server_path = remote_path
                return remote_path
            else:
                log_warning(f"⚠️ 推送本地文件失败: {stderr}，尝试在线下载...")
        
        # === 从网络下载 ===
        log_info(f"📥 准备下载 frida-server...")
        log_info(f"   客户端版本: {client_version}")
        log_info(f"   目标架构: {self.cpu_arch}")
        
        # 构建下载 URL
        urls = [FRIDA_DOWNLOAD_URL.format(version=client_version, arch=self.cpu_arch)]
        urls.extend([url.format(version=client_version, arch=self.cpu_arch) for url in FRIDA_MIRROR_URLS])
        
        # 创建临时目录
        temp_dir = tempfile.mkdtemp(prefix='fridac_')
        xz_file = os.path.join(temp_dir, f'frida-server-{client_version}-android-{self.cpu_arch}.xz')
        # 命名格式: fs + 版本号(去掉小数点)，如 fs16011
        version_suffix = client_version.replace('.', '')
        server_file = os.path.join(temp_dir, f'fs{version_suffix}')
        
        downloaded = False
        for url in urls:
            log_info(f"   尝试下载: {url[:80]}...")
            try:
                # 使用 curl 下载
                result = subprocess.run(
                    ['curl', '-L', '-o', xz_file, '-f', '--connect-timeout', '10', '--max-time', '120', url],
                    capture_output=True,
                    text=True,
                    timeout=150
                )
                if result.returncode == 0 and os.path.exists(xz_file) and os.path.getsize(xz_file) > 1000:
                    downloaded = True
                    log_success("✅ 下载成功")
                    break
            except Exception as e:
                log_debug(f"   下载失败: {e}")
                continue
        
        if not downloaded:
            log_error("❌ 所有下载源都失败")
            log_info("   请手动下载 frida-server 并推送到设备")
            log_info(f"   下载地址: https://github.com/frida/frida/releases/tag/{client_version}")
            shutil.rmtree(temp_dir, ignore_errors=True)
            return None
        
        # 解压 .xz 文件
        log_info("📦 解压 frida-server...")
        try:
            # 尝试使用 xz 命令
            result = subprocess.run(['xz', '-d', '-k', xz_file], capture_output=True, timeout=30)
            if result.returncode == 0:
                # 解压后的文件名
                unxz_file = xz_file[:-3]  # 去掉 .xz
                if os.path.exists(unxz_file):
                    shutil.move(unxz_file, server_file)
            else:
                raise Exception("xz 解压失败")
        except Exception:
            # 尝试使用 Python lzma
            try:
                import lzma
                with lzma.open(xz_file, 'rb') as f_in:
                    with open(server_file, 'wb') as f_out:
                        f_out.write(f_in.read())
            except Exception as e:
                log_error(f"❌ 解压失败: {e}")
                log_info("   请安装 xz 工具或 Python lzma 模块")
                shutil.rmtree(temp_dir, ignore_errors=True)
                return None
        
        if not os.path.exists(server_file):
            log_error("❌ 解压后文件不存在")
            shutil.rmtree(temp_dir, ignore_errors=True)
            return None
        
        log_success(f"✅ 解压成功: {server_file}")
        
        # 推送到设备
        log_info("📲 推送到设备...")
        remote_path = f'/data/local/tmp/fs{version_suffix}'
        
        code, stdout, stderr = self._run_adb('push', server_file, remote_path)
        if code != 0:
            log_error(f"❌ 推送失败: {stderr}")
            shutil.rmtree(temp_dir, ignore_errors=True)
            return None
        
        # 设置权限
        self._run_adb_shell(f'chmod 755 {remote_path}', as_root=True)
        
        log_success(f"✅ 已推送到: {remote_path}")
        
        # 清理临时文件
        shutil.rmtree(temp_dir, ignore_errors=True)
        
        self.frida_server_path = remote_path
        return remote_path
    
    def start_frida_server(self) -> bool:
        """启动 frida-server"""
        if not self.frida_server_path:
            log_error("❌ frida-server 路径未知")
            return False
        
        log_info(f"🚀 启动 frida-server: {self.frida_server_path}")
        
        # 先杀掉可能存在的进程 (匹配 fs 和 frida-server)
        self._run_adb_shell('pkill -9 -f "/data/local/tmp/fs"', as_root=True)
        self._run_adb_shell('pkill -9 -f frida-server', as_root=True)
        time.sleep(0.5)
        
        # 确保执行权限（防止权限被重置导致启动失败）
        self._run_adb_shell(f'chmod 755 {self.frida_server_path}', as_root=True)
        
        # 后台启动 frida-server
        # 使用 nohup 和 & 确保后台运行
        start_cmd = f'nohup {self.frida_server_path} -D >/dev/null 2>&1 &'
        code, stdout, stderr = self._run_adb_shell(start_cmd, as_root=True)
        
        # 等待启动
        time.sleep(1)
        
        # 验证是否启动成功
        for _ in range(5):
            if self.check_frida_server_running():
                log_success("✅ frida-server 已启动")
                return True
            time.sleep(0.5)
        
        log_error("❌ frida-server 启动失败")
        return False
    
    def stop_frida_server(self) -> bool:
        """停止 frida-server"""
        log_info("🛑 停止 frida-server...")
        self._run_adb_shell('pkill -f "/data/local/tmp/fs"', as_root=True)
        self._run_adb_shell('pkill -f frida-server', as_root=True)
        time.sleep(0.5)
        
        if not self.check_frida_server_running():
            log_success("✅ frida-server 已停止")
            return True
        
        # 强制 kill
        self._run_adb_shell('pkill -9 -f "/data/local/tmp/fs"', as_root=True)
        self._run_adb_shell('pkill -9 -f frida-server', as_root=True)
        time.sleep(0.3)
        return not self.check_frida_server_running()
    
    def ensure_frida_server(self) -> bool:
        """
        确保 frida-server 运行
        
        完整流程：
        1. 检查 ADB 连接
        2. 检查 Root
        3. 检测 CPU 架构
        4. 检查 frida-server 是否运行
        5. 如果未运行，查找已有的或下载新的
        6. 启动 frida-server
        
        Returns:
            是否成功确保 frida-server 运行
        """
        log_info("=" * 50)
        log_info("🔧 fridac 设备初始化")
        log_info("=" * 50)
        
        # 1. 检查 ADB
        if not self.check_adb_connection():
            return False
        
        # 2. 检查 Root
        if not self.check_root():
            return False
        
        # 3. 检测架构
        if not self.get_cpu_arch():
            return False
        
        # 4. 检查 frida-server 是否已运行
        if self.check_frida_server_running():
            log_success("✅ frida-server 已就绪")
            return True
        
        # 5. 查找已有的 frida-server
        if not self.find_existing_frida_server():
            # 6. 下载 frida-server
            if not self.download_frida_server():
                return False
        
        # 7. 启动 frida-server
        if not self.start_frida_server():
            return False
        
        log_info("=" * 50)
        log_success("✅ 设备初始化完成，frida-server 已就绪")
        log_info("=" * 50)
        return True


def ensure_frida_server() -> bool:
    """
    便捷函数：确保 frida-server 运行
    
    Returns:
        是否成功
    """
    manager = DeviceManager()
    return manager.ensure_frida_server()


if __name__ == '__main__':
    # 测试
    ensure_frida_server()

