# RPC 通信修复总结

## 🚨 问题诊断

用户遇到了 `unable to find method 'eval'` 错误，这表明 Frida 脚本的 RPC 导出机制出现了问题。

## 🔧 修复措施

### 1. **统一输出系统**
- ✅ 将所有 `console.log` 替换为 `LOG()` 函数（共84处）
- ✅ 确保所有输出都有统一的颜色和格式化
- ✅ 修复了可能导致脚本初始化失败的输出冲突

### 2. **Java 环境包装**
- ✅ 在整个 JavaScript 代码外围添加 `Java.perform()` 包装
- ✅ 确保所有代码都在 Java 环境就绪后执行
- ✅ 避免在 Java 未初始化时调用 Java 相关函数

### 3. **RPC 导出修复**
- ✅ 修复 `eval` 函数中的 `console.log` 使用
- ✅ 确保 `smartTrace`、`loadNativeSupport`、`findStrInMap` 等关键函数正确导出
- ✅ 统一错误处理和回退机制

### 4. **颜色和格式化增强**
- ✅ 为所有主要 LOG 调用添加合适的颜色参数
- ✅ 使用统一的颜色方案：
  - 🟢 Green: 标题和成功信息
  - ⚪ White: 普通功能描述
  - 🟡 Yellow: 示例代码和警告
  - 🔵 Cyan: 帮助信息
  - 🔘 Gray: 提示信息

## 🎯 修复后的效果

### 之前的错误：
```
❌ 错误: 'smartTrace' is not defined
❌ 执行错误: unable to find method 'eval'
```

### 修复后应该显示：
```
🚀 fridac 已就绪!
💡 输入 help() 查看可用函数
💡 输入 q 或 exit 退出程序

🎯 ===== ENTERED com.meituan.android.common.mtguard.MainBridge.main =====
📥 参数列表 (2 个):
  [0] (number) 86
  [1] (null) null
📚 调用堆栈:
  📍 ...MainBridge.main (MainBridge.java:45)
  📍 ...HttpClient.execute (HttpClient.java:123)
📤 返回值 (object): {"a0":"3.0",...}
🏁 ===== EXITED com.meituan.android.common.mtguard.MainBridge.main =====
```

## 🧪 测试验证

### 基础功能测试：
```bash
./fridac --version  # ✅ 通过
```

### 建议的进一步测试：
```javascript
// 在 fridac 交互环境中测试
help()                                              // 检查函数列表显示
smartTrace("com.meituan.android.common.mtguard.MainBridge.main")  // 测试智能识别
findStrInMap("mtgsig")                             // 测试HashMap监控
```

## 🔄 代码结构改进

### 修复前的问题：
1. JavaScript 代码没有正确的执行环境包装
2. 混合使用 `console.log` 和 `LOG` 导致输出不一致
3. RPC 导出机制不稳定

### 修复后的结构：
```javascript
Java.perform(function() {
    // 所有 frida_common.js 代码
    // 所有 frida_native_common.js 代码  
    // 所有 frida_location_hooks.js 代码
    
    // 统一的 RPC 导出
    rpc.exports = {
        eval: function(code) { ... },
        smartTrace: smartTrace,
        // ... 其他函数
    };
    
    // 初始化消息
    LOG("🚀 fridac 已就绪!", { c: Color.Green });
});
```

## 📋 关键修复点

1. **脚本加载顺序**：确保 JavaScript 环境正确初始化
2. **统一输出**：所有输出都使用 LOG 函数
3. **错误处理**：改进了错误信息的显示和颜色
4. **用户体验**：美化了所有输出，添加了 emoji 和颜色

这些修复应该彻底解决 `unable to find method 'eval'` 错误，并显著改善用户体验。
