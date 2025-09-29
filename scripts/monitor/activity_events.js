/**
 * Activity 生命周期监控（修复增强版）
 * @description 监控 onCreate/onStart/onResume/onPause/onStop/onDestroy，兼容原生Activity和AndroidX，支持堆栈打印
 * @example monitorActivityEvents({ stack: false })
 */
function monitorActivityEvents(options) {
    options = options || {};
    const showStack = !!options.stack;
    const LOG_PREFIX = "[Activity生命周期]";

    // 统一日志函数（处理颜色输出）
    function LOG(msg, opts = {}) {
        const colorMap = {
            Blue: '\x1b[34m',
            Green: '\x1b[32m',
            Red: '\x1b[31m',
            Reset: '\x1b[0m'
        };
        const color = opts.c ? colorMap[opts.c] || '' : '';
        console.log(`${LOG_PREFIX} ${color}${msg}${colorMap.Reset}`);
    }

    // 打印调用堆栈（增强版）
    function printStack() {
        try {
            const stackTrace = Java.use('java.lang.Thread').currentThread().getStackTrace();
            LOG("  调用堆栈:", { c: 'Blue' });
            for (let i = 3; i < stackTrace.length && i < 10; i++) { // 跳过前3行无关堆栈
                const frame = stackTrace[i];
                LOG(`  ${i - 2}. ${frame.getClassName()}.${frame.getMethodName()}(${frame.getFileName()}:${frame.getLineNumber()})`, { c: 'Blue' });
            }
        } catch (e) {
            LOG(`  打印堆栈失败: ${e.message}`, { c: 'Red' });
        }
    }

    // 通用Hook生命周期方法的函数
    function hookLifecycle(ActivityCls, className) {
        const lifecycleMethods = [
            { name: 'onCreate', params: ['android.os.Bundle'] },
            { name: 'onStart', params: [] },
            { name: 'onResume', params: [] },
            { name: 'onPause', params: [] },
            { name: 'onStop', params: [] },
            { name: 'onDestroy', params: [] }
        ];

        lifecycleMethods.forEach(({ name, params }) => {
            try {
                // 修复方法签名：使用正确的参数类型数组
                const method = ActivityCls[name].overload(...params);
                method.implementation = function (...args) {
                    try {
                        // 获取当前Activity的实际类名（可能是子类）
                        const currentCls = this.getClass().getName();
                        LOG(`${name} | 类名: ${currentCls} (基类: ${className})`, { c: 'Blue' });
                        
                        // 可选打印堆栈
                        if (showStack) {
                            printStack();
                        }
                    } catch (e) {
                        LOG(`${name} 日志处理失败: ${e.message}`, { c: 'Red' });
                    }
                    // 调用原方法，传递所有参数
                    return method.apply(this, args);
                };
                LOG(`成功Hook ${className}.${name}`, { c: 'Green' });
            } catch (e) {
                LOG(`Hook ${className}.${name}失败: ${e.message}`, { c: 'Red' });
            }
        });
    }

    try {
        Java.perform(function () {
            // 1. Hook原生Activity（android.app.Activity）
            try {
                const Activity = Java.use('android.app.Activity');
                hookLifecycle(Activity, 'android.app.Activity');
            } catch (e) {
                LOG("原生Activity类Hook失败，可能不支持该系统版本", { c: 'Red' });
            }

            // 2. 补充Hook AndroidX的AppCompatActivity（主流应用常用）
            try {
                const AppCompatActivity = Java.use('androidx.appcompat.app.AppCompatActivity');
                hookLifecycle(AppCompatActivity, 'androidx.appcompat.app.AppCompatActivity');
            } catch (e) {
                LOG("未找到AppCompatActivity（非AndroidX应用，忽略）", { c: 'Blue' });
            }

            // 3. 补充Hook FragmentActivity（AndroidX中常用的带Fragment支持的Activity）
            try {
                const FragmentActivity = Java.use('androidx.fragment.app.FragmentActivity');
                hookLifecycle(FragmentActivity, 'androidx.fragment.app.FragmentActivity');
            } catch (e) {
                LOG("未找到FragmentActivity（无需处理）", { c: 'Blue' });
            }
        });

        LOG("✅ Activity生命周期监控已启用", { c: 'Green' });
        return true;
    } catch (e) {
        LOG(`❌ Activity生命周期监控启动失败: ${e.message}`, { c: 'Red' });
        if (typeof TASK_ID !== 'undefined') {
            try { notifyTaskError(e); } catch (_) { }
        }
        return false;
    }
}

// 使用示例：
// 基础监控：monitorActivityEvents()
// 显示调用堆栈：monitorActivityEvents({ stack: true })