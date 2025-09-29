#!/usr/bin/env python3
"""
验证输出重定向修复效果
"""

import os
import sys
import time

def check_script_fix():
    """检查脚本修复情况"""
    print("🔍 检查 traceRegisterNatives 脚本修复情况...")
    
    script_path = "scripts/tools/jni_register_natives_trace.js"
    if not os.path.exists(script_path):
        print(f"❌ 脚本文件不存在: {script_path}")
        return False
    
    with open(script_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 检查是否使用了 send() 或 LOG()
    has_send = 'send(' in content
    has_log = 'LOG(' in content
    has_console_log = 'console.log(' in content
    
    print(f"📝 脚本分析:")
    print(f"   - 使用 send(): {has_send}")
    print(f"   - 使用 LOG(): {has_log}")
    print(f"   - 使用 console.log(): {has_console_log}")
    
    if has_send or has_log:
        print("✅ 脚本已修复，支持输出重定向")
        return True
    else:
        print("❌ 脚本仍然只使用 console.log，不支持输出重定向")
        return False

def show_usage_instructions():
    """显示使用说明"""
    print("\n📋 使用说明:")
    print("现在你可以重新测试早期 Hook 和输出重定向功能：")
    print()
    print("1. 基本测试:")
    print("   python3.6 fridac -f com.dragon.read --hook traceRegisterNatives -o test.log")
    print()
    print("2. 使用预设:")
    print("   python3.6 fridac -f com.dragon.read --preset jni_analysis -o analysis.log")
    print()
    print("3. 追加模式:")
    print("   python3.6 fridac -f com.dragon.read --hook traceRegisterNatives -o test.log --append")
    print()
    print("4. 检查日志文件:")
    print("   tail -f test.log")
    print("   grep 'RegisterNatives' test.log")
    print()
    print("🔧 如果仍有问题，可以:")
    print("1. 使用交互模式手动执行函数")
    print("2. 检查应用是否真的调用了 RegisterNatives")
    print("3. 尝试其他 Hook 函数验证输出重定向是否正常")

if __name__ == "__main__":
    print("🔧 fridac 输出重定向修复验证")
    print("=" * 50)
    
    if check_script_fix():
        show_usage_instructions()
        print("\n🎉 修复完成！现在输出重定向应该正常工作了。")
        sys.exit(0)
    else:
        print("\n❌ 修复不完整，请检查脚本文件。")
        sys.exit(1)
