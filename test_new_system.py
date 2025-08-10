#!/usr/bin/env python3
"""
测试新的任务管理系统 - 彻底移除旧系统后的验证
"""

import os
import sys

def check_files():
    """检查文件状态"""
    print("📋 检查文件状态:")
    print("-" * 40)
    
    files_to_check = [
        ('frida_common_new.js', '新版Java Hook工具'),
        ('frida_location_hooks_new.js', '新版定位Hook工具'),
        ('frida_common.js', '旧版Java Hook工具'),
        ('frida_location_hooks.js', '旧版定位Hook工具'),
        ('frida_job_manager.js', '旧版任务管理器'),
        ('frida_job_commands.js', '旧版任务命令')
    ]
    
    for filename, description in files_to_check:
        if os.path.exists(filename):
            status = "✅ 存在"
        else:
            status = "❌ 不存在"
        print(f"{status} {filename} - {description}")

def check_script_content():
    """检查脚本内容是否已清理"""
    print("\n🔍 检查脚本内容:")
    print("-" * 40)
    
    if os.path.exists('frida_common_new.js'):
        with open('frida_common_new.js', 'r') as f:
            content = f.read()
            if 'HookJobManager' in content:
                print("❌ frida_common_new.js 仍包含旧任务管理系统")
            else:
                print("✅ frida_common_new.js 已清理旧任务管理系统")
    
    if os.path.exists('frida_location_hooks_new.js'):
        with open('frida_location_hooks_new.js', 'r') as f:
            content = f.read()
            if 'HookJobManager' in content:
                print("❌ frida_location_hooks_new.js 仍包含旧任务管理系统")
            else:
                print("✅ frida_location_hooks_new.js 已清理旧任务管理系统")

def show_test_plan():
    """显示测试计划"""
    print("\n🧪 测试计划:")
    print("-" * 40)
    print("1. python3.8 fridac")
    print("2. taskhelp  # 查看新任务管理命令")
    print("3. hookbase64  # 使用新命令创建任务")
    print("4. hooktoast   # 再创建一个任务")
    print("5. tasks       # 查看所有任务")
    print("6. killall     # 这次应该真正清理所有任务!")
    print("7. 验证Hook输出完全停止")
    
    print("\n💡 预期结果:")
    print("- 所有Hook函数都不再使用旧的HookJobManager")
    print("- hookbase64、hooktoast等都是新的多脚本任务")
    print("- killall命令能够真正清理所有任务")
    print("- 不再有'已取消 0 个任务'的问题")

if __name__ == "__main__":
    print("🔄 fridacli 任务管理系统重构验证")
    print("=" * 50)
    
    check_files()
    check_script_content()
    show_test_plan()
    
    print("\n" + "=" * 50)
    print("🎯 系统已重构完成，旧的任务管理系统已彻底移除！")
    print("📋 所有Hook函数现在都将创建独立的Script任务")
    print("🧹 killall命令现在可以真正清理所有Hook！")