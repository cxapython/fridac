# 🔧 fridac 自定义脚本指南

## 快速开始

在 `scripts/` 目录创建 `.js` 文件，系统自动加载。

### 示例脚本

```javascript
/**
 * 监控登录方法
 * @description 自动Hook所有包含'login'关键词的方法
 * @example hookLoginMethods(true)
 * @param {boolean} showStack - 是否显示调用栈
 */
function hookLoginMethods(showStack) {
    showStack = showStack || false;
    
    try {
        LOG("🔍 开始扫描登录相关方法...", { c: Color.Cyan });
        var hookedCount = 0;
        
        Java.enumerateLoadedClassesSync().forEach(function(className) {
            if (className.toLowerCase().indexOf('login') !== -1) {
                try {
                    var clazz = Java.use(className);
                    var methods = clazz.class.getDeclaredMethods();
                    
                    methods.forEach(function(method) {
                        var methodName = method.getName();
                        try {
                            clazz[methodName].implementation = function() {
                                LOG("🎯 登录方法: " + className + "." + methodName, { c: Color.Yellow });
                                if (showStack) printStack();
                                notifyTaskHit({ operation: "login", class: className, method: methodName });
                                return this[methodName].apply(this, arguments);
                            };
                            hookedCount++;
                        } catch (e) {}
                    });
                } catch (e) {}
            }
        });
        
        LOG("✅ Hook了 " + hookedCount + " 个方法", { c: Color.Green });
        return hookedCount;
    } catch (error) {
        LOG("❌ 失败: " + error.message, { c: Color.Red });
        if (typeof TASK_ID !== 'undefined') notifyTaskError(error);
        return 0;
    }
}
```

## JSDoc 格式

```javascript
/**
 * 函数简短描述（必需）
 * @description 详细描述（推荐）
 * @example functionName(param1)（推荐）
 * @param {type} paramName - 参数描述（可选）
 */
function functionName(param1) {
    // 实现
}
```

## 内置工具

```javascript
// 日志输出
LOG("消息", { c: Color.Green });

// 调用栈
printStack();

// 任务通知
notifyTaskHit({ operation: "my_op", data: "..." });
notifyTaskError(error);

// 颜色：Color.Red, Green, Blue, Yellow, Cyan, White, Gray
```

## 使用流程

```bash
# 创建脚本后重载
fridac> reload_scripts

# 执行函数
fridac> myFunction(arg1)

# 查看任务
fridac> tasks

# 终止任务
fridac> kill 1
```

## 目录结构

```
scripts/
├── security/       # 安全相关
│   ├── ssl_bypass.js
│   └── anti_anti_debug.js
├── monitor/        # 监控工具
│   ├── intent_monitor.js
│   └── websocket_monitor.js
└── tools/          # 实用工具
    ├── dex_dump.js
    └── jni_register_natives_trace.js
```

## 故障排除

| 问题 | 解决方案 |
|------|---------|
| 函数未显示 | 检查 JSDoc 格式，运行 `reload_scripts` |
| 任务创建失败 | 检查语法错误 |
| 补全缺失 | 运行 `reload_scripts` 更新 |
