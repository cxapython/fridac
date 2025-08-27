# 🔧 fridac 自定义脚本功能指南

fridac 现在支持强大的自定义脚本功能，让您可以轻松扩展工具的功能，创建自己的 Hook 函数并集成到完整的工作流中。

## ✨ 核心特性

- 🎯 **自动脚本发现** - 自动扫描 `scripts/` 目录中的 JavaScript 文件
- 📝 **智能函数解析** - 解析 JSDoc 注释，提取函数信息
- 🔄 **热重载支持** - 运行时重新加载脚本，无需重启
- 📋 **任务管理集成** - 自定义函数自动支持任务管理系统
- 🎨 **Tab 补全支持** - 自定义函数自动加入智能补全
- 📚 **Help 系统集成** - 在 `help()` 中显示自定义函数
- 🛡️ **错误处理** - 完善的错误处理和降级机制

## 🚀 快速开始

### 1. 创建您的第一个自定义脚本

在 `scripts/` 目录下创建一个新的 JavaScript 文件：

```javascript
/**
 * 我的自定义工具
 * @description 这是我的第一个自定义脚本
 * @author Your Name
 */

/**
 * 快速检测登录相关方法
 * @description 自动扫描和Hook所有包含'login'关键词的方法
 * @example hookLoginMethods(true)
 * @param {boolean} showStack - 是否显示调用栈
 */
function hookLoginMethods(showStack) {
    showStack = showStack || false;
    
    try {
        LOG("🔍 开始扫描登录相关方法...", { c: Color.Cyan });
        
        var hookedCount = 0;
        
        // 获取所有已加载的类
        Java.enumerateLoadedClassesSync().forEach(function(className) {
            if (className.toLowerCase().indexOf('login') !== -1) {
                try {
                    var clazz = Java.use(className);
                    var methods = clazz.class.getDeclaredMethods();
                    
                    methods.forEach(function(method) {
                        var methodName = method.getName();
                        if (methodName.toLowerCase().indexOf('login') !== -1) {
                            // Hook这个方法
                            try {
                                clazz[methodName].implementation = function() {
                                    LOG("🎯 登录方法被调用: " + className + "." + methodName, { c: Color.Yellow });
                                    
                                    if (showStack) {
                                        printStack();
                                    }
                                    
                                    // 通知任务管理器
                                    if (typeof TASK_ID !== 'undefined') {
                                        notifyTaskHit({
                                            operation: "login_method",
                                            class: className,
                                            method: methodName
                                        });
                                    }
                                    
                                    return this[methodName].apply(this, arguments);
                                };
                                
                                hookedCount++;
                            } catch (e) {
                                // 忽略无法Hook的方法
                            }
                        }
                    });
                } catch (e) {
                    // 忽略无法访问的类
                }
            }
        });
        
        LOG("✅ 成功Hook了 " + hookedCount + " 个登录相关方法", { c: Color.Green });
        return hookedCount;
        
    } catch (error) {
        LOG("❌ Hook登录方法失败: " + error.message, { c: Color.Red });
        if (typeof TASK_ID !== 'undefined') {
            notifyTaskError(error);
        }
        return 0;
    }
}
```

### 2. 在 fridac 中使用

启动 fridac，您的自定义函数将自动可用：

```bash
fridac -p com.example.app

fridac> hookLoginMethods(true)
🎯 执行自定义函数: hookLoginMethods
✅ 自定义函数任务已创建: #1

fridac> help()
# 在帮助中会看到您的自定义函数

fridac> tasks
# 查看任务状态
```

## 📝 脚本编写规范

### JSDoc 注释格式

使用标准的 JSDoc 格式为您的函数添加文档：

```javascript
/**
 * 函数简短描述（必需）
 * @description 详细描述（推荐）
 * @example functionName(param1, param2)（推荐）
 * @param {type} paramName - 参数描述（可选）
 * @author 作者名（可选）
 */
function functionName(param1, param2) {
    // 函数实现
}
```

### 内置工具函数

您的自定义脚本可以使用所有内置的 fridac 工具：

```javascript
// 日志输出
LOG("消息", { c: Color.Green });

// 调用栈
printStack();

// 任务通知
notifyTaskHit({ operation: "my_operation", data: "some_data" });
notifyTaskError(error);

// 颜色常量
Color.Red, Color.Green, Color.Blue, Color.Yellow, Color.Cyan, Color.White, Color.Gray

// 任务ID（在任务模式下可用）
if (typeof TASK_ID !== 'undefined') {
    // 当前运行在任务中
}
```

### 最佳实践

1. **错误处理**：始终使用 try-catch 包装主要逻辑
2. **任务集成**：使用 `notifyTaskHit()` 和 `notifyTaskError()` 与任务系统集成
3. **性能考虑**：避免在高频调用的地方进行复杂计算
4. **日志控制**：提供开关来控制详细日志输出
5. **参数验证**：验证和处理函数参数

## 🔄 脚本管理

### 重新加载脚本

```bash
fridac> reload_scripts
🔄 已重新加载 3 个自定义脚本
✅ 补全器已更新
```

### 查看脚本状态

```bash
fridac> help()
# 自定义函数会在帮助中显示

# Tab 补全
fridac> my<TAB>
myCustomFunction(
```

### 任务管理

自定义函数自动支持任务管理：

```bash
fridac> myCustomFunction(arg1, arg2)
✅ 自定义函数任务已创建: #5

fridac> tasks
📋 任务列表
ID  类型         状态     目标              创建时间
5   custom_hook  running  myCustomFunction  20:15:30

fridac> kill 5
🗑️ 任务 #5 已终止
```

## 📚 示例脚本

### 示例1：加密检测器

```javascript
/**
 * Hook所有加密相关操作
 * @description 监控应用中的加密、解密、签名等操作
 * @example hookAllCrypto(true)
 */
function hookAllCrypto(showStack) {
    // Hook MessageDigest
    var MessageDigest = Java.use("java.security.MessageDigest");
    MessageDigest.digest.overload('[B').implementation = function(input) {
        LOG("🔐 加密操作: " + this.getAlgorithm(), { c: Color.Yellow });
        return this.digest(input);
    };
    
    // Hook Cipher
    var Cipher = Java.use("javax.crypto.Cipher");
    Cipher.doFinal.overload('[B').implementation = function(input) {
        LOG("🔐 密码操作: " + this.getAlgorithm(), { c: Color.Yellow });
        return this.doFinal(input);
    };
}
```

### 示例2：网络监控

```javascript
/**
 * 监控所有网络请求
 * @description 拦截并记录所有HTTP/HTTPS请求
 * @example monitorNetworkRequests()
 */
function monitorNetworkRequests() {
    var URL = Java.use("java.net.URL");
    URL.$init.overload('java.lang.String').implementation = function(spec) {
        LOG("🌐 网络请求: " + spec, { c: Color.Cyan });
        
        notifyTaskHit({
            operation: "network_request",
            url: spec,
            timestamp: Date.now()
        });
        
        return this.$init(spec);
    };
}
```

### 示例3：反调试检测

```javascript
/**
 * 检测反调试技术
 * @description 监控常见的反调试检测方法
 * @example detectAntiDebug()
 */
function detectAntiDebug() {
    // Hook Debug类
    var Debug = Java.use("android.os.Debug");
    Debug.isDebuggerConnected.implementation = function() {
        LOG("🛡️ 反调试检测: isDebuggerConnected", { c: Color.Red });
        notifyTaskHit({ operation: "anti_debug", method: "isDebuggerConnected" });
        return false; // 绕过检测
    };
    
    // Hook ApplicationInfo
    var ApplicationInfo = Java.use("android.content.pm.ApplicationInfo");
    // ... 更多反调试检测
}
```

## 🔧 高级功能

### 动态函数注册

您可以在运行时动态创建函数：

```javascript
// 在脚本中定义动态函数创建器
function createDynamicHook(className, methodName) {
    try {
        var clazz = Java.use(className);
        clazz[methodName].implementation = function() {
            LOG("动态Hook: " + className + "." + methodName, { c: Color.Green });
            return this[methodName].apply(this, arguments);
        };
        return true;
    } catch (e) {
        return false;
    }
}
```

### 配置支持

创建可配置的脚本：

```javascript
/**
 * 可配置的方法监控
 * @description 根据配置监控指定的方法
 * @example monitorWithConfig({classes: ['com.example.Class'], methods: ['method1', 'method2']})
 */
function monitorWithConfig(config) {
    config = config || {};
    var classes = config.classes || [];
    var methods = config.methods || [];
    
    classes.forEach(function(className) {
        try {
            var clazz = Java.use(className);
            methods.forEach(function(methodName) {
                if (clazz[methodName]) {
                    clazz[methodName].implementation = function() {
                        LOG("配置监控: " + className + "." + methodName, { c: Color.Blue });
                        return this[methodName].apply(this, arguments);
                    };
                }
            });
        } catch (e) {
            LOG("无法加载类: " + className, { c: Color.Yellow });
        }
    });
}
```

## 🐛 调试技巧

### 调试脚本加载

```bash
# 查看脚本加载日志
fridac> reload_scripts
🔄 开始重新加载自定义脚本...
📝 解析函数: myFunction(param1, param2)
✅ 已加载脚本: my_script.js (1 个函数)
```

### 处理语法错误

如果脚本有语法错误，fridac 会跳过该脚本并继续加载其他脚本：

```bash
❌ 加载脚本失败 bad_script.js: SyntaxError: Unexpected token
✅ 脚本扫描完成: 成功 2, 失败 1
```

### 测试函数

在 JavaScript 控制台中测试您的函数：

```bash
fridac> typeof myFunction
function

fridac> myFunction.toString().substring(0, 100)
function myFunction(param1, param2) {
    try {
        LOG("测试函数", { c: Color.Green });
        // ...
```

## 🛠️ 故障排除

### 常见问题

1. **函数未显示在补全中**
   - 检查函数语法是否正确
   - 确保使用了正确的 JSDoc 格式
   - 运行 `reload_scripts` 重新加载

2. **任务创建失败**
   - 检查函数是否有语法错误
   - 确保任务管理器已初始化
   - 查看错误日志

3. **脚本解析失败**
   - 检查 JavaScript 语法
   - 确保函数定义格式正确
   - 验证 JSDoc 注释格式

### 调试命令

```bash
# 重新加载脚本
reload_scripts

# 查看帮助（包含自定义函数）
help()

# 查看任务状态
tasks

# 测试函数存在
typeof functionName
```

## 📁 项目结构

```
fridac/
├── scripts/                     # 自定义脚本目录
│   ├── crypto_detector.js       # 示例：加密检测
│   ├── network_monitor.js       # 示例：网络监控
│   └── your_custom_script.js    # 您的自定义脚本
├── fridac_core/
│   ├── custom_scripts.py        # 自定义脚本管理器
│   ├── script_manager.py        # 脚本加载集成
│   ├── session.py              # 命令处理集成
│   ├── completer.py            # Tab补全集成
│   └── ...
└── test_custom_scripts.py      # 功能测试脚本
```

## 🎉 总结

fridac 的自定义脚本功能让您能够：

- ✅ 轻松创建和管理自定义 Hook 函数
- ✅ 享受完整的 IDE 级别的开发体验（Tab补全、帮助、任务管理）
- ✅ 无缝集成到现有的 fridac 工作流中
- ✅ 实现代码重用和团队共享
- ✅ 快速迭代和调试

开始创建您的第一个自定义脚本，扩展 fridac 的功能吧！

---

**💡 提示**：查看 `scripts/` 目录中的示例脚本，它们展示了各种高级技术和最佳实践。
