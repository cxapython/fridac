#!/usr/bin/env python3
"""
fridac 自定义脚本功能测试
验证自定义脚本的加载、解析和执行功能
"""

import os
import sys
import tempfile
import shutil

# 添加 fridac_core 到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fridac_core.custom_scripts import CustomScriptManager
from fridac_core.logger import log_info, log_success, log_error, log_warning

def test_custom_script_manager():
    """测试自定义脚本管理器的基本功能"""
    print("🧪 测试自定义脚本管理器...")
    
    # 创建临时测试目录
    test_dir = tempfile.mkdtemp(prefix='fridac_test_')
    
    try:
        # 初始化管理器
        manager = CustomScriptManager(test_dir)
        
        # 测试1: 检查scripts目录是否创建
        scripts_dir = os.path.join(test_dir, 'scripts')
        assert os.path.exists(scripts_dir), "Scripts目录应该被自动创建"
        log_success("✅ Scripts目录自动创建成功")
        
        # 测试2: 检查示例脚本是否创建
        example_script = os.path.join(scripts_dir, 'crypto_detector.js')
        assert os.path.exists(example_script), "示例脚本应该被自动创建"
        log_success("✅ 示例脚本自动创建成功")
        
        # 测试3: 扫描脚本
        count = manager.scan_scripts()
        assert count > 0, "应该扫描到至少一个脚本"
        log_success(f"✅ 扫描到 {count} 个脚本")
        
        # 测试4: 检查函数解析
        functions = manager.get_all_functions()
        assert len(functions) > 0, "应该解析到至少一个函数"
        log_success(f"✅ 解析到 {len(functions)} 个函数")
        
        # 测试5: 检查特定函数
        expected_functions = ['hookAllCrypto', 'findSensitiveStrings', 'monitorSensitiveNetwork']
        for func_name in expected_functions:
            assert func_name in functions, f"应该包含函数 {func_name}"
            func_info = functions[func_name]
            assert func_info.description, f"函数 {func_name} 应该有描述"
            assert func_info.example, f"函数 {func_name} 应该有示例"
            log_success(f"✅ 函数 {func_name} 验证通过")
        
        # 测试6: 生成导入代码
        imports = manager.generate_script_imports()
        assert 'hookAllCrypto' in imports, "导入代码应该包含函数定义"
        assert 'function hookAllCrypto' in imports, "导入代码应该包含完整函数定义"
        log_success("✅ 脚本导入代码生成成功")
        
        # 测试7: 生成RPC导出
        exports = manager.generate_rpc_exports()
        assert 'hookAllCrypto:' in exports, "RPC导出应该包含函数"
        log_success("✅ RPC导出代码生成成功")
        
        # 测试8: 生成帮助信息
        help_info = manager.generate_help_info()
        assert len(help_info) == len(functions), "帮助信息数量应该与函数数量一致"
        for func_name, desc, example in help_info:
            assert func_name in functions, f"帮助信息应该包含函数 {func_name}"
            assert desc, f"函数 {func_name} 应该有描述"
            assert example, f"函数 {func_name} 应该有示例"
        log_success("✅ 帮助信息生成成功")
        
        # 测试9: 创建新的自定义脚本
        test_script_content = '''/**
 * 测试脚本
 * @description 用于测试的简单脚本
 */

/**
 * 测试函数
 * @description 这是一个测试函数
 * @example testFunction('hello')
 * @param {string} message - 消息内容
 */
function testFunction(message) {
    LOG("测试函数被调用: " + message, { c: Color.Green });
    return true;
}
'''
        
        test_script_path = os.path.join(scripts_dir, 'test_script.js')
        with open(test_script_path, 'w', encoding='utf-8') as f:
            f.write(test_script_content)
        
        # 重新扫描
        new_count = manager.scan_scripts()
        assert new_count > count, "新脚本应该被扫描到"
        
        new_functions = manager.get_all_functions()
        assert 'testFunction' in new_functions, "新函数应该被解析到"
        log_success("✅ 新脚本动态加载成功")
        
        # 测试10: 重载功能
        reload_count = manager.reload_scripts()
        assert reload_count == new_count, "重载数量应该与当前脚本数量一致"
        log_success("✅ 脚本重载功能正常")
        
        # 测试11: 统计信息
        stats = manager.get_stats()
        assert stats['scripts_count'] == new_count, "统计中的脚本数量应该正确"
        assert stats['functions_count'] == len(new_functions), "统计中的函数数量应该正确"
        log_success("✅ 统计信息正确")
        
        log_success("🎉 所有测试通过！自定义脚本功能工作正常")
        return True
        
    except Exception as e:
        log_error(f"❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        # 清理测试目录
        try:
            shutil.rmtree(test_dir)
        except:
            pass

def test_script_parsing():
    """测试脚本解析功能"""
    print("\n🧪 测试脚本解析功能...")
    
    test_dir = tempfile.mkdtemp(prefix='fridac_parse_test_')
    
    try:
        manager = CustomScriptManager(test_dir)
        
        # 创建复杂的测试脚本
        complex_script = '''/**
 * 复杂测试脚本
 * @author test
 */

/**
 * 函数1
 * @description 第一个函数
 * @example func1(arg1, arg2)
 * @param {string} arg1 - 参数1
 * @param {number} arg2 - 参数2
 */
function func1(arg1, arg2) {
    return arg1 + arg2;
}

/**
 * 函数2
 * @description 第二个函数，无参数
 * @example func2()
 */
function func2() {
    LOG("Function 2 called");
}

// 这不是函数定义，应该被忽略
var notAFunction = function() {
    return "anonymous";
};

/**
 * 函数3
 * @description 带复杂参数的函数
 * @example func3(obj, callback, options)
 */
function func3(obj, callback, options) {
    if (callback) {
        callback(obj);
    }
    return options || {};
}
'''
        
        scripts_dir = os.path.join(test_dir, 'scripts')
        os.makedirs(scripts_dir, exist_ok=True)
        
        script_path = os.path.join(scripts_dir, 'complex_test.js')
        with open(script_path, 'w', encoding='utf-8') as f:
            f.write(complex_script)
        
        # 扫描脚本
        count = manager.scan_scripts()
        functions = manager.get_all_functions()
        
        # 验证解析结果
        expected_functions = ['func1', 'func2', 'func3']
        for func_name in expected_functions:
            assert func_name in functions, f"应该解析到函数 {func_name}"
            func_info = functions[func_name]
            assert func_info.description, f"函数 {func_name} 应该有描述"
            assert func_info.example, f"函数 {func_name} 应该有示例"
            log_success(f"✅ 函数 {func_name} 解析正确")
        
        # 检查参数解析
        func1_info = functions['func1']
        assert len(func1_info.parameters) == 2, "func1应该有2个参数"
        assert 'arg1' in func1_info.parameters, "func1应该有参数arg1"
        assert 'arg2' in func1_info.parameters, "func1应该有参数arg2"
        
        func2_info = functions['func2']
        assert len(func2_info.parameters) == 0, "func2应该没有参数"
        
        func3_info = functions['func3']
        assert len(func3_info.parameters) == 3, "func3应该有3个参数"
        
        log_success("🎉 脚本解析测试通过！")
        return True
        
    except Exception as e:
        log_error(f"❌ 解析测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        try:
            shutil.rmtree(test_dir)
        except:
            pass

def main():
    """主测试函数"""
    print("🚀 开始fridac自定义脚本功能测试")
    
    all_passed = True
    
    # 运行所有测试
    tests = [
        test_custom_script_manager,
        test_script_parsing
    ]
    
    for test_func in tests:
        try:
            if not test_func():
                all_passed = False
        except Exception as e:
            log_error(f"❌ 测试 {test_func.__name__} 出现异常: {e}")
            all_passed = False
    
    print("\n" + "="*60)
    if all_passed:
        log_success("🎉 所有测试通过！自定义脚本功能已就绪")
        print("\n📋 使用说明:")
        print("1. 在 scripts/ 目录下创建 .js 文件")
        print("2. 使用 JSDoc 格式注释定义函数")
        print("3. 在 fridac 中直接调用函数名")
        print("4. 使用 reload_scripts 重新加载脚本")
        print("5. 使用 help() 查看所有可用函数")
        return 0
    else:
        log_error("❌ 部分测试失败，请检查实现")
        return 1

if __name__ == '__main__':
    sys.exit(main())
