# fridac 早期 Hook 使用指南

## 🎯 问题背景

在逆向分析中，某些关键函数（如 `RegisterNatives`）会在应用启动的极早期被调用。如果使用传统的 attach 模式，等应用完全启动后再手动执行 hook，往往已经错过了这些关键调用。

## 🚀 解决方案

fridac 现在支持 **早期 Hook** 功能，在 spawn 模式下可以在应用启动的瞬间立即设置 hook，确保不错过任何早期调用。

## 📋 使用方式

### 1. 单个 Hook 函数

```bash
# Hook RegisterNatives（监控所有 SO）
fridac -f com.example.app --hook traceRegisterNatives

# Hook RegisterNatives（仅监控特定 SO）
fridac -f com.example.app --hook traceRegisterNatives --hook-args mylib

# Hook Base64 操作
fridac -f com.example.app --hook hookbase64 --hook-args true

# Hook 特定方法
fridac -f com.example.app --hook traceMethod --hook-args com.example.Class.method
```

### 2. 预设套件

fridac 提供了多个预设的 Hook 套件，适用于不同的分析场景：

#### JNI 分析套件
```bash
fridac -f com.example.app --preset jni_analysis
```
包含：
- `traceRegisterNatives()` - 监控所有 Native 方法注册
- `hookbase64(true)` - 监控 Base64 编解码
- `hooknewstringutf(true)` - 监控字符串创建

#### 加密分析套件
```bash
fridac -f com.example.app --preset crypto_analysis
```
包含：
- `hookbase64(true)` - Base64 操作
- `hookjsonobject(true)` - JSON 对象操作
- `traceRegisterNatives("crypto")` - 加密相关 SO

#### 网络分析套件
```bash
fridac -f com.example.app --preset network_analysis
```
包含：
- `hookurl(true)` - URL 构造
- `hookfetch("")` - fetch 网络请求
- `traceRegisterNatives("okhttp")` - OkHttp 相关

#### 反调试分析套件
```bash
fridac -f com.example.app --preset anti_debug
```
包含：
- `traceRegisterNatives()` - 监控所有 Native 注册
- `hookfileoperations(true)` - 文件操作
- `hooklog(true)` - 日志输出

### 3. 自定义配置文件

你可以编辑 `early_hooks.json` 文件来创建自己的预设：

```json
{
  "presets": {
    "my_custom_preset": {
      "description": "我的自定义分析套件",
      "hooks": [
        {
          "function": "traceRegisterNatives",
          "args": ["myapp"],
          "description": "监控应用特定的 Native 注册"
        },
        {
          "function": "hookbase64",
          "args": [true],
          "description": "监控 Base64 操作"
        }
      ]
    }
  }
}
```

然后使用：
```bash
fridac -f com.example.app --preset my_custom_preset
```

### 4. 输出重定向

当 Hook 输出内容较多时，可以将输出重定向到文件进行分析：

```bash
# 输出到文件（覆盖模式）
fridac -f com.example.app --hook traceRegisterNatives -o hooks.log

# 输出到文件（追加模式）
fridac -f com.example.app --preset jni_analysis -o analysis.log --append

# 指定输出目录
fridac -f com.example.app --preset crypto_analysis -o logs/crypto_$(date +%Y%m%d_%H%M%S).log

# 同时在控制台显示和保存到文件
fridac -f com.example.app --hook hookbase64 --hook-args true -o base64.log
```

输出文件格式示例：
```
# fridac Hook Output Log
# Started at: 2024-01-15 10:30:45
# Mode: Overwrite
============================================================

[10:30:46.123] 🚀 JNI RegisterNatives 追踪器启动
[10:30:46.124] 🔍 正在搜索 libart.so 中的 RegisterNatives 符号...
[10:30:46.125] ✅ 发现符号: 0x7... -> _ZN3art3JNI15RegisterNativesE...
[10:30:46.890] ╔═══════════════════════════════════════════════════════════════════
[10:30:46.891] ║ 🎯 RegisterNatives 调用检测到!
[10:30:46.892] ║ 📍 调用者: libnative.so
[10:30:46.893] ║ 📝 Java类: com.target.app.NativeHelper
...
============================================================
# Session ended at: 2024-01-15 10:35:20
```

## 🎪 实际使用示例

### 分析 RegisterNatives 调用

```bash
# 启动应用并立即监控 RegisterNatives
fridac -f com.target.app --hook traceRegisterNatives

# 输出示例：
🚀 JNI RegisterNatives 追踪器启动
🔍 正在搜索 libart.so 中的 RegisterNatives 符号...
✅ 发现符号: 0x7... -> _ZN3art3JNI15RegisterNativesE...
🎯 成功挂钩 1 个 RegisterNatives 符号
⏳ 等待 RegisterNatives 调用...

╔═══════════════════════════════════════════════════════════════════
║ 🎯 RegisterNatives 调用检测到!
╠═══════════════════════════════════════════════════════════════════
║ 📍 调用者: libnative.so
║ 📝 Java类: com.target.app.NativeHelper
║ 🔢 方法数量: 3
╚═══════════════════════════════════════════════════════════════════

📋 注册的Native方法列表:
┌─────────────────────────────────────────────────────────────────
│ [1] 🔧 encrypt
│     📄 签名: (Ljava/lang/String;)Ljava/lang/String;
│     🎯 地址: 0x7... (libnative.so+0x1234)
│     🔍 符号: Java_com_target_app_NativeHelper_encrypt
│
│ [2] 🔧 decrypt
│     📄 签名: (Ljava/lang/String;)Ljava/lang/String;
│     🎯 地址: 0x7... (libnative.so+0x5678)
│     🔍 符号: Java_com_target_app_NativeHelper_decrypt
└─────────────────────────────────────────────────────────────────
```

### 综合分析套件

```bash
# 使用 JNI 分析套件进行全面分析
fridac -f com.target.app --preset jni_analysis

# 这将同时监控：
# - RegisterNatives 调用
# - Base64 编解码
# - 字符串创建
# 确保捕获到所有早期的关键操作
```

### 大量输出的处理

```bash
# 将大量 Hook 输出保存到文件
fridac -f com.target.app --preset jni_analysis -o jni_analysis.log

# 使用时间戳命名文件
fridac -f com.target.app --hook hookbase64 --hook-args true -o "base64_$(date +%Y%m%d_%H%M%S).log"

# 分析完成后查看文件
tail -f jni_analysis.log  # 实时查看
grep "RegisterNatives" jni_analysis.log  # 搜索特定内容
```

## ⚠️ 注意事项

1. **仅限 Spawn 模式**: 早期 Hook 功能只在 spawn 模式下有效（`-f` 或 `--spawn` 参数）
2. **时机关键**: Hook 会在应用启动后立即设置，确保不错过早期调用
3. **性能影响**: 某些 Hook（如 Base64）可能产生大量输出，建议根据需要选择
4. **权限要求**: 需要 root 权限或在已 root 的设备上运行

## 🔧 故障排除

### 函数未找到
如果提示某个 Hook 函数未找到，请检查：
1. 自定义脚本是否正确加载
2. 使用 `reload_scripts` 重新加载
3. 检查函数名拼写是否正确

### Hook 未触发
如果 Hook 设置成功但未触发：
1. 确认应用确实会调用该函数
2. 检查过滤条件（如 SO 名称）是否正确
3. 尝试不同的 Hook 函数验证

### 输出过多
如果输出过多难以分析：
1. 使用更具体的过滤条件
2. 关闭调用栈显示（将 `true` 改为 `false`）
3. 使用输出重定向保存到文件（见下文）

## 🎯 最佳实践

1. **先用预设**: 对于常见分析场景，优先使用预设套件
2. **逐步细化**: 从宽泛的监控开始，逐步缩小范围
3. **保存配置**: 将常用的 Hook 组合保存为自定义预设
4. **结合使用**: 早期 Hook 配合交互式命令，实现全面分析
5. **输出管理**: 对于大量输出，使用 `-o` 参数保存到文件，便于后续分析
6. **文件命名**: 使用有意义的文件名，包含时间戳和应用信息

## 📚 相关命令

启动后可以使用这些命令进行进一步分析：
- `tasks` - 查看当前运行的 Hook 任务
- `kill <id>` - 终止特定任务
- `killall` - 终止所有任务
- `taskstats` - 查看任务统计
- `help()` - 查看所有可用函数

通过早期 Hook 功能，你现在可以轻松捕获应用启动时的关键调用，大大提升逆向分析的效率！
