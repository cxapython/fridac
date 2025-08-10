#!/usr/bin/env python3
"""
综合测试脚本 - 验证所有Hook函数是否正确迁移到新任务管理系统
"""

import os
import re

def check_all_functions():
    """检查所有函数状态"""
    print("🔍 fridacli 功能全面检查")
    print("=" * 60)
    
    # 1. 检查旧系统中的所有Hook函数
    print("\n📋 旧系统中的Hook函数:")
    print("-" * 40)
    
    old_hook_functions = []
    if os.path.exists('frida_location_hooks.js'):
        with open('frida_location_hooks.js', 'r') as f:
            content = f.read()
            # 找到所有 function hookXXX 的定义
            functions = re.findall(r'function (hook\w+)', content)
            old_hook_functions = functions
            
            for func in functions:
                print(f"  🔍 {func}")
    
    # 2. 检查新系统中对应的命令
    print(f"\n📋 新系统中对应的命令 (session.py):")
    print("-" * 40)
    
    new_commands = []
    if os.path.exists('fridac_core/session.py'):
        with open('fridac_core/session.py', 'r') as f:
            content = f.read()
            # 找到所有 elif cmd == 'hookxxx' 的命令
            commands = re.findall(r"elif cmd == '(hook\w+)':", content)
            new_commands = commands
            
            for cmd in commands:
                print(f"  ✅ {cmd}")
    
    # 3. 检查script_templates.py中的支持
    print(f"\n📋 script_templates.py中的支持:")
    print("-" * 40)
    
    template_support = []
    if os.path.exists('fridac_core/script_templates.py'):
        with open('fridac_core/script_templates.py', 'r') as f:
            content = f.read()
            # 找到所有 hook_type == 'xxx' 的支持
            types = re.findall(r"'(\w+)':\s*self\._get_\w+_hook_impl", content)
            template_support = types
            
            for hook_type in types:
                print(f"  🎯 {hook_type}")
    
    # 4. 对比分析
    print(f"\n📊 迁移状态分析:")
    print("-" * 40)
    
    # 将旧函数名转换为新命令名进行对比
    old_functions_as_commands = []
    for func in old_hook_functions:
        if func.startswith('hook'):
            cmd = func.lower()  # hookBase64 -> hookbase64
            old_functions_as_commands.append(cmd)
    
    print("✅ 已迁移的函数:")
    migrated = set(old_functions_as_commands) & set(new_commands)
    for func in sorted(migrated):
        print(f"  ✅ {func}")
    
    print("\n❌ 未迁移的函数:")
    not_migrated = set(old_functions_as_commands) - set(new_commands)
    for func in sorted(not_migrated):
        print(f"  ❌ {func}")
    
    print("\n🆕 新增的命令:")
    new_only = set(new_commands) - set(old_functions_as_commands)
    for func in sorted(new_only):
        print(f"  🆕 {func}")
    
    # 5. 模板支持检查
    print(f"\n🎯 模板支持状态:")
    print("-" * 40)
    
    # 将命令名转换为模板类型名进行对比
    command_to_template = {}
    for cmd in new_commands:
        if cmd.startswith('hook'):
            template_type = cmd[4:]  # hookbase64 -> base64
            command_to_template[cmd] = template_type
    
    for cmd, template_type in command_to_template.items():
        if template_type in template_support:
            print(f"  ✅ {cmd} → {template_type} (已支持)")
        else:
            print(f"  ❌ {cmd} → {template_type} (缺少模板)")
    
    # 6. Java Hook函数检查
    print(f"\n☕ Java Hook函数:")
    print("-" * 40)
    
    java_functions = []
    if os.path.exists('frida_common.js'):
        with open('frida_common.js', 'r') as f:
            content = f.read()
            java_funcs = re.findall(r'function (hook\w+|trace\w+)', content)
            java_functions = java_funcs
            
            for func in java_funcs:
                print(f"  📖 {func}")
    
    # 检查这些函数在新系统中的状态
    if os.path.exists('frida_common_new.js'):
        with open('frida_common_new.js', 'r') as f:
            new_content = f.read()
            
            print(f"\n☕ Java Hook函数在新系统中:")
            print("-" * 40)
            
            for func in java_functions:
                if f'function {func}' in new_content:
                    print(f"  ✅ {func} (已迁移)")
                else:
                    print(f"  ❌ {func} (未迁移)")
    
    # 7. 总结
    print(f"\n📊 总结:")
    print("-" * 40)
    print(f"旧Location Hook函数总数: {len(old_hook_functions)}")
    print(f"新命令总数: {len(new_commands)}")
    print(f"模板支持总数: {len(template_support)}")
    print(f"Java函数总数: {len(java_functions)}")
    
    if len(not_migrated) == 0:
        print("🎉 所有Location Hook函数已成功迁移！")
    else:
        print(f"⚠️ 还有 {len(not_migrated)} 个函数未迁移")
    
    missing_templates = len([cmd for cmd in new_commands if command_to_template.get(cmd, '') not in template_support])
    if missing_templates == 0:
        print("🎉 所有命令都有对应的模板支持！")
    else:
        print(f"⚠️ 还有 {missing_templates} 个命令缺少模板支持")

if __name__ == "__main__":
    check_all_functions()