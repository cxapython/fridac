#!/usr/bin/env python3
"""
测试新的任务管理功能
验证脚本隔离和真正的Hook清理机制
"""

import sys
import os

# 添加fridac_core到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_task_manager_basic():
    """测试任务管理器基本功能"""
    print("🧪 测试任务管理器基本功能...")
    
    try:
        from fridac_core.task_manager import FridaTaskManager, TaskType, TaskStatus
        from fridac_core.script_templates import ScriptTemplateEngine
        
        # 创建模拟session
        class MockSession:
            def create_script(self, source):
                print(f"📄 创建脚本 (长度: {len(source)} 字符)")
                return MockScript(source)
        
        class MockScript:
            def __init__(self, source):
                self.source = source
                self.loaded = False
                self.unloaded = False
            
            def on(self, event, handler):
                pass
            
            def load(self):
                self.loaded = True
                print("📥 脚本已加载")
            
            def unload(self):
                self.unloaded = True
                print("📤 脚本已卸载")
        
        # 测试任务管理器
        session = MockSession()
        manager = FridaTaskManager(session)
        
        print("✅ 任务管理器创建成功")
        
        # 测试脚本模板引擎
        script_dir = os.path.dirname(os.path.abspath(__file__))
        engine = ScriptTemplateEngine(script_dir)
        
        print("✅ 脚本模板引擎创建成功")
        
        # 测试生成方法Hook脚本
        script_source = engine.generate_method_hook_script(
            "com.example.MainActivity", 
            "onCreate", 
            {"show_stack": True}, 
            1
        )
        
        print(f"✅ 方法Hook脚本生成成功 (长度: {len(script_source)} 字符)")
        
        # 测试创建任务
        task_id = manager.create_task(
            TaskType.METHOD_HOOK,
            "com.example.MainActivity.onCreate",
            script_source,
            "测试任务",
            {"show_stack": True}
        )
        
        print(f"✅ 任务创建成功: #{task_id}")
        
        # 测试任务列表
        tasks = manager.list_tasks()
        print(f"✅ 任务列表: {len(tasks)} 个任务")
        
        # 测试任务详情
        task = manager.get_task(task_id)
        if task:
            print(f"✅ 任务详情: {task.description}")
        
        # 测试终止任务
        success = manager.kill_task(task_id)
        if success:
            print("✅ 任务终止成功")
        
        # 测试统计信息
        stats = manager.get_stats()
        print(f"✅ 统计信息: 总任务数 {stats['total_tasks']}")
        
        print("\n🎉 基本功能测试通过！")
        return True
        
    except Exception as e:
        print(f"❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_script_templates():
    """测试脚本模板生成"""
    print("\n🧪 测试脚本模板生成...")
    
    try:
        from fridac_core.script_templates import ScriptTemplateEngine
        
        script_dir = os.path.dirname(os.path.abspath(__file__))
        engine = ScriptTemplateEngine(script_dir)
        
        # 测试方法Hook脚本
        method_script = engine.generate_method_hook_script(
            "com.example.TestClass", "testMethod", {"show_stack": True}, 1
        )
        assert "com.example.TestClass" in method_script
        assert "testMethod" in method_script
        assert "TASK_ID = 1" in method_script
        print("✅ 方法Hook脚本生成正确")
        
        # 测试类Hook脚本
        class_script = engine.generate_class_hook_script(
            "com.example.TestClass", {"show_stack": False}, 2
        )
        assert "com.example.TestClass" in class_script
        assert "TASK_ID = 2" in class_script
        print("✅ 类Hook脚本生成正确")
        
        # 测试定位Hook脚本
        location_script = engine.generate_location_hook_script(
            "base64", {"show_stack": True}, 3
        )
        assert "Base64" in location_script
        assert "TASK_ID = 3" in location_script
        print("✅ 定位Hook脚本生成正确")
        
        # 测试Native Hook脚本
        native_script = engine.generate_native_hook_script(
            "open", {"show_stack": True}, 4
        )
        assert "open" in native_script
        assert "TASK_ID = 4" in native_script
        print("✅ Native Hook脚本生成正确")
        
        print("\n🎉 脚本模板测试通过！")
        return True
        
    except Exception as e:
        print(f"❌ 脚本模板测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """主测试函数"""
    print("🚀 开始测试fridacli新任务管理系统")
    print("="*60)
    
    success = True
    
    # 基本功能测试
    if not test_task_manager_basic():
        success = False
    
    # 脚本模板测试
    if not test_script_templates():
        success = False
    
    print("\n" + "="*60)
    if success:
        print("🎉 所有测试通过！新任务管理系统基本功能正常")
        print("\n💡 下一步：")
        print("1. 运行 fridac 连接到目标应用")
        print("2. 使用新命令测试：hookmethod, tasks, kill, killall")
        print("3. 验证Hook的真正清理效果")
    else:
        print("❌ 部分测试失败，请检查代码问题")
    
    return success

if __name__ == "__main__":
    main()