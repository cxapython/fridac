#!/usr/bin/env python3
"""
测试早期 Hook 功能
"""

import os
import sys
import subprocess
import time

def test_early_hook():
    """测试早期 Hook 功能"""
    print("🧪 测试早期 Hook 功能...")
    
    # 检查自定义脚本是否存在
    script_path = "scripts/tools/jni_register_natives_trace.js"
    if not os.path.exists(script_path):
        print(f"❌ 自定义脚本不存在: {script_path}")
        return False
    
    # 检查脚本内容
    with open(script_path, 'r', encoding='utf-8') as f:
        content = f.read()
        if 'traceRegisterNatives' not in content:
            print(f"❌ 脚本中未找到 traceRegisterNatives 函数")
            return False
        if '@description' not in content:
            print(f"❌ 脚本缺少 JSDoc 注释")
            return False
    
    print("✅ 自定义脚本检查通过")
    
    # 测试脚本管理器
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    
    try:
        from fridac_core.custom_scripts import CustomScriptManager
        
        manager = CustomScriptManager(os.path.dirname(os.path.abspath(__file__)))
        count = manager.scan_scripts()
        
        print(f"✅ 扫描到 {count} 个自定义脚本")
        
        if 'traceRegisterNatives' in manager.get_all_functions():
            print("✅ traceRegisterNatives 函数已正确加载")
        else:
            print("❌ traceRegisterNatives 函数未加载")
            return False
        
        # 测试 RPC 导出生成
        exports = manager.generate_rpc_exports()
        if 'traceRegisterNatives' in exports:
            print("✅ RPC 导出生成正确")
        else:
            print("❌ RPC 导出缺少 traceRegisterNatives")
            return False
            
    except Exception as e:
        print(f"❌ 脚本管理器测试失败: {e}")
        return False
    
    print("🎉 所有测试通过！")
    return True

if __name__ == "__main__":
    if test_early_hook():
        print("\n💡 现在可以尝试运行:")
        print("python3.6 fridac -f com.dragon.read --hook traceRegisterNatives -o test.log")
        sys.exit(0)
    else:
        print("\n❌ 测试失败，请检查配置")
        sys.exit(1)
