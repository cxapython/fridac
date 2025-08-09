#!/usr/bin/env python3
"""
测试函数表格显示
"""

try:
    from rich.console import Console
    from rich.table import Table
    from rich.box import ROUNDED
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False

if RICH_AVAILABLE:
    console = Console()
    
    # 模拟 fridac 的函数定义
    functions = {
        'traceClass': ('🏛️  跟踪类的所有方法', "traceClass('com.example.MainActivity')"),
        'traceMethod': ('🎯 跟踪特定方法', "traceMethod('com.example.Class.method', true)"),
        'findClasses': ('🔍 查找匹配的类', "findClasses('MainActivity', true)"),
        'hookNativeFunction': ('🔧 Hook Native 函数', "hookNativeFunction('malloc', {argTypes: ['int']})"),
        'smartTrace': ('🎯 智能识别并Hook目标', "smartTrace('com.example.MainActivity')"),
        'help': ('❓ 显示帮助信息', "help()"),
    }
    
    # 创建表格
    func_table = Table(title="🚀 可用函数", box=ROUNDED, show_header=True, header_style="bold magenta")
    func_table.add_column("函数名", style="cyan", no_wrap=True, width=20)
    func_table.add_column("描述", style="green", width=25)
    func_table.add_column("使用示例", style="yellow", width=35)
    
    for func, (desc, example) in functions.items():
        if func not in ['q', 'quit', 'exit']:
            func_table.add_row(f"{func}()", desc, f"[dim]{example}[/dim]")
    
    console.print()
    console.print(func_table)
    console.print()
    print("✅ 表格显示测试完成")
else:
    print("❌ Rich 库不可用，无法测试表格显示")

