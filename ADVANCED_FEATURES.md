# fridacli 高级功能说明

基于著名的 r0tracer.js 脚本，我们为 fridacli 新增了一系列高级追踪功能，使其功能更加强大和专业。

## 🆕 新增功能概览

### 1. 反调试绕过功能

#### `bypassTracerPidDetection()`
- **功能**: 绕过基于 TracerPid 的反调试检测
- **原理**: Hook `fgets` 函数，自动将 TracerPid 值修改为 0
- **使用场景**: 分析带有反调试保护的应用
- **示例**:
```javascript
bypassTracerPidDetection();  // 启用反调试绕过
```

### 2. 对象字段详细检查

#### `inspectObjectFields(obj, context)`
- **功能**: 深度检查 Java 对象的所有字段值
- **参数**:
  - `obj`: 要检查的对象实例
  - `context`: 上下文信息字符串（可选）
- **特点**:
  - 自动识别实例对象和类对象
  - 处理静态字段和实例字段
  - 智能格式化不同类型的字段值
  - 长字符串和对象自动截断显示
- **示例**:
```javascript
// 在方法Hook中使用
function hookMethod() {
    var obj = this;  // 当前对象实例
    var info = inspectObjectFields(obj, "MainActivity Hook");
    console.log(info);
}
```

### 3. 高级方法追踪

#### `advancedMethodTracing(methodName, enableFieldInspection, enableColorOutput)`
- **功能**: 增强版方法追踪，提供更详细的信息
- **参数**:
  - `methodName`: 完整的方法名（包名.类名.方法名）
  - `enableFieldInspection`: 是否启用对象字段检查（默认 false）
  - `enableColorOutput`: 是否启用彩色输出（默认 true）
- **特点**:
  - 详细的参数和返回值格式化
  - 可选的对象字段深度检查
  - 完整的调用栈信息
  - 随机彩色输出（模拟 r0tracer 风格）
  - 智能处理各种数据类型
- **示例**:
```javascript
// 基本用法
advancedMethodTracing('com.example.MainActivity.onCreate', false, true);

// 启用字段检查的高级用法
advancedMethodTracing('com.example.LoginActivity.login', true, true);
```

### 4. 批量Hook功能

#### `batchHookWithFilters(whitelistPattern, blacklistPattern, targetClassForLoader)`
- **功能**: 根据黑白名单批量Hook多个类的方法
- **参数**:
  - `whitelistPattern`: 白名单模式（包含的关键字）
  - `blacklistPattern`: 黑名单模式（排除的关键字）
  - `targetClassForLoader`: 目标类名，用于切换ClassLoader（可选）
- **特点**:
  - 支持ClassLoader自动切换
  - 智能过滤匹配的类
  - 批量处理多个类
  - 详细的执行统计
- **示例**:
```javascript
// Hook所有包含'com.example'但不包含'test'的类
batchHookWithFilters('com.example', 'test', null);

// 针对特定ClassLoader的批量Hook
batchHookWithFilters('com.myapp', '$', 'com.myapp.core.MainActivity');
```

### 5. 应用类全量Hook

#### `hookAllApplicationClasses(enableStrictFiltering)`
- **功能**: Hook应用的所有业务类（排除系统类）
- **参数**:
  - `enableStrictFiltering`: 是否启用严格过滤（默认 true）
- **特点**:
  - 自动识别应用ClassLoader
  - 智能过滤系统类和第三方库
  - 支持大型应用的分析
  - 详细的统计信息
- **警告**: 大型应用可能导致性能问题，建议配合过滤使用
- **示例**:
```javascript
// 启用严格过滤（推荐）
hookAllApplicationClasses(true);

// 不过滤（慎用，可能导致崩溃）
hookAllApplicationClasses(false);
```

## 🛠️ 使用场景和最佳实践

### 场景1: 反调试应用分析
```javascript
// 1. 首先绕过反调试
bypassTracerPidDetection();

// 2. 然后进行正常的Hook分析
traceMethod('com.example.SecurityCheck.isDebuggerDetected');
```

### 场景2: 登录流程深度分析
```javascript
// 使用高级追踪分析登录方法，包含字段检查
advancedMethodTracing('com.example.LoginActivity.doLogin', true, true);

// 批量Hook所有认证相关的类
batchHookWithFilters('com.example.auth', 'test', null);
```

### 场景3: 加壳应用分析
```javascript
// 指定特定的ClassLoader进行批量Hook
batchHookWithFilters('com.shell.protected', '$', 'com.shell.protected.core.Main');

// Hook所有应用业务类
hookAllApplicationClasses(true);
```

### 场景4: 数据流追踪
```javascript
// 高级方法追踪配合对象字段检查
advancedMethodTracing('com.example.DataProcessor.processData', true, true);

// 检查特定对象的字段值
// 在Hook中使用: inspectObjectFields(dataObject, "数据处理前");
```

## 🎨 输出格式说明

### 高级方法追踪输出格式
```
================================================================================
🔍 检查对象字段: 实例对象 => com.example.MainActivity
================================================================================
  📋 String username = "testuser"
  📋 boolean isLoggedIn = true
  📋 ArrayList userList = [{"id":1,"name":"user1"}] (对象被截断)
================================================================================
📊 总共检查了 3 个字段
🎯 ===== 进入方法: com.example.MainActivity.onCreate =====
📥 方法参数 (1 个):
  [0] (object) Bundle[{key1=value1, key2=value2}]
📚 调用栈:
at com.example.MainActivity.onCreate(MainActivity.java:45)
at android.app.Activity.performCreate(Activity.java:7136)
...
📤 返回值 (undefined): undefined
🏁 ===== 退出方法: com.example.MainActivity.onCreate =====
================================================================================
```

### 批量Hook统计输出
```
🎯 开始批量 Hook，白名单: 'com.example'，黑名单: 'test'
📋 找到 25 个匹配的类
🔨 Hook 类 [1/25]: com.example.MainActivity
🔨 Hook 类 [2/25]: com.example.LoginActivity
...
📊 批量 Hook 完成: 成功 23 个，失败 2 个
```

## ⚠️ 注意事项

1. **性能影响**: 高级功能会产生更多输出，建议在小型应用或特定场景下使用
2. **内存消耗**: 对象字段检查会增加内存使用，大型对象可能影响性能
3. **稳定性**: 批量Hook大量类可能导致应用崩溃，建议配合过滤器使用
4. **兼容性**: 功能基于 Android Java 层，Native 层需要配合 Native Hook 工具

## 🔧 故障排除

### 常见问题

1. **TracerPid绕过失败**
   - 确认设备已Root
   - 检查libc.so是否存在
   - 尝试在应用启动前调用

2. **批量Hook导致崩溃**
   - 减少Hook的类数量
   - 启用严格过滤
   - 使用白名单精确匹配

3. **字段检查失败**
   - 确认对象不为null
   - 检查字段访问权限
   - 处理私有字段的访问限制

## 📚 相关资源

- [r0tracer 原项目](https://github.com/r0ysue/r0tracer)
- [Frida 官方文档](https://frida.re/docs/)
- [Android 逆向工程指南](https://github.com/AndroidReverse)

---

通过这些高级功能，fridacli 现在具备了与 objection 和 Wallbreaker 类似的强大追踪能力，同时保持了良好的易用性和扩展性。
