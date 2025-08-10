#!/usr/bin/env python3
"""
最终验证 - 确认所有功能都已正确实现
"""

import os

def final_check():
    print("🎯 fridacli 系统最终验证")
    print("=" * 50)
    
    # 1. 核心文件检查
    print("\n📁 核心文件状态:")
    print("-" * 30)
    
    core_files = {
        'frida_common_new.js': 'Java Hook工具集 (新版)',
        'frida_location_hooks_new.js': '定位Hook工具集 (新版)', 
        'fridac_core/task_manager.py': 'Python任务管理器',
        'fridac_core/script_templates.py': '脚本模板引擎',
        'fridac_core/session.py': '会话管理 (含新命令)'
    }
    
    for file, desc in core_files.items():
        if os.path.exists(file):
            print(f"  ✅ {file} - {desc}")
        else:
            print(f"  ❌ {file} - {desc} (缺失)")
    
    # 2. 旧系统禁用检查
    print(f"\n🚫 旧系统禁用状态:")
    print("-" * 30)
    
    if os.path.exists('fridac_core/script_manager.py'):
        with open('fridac_core/script_manager.py', 'r') as f:
            content = f.read()
            if '# js_content += _load_job_manager()' in content:
                print("  ✅ 旧任务管理系统已禁用")
            else:
                print("  ❌ 旧任务管理系统仍在加载")
            
            if 'frida_common_new.js' in content:
                print("  ✅ 使用新版Java Hook工具")
            else:
                print("  ❌ 仍使用旧版Java Hook工具")
            
            if 'frida_location_hooks_new.js' in content:
                print("  ✅ 使用新版定位Hook工具") 
            else:
                print("  ❌ 仍使用旧版定位Hook工具")
    
    # 3. 新命令完整性检查
    print(f"\n⚙️ 新命令系统:")
    print("-" * 30)
    
    expected_commands = [
        'hookmethod', 'hookclass', 'hooknative',
        'hookbase64', 'hooktoast', 'hookarraylist', 'hookloadlibrary',
        'hooknewstringutf', 'hookfileoperations', 'hookjsonobject', 
        'hookhashmap', 'hookedittext', 'hooklog', 'hookurl',
        'tasks', 'killall', 'taskinfo', 'taskstats'
    ]
    
    if os.path.exists('fridac_core/session.py'):
        with open('fridac_core/session.py', 'r') as f:
            content = f.read()
            
            found_commands = 0
            for cmd in expected_commands:
                if f"elif cmd == '{cmd}':" in content:
                    found_commands += 1
                    print(f"  ✅ {cmd}")
                else:
                    print(f"  ❌ {cmd} (未找到)")
            
            print(f"\n  📊 新命令覆盖率: {found_commands}/{len(expected_commands)} ({found_commands/len(expected_commands)*100:.1f}%)")
    
    # 4. 模板引擎完整性 
    print(f"\n🎯 脚本模板支持:")
    print("-" * 30)
    
    template_methods = [
        'generate_method_hook_script',
        'generate_class_hook_script', 
        'generate_native_hook_script',
        'generate_location_hook_script'
    ]
    
    if os.path.exists('fridac_core/script_templates.py'):
        with open('fridac_core/script_templates.py', 'r') as f:
            content = f.read()
            
            for method in template_methods:
                if f'def {method}(' in content:
                    print(f"  ✅ {method}")
                else:
                    print(f"  ❌ {method} (缺失)")
    
    # 5. 别名和兼容性
    print(f"\n🔄 别名和兼容性:")
    print("-" * 30)
    
    if os.path.exists('frida_job_commands.js'):
        with open('frida_job_commands.js', 'r') as f:
            content = f.read()
            aliases = ['j = jobs', 'k = kill', 'ka = killall', 'jh = jobhelp']
            
            for alias in aliases:
                if alias in content:
                    print(f"  ✅ {alias}")
                else:
                    print(f"  ❌ {alias} (缺失)")
    
    # 6. 全局导出冲突检查
    print(f"\n⚠️ 全局导出冲突检查:")
    print("-" * 30)
    
    # 检查新版本文件是否正确移除了Hook函数导出
    if os.path.exists('frida_location_hooks_new.js'):
        with open('frida_location_hooks_new.js', 'r') as f:
            content = f.read()
            
            hook_exports = ['global.hookBase64', 'global.hookURL', 'global.hookToast']
            conflict_found = False
            
            for export in hook_exports:
                if export in content:
                    print(f"  ❌ 发现冲突导出: {export}")
                    conflict_found = True
            
            if not conflict_found:
                print("  ✅ 无冲突导出，新版本文件正确")
    
    print(f"\n🎊 验证完成！")
    print("=" * 50)
    print("如果以上所有项目都显示 ✅，说明系统已完全迁移成功！")

if __name__ == "__main__":
    final_check()