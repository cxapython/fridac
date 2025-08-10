#!/usr/bin/env python3
"""
离线测试新的任务管理命令解析
不需要连接设备，只测试命令接口
"""

import sys
import os

# 添加fridac_core到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fridac_core.session import _handle_task_commands, _show_task_help

class MockSession:
    """模拟session对象用于测试"""
    
    def __init__(self):
        self.task_manager = MockTaskManager()
        self.script_engine = MockScriptEngine()
    
    def list_tasks(self, status_filter=None):
        print(f"📋 [模拟] 显示任务列表，过滤器: {status_filter}")
        print("ID   类型         状态    目标")
        print("1    method_hook  running com.example.MainActivity.onCreate")
        print("2    class_hook   running com.example.TestClass")
    
    def kill_task(self, task_id):
        print(f"🗑️ [模拟] 终止任务 #{task_id}")
        return True
    
    def kill_all_tasks(self, task_type=None):
        filter_info = f" (类型: {task_type})" if task_type else ""
        print(f"🧹 [模拟] 终止所有任务{filter_info}")
        return 2
    
    def show_task_details(self, task_id):
        print(f"🔍 [模拟] 任务 #{task_id} 详细信息")
        print("类型: method_hook")
        print("目标: com.example.MainActivity.onCreate")
        print("状态: running")
    
    def show_task_stats(self):
        print("📊 [模拟] 任务统计信息")
        print("总任务数: 2")
        print("总命中数: 15")
    
    def create_hook_task(self, task_type, target, options):
        print(f"✨ [模拟] 创建{task_type}任务: {target}")
        print(f"   选项: {options}")
        return 3  # 模拟返回任务ID

class MockTaskManager:
    pass

class MockScriptEngine:
    pass

def test_commands():
    """测试各种命令解析"""
    session = MockSession()
    
    test_cases = [
        # 基本任务管理命令
        "tasks",
        "jobs",
        "jobs running",
        "kill 1",
        "killall",
        "killall method_hook",
        "taskinfo 1", 
        "taskstats",
        
        # Hook创建命令
        "hookmethod com.example.MainActivity.onCreate true",
        "hookmethod com.example.TestClass.method",
        "hookclass com.example.TestClass true",
        "hookclass com.example.MainActivity",
        "hooknative open true",
        "hooknative malloc",
        "hookbase64 true",
        "hookbase64",
        "hooktoast true",
        "hooktoast",
        
        # 帮助命令
        "taskhelp",
        "jobhelp",
        
        # 非任务管理命令 (应该返回False)
        "traceClass('com.example.Test')",
        "help()",
        "invalid_command"
    ]
    
    print("🧪 测试新的任务管理命令解析\n")
    print("="*60)
    
    for i, command in enumerate(test_cases, 1):
        print(f"\n[{i:2d}] 测试命令: {command}")
        print("-" * 40)
        
        # 测试命令处理
        handled = _handle_task_commands(session, command)
        
        if handled:
            print("✅ 命令被任务管理系统处理")
        else:
            print("➡️ 命令将传递给JavaScript引擎")
        
        print()
    
    print("="*60)
    print("🎉 命令解析测试完成！")
    
    # 显示帮助信息测试
    print("\n📖 帮助信息显示测试:")
    print("="*60)
    _show_task_help()

if __name__ == "__main__":
    test_commands()