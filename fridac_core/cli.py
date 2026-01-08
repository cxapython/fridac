#!/usr/bin/env python3
"""
fridac CLI 入口模块

提供全局安装后的命令行入口点
"""

import sys
import os
import argparse
import signal
import traceback
import json
import time

# 获取数据文件路径
def get_data_path():
    """获取数据文件路径（JS文件、scripts目录等）"""
    # 优先级1: 环境变量
    if 'FRIDAC_DATA_PATH' in os.environ:
        return os.environ['FRIDAC_DATA_PATH']
    
    # 优先级2: 当前目录（开发模式）
    current_dir = os.getcwd()
    if os.path.exists(os.path.join(current_dir, 'frida_common_new.js')):
        return current_dir
    
    # 优先级3: 脚本所在目录的父目录
    cli_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(cli_dir)
    if os.path.exists(os.path.join(parent_dir, 'frida_common_new.js')):
        return parent_dir
    
    # 优先级4: pip 安装的数据目录
    try:
        import site
        for site_dir in site.getsitepackages() + [site.getusersitepackages()]:
            data_dir = os.path.join(site_dir, 'fridac_data')
            if os.path.exists(data_dir):
                return data_dir
    except Exception:
        pass
    
    # 优先级5: 用户目录下的 .fridac
    home_dir = os.path.expanduser('~/.fridac')
    if os.path.exists(home_dir):
        return home_dir
    
    # 回退到脚本目录的父目录
    return parent_dir

# 设置数据路径
DATA_PATH = get_data_path()

# 将数据路径设置为环境变量供其他模块使用
os.environ['FRIDAC_DATA_PATH'] = DATA_PATH

from fridac_core.logger import show_banner, log_info, log_success, log_error, log_warning, log_exception, log_debug
from fridac_core.environment import (
    detect_python_environment, 
    get_frida_version, 
    get_frontmost_app, 
    find_target_app
)
from fridac_core.session import FridacSession, run_interactive_session


def _load_early_hooks_config(config_file=None):
    """加载早期 hook 配置文件"""
    if not config_file:
        config_file = os.path.join(DATA_PATH, 'early_hooks.json')
    
    if not os.path.exists(config_file):
        log_warning(f"配置文件不存在: {config_file}")
        return {}
    
    try:
        with open(config_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        log_error(f"加载配置文件失败: {e}")
        return {}


def _execute_single_hook(session, hook_name, args_list):
    """执行单个 hook 函数"""
    try:
        # 首先验证函数是否存在
        check_js = f"typeof {hook_name} !== 'undefined'"
        result = session.script.exports.eval(check_js)
        
        if not result:
            log_error(f"❌ 函数 {hook_name} 未找到或未正确加载")
            # 尝试通过 RPC 调用
            if hasattr(session.script.exports, hook_name):
                log_info(f"🔄 尝试通过 RPC 调用 {hook_name}")
                rpc_func = getattr(session.script.exports, hook_name)
                if args_list:
                    rpc_func(*args_list)
                else:
                    rpc_func()
                return True
            else:
                return False
        
        if hook_name == "traceRegisterNatives":
            target_so = args_list[0] if args_list else ""
            js_call = f"traceRegisterNatives('{target_so}')" if target_so else "traceRegisterNatives()"
        else:
            if args_list:
                formatted_args = ', '.join([f"'{arg}'" if not str(arg).isdigit() and str(arg).lower() not in ['true', 'false'] else str(arg) 
                                           for arg in args_list])
                js_call = f"{hook_name}({formatted_args})"
            else:
                js_call = f"{hook_name}()"
        
        log_info(f"🎯 执行: {js_call}")
        session.execute_js(js_call)
        return True
    except Exception as e:
        log_error(f"❌ 执行失败: {hook_name} - {e}")
        return False


def _execute_early_hooks(session, early_hook, hook_args, preset, config_file):
    """执行早期 hook 配置"""
    executed_count = 0
    
    # 处理单个 hook
    if early_hook:
        log_info(f"🚀 执行早期Hook: {early_hook}")
        args_list = [arg.strip() for arg in hook_args.split(',')] if hook_args else []
        if _execute_single_hook(session, early_hook, args_list):
            executed_count += 1
            log_success(f"✅ 早期Hook已执行: {early_hook}")
    
    # 处理预设
    if preset:
        log_info(f"🎯 加载Hook预设: {preset}")
        config = _load_early_hooks_config(config_file)
        presets = config.get('presets', {})
        
        if preset in presets:
            preset_config = presets[preset]
            log_info(f"📋 预设描述: {preset_config.get('description', '无描述')}")
            
            hooks = preset_config.get('hooks', [])
            for hook_config in hooks:
                hook_name = hook_config.get('function')
                hook_args = hook_config.get('args', [])
                hook_desc = hook_config.get('description', '')
                
                if hook_desc:
                    log_info(f"   {hook_desc}")
                
                if _execute_single_hook(session, hook_name, hook_args):
                    executed_count += 1
                
                time.sleep(0.1)
            
            log_success(f"✅ 预设 '{preset}' 已加载，执行了 {len(hooks)} 个Hook")
        else:
            log_error(f"❌ 未找到预设: {preset}")
            available = list(presets.keys())
            if available:
                log_info(f"可用预设: {', '.join(available)}")
    
    if executed_count > 0:
        log_success(f"🎉 早期Hook执行完成，共执行 {executed_count} 个Hook")
        log_info("⏳ 等待应用触发Hook...")


def run_frida_session(spawn_mode=False, target_package=None, force_show_apps=False, 
                      early_hook=None, hook_args=None, preset=None, config_file=None, 
                      output_file=None, append_mode=False, 
                      select_scripts=False, scripts_filter=None, no_scripts=False):
    """运行 Frida 会话"""
    
    # 设置脚本加载选项
    os.environ['FRIDAC_NO_CUSTOM_SCRIPTS'] = '1' if no_scripts else ''
    os.environ['FRIDAC_SCRIPTS_FILTER'] = scripts_filter or ''
    os.environ['FRIDAC_SELECT_SCRIPTS'] = '1' if select_scripts else ''
    
    if force_show_apps or not target_package:
        target_app = find_target_app()
        if not target_app:
            return
    else:
        target_app = target_package
        log_info("使用指定的包名: {}".format(target_app))
    
    session = FridacSession()
    
    if output_file:
        session.setup_output_redirect(output_file, append_mode)
        log_info(f"📁 Hook输出将重定向到: {output_file} ({'追加' if append_mode else '覆盖'}模式)")
    
    def signal_handler(sig, frame):
        log_info("正在退出...")
        session.disconnect()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    
    if not session.connect_to_app(target_app, spawn_mode):
        return
    
    if early_hook or preset:
        log_info("⏳ 等待脚本完全加载...")
        if spawn_mode:
            # Spawn模式需要更长的等待时间,确保Java环境初始化
            time.sleep(2.0)
        else:
            time.sleep(0.5)
    
    _execute_early_hooks(session, early_hook, hook_args, preset, config_file)
    
    try:
        run_interactive_session(session)
    except OSError as e:
        log_exception("交互会话 I/O 异常", e)
    except Exception as e:
        log_exception("交互会话发生错误", e)
    finally:
        session.disconnect()


def main():
    """主函数 - CLI 入口点"""
    parser = argparse.ArgumentParser(
        description='fridac - 专业级 Frida Hook 工具集',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
示例:
  fridac                                    # 自动连接前台应用
  fridac -a                                 # 显示应用列表
  fridac -f com.example.app                 # Spawn 模式启动
  fridac -p com.example.app                 # 附加到应用
  
frida-server 管理:
  fridac --server-only                      # 仅启动 frida-server 不连接应用
  fridac --stop-server                      # 停止 frida-server
  # 注: fridac 会自动检测并启动 frida-server，无需手动管理
  
早期 Hook (仅 Spawn 模式):
  fridac -f com.app --hook traceRegisterNatives
  fridac -f com.app --preset jni_analysis
  fridac -f com.app --hook hookbase64 -o hooks.log
        '''
    )
    
    parser.add_argument('-f', '--package', type=str,
                       help='以 Spawn 模式启动并附加')
    
    parser.add_argument('-p', '--attach-package', type=str,
                       help='附加到已运行的应用')
    
    parser.add_argument('-a', '--apps', action='store_true',
                       help='显示应用列表供选择')
    
    # frida-server 管理选项
    parser.add_argument('--server-only', action='store_true',
                       help='仅启动 frida-server，不连接应用')
    
    parser.add_argument('--stop-server', action='store_true',
                       help='停止 frida-server')
    
    parser.add_argument('--hook', type=str, 
                       help='启动后立即执行的 Hook 函数')
    
    parser.add_argument('--hook-args', type=str,
                       help='Hook 函数参数 (逗号分隔)')
    
    parser.add_argument('--preset', type=str,
                       help='Hook 预设 (jni_analysis, crypto_analysis, network_analysis, anti_debug)')
    
    parser.add_argument('--config', type=str,
                       help='Hook 配置文件路径')
    
    parser.add_argument('-o', '--output', type=str,
                       help='输出重定向到文件')
    
    parser.add_argument('--append', action='store_true',
                       help='追加模式 (配合 -o)')
    
    parser.add_argument('--data-path', type=str,
                       help='指定数据文件路径 (JS 脚本目录)')
    
    # 自定义脚本选择
    parser.add_argument('-s', '--select-scripts', action='store_true',
                       help='交互式选择要加载的自定义脚本')
    
    parser.add_argument('--scripts', type=str,
                       help='指定要加载的脚本 (逗号分隔，如: ssl_bypass,anti_anti_debug)')
    
    parser.add_argument('--no-scripts', action='store_true',
                       help='不加载任何自定义脚本 (仅加载核心功能)')
    
    parser.add_argument('--list-scripts', action='store_true',
                       help='列出所有可用的自定义脚本')
    
    parser.add_argument('--version', action='version', 
                       version='fridac 1.0.0 (Frida {})'.format(get_frida_version()))
    
    args = parser.parse_args()
    
    # 如果指定了数据路径，更新环境变量（需在使用 DATA_PATH 前处理）
    if args.data_path:
        os.environ['FRIDAC_DATA_PATH'] = args.data_path
    
    # 处理列出脚本命令
    if args.list_scripts:
        from fridac_core.custom_scripts import CustomScriptManager
        data_path = os.environ.get('FRIDAC_DATA_PATH', DATA_PATH)
        manager = CustomScriptManager(data_path)
        manager.scan_scripts()
        manager.list_available_scripts()
        return
    
    # 处理 frida-server 管理命令
    if args.stop_server:
        from fridac_core.device_manager import DeviceManager
        manager = DeviceManager()
        if manager.check_adb_connection():
            manager.check_root()
            manager.stop_frida_server()
        return
    
    if args.server_only:
        from fridac_core.device_manager import ensure_frida_server
        ensure_frida_server()
        return
    
    # 数据路径已在前面处理
    
    target_package = None
    spawn_mode = False
    force_show_apps = False
    
    if args.package:
        target_package = args.package
        spawn_mode = True
    elif args.attach_package:
        target_package = args.attach_package
        spawn_mode = False
    elif args.apps:
        force_show_apps = True
    else:
        frontmost_id, frontmost_name = get_frontmost_app()
        if frontmost_id:
            target_package = frontmost_id
            spawn_mode = False
            log_success("检测到前台应用: {} ({})".format(frontmost_name, frontmost_id))
            log_info("将自动连接到此应用，如需选择其他应用请使用 'fridac -a'")
        else:
            log_info("没有检测到前台应用，显示应用列表...")
            force_show_apps = True
    
    # 检测环境并显示 Banner（集成版本信息）
    env_info = detect_python_environment()
    show_banner(env_info)
    
    try:
        run_frida_session(
            spawn_mode=spawn_mode, 
            target_package=target_package, 
            force_show_apps=force_show_apps, 
            early_hook=args.hook, 
            hook_args=args.hook_args, 
            preset=args.preset, 
            config_file=args.config,
            output_file=args.output, 
            append_mode=args.append,
            select_scripts=args.select_scripts,
            scripts_filter=args.scripts,
            no_scripts=args.no_scripts
        )
    except KeyboardInterrupt:
        log_info("程序被用户中断")
    except Exception as e:
        log_exception(f"运行出错:{traceback.format_exc()}")
        from fridac_core.logger import is_rich_available
        if not is_rich_available():
            log_warning("建议安装 rich 获得更好的用户体验: pip install rich")


if __name__ == '__main__':
    main()

