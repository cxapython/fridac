# fridac 安装和使用说明

## 系统要求

- **Python**: 3.6.8 或更高版本
- **系统**: macOS, Linux, Windows
- **设备**: 支持 Frida 的 Android/iOS 设备

## 安装步骤

### 1. 安装依赖

```bash
# 安装基础依赖
pip install frida rich

# 或使用 requirements.txt
pip install -r requirements.txt
```

### 2. 设置可执行权限

```bash
chmod +x fridac
```

### 3. 可选：添加到 PATH

```bash
# 将 fridac 目录添加到 PATH，或者
ln -s /path/to/fridacli/fridac /usr/local/bin/fridac
```

## 使用方法

### 基础使用

```bash
# 自动连接前台应用
./fridac

# 显示应用列表选择
./fridac -a

# 连接指定包名应用
./fridac -p com.example.app

# 启动并连接应用
./fridac -f com.example.app
```

### 交互式命令

在 fridac 交互模式中，您可以使用以下命令：

```javascript
// 跟踪类的所有方法
traceClass('com.example.MainActivity')

// 跟踪特定方法
traceMethod('com.example.Class.method')

// 查找匹配的类
findClasses('MainActivity', true)

// 枚举所有类
enumAllClasses('com.example')

// 显示帮助
help()

// 退出
q
```

## 功能特性

### 🎨 美化界面 (需要 rich 库)
- 彩色日志输出
- 表格化应用列表
- 美观的交互界面
- 智能进度提示

### 🔧 智能补全
- Tab 键自动补全函数名
- 常见包名模式补全
- 交互式帮助系统

### 📱 设备支持
- 自动检测 USB 设备
- 智能前台应用识别
- 灵活的连接模式

### 🐍 Python 环境
- 自动检测 Python 版本
- pyenv 支持
- Frida 版本兼容性检查

## 环境配置建议

### Python 3.6.8 + Frida 14.x
```bash
pyenv install 3.6.8
pyenv local 3.6.8
pip install frida==14.2.18 rich
```

### Python 3.8.2 + Frida 16.x
```bash
pyenv install 3.8.2
pyenv local 3.8.2  
pip install frida==16.1.4 rich
```

## 常见问题

### Q: Rich 库安装失败
A: Rich 需要 Python 3.6.1+，确保 Python 版本符合要求

### Q: 找不到设备
A: 确保设备已连接且 frida-server 正在运行

### Q: 权限问题
A: 确保 fridac 文件有执行权限：`chmod +x fridac`

## 依赖说明

- **frida**: Frida 核心库，用于动态分析
- **rich**: 终端美化库，可选但强烈推荐
- **readline**: 命令行编辑支持 (Python 内置)
- **argparse**: 命令行参数解析 (Python 内置)

享受使用 fridac！🎉

