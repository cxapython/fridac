#!/usr/bin/env python3
"""
fridac - 专业级 Frida Hook 工具集
安装: pip install -e .
"""
from setuptools import setup, find_packages
import os

# 读取 README
def read_readme():
    with open("README.md", "r", encoding="utf-8") as f:
        return f.read()

# 收集所有 JS 文件和脚本
def get_data_files():
    data_files = []
    
    # 根目录的 JS 和 JSON 文件
    root_files = []
    for f in os.listdir('.'):
        if f.endswith('.js') or f.endswith('.json'):
            root_files.append(f)
    if root_files:
        data_files.append(('fridac_data', root_files))
    
    # frida_native 目录
    native_files = []
    if os.path.exists('frida_native'):
        for f in os.listdir('frida_native'):
            if f.endswith('.js'):
                native_files.append(os.path.join('frida_native', f))
    if native_files:
        data_files.append(('fridac_data/frida_native', native_files))
    
    # scripts 目录 (递归)
    for root, dirs, files in os.walk('scripts'):
        js_files = [os.path.join(root, f) for f in files if f.endswith('.js')]
        if js_files:
            # 计算相对路径
            rel_path = os.path.relpath(root, '.')
            data_files.append((f'fridac_data/{rel_path}', js_files))
    
    return data_files

setup(
    name="fridac",
    version="1.0.0",
    description="专业级 Frida Hook 工具集 - 集成 Java/Native/定位 Hook",
    long_description=read_readme(),
    long_description_content_type="text/markdown",
    author="fridac team",
    url="https://github.com/cxapython/fridac",
    license="MIT",
    packages=find_packages(),
    include_package_data=True,
    package_data={
        '': ['*.js', '*.json'],
        'fridac_core': ['*.js', '*.json'],
    },
    data_files=get_data_files(),
    python_requires=">=3.6.8",
    install_requires=[
        "frida>=14.0.0",
    ],
    extras_require={
        "rich": ["rich>=10.0.0"],
        "full": ["rich>=10.0.0", "esprima>=4.0.0"],
    },
    entry_points={
        "console_scripts": [
            "fridac=fridac_core.cli:main",
        ],
    },
    classifiers=[
        "Development Status :: 4 - Beta",
        "Environment :: Console",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.6",
        "Programming Language :: Python :: 3.8",
        "Topic :: Security",
        "Topic :: Software Development :: Debuggers",
    ],
)

