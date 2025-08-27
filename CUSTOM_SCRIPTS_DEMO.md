# 🚀 fridac 自定义脚本功能演示

## 🎯 功能概述

我为您的fridac项目成功实现了完整的自定义脚本自动加载系统！这是一个强大的扩展系统，让您可以：

1. **📝 创建自定义JavaScript脚本** - 在`scripts/`目录下编写自己的Hook函数
2. **🔄 自动发现和加载** - 系统自动扫描、解析和集成您的脚本
3. **📋 完整任务管理** - 自定义函数自动支持任务系统（创建、监控、终止）
4. **🎨 智能补全** - 自定义函数自动加入Tab补全系统
5. **📚 Help集成** - 在`help()`中显示自定义函数文档
6. **🔄 热重载** - 运行时重新加载脚本，无需重启

## 🎪 实时演示

### 1. 查看已创建的示例脚本

```bash
ls scripts/
# crypto_detector.js      # 加密检测工具
# network_monitor.js      # 网络监控工具
```

### 2. 启动fridac并体验

```bash
./fridac -p com.example.app

# 🎯 查看自定义函数帮助
fridac> help()
# 会看到：
# 🔧 自定义函数:
#   hookAllCrypto() - 自定义: Hook应用的所有加密相关方法
#     示例: hookAllCrypto(true)
#   findSensitiveStrings() - 自定义: 在内存中搜索包含敏感信息的字符串
#     示例: findSensitiveStrings(['password', 'token', 'secret'])
#   monitorAllNetworkRequests() - 自定义: 监控所有HTTP请求并分析请求模式
#     示例: monitorAllNetworkRequests(true)

# 🎨 体验Tab补全
fridac> hook<TAB>
# 会显示包括自定义函数在内的所有可用函数

# 🎯 执行自定义函数（自动创建任务）
fridac> hookAllCrypto(true)
🎯 执行自定义函数: hookAllCrypto
✅ 自定义函数任务已创建: #3

# 📋 查看任务
fridac> tasks
ID  类型         状态     目标           创建时间
3   custom_hook  running  hookAllCrypto  20:30:15

# 🔄 重新加载脚本
fridac> reload_scripts
🔄 已重新加载 2 个自定义脚本
✅ 补全器已更新
```

### 3. 创建您的第一个自定义脚本

创建 `scripts/my_tools.js`：

```javascript
/**
 * 我的自定义工具集
 * @description 个人定制的Hook工具
 */

/**
 * 监控登录活动
 * @description 自动检测和监控所有登录相关的方法调用
 * @example monitorLogin(true)
 * @param {boolean} showDetails - 是否显示详细信息
 */
function monitorLogin(showDetails) {
    showDetails = showDetails || false;
    
    try {
        LOG("🔐 开始监控登录活动...", { c: Color.Cyan });
        
        // Hook常见的登录方法
        var patterns = ['login', 'signin', 'auth', 'verify'];
        var hookedCount = 0;
        
        Java.enumerateLoadedClassesSync().forEach(function(className) {
            if (className.indexOf('com.example') === 0) { // 只Hook应用类
                patterns.forEach(function(pattern) {
                    if (className.toLowerCase().indexOf(pattern) !== -1) {
                        try {
                            var clazz = Java.use(className);
                            var methods = clazz.class.getDeclaredMethods();
                            
                            methods.forEach(function(method) {
                                var methodName = method.getName();
                                if (clazz[methodName]) {
                                    clazz[methodName].implementation = function() {
                                        LOG("🎯 登录方法: " + className + "." + methodName, { c: Color.Yellow });
                                        
                                        if (showDetails && arguments.length > 0) {
                                            LOG("  参数: " + Array.prototype.slice.call(arguments).join(', '), { c: Color.White });
                                        }
                                        
                                        notifyTaskHit({
                                            operation: "login_activity",
                                            class: className,
                                            method: methodName,
                                            args_count: arguments.length
                                        });
                                        
                                        return this[methodName].apply(this, arguments);
                                    };
                                    hookedCount++;
                                }
                            });
                        } catch (e) {
                            // 忽略无法访问的类
                        }
                    }
                });
            }
        });
        
        LOG("✅ 成功Hook " + hookedCount + " 个登录相关方法", { c: Color.Green });
        return hookedCount;
        
    } catch (error) {
        LOG("❌ 监控登录失败: " + error.message, { c: Color.Red });
        if (typeof TASK_ID !== 'undefined') {
            notifyTaskError(error);
        }
        return 0;
    }
}
```

然后在fridac中：

```bash
fridac> reload_scripts
🔄 已重新加载 3 个自定义脚本

fridac> monitorLogin(true)
🎯 执行自定义函数: monitorLogin
✅ 自定义函数任务已创建: #4
```

## 🏗️ 实现架构

我创建了以下核心组件：

### 1. CustomScriptManager (`fridac_core/custom_scripts.py`)
- 📁 自动扫描`scripts/`目录
- 🔍 解析JavaScript函数和JSDoc注释
- 🔄 支持热重载和动态更新
- 📊 提供统计信息和状态管理

### 2. Script Manager集成 (`script_manager.py`)
- 🔗 将自定义脚本集成到主脚本加载流程
- 📤 生成RPC导出代码
- 🎯 在help系统中显示自定义函数

### 3. Session处理 (`session.py`)
- ⌨️ 处理自定义函数命令
- 📋 集成任务管理系统
- 🔄 支持脚本重载命令

### 4. 智能补全 (`completer.py`)
- 🎨 自动添加自定义函数到Tab补全
- 🔄 支持动态更新补全列表
- 📝 显示函数描述和示例

### 5. 任务模板支持 (`script_templates.py`)
- 🛠️ 支持自定义脚本的任务模板生成
- 📋 完整的任务生命周期管理

## 🎊 测试结果

所有功能都通过了全面测试：

```bash
python3 test_custom_scripts.py
# 🚀 开始fridac自定义脚本功能测试
# ✅ Scripts目录自动创建成功
# ✅ 示例脚本自动创建成功
# ✅ 解析到 3 个函数
# ✅ 脚本导入代码生成成功
# ✅ RPC导出代码生成成功
# ✅ 帮助信息生成成功
# ✅ 新脚本动态加载成功
# ✅ 脚本重载功能正常
# ✅ 统计信息正确
# 🎉 所有测试通过！自定义脚本功能已就绪
```

## 🎁 开箱即用的示例

我已经为您创建了两个强大的示例脚本：

### 1. `crypto_detector.js` - 加密检测工具
```javascript
hookAllCrypto(true)           // Hook所有加密操作
findSensitiveStrings(['key']) // 搜索敏感字符串
monitorSensitiveNetwork()     // 监控敏感网络数据
```

### 2. `network_monitor.js` - 网络监控工具
```javascript
monitorAllNetworkRequests(true)    // 全面网络监控
detectSSLBypass()                   // SSL绕过检测
quickNetworkSecurityAssessment()   // 网络安全评估
```

## 🚀 立即开始使用

1. **查看示例**：
   ```bash
   cat scripts/crypto_detector.js
   cat scripts/network_monitor.js
   ```

2. **启动fridac**：
   ```bash
   ./fridac -p your.app.package
   ```

3. **体验功能**：
   ```bash
   fridac> help()                    # 查看所有函数包括自定义的
   fridac> hookAllCrypto(true)       # 执行自定义函数
   fridac> tasks                     # 查看任务状态
   fridac> reload_scripts            # 重新加载脚本
   ```

4. **创建自己的脚本**：
   ```bash
   touch scripts/my_custom_script.js
   # 编写您的函数...
   fridac> reload_scripts
   ```

## 🎯 核心优势

- ✅ **零配置** - 创建脚本即可使用，无需配置
- ✅ **完全集成** - 享受与内置函数相同的体验
- ✅ **专业级** - 任务管理、错误处理、状态监控
- ✅ **开发友好** - Tab补全、帮助文档、热重载
- ✅ **可扩展** - 强大的API和工具函数支持
- ✅ **向下兼容** - 不影响现有功能

## 📖 文档

- 📘 [`CUSTOM_SCRIPTS_GUIDE.md`](CUSTOM_SCRIPTS_GUIDE.md) - 完整的用户指南
- 🧪 [`test_custom_scripts.py`](test_custom_scripts.py) - 功能测试和验证
- 💡 [`scripts/`](scripts/) - 示例脚本和模板

---

🎉 **恭喜！您的fridac现在拥有了强大的自定义脚本功能！**

这个功能让fridac从一个工具变成了一个平台，您可以在此基础上构建自己的Hook工具生态系统。开始创建您的第一个自定义脚本吧！
