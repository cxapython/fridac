/**
 * Intent/Activity/Service 监控（修复Extras解析错误版）
 * @description 解决"invalid 'instanceof' right operand"问题，仅输出日志无上报
 */
function monitorIntents(options) {
    options = options || {};
    const filter = options.filter ? String(options.filter) : null;
    const enableLifecycle = !!options.lifecycle;
    const LOG_PREFIX = "[Intent监控]";

    // 统一日志函数
    function LOG(msg, opts = {}) {
        const colorMap = {
            Cyan: '\x1b[36m',
            Gray: '\x1b[90m',
            Blue: '\x1b[34m',
            Green: '\x1b[32m',
            Red: '\x1b[31m',
            Reset: '\x1b[0m'
        };
        const color = opts.c ? colorMap[opts.c] || '' : '';
        console.log(`${LOG_PREFIX} ${color}${msg}${colorMap.Reset}`);
    }

    // 提前获取常用Java类（避免重复调用Java.use）
    let BundleClass = null;
    let IntentClass = null;
    try {
        BundleClass = Java.use('android.os.Bundle');
        IntentClass = Java.use('android.content.Intent');
    } catch (e) {
        LOG(`提前加载Java类失败: ${e.message}`, { c: 'Red' });
    }

    // 解析Intent信息
    function parseIntent(intent) {
        if (!intent) return null;
        try {
            return {
                action: intent.getAction() || '',
                data: intent.getDataString() || '',
                component: intent.getComponent() ? intent.getComponent().flattenToString() : '',
                flags: intent.getFlags() || 0,
                extras: parseExtras(intent.getExtras())
            };
        } catch (e) {
            LOG(`解析Intent失败: ${e.message}`, { c: 'Red' });
            return null;
        }
    }

    // 修复Extras解析：替换instanceof为Frida兼容的类型判断
    function parseExtras(bundle) {
        const extras = {};
        // 前置校验：bundle为空或非Bundle类型直接返回
        if (!bundle || !BundleClass) return extras;

        try {
            // 关键修复：用Java.cast判断是否为Bundle类型（避免instanceof错误）
            let isBundle = false;
            try {
                // 尝试将对象转为Bundle，成功则为Bundle类型
                Java.cast(bundle, BundleClass);
                isBundle = true;
            } catch (e) {
                isBundle = false;
            }
            if (!isBundle) return extras;

            // 正常解析Bundle中的key
            const keySet = bundle.keySet();
            const iterator = keySet.iterator();
            while (iterator.hasNext()) {
                const key = iterator.next();
                let value = null;
                // 捕获单个key的解析错误，避免影响整体解析
                try {
                    value = bundle.get(key);

                    // 处理空值
                    if (value === null) {
                        extras[key] = 'null';
                        continue;
                    }

                    // 处理Bundle类型（递归解析）
                    let isSubBundle = false;
                    try {
                        Java.cast(value, BundleClass);
                        isSubBundle = true;
                    } catch (e) {
                        isSubBundle = false;
                    }
                    if (isSubBundle) {
                        extras[key] = '[Bundle] ' + JSON.stringify(parseExtras(value));
                        continue;
                    }

                    // 处理Intent类型
                    let isIntent = false;
                    try {
                        if (IntentClass) {
                            Java.cast(value, IntentClass);
                            isIntent = true;
                        }
                    } catch (e) {
                        isIntent = false;
                    }
                    if (isIntent) {
                        const subIntentInfo = parseIntent(value);
                        extras[key] = '[Intent] ' + JSON.stringify(subIntentInfo || 'unknown');
                        continue;
                    }

                    // 其他普通类型：直接转字符串（增加异常捕获）
                    try {
                        extras[key] = String(value);
                    } catch (e) {
                        extras[key] = '[UnsupportedType] ' + value.getClass().getName();
                    }
                } catch (e) {
                    extras[key] = '[ParseError] ' + e.message;
                    LOG(`解析Extras key=${key}失败: ${e.message}`, { c: 'Red' });
                }
            }
        } catch (e) {
            LOG(`解析Extras整体失败: ${e.message}`, { c: 'Red' });
        }
        return extras;
    }

    // 输出Intent日志
    function dumpIntent(prefix, intent) {
        const intentInfo = parseIntent(intent);
        if (!intentInfo) return;

        const logLine = `${prefix} | action=${intentInfo.action} | data=${intentInfo.data} | component=${intentInfo.component} | flags=0x${intentInfo.flags.toString(16)} | extras=${JSON.stringify(intentInfo.extras)}`;

        // 过滤逻辑
        if (filter) {
            const matchStr = `${intentInfo.action}${intentInfo.data}${intentInfo.component}${JSON.stringify(intentInfo.extras)}`;
            if (matchStr.indexOf(filter) === -1) return;
        }

        LOG(logLine, { c: 'Cyan' });
    }

    try {
        Java.perform(function () {
            // 1. Hook ContextWrapper（覆盖Activity/Service）
            const ContextWrapper = Java.use('android.content.ContextWrapper');
            if (ContextWrapper) {
                LOG("已找到 ContextWrapper 类，开始Hook Intent相关方法", { c: 'Green' });

                // 1.1 startActivity 所有重载
                const startActivityOverloads = [
                    { params: ['android.content.Intent'] },
                    { params: ['android.content.Intent', 'android.os.Bundle'] },
                    { params: ['android.content.Intent', 'java.lang.String'] }
                ];
                startActivityOverloads.forEach(({ params }) => {
                    try {
                        const method = ContextWrapper.startActivity.overload(...params);
                        method.implementation = function (intent, ...args) {
                            dumpIntent('startActivity', intent);
                            return method.call(this, intent, ...args);
                        };
                        LOG(`成功Hook ContextWrapper.startActivity(${params.join(', ')})`, { c: 'Gray' });
                    } catch (e) {
                        LOG(`Hook ContextWrapper.startActivity(${params.join(', ')})失败: ${e.message}`, { c: 'Red' });
                    }
                });

                // 1.2 startService 所有重载
                const startServiceOverloads = [
                    { params: ['android.content.Intent'] },
                    { params: ['android.content.Intent', 'java.lang.String'] }
                ];
                startServiceOverloads.forEach(({ params }) => {
                    try {
                        const method = ContextWrapper.startService.overload(...params);
                        method.implementation = function (intent, ...args) {
                            dumpIntent('startService', intent);
                            return method.call(this, intent, ...args);
                        };
                        LOG(`成功Hook ContextWrapper.startService(${params.join(', ')})`, { c: 'Gray' });
                    } catch (e) {
                        LOG(`Hook ContextWrapper.startService(${params.join(', ')})失败: ${e.message}`, { c: 'Red' });
                    }
                });

                // 1.3 startForegroundService
                try {
                    const startForegroundService = ContextWrapper.startForegroundService.overload('android.content.Intent');
                    startForegroundService.implementation = function (intent) {
                        dumpIntent('startForegroundService', intent);
                        return startForegroundService.call(this, intent);
                    };
                    LOG("成功Hook ContextWrapper.startForegroundService", { c: 'Gray' });
                } catch (e) {
                    LOG(`Hook startForegroundService失败: ${e.message}`, { c: 'Red' });
                }

                // 1.4 sendBroadcast 所有重载
                const sendBroadcastOverloads = [
                    { params: ['android.content.Intent'] },
                    { params: ['android.content.Intent', 'java.lang.String'] },
                    { params: ['android.content.Intent', 'java.lang.String', 'android.os.Bundle'] }
                ];
                sendBroadcastOverloads.forEach(({ params }) => {
                    try {
                        const method = ContextWrapper.sendBroadcast.overload(...params);
                        method.implementation = function (intent, ...args) {
                            dumpIntent('sendBroadcast', intent);
                            return method.call(this, intent, ...args);
                        };
                        LOG(`成功Hook ContextWrapper.sendBroadcast(${params.join(', ')})`, { c: 'Gray' });
                    } catch (e) {
                        LOG(`Hook ContextWrapper.sendBroadcast(${params.join(', ')})失败: ${e.message}`, { c: 'Red' });
                    }
                });

                // 1.5 registerReceiver 所有重载
                const registerReceiverOverloads = [
                    { params: ['android.content.BroadcastReceiver', 'android.content.IntentFilter'] },
                    { params: ['android.content.BroadcastReceiver', 'android.content.IntentFilter', 'int'] },
                    { params: ['android.content.BroadcastReceiver', 'android.content.IntentFilter', 'java.lang.String', 'android.os.Handler'] }
                ];
                registerReceiverOverloads.forEach(({ params }) => {
                    try {
                        const method = ContextWrapper.registerReceiver.overload(...params);
                        method.implementation = function (receiver, filterObj, ...args) {
                            const receiverCls = receiver ? receiver.getClass().getName() : 'null';
                            const filterStr = filterObj ? filterObj.toString() : 'null';
                            LOG(`registerReceiver | receiver=${receiverCls} | filter=${filterStr}`, { c: 'Gray' });
                            return method.call(this, receiver, filterObj, ...args);
                        };
                        LOG(`成功Hook ContextWrapper.registerReceiver(${params.join(', ')})`, { c: 'Gray' });
                    } catch (e) {
                        LOG(`Hook ContextWrapper.registerReceiver(${params.join(', ')})失败: ${e.message}`, { c: 'Red' });
                    }
                });

                // 1.6 startActivityForResult
                try {
                    const startActivityForResult = ContextWrapper.startActivityForResult.overload('android.content.Intent', 'int');
                    startActivityForResult.implementation = function (intent, requestCode) {
                        dumpIntent(`startActivityForResult(requestCode=${requestCode})`, intent);
                        return startActivityForResult.call(this, intent, requestCode);
                    };
                    LOG("成功Hook ContextWrapper.startActivityForResult", { c: 'Gray' });
                } catch (e) {
                    LOG(`Hook startActivityForResult失败: ${e.message}`, { c: 'Red' });
                }
            } else {
                LOG("未找到 ContextWrapper 类，尝试Hook Context", { c: 'Red' });
                const Context = Java.use('android.content.Context');
                if (Context) {
                    // 降级Hook Context（逻辑同ContextWrapper，省略重复代码）
                    try {
                        const sa = Context.startActivity.overload('android.content.Intent');
                        sa.implementation = function (intent) {
                            dumpIntent('startActivity(Context)', intent);
                            return sa.call(this, intent);
                        };
                        LOG("成功Hook Context.startActivity", { c: 'Gray' });
                    } catch (e) {
                        LOG(`Hook Context.startActivity失败: ${e.message}`, { c: 'Red' });
                    }
                }
            }

            // 2. Hook BroadcastReceiver.onReceive
            try {
                const BroadcastReceiver = Java.use('android.content.BroadcastReceiver');
                const onReceive = BroadcastReceiver.onReceive.overload('android.content.Context', 'android.content.Intent');
                onReceive.implementation = function (ctx, intent) {
                    dumpIntent('onReceive(Broadcast)', intent);
                    return onReceive.call(this, ctx, intent);
                };
                LOG("成功Hook BroadcastReceiver.onReceive", { c: 'Gray' });
            } catch (e) {
                LOG(`Hook BroadcastReceiver.onReceive失败: ${e.message}`, { c: 'Red' });
            }

            // 3. Hook Activity生命周期（支持AndroidX）
            if (enableLifecycle) {
                LOG("开始Hook Activity生命周期", { c: 'Green' });

                // 3.1 原生Activity
                const Activity = Java.use('android.app.Activity');
                hookActivityLifecycle(Activity, 'android.app.Activity');

                // 3.2 AndroidX AppCompatActivity
                try {
                    const AppCompatActivity = Java.use('androidx.appcompat.app.AppCompatActivity');
                    hookActivityLifecycle(AppCompatActivity, 'androidx.appcompat.app.AppCompatActivity');
                } catch (e) {
                    LOG("未找到 AppCompatActivity（非AndroidX项目）", { c: 'Gray' });
                }
            }

            // 辅助函数：Hook Activity生命周期
            function hookActivityLifecycle(ActivityCls, clsName) {
                const lifecycleMethods = [
                    { name: 'onCreate', params: ['android.os.Bundle'] },
                    { name: 'onStart', params: [] },
                    { name: 'onResume', params: [] },
                    { name: 'onPause', params: [] },
                    { name: 'onStop', params: [] },
                    { name: 'onDestroy', params: [] },
                    { name: 'onNewIntent', params: ['android.content.Intent'] }
                ];

                lifecycleMethods.forEach(({ name, params }) => {
                    try {
                        const method = ActivityCls[name].overload(...params);
                        method.implementation = function (...args) {
                            const currentCls = this.getClass().getName();
                            const logMsg = `Activity生命周期 | ${clsName}.${name}() | 当前类: ${currentCls}`;
                            LOG(logMsg, { c: 'Blue' });

                            // onNewIntent额外输出Intent
                            if (name === 'onNewIntent' && args[0]) {
                                dumpIntent(`onNewIntent(${currentCls})`, args[0]);
                            }

                            return method.apply(this, args);
                        };
                        LOG(`成功Hook ${clsName}.${name}(${params.join(', ')})`, { c: 'Gray' });
                    } catch (e) {
                        LOG(`Hook ${clsName}.${name}(${params.join(', ')})失败: ${e.message}`, { c: 'Red' });
                    }
                });
            }
        });

        LOG(`✅ Intent监控已启用 ${filter ? '(过滤关键词: ' + filter + ')' : ''}`, { c: 'Green' });
        return true;
    } catch (e) {
        LOG(`❌ Intent监控启动失败: ${e.message}`, { c: 'Red' });
        if (typeof TASK_ID !== 'undefined') {
            try { notifyTaskError(e); } catch (_) { }
        }
        return false;
    }
}

// 使用示例：
// monitorIntents({ lifecycle: true });
// monitorIntents({ filter: 'com.example', lifecycle: true });