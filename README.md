# 🚀 fridac - 专业级 Frida Hook 工具集

>注:该项目由AI辅助生成有问题，有些功能可能还不太好用，因为代码体积量太大所以暂时没有详细排查只针对常用的hook操作做了测试，比如trace目前不能用。其他有问题提issuce就行。微信:italocxa，备注:fridac

集成 **Java Hook**、**Native Hook** 和 **定位 Hook** 的 Frida CLI 工具，提供交互式调试环境。

截图一览


<img width="553" height="207" alt="截屏2026-01-09 10 58 14" src="https://github.com/user-attachments/assets/a757677d-6c37-493b-9283-29dc62e30abc" />

<img width="934" height="215" alt="截屏2026-01-09 10 54 25" src="https://github.com/user-attachments/assets/23d13178-c9f2-45a5-99f4-ca5b04587c3d" />

<img width="1172" height="622" alt="截屏2026-01-09 10 55 54" src="https://github.com/user-attachments/assets/d89096da-bf5b-456b-9f47-3f954a631e16" />


## ✨ 核心特性

- 🎯 **智能应用连接** - 自动检测前台应用或选择目标
- 📋 **任务管理系统** - 每个 Hook 独立脚本，`killall` 真正清理
- 💻 **交互式 Shell** - 智能补全、命令历史
- 🧩 **自定义脚本** - `scripts/` 目录下脚本自动加载
- 🔥 **高级追踪** - 批量 Hook、字段检查

## 📋 系统要求

- Python 3.6.8+ | Frida 14.0.0+ | Rich 10.0.0+ (可选)

## 🚀 安装

### 方式一：pip 安装（推荐）

```bash
# 克隆项目
git clone https://github.com/cxapython/fridac.git
cd fridac

# 安装（开发模式，支持实时修改）
pip install -e .

# 或直接安装
pip install .

# 安装完整依赖（包含 Rich UI）
pip install -e ".[full]"
```

安装后，可以在任意目录直接使用 `fridac` 命令：

```bash
fridac                      # 自动连接前台应用（自动管理 frida-server）
fridac -a                   # 选择应用
fridac -f com.example.app   # Spawn 模式
fridac -p com.example.app   # 附加模式

# frida-server 管理（通常无需手动操作）
fridac --server-only        # 仅启动 frida-server
fridac --stop-server        # 停止 frida-server
```

### frida-server 自动管理

fridac 会在连接失败时**自动检测并启动 frida-server**，完成以下流程：

1. **检测 ADB 连接** - 确认设备已连接
2. **检查 Root 权限** - 验证 su 可用
3. **检测 CPU 架构** - arm64/arm/x86_64/x86
4. **检查运行状态** - 通过端口 27042 检测
5. **查找已有版本** - 匹配 `/data/local/tmp/fs{版本号}` 
6. **自动下载安装** - 从 GitHub 下载对应版本
7. **启动并验证** - 后台启动并确认运行

**命名规则**：`fs` + 版本号（去掉小数点），如：
- Frida 16.0.11 → `fs16011`
- Frida 14.2.18 → `fs14218`

设备上可同时存在多个版本，fridac 会优先选择与客户端匹配的版本。

### 方式二：直接运行

```bash
# 克隆项目
git clone https://github.com/cxapython/fridac.git
cd fridac

# 安装依赖
pip install frida>=14.0.0 rich>=10.0.0

# 直接运行
python3 fridac
```

## 🎯 常用命令

### 任务管理

| 命令 | 说明 |
|------|------|
| `tasks` / `jobs` | 显示所有任务 |
| `kill <id>` | 终止任务 |
| `killall` | 终止所有任务 |
| `taskstats` | 任务统计 |

### Java Hook

| 命令 | 说明 |
|------|------|
| `traceclass <class>` | 追踪类的所有方法 |
| `tracemethod <method>` | 追踪特定方法 |
| `findClasses('pattern')` | 查找匹配的类 |
| `classdump('类名')` | 查看类的完整结构 |

### 对象搜索与深度查看（Wallbreaker 集成）

| 命令 | 说明 |
|------|------|
| `objectsearch <类名>` | 搜索类的实例对象，返回句柄 ID |
| `objectdump <句柄ID>` | 查看对象完整信息（字段值） |
| `classdump <类名>` | 查看类结构（方法、字段、构造器） |
| `classsearch <pattern>` | 搜索匹配的类名 |

> 💡 **智能降级机制**：优先使用 [Wallbreaker](https://github.com/nickcano/Wallbreaker) 插件（需安装到 `~/.objection/plugins/wallbreaker/`），若不可用自动降级到内置 JavaScript 版本。Wallbreaker 版本在堆搜索方面更强大。
>
> 安装 Wallbreaker：`git clone https://github.com/nickcano/Wallbreaker ~/.objection/plugins/wallbreaker`

**深度对象遍历示例**：
```bash
fridac> objectsearch com.example.User    # 搜索 User 类实例
[0x107aa]: com.example.User@b9a78dc
[0x1077a]: com.example.User@7c0ade5

fridac> objectdump 0x107aa               # 查看对象详情
📦 对象详情: 0x107aa
  String name = "张三"
  int age = 25
  [0x108bb]: com.example.Address@...     # 嵌套对象可继续查看

fridac> objectdump 0x108bb               # 深入查看嵌套对象
```

### 接口/继承查找

| 命令 | 说明 |
|------|------|
| `findImplementations('接口名', '包过滤')` | 查找接口的所有实现类 |
| `findDirectImplementations('接口名')` | 查找直接实现接口的类 |
| `findSubclasses('父类名', '包过滤')` | 查找所有子类 |
| `analyzeClassHierarchy('类名')` | 分析类的继承层次结构 |

> 💡 所有接口查找函数都支持多 ClassLoader，自动遍历其他 dex 查找类

### 定位 Hook

| 命令 | 说明 |
|------|------|
| `hookbase64` | Base64 编解码 |
| `hookurl` | URL 创建 |
| `hooktoast` | Toast 显示 |
| `hookhashmap [key]` | HashMap 操作 |
| `hooklog` | Log 输出 |

### Native Hook

| 命令 | 说明 |
|------|------|
| `hooknative <func>` | Hook Native 函数 |
| `nativeFindExports()` | 查找模块导出 |
| `nativeHookCryptoFunctions()` | Hook 加密函数 |

### 网络抓包

| 命令 | 说明 |
|------|------|
| `okhttpStart()` | 一键启动 OkHttp 抓包 |
| `okhttpHistory()` | 查看请求历史 |
| `okhttpResend(n)` | 重放请求 |
| `fetch('filter')` | 网络抓包 |

### Ghidra 桥接 (GhidraMCP)

直接在 fridac 中调用 Ghidra 静态分析功能，无需 AI/MCP。

**前提条件**：
1. Ghidra 已安装 [GhidraMCP](https://github.com/LaurieWired/GhidraMCP) 插件
2. 在 CodeBrowser 中打开二进制文件并启用插件
3. HTTP 服务器运行在 `http://127.0.0.1:8080/`

| 命令 | 说明 |
|------|------|
| `ghidra [url]` | 连接 Ghidra 服务器 |
| `ghelp` | 显示 Ghidra 命令帮助 |
| `gfuncs [limit]` | 列出函数 |
| `gimports` / `gexports` | 列出导入/导出 |
| `gstrings [keyword]` | 搜索字符串 |
| `gsearch <keyword>` | 搜索函数名 |
| `gdecompile <name/addr>` | 反编译函数（简写: `gd`） |
| `gdisasm <addr>` | 获取汇编代码 |
| `gxrefs <addr>` | 查看交叉引用 |
| `gcurrent` | 获取当前选中地址/函数 |
| `gbytes <addr> [size]` | 读取内存字节 |
| `grename <old> <new>` | 重命名函数 |

**使用示例**：

```bash
fridac> ghidra                           # 连接默认地址
fridac> ghidra http://192.168.1.100:8080/  # 连接远程 Ghidra

fridac> gfuncs 50                        # 列出前50个函数
fridac> gstrings password                # 搜索包含 "password" 的字符串
fridac> gd main                          # 反编译 main 函数
fridac> gd 0x21244                       # 按地址反编译
fridac> gxrefs 0x21244                   # 查看交叉引用
fridac> grename sub_21244 decryptData    # 重命名函数
```

**Python API**（高级用法）：

```python
from fridac_core.ghidra_bridge import GhidraBridge

g = GhidraBridge("http://127.0.0.1:8080/")
print(g.decompile("main"))           # 反编译
print(g.xrefs_to("0x401000"))        # 交叉引用
g.create_struct("MyStruct", [{"name": "field1", "type": "int"}])  # 创建结构体
```

### Arm64Trace (QBDI 汇编追踪)

基于 [Arm64Trace](https://github.com/cxapython/Arm64Trace) 项目的 SO 汇编级追踪功能，可追踪 Native 函数执行的每条汇编指令。

**核心功能**：
- 📊 **完整寄存器变化**：记录所有变化的寄存器
- 🔢 **指令序号**：每条指令带唯一序号，便于精确定位
- 📈 **调用深度**：`[D1]/[D2]/[D3]` 标记函数嵌套层级
- 🏷️ **操作类型**：`[A]`算术/`[L]`逻辑/`[M]`内存/`[B]`分支/`[C]`调用/`[R]`返回
- 🔍 **源寄存器追踪**：内存写入记录数据来源寄存器

**v2.1 新增功能**：
- 📱 **JNI 追踪**：自动检测 FindClass、GetMethodID、RegisterNatives、NewStringUTF 等
- 🔧 **Syscall 追踪**：自动检测 openat、read、write、mmap、connect 等系统调用
- 📊 **日志级别控制**：0=关闭, 1=简洁(一行), 2=详细(展开)

| 命令 | 说明 |
|------|------|
| `smalltrace <so> <offset> [output] [argc] [hexdump] [jni] [syscall] [level]` | 按偏移追踪 |
| `smalltrace_symbol <so> <symbol> [output] [argc] [hexdump]` | 按符号追踪 |
| `smalltrace_pull [output]` | 拉取追踪日志到本地 |
| `smalltrace_status` | 查看追踪状态和统计 |
| `smalltrace_analyze <file>` | 分析追踪日志 |

**参数说明**：

| 参数 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| `so` | string | 目标 SO 文件名 | 必填 |
| `offset`/`symbol` | hex/string | 函数偏移或符号名 | 必填 |
| `output` | string | `smalltrace_pull` 拉取时的本地保存路径 | ~/Desktop/qbdi_trace_*.log |
| `argc` | int | 函数参数数量，用于记录 X0-Xn 寄存器的参数值 | 5 |
| `hexdump` | bool | 是否显示内存 hexdump | false |
| `jni` | bool | 启用 JNI 追踪 | false |
| `syscall` | bool | 启用 Syscall 追踪 | false |
| `level` | int | JNI/Syscall 日志级别 (0/1/2) | 2 |

> 📝 **日志路径说明**：追踪日志实际生成在设备的 `/data/data/<package>/qbdi_trace_<package>.log`，`output` 参数指定 `smalltrace_pull` 拉取到本地时的保存路径。

**使用示例**：

```bash
# 基础追踪（自动生成输出文件名）
fridac> smalltrace libjnicalculator.so 0x21244

# 按符号名追踪
fridac> smalltrace_symbol libtarget.so encryptToMd5Hex

# 指定输出文件和参数数量
fridac> smalltrace libnative.so 0x12340 ~/trace.log 5

# 启用 hexdump (显示内存读写周围的数据)
fridac> smalltrace libnative.so 0x21244 ~/trace.log 5 true

# 跳过 output 参数用 null 占位，启用 JNI 追踪 (简洁模式)
fridac> smalltrace libnative.so 0x12340 null 5 false true false 1

# 启用 JNI + Syscall 追踪 (详细模式)
fridac> smalltrace libnative.so 0x12340 null 5 false true true 2

# 拉取追踪日志（使用自动生成的路径）
fridac> smalltrace_pull

# 拉取到指定路径
fridac> smalltrace_pull ~/Desktop/trace.log

# 分析追踪日志
fridac> smalltrace_analyze ~/Desktop/trace.log
```

> 💡 **提示**：
> - 不想指定 `output` 参数时，用 `null` 占位，系统会自动生成 `~/Desktop/qbdi_trace_<package>_<timestamp>.log`
> - `smalltrace` 中指定的 output 路径会被记住，后续 `smalltrace_pull` 无参数时自动使用该路径

**JNI/Syscall 追踪输出示例**：

```bash
# JNI 追踪 (简洁模式 level=1)
[JNI] 🏷️ FindClass "com/example/Crypto"
[JNI] 🏷️ GetMethodID "encrypt" "(Ljava/lang/String;)Ljava/lang/String;"
[JNI] 📝 NewStringUTF "Hello World"
[JNI] 📞 CallObjectMethod -> 0x12345678

# Syscall 追踪 (简洁模式 level=1)
[SVC] 📄 openat(AT_FDCWD, "/data/local/tmp/test.txt", O_RDONLY) = 3
[SVC] 📄 read(3, buf, 1024) = 256
[SVC] 📄 close(3) = 0
```

**v2.0 日志格式**：
```
#1 [D1] [M] 0x7dd046e244    0x21244    ldr    x16, #0x8    ;X16=0x0->0x7e8897c000
  MEM_read @0x7dd046e24c size=8 val=00c097887e000000
#42 [D1] [M] 0x7e8b8df098    0x0       str    x30, [sp, #0x100]
  MEM_write @0xb400007dd0f0cd80 size=8 val=ace346d07d000000
    SRC_REG=X30 val=0x7dd046e3ac
```

> ⚠️ **注意**: Small-Trace 仅支持 ARM64 架构，首次使用会自动下载 libqdbi.so (~18MB)。需要 Root 权限和关闭 SELinux。
>
> 📊 使用 [QBDITraceViewer](https://github.com/cxapython/QBDITraceViewer) 可视化分析追踪日志，支持值流追踪和算法还原。
>
> 📖 详细分析指南请参考 [SMALLTRACE_ANALYSIS_GUIDE.md](SMALLTRACE_ANALYSIS_GUIDE.md)

### 主动调用脚本

对于需要主动触发函数调用的场景，提供两个脚本：

#### 普通 Native 函数 (smalltrace_active.js)

适用于 `char* func(char* input, int len, char* output, ...)` 等普通 Native 函数。

| 函数 | 说明 |
|------|------|
| `traceAndCall(so, offset, input, argc)` | 追踪 + 主动调用 |
| `loadSo(path, java)` | 加载 SO |
| `listModules(filter)` | 列出模块 |
| `callRaw(so, offset, ret, types, args)` | 自定义签名调用 |

```bash
frida -U -l scripts/smalltrace_active.js -f com.example.app --no-pause

# 追踪普通 Native 函数
traceAndCall('libjnicalculator.so', 0x21244, 'hello')
traceAndCall('libtarget.so', 0x1000, 'test', 3)
```

#### JNI 函数 (smalltrace_jni_active.js)

适用于 `jstring func(JNIEnv*, jobject, jstring, ...)` 等 JNI 函数。

| 函数 | 说明 |
|------|------|
| `traceAndCallJNI(so, offset, arg1, arg2, ...)` | 追踪 + 调用 JNI 函数 |
| `traceJNIBySymbol(so, symbol, arg1, arg2, ...)` | 通过符号名追踪 |
| `findExport(so, keyword)` | 查找导出符号偏移 |
| `jniHelp()` | 显示帮助 |

```bash
frida -U -l scripts/smalltrace_jni_active.js -f com.example.app --no-pause

# 追踪 JNI 函数: jstring encryptString2(JNIEnv*, jobject, jstring input, jstring key)
traceAndCallJNI('libjnicalculator.so', 0x1ed98, 'hello', '1234qwer')

# 单参数 JNI 函数: jstring encrypt(JNIEnv*, jobject, jstring input)
traceAndCallJNI('libjnicalculator.so', 0x21244, 'hello')

# 通过符号名调用
traceJNIBySymbol('libjnicalculator.so', 'Java_com_example_MainActivity_encryptString2', 'hello', 'key')

# 查找符号偏移
findExport('libjnicalculator.so', 'encrypt')
```

> 💡 **区别**: 
> - `traceAndCall` 用于普通 Native 函数，参数是 `char*`、`int` 等
> - `traceAndCallJNI` 用于 JNI 函数，自动处理 `JNIEnv*`、`jobject`、`jstring` 参数

## 📁 项目结构

```
fridac/
├── fridac                      # CLI 入口
├── fridac_core/                # Python 核心模块
│   ├── session.py              # 会话管理
│   ├── task_manager.py         # 任务系统
│   ├── script_manager.py       # 脚本管理
│   ├── smalltrace.py           # Small-Trace 集成
│   ├── ghidra_bridge.py        # Ghidra 桥接 (GhidraMCP)
│   └── ...
├── scripts/                    # 自定义脚本目录
│   ├── security/               # 安全相关脚本
│   ├── monitor/                # 监控脚本
│   └── tools/                  # 工具脚本
├── binaries/                   # 预置二进制文件
│   └── arm64/                  # ARM64 架构文件
├── frida_common_new.js         # Java Hook 工具
├── frida_location_hooks_new.js # 定位 Hook 工具
├── frida_native_common.js      # Native Hook 工具
├── frida_native/               # Native Hook 模块
├── frida_advanced_tracer.js    # 高级追踪工具
└── frida_okhttp_logger.js      # OkHttp 插件
```

## 📖 文档

- [Small-Trace 分析指南](SMALLTRACE_ANALYSIS_GUIDE.md) - QBDI 汇编追踪与算法还原实战教程

### 快速参考

<details>
<summary>📋 任务管理命令</summary>

| 命令 | 说明 |
|------|------|
| `tasks` / `jobs` | 显示所有任务 |
| `kill <id>` | 终止任务 |
| `killall [type]` | 终止所有/指定类型任务 |
| `taskinfo <id>` | 任务详情 |

**任务状态**: ⏳pending → 🟢running → ✅completed / ❌failed / 🚫cancelled
</details>

<details>
<summary>🔧 hooknative 用法</summary>

```bash
hooknative <function_name> [show_stack] [stack_lines]

# 示例
hooknative malloc true              # Hook malloc
hooknative libc.so!open true        # 指定模块
hooknative SSL_write true 10        # 显示10行栈
```
</details>

<details>
<summary>🚀 早期 Hook (Spawn 模式)</summary>

在应用启动时自动执行 Hook 函数，无需手动输入：

```bash
# 基础用法
fridac -f com.app --hook traceRegisterNatives       # 执行无参数函数
fridac -f com.app --preset jni_analysis             # 预设套件
fridac -f com.app --preset crypto_analysis -o log   # 输出到文件

# 带参数的 Hook (使用 --hook-args)
fridac -f com.app --hook findNativeFuncAddress --hook-args "encrypt,com.app.Native"
fridac -f com.app --hook traceClass --hook-args "com.example.MainActivity"
fridac -f com.app --hook traceMethod --hook-args "com.example.App.decrypt,1"

# 可用预设: jni_analysis, crypto_analysis, network_analysis, anti_debug
```

**参数说明**：
| 参数 | 说明 |
|------|------|
| `--hook <函数名>` | 指定要执行的 Hook 函数（来自内置或自定义脚本） |
| `--hook-args <参数>` | 函数参数，多个参数用逗号分隔 |
| `--preset <预设>` | 使用预定义的 Hook 套件 |
</details>

<details>
<summary>❓ 故障排除</summary>

| 问题 | 解决方案 |
|------|---------|
| 函数未找到 | 检查 JSDoc 格式，运行 `reload_scripts` |
| 连接失败 | 检查 `frida-ps -U`，确认服务器运行 |
| Hook 未执行 | 使用 spawn 模式 `-f` + `--hook` |
| 输出不正确 | 使用 `LOG()` 而非 `console.log()` |
</details>

## 🔧 自定义脚本

fridac 支持多个脚本目录（按优先级加载，后加载覆盖先加载）：

| 目录 | 说明 | 用途 |
|------|------|------|
| `安装目录/scripts/` | 随 fridac 安装的脚本 | 内置工具 |
| `~/.fridac/scripts/` | 用户全局脚本 | 个人工具库 |
| `当前目录/scripts/` | 项目特定脚本 | 项目专用 |
| `FRIDAC_SCRIPTS_PATH` | 环境变量指定 | 灵活配置 |

### 添加脚本

```bash
# 方式1：添加到用户全局目录（任意目录可用）
mkdir -p ~/.fridac/scripts
vim ~/.fridac/scripts/my_hooks.js

# 方式2：添加到当前项目目录
mkdir -p ./scripts
vim ./scripts/project_hooks.js

# 方式3：使用环境变量
export FRIDAC_SCRIPTS_PATH="/path/to/my/scripts"
```

### 脚本格式

```javascript
/**
 * 监控登录方法
 * @example monitorLogin(true)
 */
function monitorLogin(showStack) {
    LOG("🔐 监控登录...", { c: Color.Cyan });
    // 实现代码
}
```

### 使用

```bash
fridac> reload_scripts     # 重载所有脚本
fridac> monitorLogin(true) # 执行函数
```

## 📝 许可证

MIT License

---

**🚀 fridac - 让 Frida Hook 更简单！**
