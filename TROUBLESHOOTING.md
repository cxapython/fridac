# fridac 故障排除

## 常见问题

### 1. 早期 Hook 未执行

**解决方案**:
```bash
# 验证函数存在
fridac -f com.app
typeof traceRegisterNatives  # 应返回 "function"

# 重载脚本
reload_scripts

# 使用交互模式
fridac -f com.app -o output.log
traceRegisterNatives()
```

### 2. 输出文件内容不正确

**原因**: 使用 `console.log` 而非 `send()`

**正确方式**:
```javascript
// ✗ 错误
console.log("消息");

// ✓ 正确
LOG("消息", { c: Color.Green });
send("消息");
```

### 3. 函数未找到

**检查 JSDoc 格式**:
```javascript
/**
 * 函数描述
 * @example functionName("example")
 */
function functionName(param) {
    // 实现
}
```

**检查语法**:
```bash
node -c scripts/your_script.js
```

### 4. 连接失败

```bash
# 检查 Frida 服务器
frida-ps -U

# 获取包名
adb shell pm list packages | grep keyword
```

## 调试技巧

```bash
# 启用调试日志
export FRIDAC_DEBUG=1
fridac -f com.app

# 分步调试
fridac -f com.app
traceRegisterNatives()
tasks

# 使用预设测试
fridac -f com.app --preset jni_analysis -o test.log
```

## 信息收集

出现问题时请提供：
- fridac 版本: `fridac --version`
- Frida 版本: `frida --version`
- Python 版本: `python3 --version`
- 完整错误日志
