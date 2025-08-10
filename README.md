# 🚀 fridacli - 专业级 Frida Hook 工具集（2024 新任务系统 | 已在 Python 3.8 验证）

一个集成了 **Java Hook**、**Native Hook** 和 **定位Hook** 的强大 Frida CLI 工具，提供交互式调试环境和智能应用管理功能。

## ✨ 核心特性

- 🎯 **智能应用连接** - 自动检测前台应用或选择目标应用
- 📱 **多种连接模式** - 支持附加(attach)和启动(spawn)模式  
- 💻 **交互式JavaScript Shell** - 内置智能补全和命令历史
- ☕ **完整Java Hook套件** - 类跟踪、方法Hook、对象分析
- 🔧 **强大Native Hook工具** - SO分析、加密算法Hook、网络监控
- 📍 **精准定位Hook** - Base64、Toast、HashMap等常用组件Hook
- 🔥 **高级追踪功能** - 基于r0tracer的反调试绕过、批量Hook、对象字段检查
- 📋 **任务管理系统（新）** - 每个 Hook 独立脚本任务，killall 真正清理、无残留
- 🤖 **自测与自动任务** - 提供 `selftest_all` 一键验证，命中日志以 [#任务ID] 标记
- 🚀 **自动环境检测** - 智能检测Python和Frida版本
- 🎨 **Rich界面** - 美观的表格显示和彩色日志输出

## 📋 系统要求

- **Python** 3.6.8+ 
- **Frida** 14.0.0+
- **Rich** 10.0.0+ (可选，用于美化界面)
- **iOS/Android** 设备连接

## 🚀 快速安装

### 方式一：全局安装 (推荐)

```bash
# 克隆项目
git clone <your-repo-url>
cd fridacli

# 安装依赖
pip install frida>=14.0.0 rich>=10.0.0

# 全局安装
sudo cp fridac /usr/local/bin/fridac
sudo chmod +x /usr/local/bin/fridac

# 复制Hook工具集
sudo cp frida_common.js /usr/local/bin/frida_common.js
sudo cp frida_native_common.js /usr/local/bin/frida_native_common.js
sudo cp frida_location_hooks.js /usr/local/bin/frida_location_hooks.js
```

### 方式二：本地使用

```bash
# 直接使用
chmod +x fridac
python3 fridac --help
```

## 💡 使用方法

### 基本命令（建议使用 Python 3.8 前台启动）

```bash
# 🎯 智能模式 - 自动连接前台应用
python3.8 /Users/chennan/fridac/fridac

# 📱 应用选择 - 显示应用列表供选择
python3.8 /Users/chennan/fridac/fridac -a

# 🚀 启动模式 - 启动指定应用并连接
python3.8 /Users/chennan/fridac/fridac -f com.example.app
python3.8 /Users/chennan/fridac/fridac --spawn com.example.app

# 🔗 附加模式 - 连接到已运行的应用
python3.8 /Users/chennan/fridac/fridac -p com.example.app

# ℹ️ 版本信息
python3.8 /Users/chennan/fridac/fridac --version
```

### 交互式使用（新任务命令 + 自测）

连接成功后，您将进入功能强大的交互式环境：

```javascript
// 📚 查看完整帮助
help()

// ⚡ 一键自测（定位Hook全套，自动触发并打印命中）
selftest_all

// 🎯 智能Hook - 自动识别Java/Native
smartTrace('com.example.MainActivity')  // Java类
smartTrace('malloc', {showArgs: true})  // Native函数
```

## 🔧 完整函数列表（命令行风格，括号可选）

### ☕ Java层Hook函数

| 函数名 | 描述 | 使用示例 |
|--------|------|----------|
| `traceClass()` | 🏢 跟踪类的所有方法 | `traceClass('com.example.MainActivity')` |
| `traceMethod()` | 🎯 跟踪特定方法 | `traceMethod('com.example.Class.method', true)` |
| `findClasses()` | 🔍 查找匹配的类 | `findClasses('MainActivity', true)` |
| `enumAllClasses()` | 📜 枚举所有已加载的类 | `enumAllClasses('com.example')` |
| `describeJavaClass()` | 📋 描述Java类的详细信息 | `describeJavaClass('java.lang.String')` |
| `printStack()` | 📚 打印Java调用栈 | `printStack()` |
| `findTargetClassLoader()` | 🔧 查找目标类加载器 | `findTargetClassLoader('com.example.Class')` |
| `findStrInMap()` | 🗺️ 监控HashMap查找key对应value | `findStrInMap('password', 1)` |

### 📍 定位Hook函数（新任务系统）

| 函数名 | 描述 | 使用示例 |
|--------|------|----------|
| `hookBase64()` | 🔤 Hook Base64编码解码 | `hookBase64(1)` |
| `hookToast()` | 🍞 Hook Toast显示 | `hookToast(1)` |
| `hookJSONObject()` | 📄 Hook JSONObject操作 | `hookJSONObject(1)` |
| `hookHashMap()` | 🗺️ Hook HashMap操作 | `hookHashMap('key', 1)` |
| `hookEditText()` | ✏️ Hook EditText输入 | `hookEditText(1)` |
| `hookArrayList()` | 📝 Hook ArrayList操作 | `hookArrayList(1)` |
| `hookLoadLibrary()` | 📚 Hook 动态库加载 | `hookLoadLibrary(1)` |
| `hookNewStringUTF()` | 🆕 Hook JNI字符串创建 | `hookNewStringUTF(1)` |
| `hookFileOperations()` | 📁 Hook 文件操作 | `hookFileOperations(1)` |
| `hookLog()` | 📜 Hook Log输出 | `hookLog(1)` |
| `hookURL()` | 🌐 Hook URL请求 | `hookURL(1)` |
| `hookFileOperations()` | 📁 Hook 文件操作 | `hookFileOperations(1)` |

### 🔧 Native层Hook函数

| 函数名 | 描述 | 使用示例 |
|--------|------|----------|
| `nativeHookNativeFunction()` | 🔧 Hook Native 函数 | `nativeHookNativeFunction('malloc', {argTypes: ['int']})` |
| `nativeFindModules()` | 📦 查找加载的模块 | `nativeFindModules(/libc/)` |
| `nativeFindExports()` | 📤 查找模块导出函数 | `nativeFindExports('libc.so', /malloc/)` |
| `nativeFindImports()` | 📥 查找模块导入函数 | `nativeFindImports('app', /strcpy/)` |
| `nativeSearchMemory()` | 🔍 搜索内存模式 | `nativeSearchMemory('48 89 e5')` |
| `printNativeStack()` | 📚 打印Native调用栈 | `printNativeStack()` |
| `nativeHookDlopenFamily()` | 📚 Hook动态库加载 | `nativeHookDlopenFamily(1)` |
| `nativeHookJNIFunctions()` | ☕ Hook JNI函数 | `nativeHookJNIFunctions(1)` |
| `nativeHookCryptoFunctions()` | 🔐 Hook加密算法 | `nativeHookCryptoFunctions('aes', 1)` |
| `nativeHookNetworkFunctions()` | 🌐 Hook网络函数 | `nativeHookNetworkFunctions(1)` |
| `nativeHookAntiDebug()` | 🛡️ Hook反调试检测 | `nativeHookAntiDebug(1)` |
| `nativeAnalyzeSO()` | 🔍 分析SO文件 | `nativeAnalyzeSO('libtest.so', 1, 1)` |
| `nativeEnableAllHooks()` | 🚀 启用所有Native Hook | `nativeEnableAllHooks(1)` |
| `nativeQuickHookCrypto()` | ⚡ 快速Hook加密 | `nativeQuickHookCrypto('md5')` |
| `nativeQuickHookNetwork()` | ⚡ 快速Hook网络 | `nativeQuickHookNetwork()` |
| `nativeQuickAnalyzeApp()` | ⚡ 快速分析应用 | `nativeQuickAnalyzeApp()` |

### 🎯 智能工具

| 函数名 | 描述 | 使用示例 |
|--------|------|----------|
| `smartTrace()` | 🎯 智能识别并Hook目标 | `smartTrace('com.example.MainActivity')` |
| `loadNativeSupport()` | 🔧 加载Native Hook工具 | `loadNativeSupport()` |

## 📁 项目结构

```
fridacli/
├── fridac                    # 主程序文件 (已增强自动任务追踪)
├── frida_common.js          # Java Hook 工具集 (已集成任务管理)
├── frida_native_common.js   # Native Hook 工具集  
├── frida_location_hooks.js  # 定位Hook 工具集 (已集成任务管理)
├── frida_advanced_tracer.js # 高级追踪工具集 (基于r0tracer)
├── frida_job_manager.js    # Hook任务管理器核心 (已增强自动追踪)
├── frida_job_commands.js   # 任务管理用户命令
├── requirements.txt         # Python依赖
├── INSTALL.md              # 安装说明
├── ADVANCED_FEATURES.md    # 高级功能详细说明
├── JOB_MANAGEMENT.md       # 任务管理系统说明
├── JOB_MANAGEMENT_SUMMARY.md # 任务管理实现总结
├── RPC_FIXES_SUMMARY.md    # RPC修复总结
├── REFACTORING_SUMMARY.md  # 重构总结
└── README.md               # 项目文档 (最新)
```

## ⚙️ 智能补全功能

fridac 提供强大的智能补全：

- **Tab键** - 自动补全函数名和参数
- **引号内Tab** - 补全常见包名模式
- **命令历史** - 上下箭头浏览历史命令
- **函数帮助** - `help()` 显示分类函数列表

### 常见包名模式
```javascript
com.android.*     // Android系统包
com.google.*      // Google应用包  
com.facebook.*    // Facebook应用包
java.lang.*       // Java核心包
android.app.*     // Android应用框架
```

## 🔍 实战案例

### 案例1: 快速调试前台应用（新任务系统）

```bash
# 自动连接前台应用
fridac

fridac> selftest_all
✅ 自动创建并触发 url/log/base64/jsonobject/hashmap/arraylist/fileoperations

# 智能跟踪 (自动创建任务)
fridac> smartTrace('Login')
🤖 自动注册任务 #3: 自动追踪: smartTrace('Login')

# 查看所有活跃任务
fridac> jobs()
📋 Hook 任务列表
[#1] [active] 自动追踪: enableAllHooks(1)             📍定位Hook    [25次命中] 1分钟前
[#2] [active] 自动追踪: nativeEnableAllHooks(1)       🔧Native Hook [8次命中]  30秒前
[#3] [active] 自动追踪: smartTrace('Login')           🎯智能Hook    [3次命中]  刚刚

# 如果某个Hook太吵可以暂停
fridac> pause(1)
✅ 已暂停任务 #1
```

### 案例2: 深度分析特定应用

```bash
# 启动微信并连接
fridac -f com.tencent.mm

# 分析应用结构 (自动创建任务)
fridac> nativeQuickAnalyzeApp()
🤖 自动注册任务 #1: 自动追踪: nativeQuickAnalyzeApp()

fridac> findClasses('Login', true)
🤖 自动注册任务 #2: 自动追踪: findClasses('Login', true)

# Hook关键功能 (自动创建任务)
fridac> hookBase64(1)
🤖 自动注册任务 #3: 自动追踪: hookBase64(1)
✅ Base64 Hook已启用 (任务ID: #3)

fridac> nativeHookCryptoFunctions('all', 1)
🤖 自动注册任务 #4: 自动追踪: nativeHookCryptoFunctions('all', 1)
✅ 已启用所有加密算法Hook (任务ID: #4)

# 实时查看Hook效果
fridac> jobs()
📋 Hook 任务列表
[#3] [active] 自动追踪: hookBase64(1)                 📍定位Hook    [15次命中] 2分钟前
[#4] [active] 自动追踪: nativeHookCryptoFunctions('all', 1)  🔧Native Hook [42次命中] 1分钟前

# 任务统计
fridac> jobstats()
📊 任务统计信息
总任务数: 4 | 活跃: 2 | 暂停: 0 | 完成: 2 | 失败: 0
总命中次数: 57 | 平均命中: 28.5/任务
```

### 案例3: Native层逆向分析

```bash
# 连接目标应用
fridac -p com.target.app

# 分析SO文件 (自动创建任务)
fridac> nativeAnalyzeSO('libencrypt.so', 1, 1)
🤖 自动注册任务 #1: 自动追踪: nativeAnalyzeSO('libencrypt.so', 1, 1)

# Hook加密相关 (自动创建任务)
fridac> nativeHookCryptoFunctions('aes', 1)
🤖 自动注册任务 #2: 自动追踪: nativeHookCryptoFunctions('aes', 1)
✅ AES加密算法Hook已启用 (任务ID: #2)

fridac> nativeHookNetworkFunctions(1)
🤖 自动注册任务 #3: 自动追踪: nativeHookNetworkFunctions(1)
✅ 网络函数Hook已启用 (任务ID: #3)

# 管理任务：如果网络Hook太频繁，可以暂停
fridac> pause(3)
✅ 已暂停任务 #3

# 稍后恢复
fridac> resume(3)
✅ 已恢复任务 #3

# 查看任务详情
fridac> job(2)
📋 任务详情 - #2
类型: 🔧Native Hook
目标: nativeHookCryptoFunctions('aes', 1)
状态: ✅ active
创建时间: 2分钟前
命中次数: 28次
最后活动: 5秒前
```

### 案例4: 任务管理最佳实践

```bash
# 同时启动多个Hook进行监控
fridac> hookLog()          # 任务 #1
fridac> hookBase64(1)      # 任务 #2  
fridac> hookToast(1)       # 任务 #3
fridac> traceClass('com.example.LoginActivity')  # 任务 #4

# 查看所有任务
fridac> jobs()
📋 Hook 任务列表
[#1] [active] 自动追踪: hookLog(0)                    📍定位Hook    [0次命中] 1分钟前
[#2] [active] 自动追踪: hookBase64(1)                 📍定位Hook    [5次命中] 1分钟前
[#3] [active] 自动追踪: hookToast(1)                  📍定位Hook    [2次命中] 1分钟前
[#4] [active] 自动追踪: hookAllMethodsInJavaClass('com.example.LoginActivity')  🏛️类Hook  [12次命中] 30秒前

# 暂停噪音较大的Hook
fridac> pause(1)    # 暂停Log Hook
fridac> pause(4)    # 暂停类Hook

# 只保留关键的Base64和Toast监控
fridac> jobs('active')  # 只查看活跃任务
[#2] [active] 自动追踪: hookBase64(1)                 📍定位Hook    [8次命中] 刚刚
[#3] [active] 自动追踪: hookToast(1)                  📍定位Hook    [3次命中] 10秒前

# 获取统计信息
fridac> jobstats()
📊 任务统计信息
总任务数: 4 | 活跃: 2 | 暂停: 2 | 完成: 0 | 失败: 0
总命中次数: 28 | 平均命中: 7/任务
系统运行时间: 5分钟 | 任务创建频率: 0.8/分钟

# 清理已完成的任务
fridac> cleanup()
🧹 已清理 0 个已完成任务
```

## 🛠️ 高级功能

### 🔥 高级追踪功能 (基于 r0tracer)

fridacli 集成了基于著名 r0tracer.js 的高级追踪功能：

#### 反调试绕过
```javascript
// 绕过 TracerPid 反调试检测
bypassTracerPidDetection()
```

#### 高级方法追踪
```javascript
// 增强版方法追踪，包含对象字段检查和彩色输出
advancedMethodTracing('com.example.MainActivity.onCreate', true, true)

// 参数说明:
// 参数1: 完整方法名
// 参数2: 是否启用对象字段检查 (true/false)
// 参数3: 是否启用彩色输出 (true/false)
```

#### 批量Hook功能
```javascript
// 根据黑白名单批量Hook类方法
batchHookWithFilters('com.example', 'test', null)

// 参数说明:
// 参数1: 白名单模式 (包含的关键字)
// 参数2: 黑名单模式 (排除的关键字)  
// 参数3: 目标类名，用于切换ClassLoader (可选)
```

#### 应用类全量Hook
```javascript
// Hook所有应用业务类 (排除系统类)
hookAllApplicationClasses(true)

// 参数: 是否启用严格过滤 (推荐为true)
// 注意: 大型应用可能导致性能问题
```

#### 对象字段深度检查
```javascript
// 在Hook中检查对象的所有字段值
var info = inspectObjectFields(this, "登录Activity");
console.log(info);
```

### 📋 任务管理系统 (参考 objection)

fridacli 实现了完整的 Hook 任务管理系统，**所有Hook函数都会自动注册为可管理任务**：

#### 🤖 自动任务追踪 (新特性)

**所有Hook函数执行时都会自动创建任务，无需手动管理：**

```javascript
// 🎯 普通Hook调用，自动创建任务
fridac> hookLog()
🤖 自动注册任务 #1: 自动追踪: hookLog(0)
✅ Log Hook已启用 (任务ID: #1)

fridac> hookBase64(1)  
🤖 自动注册任务 #2: 自动追踪: hookBase64(1)
✅ Base64 Hook已启用 (任务ID: #2)

fridac> traceClass('com.example.MainActivity')
🤖 自动注册任务 #3: 自动追踪: hookAllMethodsInJavaClass('com.example.MainActivity')
✅ 成功Hook了 15/20 个方法 (任务ID: #3)

// 📋 查看所有任务 - 现在可以看到刚才的Hook了！
fridac> tasks
📋 任务列表（示例）
ID  类型            状态     目标            创建时间
1   location_hook   running  url             12:00:01
2   location_hook   running  log             12:00:02
3   location_hook   running  base64          12:00:02

// ✅ 可以正常管理任务
fridac> kill(1)
✅ 已取消任务 #1

fridac> pause(2)
✅ 已暂停任务 #2
```

**特性说明：**
- 🆔 **按执行顺序分配ID** - 任务ID从1开始递增，便于记忆和管理
- 🏷️ **智能分类** - 自动识别Hook类型：Java Hook、Native Hook、定位Hook等
- 📊 **实时统计** - 自动跟踪命中次数、执行时间、最后活动时间
- 🔄 **向下兼容** - 原有函数用法完全不变，只是增加了任务管理能力

#### 查看和管理任务
```javascript
// 查看所有活跃任务
jobs()

// 查看特定状态的任务
jobs('active')    // 只显示活跃任务
jobs('paused')    // 只显示暂停任务
jobs('failed')    // 只显示失败任务

// 查看任务详情
job(1)

// 取消指定任务
kill(1)

// 取消所有任务
killall()

// 取消特定类型的任务
killall('location_hook')  // 只取消定位Hook任务

// 暂停/恢复任务
pause(1)
resume(1)
```

#### 任务统计和监控
```javascript
// 显示任务统计
jobstats()

// 查看任务历史
history(20)

// 清理已完成任务
cleanup()

// 导出任务配置
exportJobs()

// 任务管理帮助
jobhelp()
```

#### 手动任务管理 (高级用法)
```javascript
// 如果需要更精细的控制，仍可使用带Job后缀的函数
var jobId = traceMethodWithJob('com.example.Class.method', true)

// 随时取消
kill(jobId)

// 查看状态
job(jobId)
```

#### 快捷命令
```javascript
j()        // jobs() 的快捷方式
k(1)       // kill(1) 的快捷方式  
ka()       // killall() 的快捷方式
jh()       // jobhelp() 的快捷方式
```

### 🔐 加密算法Hook支持

```javascript
// 支持的算法类型
nativeHookCryptoFunctions('aes', 1)    // AES加密
nativeHookCryptoFunctions('des', 1)    // DES加密  
nativeHookCryptoFunctions('md5', 1)    // MD5哈希
nativeHookCryptoFunctions('sha', 1)    // SHA系列
nativeHookCryptoFunctions('all', 1)    // 全部算法
```

### 🌐 网络监控功能

```javascript
// 监控网络连接
nativeHookNetworkFunctions(1)

// 监控特定连接
connect: 192.168.1.100:8080 (socket: 15)
send: socket=15, len=256
recv: socket=15, received=512
```

### 🛡️ 反调试检测

```javascript
// Hook反调试机制
nativeHookAntiDebug(1)

// 检测内容
ptrace 被调用, request: 0
kill 被调用: PID=1234, 信号=9
可疑文件访问: /proc/self/status
```

## 🔧 环境兼容性

fridac 智能适配多种环境：

- **Python版本** - 自动选择Python 3.6.8+解释器
- **Frida版本** - 兼容Frida 14.0.0+各版本
- **pyenv支持** - 自动识别pyenv环境
- **路径智能** - 自动查找Hook工具文件
- **Rich支持** - 优雅降级，无Rich也可正常使用

## ❓ 故障排除

### 常见问题解决

#### 1. 找不到Hook工具文件
```bash
# 确保文件在正确位置
ls -la frida_*.js

# 或复制到系统路径
sudo cp frida_*.js /usr/local/bin/
```

#### 2. 连接设备失败
```bash
# 检查设备连接
adb devices

# 检查frida-server
frida-ps -U
```

#### 3. 权限问题
```bash
# 添加执行权限
chmod +x fridac

# 修改所有者
sudo chown $USER:$USER fridac
```

#### 4. Rich库缺失
```bash
# 安装Rich（可选）
pip install rich>=10.0.0

# 或使用基础模式（自动降级）
python3 fridac
```

## 📊 性能特点

- **🚀 启动速度** - 2-3秒完成初始化
- **💾 内存占用** - 基础模式 < 50MB
- **🔄 Hook效率** - 支持大批量Hook操作
- **📱 设备兼容** - 支持iOS和Android双平台
- **🎯 精准度** - 智能过滤和目标识别

## 🤝 贡献指南

欢迎提交Issue和Pull Request！

### 开发规范
- 函数命名：Java层无前缀，Native层使用`native`前缀
- 参数统一：`showStack` 参数使用 `1`/`0` 表示是否显示调用栈
- 注释规范：中文注释，详细说明函数用途和参数

### 提交说明
- **feat**: 新功能
- **fix**: 修复问题  
- **docs**: 文档更新
- **refactor**: 代码重构

## 📝 许可证

本项目基于 MIT 许可证开源。

## 🏆 致谢

感谢 [Frida](https://frida.re/) 项目提供的强大动态分析框架！

---

**🚀 fridacli - 让Frida Hook更简单、更强大、更专业！**

> 集成Java、Native、定位三大Hook体系，一站式解决移动应用逆向分析需求！