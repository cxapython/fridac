/**
 * fridacli 任务管理命令接口
 * 提供用户友好的任务管理命令
 */

/**
 * 显示所有活跃的 Hook 任务
 * @param {string} statusFilter - 可选的状态过滤器 ('active', 'paused', 'failed' 等)
 */
function jobs(statusFilter) {
    if (typeof HookJobManager === 'undefined') {
        LOG("❌ 任务管理器未初始化", { c: Color.Red });
        return;
    }
    
    HookJobManager.showJobs(statusFilter);
}

/**
 * 显示任务详细信息
 * @param {number} jobId - 任务 ID
 */
function job(jobId) {
    if (typeof HookJobManager === 'undefined') {
        LOG("❌ 任务管理器未初始化", { c: Color.Red });
        return;
    }
    
    if (typeof jobId === 'undefined') {
        LOG("❌ 请提供任务 ID，例如: job(1)", { c: Color.Red });
        return;
    }
    
    HookJobManager.showJobDetails(parseInt(jobId));
}

/**
 * 取消指定的 Hook 任务
 * @param {number} jobId - 任务 ID
 */
function kill(jobId) {
    if (typeof HookJobManager === 'undefined') {
        LOG("❌ 任务管理器未初始化", { c: Color.Red });
        return false;
    }
    
    if (typeof jobId === 'undefined') {
        LOG("❌ 请提供任务 ID，例如: kill(1)", { c: Color.Red });
        return false;
    }
    
    var job = HookJobManager.getJob(parseInt(jobId));
    if (job && job.options.autoTracked) {
        LOG("🎯 正在取消自动追踪任务 #" + jobId, { c: Color.Cyan });
    }
    
    return HookJobManager.killJob(parseInt(jobId));
}

/**
 * 取消所有 Hook 任务
 * @param {string} typeFilter - 可选的类型过滤器
 */
function killall(typeFilter) {
    if (typeof HookJobManager === 'undefined') {
        LOG("❌ 任务管理器未初始化", { c: Color.Red });
        return 0;
    }
    
    var confirm = true;
    if (!typeFilter) {
        LOG("⚠️  确定要取消所有任务吗？这将停止所有活跃的 Hook！", { c: Color.Yellow });
        LOG("💡 提示: 使用 killall('method_hook') 可以只取消特定类型的任务", { c: Color.Blue });
        // 在真实环境中，这里可以添加确认提示
    }
    
    if (confirm) {
        return HookJobManager.killAllJobs(typeFilter);
    }
    return 0;
}

/**
 * 暂停指定的 Hook 任务
 * @param {number} jobId - 任务 ID
 */
function pause(jobId) {
    if (typeof HookJobManager === 'undefined') {
        LOG("❌ 任务管理器未初始化", { c: Color.Red });
        return false;
    }
    
    if (typeof jobId === 'undefined') {
        LOG("❌ 请提供任务 ID，例如: pause(1)", { c: Color.Red });
        return false;
    }
    
    return HookJobManager.pauseJob(parseInt(jobId));
}

/**
 * 恢复指定的 Hook 任务
 * @param {number} jobId - 任务 ID
 */
function resume(jobId) {
    if (typeof HookJobManager === 'undefined') {
        LOG("❌ 任务管理器未初始化", { c: Color.Red });
        return false;
    }
    
    if (typeof jobId === 'undefined') {
        LOG("❌ 请提供任务 ID，例如: resume(1)", { c: Color.Red });
        return false;
    }
    
    return HookJobManager.resumeJob(parseInt(jobId));
}

/**
 * 显示任务统计信息
 */
function jobstats() {
    if (typeof HookJobManager === 'undefined') {
        LOG("❌ 任务管理器未初始化", { c: Color.Red });
        return;
    }
    
    HookJobManager.showStatistics();
}

/**
 * 显示任务历史记录
 * @param {number} limit - 显示数量限制，默认 20
 */
function history(limit) {
    if (typeof HookJobManager === 'undefined') {
        LOG("❌ 任务管理器未初始化", { c: Color.Red });
        return;
    }
    
    HookJobManager.showHistory(limit || 20);
}

/**
 * 清理已完成的任务
 */
function cleanup() {
    if (typeof HookJobManager === 'undefined') {
        LOG("❌ 任务管理器未初始化", { c: Color.Red });
        return 0;
    }
    
    return HookJobManager.cleanup();
}

/**
 * 导出任务配置
 */
function exportJobs() {
    if (typeof HookJobManager === 'undefined') {
        LOG("❌ 任务管理器未初始化", { c: Color.Red });
        return null;
    }
    
    var exportData = HookJobManager.exportJobs();
    LOG("📋 任务配置已导出:", { c: Color.Green });
    LOG(exportData, { c: Color.White });
    return exportData;
}

/**
 * 增强版 traceMethod - 带任务管理
 * @param {string} targetMethodName - 完整的方法名
 * @param {boolean} enableStackTrace - 是否显示调用栈
 * @param {any} customReturnValue - 自定义返回值
 * @returns {number} 任务 ID
 */
function traceMethodWithJob(targetMethodName, enableStackTrace, customReturnValue) {
    enableStackTrace = enableStackTrace || false;
    
    // 创建任务
    var jobId = HookJobManager.createJob(
        HookJobManager.JobType.METHOD_HOOK,
        targetMethodName,
        { 
            enableStackTrace: enableStackTrace, 
            customReturnValue: customReturnValue 
        },
        function() {
            // 调用原始的 hookJavaMethodWithTracing 函数
            if (typeof hookJavaMethodWithTracing !== 'undefined') {
                return hookJavaMethodWithTracing(targetMethodName, enableStackTrace, customReturnValue);
            } else {
                throw new Error("hookJavaMethodWithTracing 函数不可用");
            }
        }
    );
    
    // 执行任务
    if (HookJobManager.executeJob(jobId)) {
        LOG("🎯 方法 Hook 任务 #" + jobId + " 已启动: " + targetMethodName, { c: Color.Green });
        return jobId;
    } else {
        return null;
    }
}

/**
 * 增强版 traceClass - 带任务管理
 * @param {string} className - 类名
 * @returns {number} 任务 ID
 */
function traceClassWithJob(className) {
    // 创建任务
    var jobId = HookJobManager.createJob(
        HookJobManager.JobType.CLASS_HOOK,
        className,
        {},
        function() {
            // 调用原始的 hookAllMethodsInJavaClass 函数
            if (typeof hookAllMethodsInJavaClass !== 'undefined') {
                return hookAllMethodsInJavaClass(className);
            } else {
                throw new Error("hookAllMethodsInJavaClass 函数不可用");
            }
        }
    );
    
    // 执行任务
    if (HookJobManager.executeJob(jobId)) {
        LOG("🏛️ 类 Hook 任务 #" + jobId + " 已启动: " + className, { c: Color.Green });
        return jobId;
    } else {
        return null;
    }
}

/**
 * 增强版 advancedMethodTracing - 带任务管理
 * @param {string} methodName - 方法名
 * @param {boolean} enableFieldInspection - 是否启用字段检查
 * @param {boolean} enableColorOutput - 是否启用彩色输出
 * @returns {number} 任务 ID
 */
function advancedMethodTracingWithJob(methodName, enableFieldInspection, enableColorOutput) {
    enableFieldInspection = enableFieldInspection || false;
    enableColorOutput = enableColorOutput || true;
    
    // 创建任务
    var jobId = HookJobManager.createJob(
        HookJobManager.JobType.ADVANCED_HOOK,
        methodName,
        { 
            enableFieldInspection: enableFieldInspection, 
            enableColorOutput: enableColorOutput 
        },
        function() {
            // 调用原始的 advancedMethodTracing 函数
            if (typeof advancedMethodTracing !== 'undefined') {
                return advancedMethodTracing(methodName, enableFieldInspection, enableColorOutput);
            } else {
                throw new Error("advancedMethodTracing 函数不可用");
            }
        }
    );
    
    // 执行任务
    if (HookJobManager.executeJob(jobId)) {
        LOG("🔥 高级 Hook 任务 #" + jobId + " 已启动: " + methodName, { c: Color.Green });
        return jobId;
    } else {
        return null;
    }
}

/**
 * 增强版 batchHookWithFilters - 带任务管理
 * @param {string} whitelistPattern - 白名单模式
 * @param {string} blacklistPattern - 黑名单模式
 * @param {string} targetClassForLoader - 目标类名
 * @returns {number} 任务 ID
 */
function batchHookWithJob(whitelistPattern, blacklistPattern, targetClassForLoader) {
    // 创建任务
    var jobId = HookJobManager.createJob(
        HookJobManager.JobType.BATCH_HOOK,
        "批量Hook: " + whitelistPattern + " (排除: " + (blacklistPattern || "无") + ")",
        { 
            whitelistPattern: whitelistPattern, 
            blacklistPattern: blacklistPattern,
            targetClassForLoader: targetClassForLoader
        },
        function() {
            // 调用原始的 batchHookWithFilters 函数
            if (typeof batchHookWithFilters !== 'undefined') {
                return batchHookWithFilters(whitelistPattern, blacklistPattern, targetClassForLoader);
            } else {
                throw new Error("batchHookWithFilters 函数不可用");
            }
        }
    );
    
    // 执行任务
    if (HookJobManager.executeJob(jobId)) {
        LOG("📦 批量 Hook 任务 #" + jobId + " 已启动", { c: Color.Green });
        return jobId;
    } else {
        return null;
    }
}

/**
 * 创建定位Hook任务
 * @param {string} hookType - Hook类型
 * @param {Array} args - Hook参数
 * @returns {number} 任务 ID
 */
function createLocationHookJob(hookType, args) {
    var target = hookType + "(" + (args || []).join(", ") + ")";
    
    // 创建任务
    var jobId = HookJobManager.createJob(
        HookJobManager.JobType.LOCATION_HOOK,
        target,
        { hookType: hookType, args: args },
        function() {
            // 根据类型调用相应的Hook函数
            switch (hookType) {
                case 'hookBase64':
                    if (typeof hookBase64 !== 'undefined') {
                        return hookBase64.apply(null, args);
                    }
                    break;
                case 'hookToast':
                    if (typeof hookToast !== 'undefined') {
                        return hookToast.apply(null, args);
                    }
                    break;
                case 'hookJSONObject':
                    if (typeof hookJSONObject !== 'undefined') {
                        return hookJSONObject.apply(null, args);
                    }
                    break;
                // 可以继续添加更多定位Hook类型
                default:
                    throw new Error("未知的定位Hook类型: " + hookType);
            }
            throw new Error(hookType + " 函数不可用");
        }
    );
    
    // 执行任务
    if (HookJobManager.executeJob(jobId)) {
        LOG("📍 定位 Hook 任务 #" + jobId + " 已启动: " + target, { c: Color.Green });
        return jobId;
    } else {
        return null;
    }
}

/**
 * 创建Native Hook任务
 * @param {string} hookType - Hook类型
 * @param {Array} args - Hook参数
 * @returns {number} 任务 ID
 */
function createNativeHookJob(hookType, args) {
    var target = hookType + "(" + (args || []).join(", ") + ")";
    
    // 创建任务
    var jobId = HookJobManager.createJob(
        HookJobManager.JobType.NATIVE_HOOK,
        target,
        { hookType: hookType, args: args },
        function() {
            // 根据类型调用相应的Native Hook函数
            switch (hookType) {
                case 'nativeHookCryptoFunctions':
                    if (typeof nativeHookCryptoFunctions !== 'undefined') {
                        return nativeHookCryptoFunctions.apply(null, args);
                    }
                    break;
                case 'nativeHookNetworkFunctions':
                    if (typeof nativeHookNetworkFunctions !== 'undefined') {
                        return nativeHookNetworkFunctions.apply(null, args);
                    }
                    break;
                // 可以继续添加更多Native Hook类型
                default:
                    throw new Error("未知的Native Hook类型: " + hookType);
            }
            throw new Error(hookType + " 函数不可用");
        }
    );
    
    // 执行任务
    if (HookJobManager.executeJob(jobId)) {
        LOG("🔧 Native Hook 任务 #" + jobId + " 已启动: " + target, { c: Color.Green });
        return jobId;
    } else {
        return null;
    }
}

/**
 * 显示任务管理帮助
 */
function jobhelp() {
    LOG("\n📋 fridacli 任务管理系统帮助", { c: Color.Cyan });
    LOG("=" + "=".repeat(60), { c: Color.Gray });
    
    LOG("\n🔍 查看任务:", { c: Color.Green });
    LOG("  jobs()                    - 显示所有活跃任务", { c: Color.White });
    LOG("  jobs('active')            - 显示指定状态的任务", { c: Color.White });
    LOG("  job(1)                    - 显示任务详情", { c: Color.White });
    LOG("  jobstats()                - 显示任务统计信息", { c: Color.White });
    LOG("  history(20)               - 显示任务历史记录", { c: Color.White });
    
    LOG("\n🎛️ 控制任务:", { c: Color.Green });
    LOG("  kill(1)                   - 取消指定任务", { c: Color.White });
    LOG("  killall()                 - 取消所有任务", { c: Color.White });
    LOG("  killall('method_hook')    - 取消指定类型的任务", { c: Color.White });
    LOG("  pause(1)                  - 暂停任务", { c: Color.White });
    LOG("  resume(1)                 - 恢复任务", { c: Color.White });
    
    LOG("\n🧹 维护任务:", { c: Color.Green });
    LOG("  cleanup()                 - 清理已完成的任务", { c: Color.White });
    LOG("  exportJobs()              - 导出任务配置", { c: Color.White });
    
    LOG("\n🎯 创建托管任务:", { c: Color.Green });
    LOG("  traceMethodWithJob(method, showStack, retVal)", { c: Color.White });
    LOG("  traceClassWithJob(className)", { c: Color.White });
    LOG("  advancedMethodTracingWithJob(method, fields, color)", { c: Color.White });
    LOG("  batchHookWithJob(whitelist, blacklist, targetClass)", { c: Color.White });
    
    LOG("\n📊 任务状态:", { c: Color.Blue });
    LOG("  ⏳ pending    - 等待执行", { c: Color.Yellow });
    LOG("  ✅ active     - 正在运行", { c: Color.Green });
    LOG("  ⏸️ paused     - 已暂停", { c: Color.Blue });
    LOG("  ✔️ completed  - 已完成", { c: Color.Cyan });
    LOG("  ❌ failed     - 执行失败", { c: Color.Red });
    LOG("  🚫 cancelled  - 已取消", { c: Color.Gray });
    
    LOG("\n💡 使用提示:", { c: Color.Blue });
    LOG("  • 任务 ID 从 1 开始自动递增", { c: Color.White });
    LOG("  • 使用任务管理可以更好地控制 Hook 生命周期", { c: Color.White });
    LOG("  • 定期使用 cleanup() 清理已完成的任务", { c: Color.White });
    LOG("  • 使用 jobstats() 监控系统性能", { c: Color.White });
    
    LOG("=" + "=".repeat(60), { c: Color.Gray });
}

// 任务管理的别名函数，提供更简洁的命令
var j = jobs;           // 快捷查看任务
var k = kill;           // 快捷取消任务
var ka = killall;       // 快捷取消所有任务
var jh = jobhelp;       // 快捷帮助

// 导出到全局作用域 (Frida环境)
global.jobs = jobs;
global.job = job;
global.kill = kill;
global.killall = killall;
global.pause = pause;
global.resume = resume;
global.jobstats = jobstats;
global.history = history;
global.cleanup = cleanup;
global.exportJobs = exportJobs;
global.traceMethodWithJob = traceMethodWithJob;
global.traceClassWithJob = traceClassWithJob;
global.advancedMethodTracingWithJob = advancedMethodTracingWithJob;
global.batchHookWithJob = batchHookWithJob;
global.createLocationHookJob = createLocationHookJob;
global.createNativeHookJob = createNativeHookJob;
global.jobhelp = jobhelp;

// 也导出快捷命令
global.j = j;
global.k = k;
global.ka = ka;
global.jh = jh;

// Node.js环境的导出（保持兼容性）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        jobs: jobs,
        job: job,
        kill: kill,
        killall: killall,
        pause: pause,
        resume: resume,
        jobstats: jobstats,
        history: history,
        cleanup: cleanup,
        exportJobs: exportJobs,
        traceMethodWithJob: traceMethodWithJob,
        traceClassWithJob: traceClassWithJob,
        advancedMethodTracingWithJob: advancedMethodTracingWithJob,
        batchHookWithJob: batchHookWithJob,
        createLocationHookJob: createLocationHookJob,
        createNativeHookJob: createNativeHookJob,
        jobhelp: jobhelp
    };
}

// 调试信息：确认任务管理命令已正确加载
LOG("📋 任务管理命令已加载 - jobs: " + (typeof jobs !== 'undefined' ? "✅" : "❌"), { c: Color.Blue });
