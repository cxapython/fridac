#!/usr/bin/env python3
"""
测试输出重定向功能
"""

import os
import sys
import time

# 将 fridac_core 包加入 Python 路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_output_redirect():
    """测试输出重定向功能"""
    print("🧪 测试输出重定向功能...")
    
    try:
        from fridac_core.session import FridacSession
        
        # 创建会话
        session = FridacSession()
        
        # 测试输出重定向设置
        test_file = "test_redirect.log"
        session.setup_output_redirect(test_file, append_mode=False)
        
        if session.output_handle:
            print("✅ 输出重定向设置成功")
            
            # 测试写入
            session._write_to_output_file("测试消息 1")
            session._write_to_output_file("测试消息 2")
            
            # 关闭文件
            session.output_handle.close()
            session.output_handle = None
            
            # 检查文件内容
            if os.path.exists(test_file):
                with open(test_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                    if "测试消息 1" in content and "测试消息 2" in content:
                        print("✅ 输出写入测试通过")
                        print(f"文件内容预览:\n{content[:200]}...")
                        
                        # 清理测试文件
                        os.remove(test_file)
                        return True
                    else:
                        print("❌ 文件内容不正确")
                        return False
            else:
                print("❌ 测试文件未创建")
                return False
        else:
            print("❌ 输出重定向设置失败")
            return False
            
    except Exception as e:
        print(f"❌ 测试失败: {e}")
        return False

if __name__ == "__main__":
    if test_output_redirect():
        print("\n🎉 输出重定向功能正常！")
        print("\n💡 问题可能在于:")
        print("1. traceRegisterNatives 使用 console.log 而非 send()")
        print("2. 已修复：改为使用 LOG() 或 send() 函数")
        print("\n🔧 请重新测试:")
        print("python3.6 fridac -f com.dragon.read --hook traceRegisterNatives -o test_fixed.log")
    else:
        print("\n❌ 输出重定向功能有问题")
