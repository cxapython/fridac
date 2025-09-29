#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
测试新的 AST 函数解析功能
"""

import os
import sys
import tempfile

# 添加项目路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fridac_core.custom_scripts import CustomScriptManager

def test_ast_parsing():
    """测试 AST 解析功能"""
    
    # 创建测试脚本内容
    test_script = '''
/**
 * 测试顶层函数1
 * @description 这是一个顶层函数
 * @example testTopLevel1(arg1, arg2)
 */
function testTopLevel1(arg1, arg2) {
    console.log('顶层函数1');
    
    // 嵌套函数
    function nestedFunction() {
        console.log('嵌套函数');
    }
    
    nestedFunction();
}

/**
 * 测试顶层函数2
 */
function testTopLevel2() {
    console.log('顶层函数2');
}

function __internalFunction() {
    console.log('内部函数，应该被过滤');
}

// 在其他函数内的函数
function outerFunction() {
    function innerFunction() {
        console.log('内层函数，应该被过滤');
    }
    innerFunction();
}
'''

    # 创建临时脚本文件
    with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False, encoding='utf-8') as f:
        f.write(test_script)
        temp_file = f.name

    try:
        # 测试解析
        manager = CustomScriptManager(base_dir=os.path.dirname(temp_file))
        functions = manager._parse_functions(test_script, temp_file)
        
        print('解析结果:')
        for name, func in functions.items():
            print(f'  - {name}: {func.description}')
            print(f'    参数: {func.parameters}')
            print(f'    示例: {func.example}')
            print()
            
        print(f'总共解析到 {len(functions)} 个顶层函数')
        
        # 验证预期结果
        expected_functions = ['testTopLevel1', 'testTopLevel2', 'outerFunction']
        actual_functions = list(functions.keys())
        
        print('预期函数:', expected_functions)
        print('实际函数:', actual_functions)
        
        # 检查是否正确过滤了内部函数和嵌套函数
        success = True
        
        if '__internalFunction' not in actual_functions:
            print('✅ 成功过滤内部函数 (__internalFunction)')
        else:
            print('❌ 未能过滤内部函数')
            success = False
            
        if 'nestedFunction' not in actual_functions:
            print('✅ 成功过滤嵌套函数 (nestedFunction)')
        else:
            print('❌ 未能过滤嵌套函数')
            success = False
            
        if 'innerFunction' not in actual_functions:
            print('✅ 成功过滤嵌套函数 (innerFunction)')
        else:
            print('❌ 未能过滤嵌套函数')
            success = False
            
        # 检查是否包含预期的顶层函数
        for expected_func in expected_functions:
            if expected_func in actual_functions:
                print(f'✅ 成功解析顶层函数 ({expected_func})')
            else:
                print(f'❌ 未能解析顶层函数 ({expected_func})')
                success = False
        
        if success:
            print('\n🎉 所有测试通过！新的 AST 解析功能工作正常。')
        else:
            print('\n❌ 部分测试失败，需要检查解析逻辑。')
            
        return success
        
    finally:
        os.unlink(temp_file)

if __name__ == '__main__':
    test_ast_parsing()
