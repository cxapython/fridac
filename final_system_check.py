#!/usr/bin/env python3
"""
最终系统检查 - 确保所有问题都已解决
"""

import os
import sys

def check_file_references():
    """检查文件引用是否正确更新"""
    print("🔍 检查文件引用:")
    print("-" * 40)
    
    # 检查script_manager.py
    with open('fridac_core/script_manager.py', 'r') as f:
        content = f.read()
        if 'frida_common_new.js' in content:
            print("✅ script_manager.py 使用新版 frida_common_new.js")
        else:
            print("❌ script_manager.py 未更新为新版本")
            
        if 'frida_location_hooks_new.js' in content:
            print("✅ script_manager.py 使用新版 frida_location_hooks_new.js")
        else:
            print("❌ script_manager.py 未更新为新版本")
            
        if '# js_content += _load_job_manager()' in content:
            print("✅ script_manager.py 已禁用旧任务管理系统")
        else:
            print("❌ script_manager.py 旧任务管理系统未禁用")
    
    # 检查script_templates.py
    with open('fridac_core/script_templates.py', 'r') as f:
        content = f.read()
        if 'frida_common_new.js' in content:
            print("✅ script_templates.py 使用新版 frida_common_new.js")
        else:
            print("❌ script_templates.py 未更新为新版本")

def check_hook_functions():
    """检查Hook函数是否已清理"""
    print("\n🎯 检查Hook函数:")
    print("-" * 40)
    
    # 检查新版本文件是否不包含旧系统引用
    new_files = ['frida_common_new.js', 'frida_location_hooks_new.js']
    
    for filename in new_files:
        if os.path.exists(filename):
            with open(filename, 'r') as f:
                content = f.read()
                if 'HookJobManager.autoRegisterHook' in content:
                    print(f"❌ {filename} 仍包含 HookJobManager.autoRegisterHook")
                elif 'HookJobManager.getJob' in content:
                    print(f"❌ {filename} 仍包含 HookJobManager.getJob")
                elif 'HookJobManager.updateAutoTaskHit' in content:
                    print(f"❌ {filename} 仍包含 HookJobManager.updateAutoTaskHit")
                else:
                    print(f"✅ {filename} 已清理所有旧任务管理系统引用")

def check_global_exports():
    """检查全局导出是否已移除"""
    print("\n🌍 检查全局导出:")
    print("-" * 40)
    
    files_to_check = ['frida_location_hooks_new.js']
    
    for filename in files_to_check:
        if os.path.exists(filename):
            with open(filename, 'r') as f:
                content = f.read()
                problematic_exports = [
                    'global.hookBase64 =',
                    'global.hookURL =', 
                    'global.hookToast =',
                    'global.jobs =',
                    'global.killall ='
                ]
                
                has_problems = False
                for export in problematic_exports:
                    if export in content:
                        print(f"❌ {filename} 仍导出: {export}")
                        has_problems = True
                
                if not has_problems:
                    print(f"✅ {filename} 已移除冲突的全局导出")

def check_command_system():
    """检查命令系统"""
    print("\n⚙️ 检查命令系统:")
    print("-" * 40)
    
    with open('fridac_core/session.py', 'r') as f:
        content = f.read()
        
        # 检查新命令是否存在
        new_commands = [
            'elif cmd == \'hookbase64\':',
            'elif cmd == \'hooktoast\':',
            'session.create_hook_task'
        ]
        
        for cmd in new_commands:
            if cmd in content:
                print(f"✅ 新命令系统: {cmd}")
            else:
                print(f"❌ 缺少新命令: {cmd}")

def check_task_manager():
    """检查任务管理器"""
    print("\n📋 检查任务管理器:")
    print("-" * 40)
    
    required_files = [
        'fridac_core/task_manager.py',
        'fridac_core/script_templates.py'
    ]
    
    for filename in required_files:
        if os.path.exists(filename):
            print(f"✅ {filename} 存在")
        else:
            print(f"❌ {filename} 缺失")

def final_recommendations():
    """最终建议"""
    print("\n🎯 最终测试建议:")
    print("-" * 40)
    print("1. python3.8 fridac")
    print("2. hookbase64    # 应该创建任务而不是直接Hook")
    print("3. tasks         # 应该显示1个任务")
    print("4. hooktoast     # 应该创建第2个任务")
    print("5. tasks         # 应该显示2个任务")
    print("6. killall       # 应该清理2个任务")
    print("7. tasks         # 应该显示0个任务")
    
    print("\n💡 如果hookbase64直接生效而不是创建任务，说明:")
    print("   - 主脚本仍在加载旧版本文件")
    print("   - 或者全局导出仍然存在")

if __name__ == "__main__":
    print("🔧 fridacli 系统最终检查")
    print("=" * 50)
    
    check_file_references()
    check_hook_functions()
    check_global_exports()
    check_command_system()
    check_task_manager()
    final_recommendations()
    
    print("\n" + "=" * 50)
    print("🎊 检查完成！现在可以进行最终测试了！")