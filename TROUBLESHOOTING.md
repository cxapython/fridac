# fridac 故障排除指南

## 🔧 常见问题与解决方案

### 1. 早期 Hook 执行失败

**问题症状**：
- 使用 `--hook traceRegisterNatives` 参数时，日志文件只有系统初始化信息
- 没有看到 Hook 函数的实际执行输出
- 提示函数未找到或未加载

**可能原因**：
1. 自定义脚本加载时机问题
2. RPC 导出未正确替换
3. 函数定义或 JSDoc 注释格式错误

**解决方案**：

#### 方案 1：验证自定义脚本
```bash
# 运行测试脚本验证
python3 test_early_hook.py
```

#### 方案 2：手动验证函数存在
```bash
# 启动 fridac 后在交互模式下检查
fridac -f com.your.app

# 在交互提示符下输入：
typeof traceRegisterNatives
# 应该返回 "function"

# 检查函数是否可调用：
traceRegisterNatives()
```

#### 方案 3：重新加载自定义脚本
```bash
# 在 fridac 交互模式下：
reload_scripts
```

#### 方案 4：使用交互模式而非早期 Hook
```bash
# 先启动应用
fridac -f com.your.app -o output.log

# 然后在交互模式下快速执行：
traceRegisterNatives()
```

### 2. 输出文件内容不正确

**问题症状**：
- 输出文件只有系统信息，没有 Hook 内容
- 控制台显示正常，但文件中缺少 Hook 输出
- 文件内容格式异常

**根本原因**：
某些自定义脚本使用 `console.log` 而不是 Frida 的 `send()` 函数，导致输出无法被重定向到文件。

**解决方案**：

#### 已修复的脚本
以下脚本已经修复了输出重定向问题：
- `scripts/tools/jni_register_natives_trace.js` - traceRegisterNatives 函数

#### 如果遇到其他脚本的输出重定向问题
检查自定义脚本中是否使用了 `console.log`，应该改为：
```javascript
// 错误的方式
console.log("消息");

// 正确的方式 1：使用全局 LOG 函数
LOG("消息", { c: Color.Green });

// 正确的方式 2：使用 send 函数
send("消息");
```

#### 检查文件权限
```bash
# 确保输出目录有写权限
ls -la $(dirname output.log)

# 如果需要，创建目录
mkdir -p logs
fridac -f com.app --hook traceRegisterNatives -o logs/trace.log
```

#### 验证 Hook 是否触发
```bash
# 使用追加模式，避免覆盖
fridac -f com.app --hook traceRegisterNatives -o trace.log --append

# 在应用中执行一些操作，触发 Native 方法注册
# 然后检查文件内容：
tail -f trace.log
```

### 3. 函数加载问题

**问题症状**：
- 提示 "函数未找到或未正确加载"
- JSDoc 解析错误

**解决方案**：

#### 检查 JSDoc 格式
确保自定义脚本中的函数有正确的 JSDoc 注释：

```javascript
/**
 * 函数描述
 * @description 详细描述
 * @param {string} param - 参数说明
 * @example functionName("example")
 */
function functionName(param) {
    // 实现
}
```

#### 检查函数语法
```bash
# 使用 Node.js 检查语法
node -c scripts/tools/jni_register_natives_trace.js
```

### 4. 应用连接问题

**问题症状**：
- 无法连接到目标应用
- Spawn 模式启动失败

**解决方案**：

#### 检查设备连接
```bash
# 检查 Frida 服务器状态
frida-ps -U

# 检查应用是否存在
frida-ps -U | grep com.your.app
```

#### 使用正确的包名
```bash
# 获取准确的包名
adb shell pm list packages | grep -i keyword

# 或使用 frida 查看应用列表
frida-ps -U -a
```

## 🛠️ 调试技巧

### 1. 启用详细日志
```bash
# 设置环境变量启用调试日志
export FRIDAC_DEBUG=1
python3.6 fridac -f com.app --hook traceRegisterNatives -o debug.log
```

### 2. 分步调试
```bash
# 第一步：验证应用连接
fridac -f com.app

# 第二步：手动执行函数
# 在交互模式下：
traceRegisterNatives()

# 第三步：检查输出
tasks
```

### 3. 使用预设进行测试
```bash
# 使用预设测试多个 Hook
fridac -f com.app --preset jni_analysis -o test.log

# 检查哪些 Hook 生效了
grep -E "(RegisterNatives|Base64|NewStringUTF)" test.log
```

## 📞 获取帮助

如果以上方案都无法解决问题，请：

1. **收集信息**：
   - fridac 版本：`python3.6 fridac --version`
   - Frida 版本：`frida --version`
   - Python 版本：`python3.6 --version`
   - 目标应用包名和版本

2. **提供日志**：
   - 完整的错误日志
   - 测试脚本的输出：`python3 test_early_hook.py`
   - 详细的复现步骤

3. **检查环境**：
   - 设备 root 状态
   - Frida 服务器版本匹配
   - 应用是否有反调试保护

通过这些步骤，通常可以快速定位和解决问题。
