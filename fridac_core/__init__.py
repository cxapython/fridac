# fridac_core package
"""
fridac 核心模块

提供 Frida Hook 工具的核心功能：
- 会话管理
- 脚本管理
- 任务系统
- 自定义脚本支持
"""

__version__ = "1.0.0"
__author__ = "fridac team"

# 导出主要模块
from .cli import main
