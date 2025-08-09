/**
 * fridacli 通用Hook取消示例
 * 展示如何处理不同类型的Hook
 */

// ========== 1. 标准implementation Hook ==========
function hookWithImplementation(className, methodName, showStack) {
    var taskId = HookJobManager.autoRegisterHook('hookWithImplementation', [className, methodName, showStack]);
    
    try {
        var targetClass = Java.use(className);
        var targetMethod = targetClass[methodName];
        
        // 保存原始实现
        HookJobManager.registerHookMethod(taskId, {
            type: 'implementation',
            target: targetMethod,
            original: targetMethod.implementation,
            description: className + "." + methodName + "()"
        });
        
        // 设置新实现
        targetMethod.implementation = function() {
            if (showStack) {
                LOG("🎯 " + className + "." + methodName + " 被调用", { c: Color.Cyan });
            }
            return this[methodName].apply(this, arguments);
        };
        
        return taskId;
    } catch (e) {
        LOG("❌ Hook失败: " + e.message, { c: Color.Red });
        return null;
    }
}

// ========== 2. Interceptor Hook ==========
function hookWithInterceptor(address, showStack) {
    var taskId = HookJobManager.autoRegisterHook('hookWithInterceptor', [address, showStack]);
    
    try {
        var interceptor = Interceptor.attach(ptr(address), {
            onEnter: function(args) {
                if (showStack) {
                    LOG("🔧 Interceptor Hook 被触发", { c: Color.Cyan });
                    LOG("地址: " + address, { c: Color.Yellow });
                }
            }
        });
        
        // 注册Interceptor到任务管理器
        HookJobManager.registerHookMethod(taskId, {
            type: 'interceptor',
            interceptor: interceptor
        });
        
        return taskId;
    } catch (e) {
        LOG("❌ Interceptor Hook失败: " + e.message, { c: Color.Red });
        return null;
    }
}

// ========== 3. 自定义Hook（需要特殊取消逻辑）==========
function hookWithCustomCancel(customLogic, showStack) {
    var taskId = HookJobManager.autoRegisterHook('hookWithCustomCancel', [showStack]);
    
    var isActive = true;
    
    try {
        // 执行自定义Hook逻辑
        customLogic(function() {
            if (isActive && showStack) {
                LOG("🔥 自定义Hook被触发", { c: Color.Cyan });
            }
        });
        
        // 注册自定义取消处理器
        HookJobManager.registerHookMethod(taskId, {
            type: 'custom',
            cancelHandler: function() {
                isActive = false;
                LOG("🔥 自定义Hook已停用", { c: Color.Yellow });
                // 这里可以执行任何自定义的清理逻辑
            }
        });
        
        return taskId;
    } catch (e) {
        LOG("❌ 自定义Hook失败: " + e.message, { c: Color.Red });
        return null;
    }
}

// ========== 4. 复合Hook（多种Hook类型组合）==========
function hookComplex(className, methodName, showStack) {
    var taskId = HookJobManager.autoRegisterHook('hookComplex', [className, methodName, showStack]);
    
    try {
        var targetClass = Java.use(className);
        var targetMethod = targetClass[methodName];
        
        // 1. 保存原始implementation
        HookJobManager.registerHookMethod(taskId, {
            type: 'implementation',
            target: targetMethod,
            original: targetMethod.implementation,
            description: className + "." + methodName + "()"
        });
        
        // 2. 如果有native实现，同时Hook native层
        if (targetMethod.implementation && targetMethod.implementation.toString().includes('native')) {
            try {
                var nativeAddr = Module.findExportByName(null, methodName);
                if (nativeAddr) {
                    var interceptor = Interceptor.attach(nativeAddr, {
                        onEnter: function(args) {
                            LOG("🔧 Native层也被Hook", { c: Color.Blue });
                        }
                    });
                    
                    HookJobManager.registerHookMethod(taskId, {
                        type: 'interceptor',
                        interceptor: interceptor
                    });
                }
            } catch (e) {
                LOG("⚠️  Native Hook失败，继续Java Hook: " + e.message, { c: Color.Yellow });
            }
        }
        
        // 3. 自定义清理逻辑
        var customState = { active: true };
        HookJobManager.registerHookMethod(taskId, {
            type: 'custom',
            cancelHandler: function() {
                customState.active = false;
                LOG("🧹 复合Hook自定义清理完成", { c: Color.Green });
            }
        });
        
        // 4. 设置Java Hook
        targetMethod.implementation = function() {
            if (customState.active && showStack) {
                LOG("🎯 复合Hook: " + className + "." + methodName, { c: Color.Cyan });
            }
            return this[methodName].apply(this, arguments);
        };
        
        return taskId;
    } catch (e) {
        LOG("❌ 复合Hook失败: " + e.message, { c: Color.Red });
        return null;
    }
}

// 导出函数
global.hookWithImplementation = hookWithImplementation;
global.hookWithInterceptor = hookWithInterceptor;
global.hookWithCustomCancel = hookWithCustomCancel;
global.hookComplex = hookComplex;

LOG("🚀 通用Hook取消机制已加载", { c: Color.Green });
