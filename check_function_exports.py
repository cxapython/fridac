#!/usr/bin/env python3
"""
检查函数导出状态，避免重复导出和别名冲突
"""

import os
import re

def check_exports():
    """检查所有函数的导出状态"""
    
    print("🔍 检查函数导出状态")
    print("=" * 60)
    
    # 1. 检查现有的全局导出
    print("\n📋 现有全局导出:")
    print("-" * 40)
    
    all_exports = {}
    js_files = [
        'frida_common.js',
        'frida_common_new.js', 
        'frida_location_hooks.js',
        'frida_location_hooks_new.js',
        'frida_native_common.js',
        'frida_job_commands.js'
    ]
    
    for filename in js_files:
        if os.path.exists(filename):
            with open(filename, 'r') as f:
                content = f.read()
                
                # 查找 global.xxx = 的导出
                exports = re.findall(r'global\.(\w+)\s*=', content)
                if exports:
                    all_exports[filename] = exports
                    print(f"\n📁 {filename}:")
                    for export in exports:
                        print(f"  ✅ global.{export}")
    
    # 2. 检查别名情况
    print("\n🔄 别名和快捷命令:")
    print("-" * 40)
    
    aliases = {
        'j': 'jobs',
        'k': 'kill', 
        'ka': 'killall',
        'jh': 'jobhelp',
        'findStrInMap': 'hookHashMapToFindValue (兼容性别名)'
    }
    
    for alias, original in aliases.items():
        print(f"  🔗 {alias} → {original}")
    
    # 3. 检查新系统vs旧系统冲突
    print("\n⚠️  可能的冲突:")
    print("-" * 40)
    
    old_functions = []
    new_functions = []
    
    if 'frida_location_hooks.js' in all_exports:
        old_functions = [f for f in all_exports['frida_location_hooks.js'] if f.startswith('hook')]
    
    if 'frida_location_hooks_new.js' in all_exports:
        new_functions = [f for f in all_exports['frida_location_hooks_new.js'] if f.startswith('hook')]
    
    conflicts = set(old_functions) & set(new_functions)
    if conflicts:
        print("  ❌ 发现冲突的函数导出:")
        for func in conflicts:
            print(f"    - {func} (新旧版本都导出了)")
    else:
        print("  ✅ 无冲突")
    
    # 4. 检查任务管理命令
    print("\n📋 任务管理命令导出:")
    print("-" * 40)
    
    task_commands = ['jobs', 'kill', 'killall', 'tasks']
    for cmd in task_commands:
        found_in = []
        for filename, exports in all_exports.items():
            if cmd in exports:
                found_in.append(filename)
        
        if found_in:
            print(f"  🎯 {cmd}: {', '.join(found_in)}")
        else:
            print(f"  ❌ {cmd}: 未找到导出")
    
    # 5. 建议
    print("\n💡 建议:")
    print("-" * 40)
    print("1. 旧的location hooks应该不再全局导出")
    print("2. 新的hook函数只通过任务管理系统使用")
    print("3. 保留必要的兼容性别名")
    print("4. 避免新旧系统函数名冲突")

if __name__ == "__main__":
    check_exports()