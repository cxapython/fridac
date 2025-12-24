# 🚀 fridac - 专业级 Frida Hook 工具集

集成 **Java Hook**、**Native Hook** 和 **定位 Hook** 的 Frida CLI 工具，提供交互式调试环境。

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

### Small-Trace (QBDI 汇编追踪)

基于 [Small-Trace](https://github.com/NiTianErXing666/Small-Trace) 项目的 SO 汇编级追踪功能，可追踪 Native 函数执行的每条汇编指令。

**v2.0 增强功能**：
- 📊 **完整寄存器变化**：记录所有变化的寄存器，不再仅记录第一个
- 🔢 **指令序号**：每条指令带唯一序号，便于精确定位
- 📈 **调用深度**：`[D1]/[D2]/[D3]` 标记函数嵌套层级
- 🏷️ **操作类型**：`[A]`算术/`[L]`逻辑/`[M]`内存/`[B]`分支/`[C]`调用/`[R]`返回
- 🔍 **源寄存器追踪**：内存写入记录数据来源寄存器

| 命令 | 说明 |
|------|------|
| `smalltrace <so> <offset> [argc]` | 按偏移追踪 SO 函数 |
| `smalltrace_symbol <so> <symbol> [argc]` | 按符号名追踪 |
| `smalltrace_pull [output]` | 拉取追踪日志到本地 |
| `smalltrace_status` | 查看追踪状态和统计 |

**使用示例**：

```bash
# 追踪 libjnicalculator.so 偏移 0x21244 处的函数
fridac> smalltrace libjnicalculator.so 0x21244

# 按符号名追踪
fridac> smalltrace_symbol libtarget.so encryptToMd5Hex

# 触发目标函数后，拉取追踪日志
fridac> smalltrace_pull ~/Desktop/trace.log

# 查看追踪状态（v2.0 显示操作类型分布）
fridac> smalltrace_status
```

**v2.0 日志示例**：
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

## 📁 项目结构

```
fridac/
├── fridac                      # CLI 入口
├── fridac_core/                # Python 核心模块
│   ├── session.py              # 会话管理
│   ├── task_manager.py         # 任务系统
│   ├── script_manager.py       # 脚本管理
│   ├── smalltrace.py           # Small-Trace 集成
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

- [任务系统指南](TASK_SYSTEM_GUIDE.md) - 任务管理命令详解
- [自定义脚本指南](CUSTOM_SCRIPTS_GUIDE.md) - 创建自定义 Hook 脚本
- [Native Hook 指南](HOOKNATIVE_USAGE_GUIDE.md) - Native 函数 Hook
- [早期 Hook 指南](EARLY_HOOKS_GUIDE.md) - Spawn 模式早期 Hook
- [故障排除](TROUBLESHOOTING.md) - 常见问题解决

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
