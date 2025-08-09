/**
 * fridacli Hook 任务管理器
 * 参考 objection 设计，提供完整的 Hook 生命周期管理
 */

/**
 * Hook 任务管理器
 * 负责跟踪、管理和控制所有 Hook 任务
 */
var HookJobManager = (function() {
    // 私有变量
    var nextJobId = 1;
    var activeJobs = new Map();
    var jobHistory = [];
    var maxHistorySize = 1000;
    
    // 任务状态枚举
    var JobStatus = {
        PENDING: 'pending',
        ACTIVE: 'active',
        PAUSED: 'paused',
        COMPLETED: 'completed',
        FAILED: 'failed',
        CANCELLED: 'cancelled'
    };
    
    // 任务类型枚举
    var JobType = {
        METHOD_HOOK: 'method_hook',
        CLASS_HOOK: 'class_hook',
        NATIVE_HOOK: 'native_hook',
        LOCATION_HOOK: 'location_hook',
        ADVANCED_HOOK: 'advanced_hook',
        BATCH_HOOK: 'batch_hook',
        AUTO_HOOK: 'auto_hook'  // 自动追踪的Hook
    };
    
    /**
     * Hook 任务类
     * @param {string} type - 任务类型
     * @param {string} target - Hook 目标
     * @param {Object} options - Hook 选项
     * @param {Function} hookFunction - Hook 函数
     */
    function HookJob(type, target, options, hookFunction) {
        this.id = nextJobId++;
        this.type = type;
        this.target = target;
        this.options = options || {};
        this.hookFunction = hookFunction;
        this.status = JobStatus.PENDING;
        this.createdAt = new Date();
        this.lastModified = new Date();
        this.description = this.generateDescription();
        this.metadata = {
            hitCount: 0,
            lastHit: null,
            errors: [],
            performance: {
                totalTime: 0,
                avgTime: 0
            }
        };
        this.interceptors = []; // 存储 Frida Interceptor 对象
        this.originalImplementations = []; // 存储原始Java方法实现
        this.customCancelHandlers = []; // 存储自定义取消处理器
    }
    
    /**
     * 生成任务描述
     */
    HookJob.prototype.generateDescription = function() {
        switch (this.type) {
            case JobType.METHOD_HOOK:
                return "Hook 方法: " + this.target;
            case JobType.CLASS_HOOK:
                return "Hook 类: " + this.target;
            case JobType.NATIVE_HOOK:
                return "Hook Native: " + this.target;
            case JobType.LOCATION_HOOK:
                return "定位 Hook: " + this.target;
            case JobType.ADVANCED_HOOK:
                return "高级 Hook: " + this.target;
            case JobType.BATCH_HOOK:
                return "批量 Hook: " + this.target;
            case JobType.AUTO_HOOK:
                return "自动追踪: " + this.target;
            default:
                return "Hook: " + this.target;
        }
    };
    
    /**
     * 更新任务状态
     */
    HookJob.prototype.updateStatus = function(newStatus, error) {
        this.status = newStatus;
        this.lastModified = new Date();
        
        if (error) {
            this.metadata.errors.push({
                timestamp: new Date(),
                error: error.toString()
            });
        }
        
        LOG("📋 任务 #" + this.id + " 状态更新: " + newStatus, { c: Color.Blue });
    };
    
    /**
     * 记录命中
     */
    HookJob.prototype.recordHit = function(executionTime) {
        this.metadata.hitCount++;
        this.metadata.lastHit = new Date();
        
        if (executionTime) {
            this.metadata.performance.totalTime += executionTime;
            this.metadata.performance.avgTime = this.metadata.performance.totalTime / this.metadata.hitCount;
        }
    };
    
    /**
     * 取消任务
     */
    HookJob.prototype.cancel = function() {
        try {
            // 对于自动追踪任务，恢复原始implementation
            if (this.options.autoTracked) {
                LOG("🎯 正在恢复原始方法实现...", { c: Color.Yellow });
                
                // 恢复所有被Hook的方法
                this.originalImplementations.forEach(function(item) {
                    try {
                        if (item.target && item.original) {
                            item.target.implementation = item.original;
                            LOG("✅ 已恢复: " + item.description, { c: Color.Green });
                        }
                    } catch (e) {
                        LOG("⚠️  恢复失败: " + item.description + " - " + e.message, { c: Color.Yellow });
                    }
                });
                
                this.originalImplementations = [];
                
                // 执行自定义取消处理器
                this.customCancelHandlers.forEach(function(handler) {
                    try {
                        if (typeof handler === 'function') {
                            handler();
                            LOG("✅ 执行自定义取消处理器", { c: Color.Green });
                        }
                    } catch (e) {
                        LOG("⚠️  自定义取消处理器失败: " + e.message, { c: Color.Yellow });
                    }
                });
                this.customCancelHandlers = [];
                
                this.updateStatus(JobStatus.CANCELLED);
                LOG("✅ 任务 #" + this.id + " 已完全取消", { c: Color.Green });
                return true;
            }
            
            // 移除所有 Interceptor（适用于Native Hook和带Interceptor的任务）
            this.interceptors.forEach(function(interceptor) {
                if (interceptor && typeof interceptor.detach === 'function') {
                    interceptor.detach();
                }
            });
            
            this.interceptors = [];
            this.updateStatus(JobStatus.CANCELLED);
            
            LOG("✅ 任务 #" + this.id + " 已取消", { c: Color.Green });
            return true;
        } catch (error) {
            this.updateStatus(JobStatus.FAILED, error);
            LOG("❌ 取消任务 #" + this.id + " 失败: " + error.message, { c: Color.Red });
            return false;
        }
    };
    
    /**
     * 暂停任务
     */
    HookJob.prototype.pause = function() {
        if (this.status === JobStatus.ACTIVE) {
            this.updateStatus(JobStatus.PAUSED);
            LOG("⏸️ 任务 #" + this.id + " 已暂停", { c: Color.Yellow });
            return true;
        }
        return false;
    };
    
    /**
     * 恢复任务
     */
    HookJob.prototype.resume = function() {
        if (this.status === JobStatus.PAUSED) {
            this.updateStatus(JobStatus.ACTIVE);
            LOG("▶️ 任务 #" + this.id + " 已恢复", { c: Color.Green });
            return true;
        }
        return false;
    };
    
    // 公共方法
    return {
        JobStatus: JobStatus,
        JobType: JobType,
        
        /**
         * 创建新的 Hook 任务
         * @param {string} type - 任务类型
         * @param {string} target - Hook 目标
         * @param {Object} options - Hook 选项
         * @param {Function} hookFunction - Hook 函数
         * @returns {number} 任务 ID
         */
        createJob: function(type, target, options, hookFunction) {
            var job = new HookJob(type, target, options, hookFunction);
            activeJobs.set(job.id, job);
            
            LOG("🎯 创建新任务 #" + job.id + ": " + job.description, { c: Color.Cyan });
            
            // 添加到历史记录
            this.addToHistory(job);
            
            return job.id;
        },
        
        /**
         * 执行 Hook 任务
         * @param {number} jobId - 任务 ID
         * @returns {boolean} 是否成功
         */
        executeJob: function(jobId) {
            var job = activeJobs.get(jobId);
            if (!job) {
                LOG("❌ 任务 #" + jobId + " 不存在", { c: Color.Red });
                return false;
            }
            
            try {
                job.updateStatus(JobStatus.ACTIVE);
                
                // 执行 Hook 函数
                var result = job.hookFunction();
                
                // 如果返回的是 Interceptor 对象，保存它
                if (result && typeof result.detach === 'function') {
                    job.interceptors.push(result);
                } else if (Array.isArray(result)) {
                    job.interceptors = job.interceptors.concat(result);
                }
                
                LOG("✅ 任务 #" + jobId + " 执行成功", { c: Color.Green });
                return true;
                
            } catch (error) {
                job.updateStatus(JobStatus.FAILED, error);
                LOG("❌ 任务 #" + jobId + " 执行失败: " + error.message, { c: Color.Red });
                return false;
            }
        },
        
        /**
         * 获取所有活跃任务
         * @returns {Array<HookJob>} 任务列表
         */
        getActiveJobs: function() {
            return Array.from(activeJobs.values());
        },
        
        /**
         * 获取特定任务
         * @param {number} jobId - 任务 ID
         * @returns {HookJob|null} 任务对象
         */
        getJob: function(jobId) {
            return activeJobs.get(jobId) || null;
        },
        
        /**
         * 取消任务
         * @param {number} jobId - 任务 ID
         * @returns {boolean} 是否成功
         */
        killJob: function(jobId) {
            var job = activeJobs.get(jobId);
            if (!job) {
                LOG("❌ 任务 #" + jobId + " 不存在", { c: Color.Red });
                return false;
            }
            
            var success = job.cancel();
            if (success) {
                activeJobs.delete(jobId);
            }
            
            return success;
        },
        
        /**
         * 取消所有任务
         * @param {string} typeFilter - 可选的类型过滤器
         * @returns {number} 取消的任务数量
         */
        killAllJobs: function(typeFilter) {
            var cancelledCount = 0;
            var jobsToCancel = [];
            
            // 收集要取消的任务
            activeJobs.forEach(function(job, jobId) {
                if (!typeFilter || job.type === typeFilter) {
                    jobsToCancel.push(jobId);
                }
            });
            
            // 逐个取消
            jobsToCancel.forEach(function(jobId) {
                if (this.killJob(jobId)) {
                    cancelledCount++;
                }
            }.bind(this));
            
            LOG("🧹 已取消 " + cancelledCount + " 个任务", { c: Color.Green });
            return cancelledCount;
        },
        
        /**
         * 暂停任务
         * @param {number} jobId - 任务 ID
         * @returns {boolean} 是否成功
         */
        pauseJob: function(jobId) {
            var job = activeJobs.get(jobId);
            return job ? job.pause() : false;
        },
        
        /**
         * 恢复任务
         * @param {number} jobId - 任务 ID
         * @returns {boolean} 是否成功
         */
        resumeJob: function(jobId) {
            var job = activeJobs.get(jobId);
            return job ? job.resume() : false;
        },
        
        /**
         * 显示任务列表
         * @param {string} statusFilter - 可选的状态过滤器
         */
        showJobs: function(statusFilter) {
            var jobs = this.getActiveJobs();
            
            if (statusFilter) {
                jobs = jobs.filter(function(job) {
                    return job.status === statusFilter;
                });
            }
            
            if (jobs.length === 0) {
                LOG("📋 没有找到任务" + (statusFilter ? " (状态: " + statusFilter + ")" : ""), { c: Color.Yellow });
                return;
            }
            
            LOG("\n📋 Hook 任务列表" + (statusFilter ? " (状态: " + statusFilter + ")" : ""), { c: Color.Cyan });
            LOG("=" + "=".repeat(80), { c: Color.Gray });
            
            jobs.forEach(function(job) {
                var statusIcon = this.getStatusIcon(job.status);
                var timeInfo = this.formatTimeInfo(job);
                var hitInfo = job.metadata.hitCount > 0 ? " (命中: " + job.metadata.hitCount + ")" : "";
                
                LOG(statusIcon + " #" + job.id + " | " + job.description + hitInfo, { c: this.getStatusColor(job.status) });
                LOG("   类型: " + job.type + " | 创建: " + timeInfo + " | 状态: " + job.status, { c: Color.Gray });
                
                if (job.metadata.errors.length > 0) {
                    LOG("   ⚠️ 错误数: " + job.metadata.errors.length, { c: Color.Yellow });
                }
            }.bind(this));
            
            LOG("=" + "=".repeat(80), { c: Color.Gray });
            LOG("📊 总计: " + jobs.length + " 个任务", { c: Color.Blue });
        },
        
        /**
         * 显示任务详情
         * @param {number} jobId - 任务 ID
         */
        showJobDetails: function(jobId) {
            var job = activeJobs.get(jobId);
            if (!job) {
                LOG("❌ 任务 #" + jobId + " 不存在", { c: Color.Red });
                return;
            }
            
            LOG("\n🔍 任务 #" + job.id + " 详细信息", { c: Color.Cyan });
            LOG("=" + "=".repeat(60), { c: Color.Gray });
            LOG("📝 描述: " + job.description, { c: Color.White });
            LOG("🎯 目标: " + job.target, { c: Color.White });
            LOG("📋 类型: " + job.type, { c: Color.White });
            LOG("🚦 状态: " + job.status, { c: this.getStatusColor(job.status) });
            LOG("📅 创建时间: " + job.createdAt.toLocaleString(), { c: Color.White });
            LOG("🔄 最后修改: " + job.lastModified.toLocaleString(), { c: Color.White });
            LOG("🎯 命中次数: " + job.metadata.hitCount, { c: Color.White });
            
            if (job.metadata.lastHit) {
                LOG("⏰ 最后命中: " + job.metadata.lastHit.toLocaleString(), { c: Color.White });
            }
            
            if (job.metadata.performance.avgTime > 0) {
                LOG("⚡ 平均执行时间: " + job.metadata.performance.avgTime.toFixed(2) + "ms", { c: Color.White });
            }
            
            if (job.interceptors.length > 0) {
                LOG("🔗 活跃拦截器: " + job.interceptors.length + " 个", { c: Color.White });
            }
            
            if (job.options && Object.keys(job.options).length > 0) {
                LOG("⚙️ 选项: " + JSON.stringify(job.options), { c: Color.White });
            }
            
            if (job.metadata.errors.length > 0) {
                LOG("\n❌ 错误记录:", { c: Color.Red });
                job.metadata.errors.slice(-5).forEach(function(errorRecord) {
                    LOG("   " + errorRecord.timestamp.toLocaleTimeString() + ": " + errorRecord.error, { c: Color.Yellow });
                });
                
                if (job.metadata.errors.length > 5) {
                    LOG("   ... 还有 " + (job.metadata.errors.length - 5) + " 个错误", { c: Color.Gray });
                }
            }
            
            LOG("=" + "=".repeat(60), { c: Color.Gray });
        },
        
        /**
         * 获取任务统计信息
         * @returns {Object} 统计信息
         */
        getStatistics: function() {
            var stats = {
                total: activeJobs.size,
                byStatus: {},
                byType: {},
                totalHits: 0,
                totalErrors: 0
            };
            
            // 初始化计数器
            Object.values(JobStatus).forEach(function(status) {
                stats.byStatus[status] = 0;
            });
            
            Object.values(JobType).forEach(function(type) {
                stats.byType[type] = 0;
            });
            
            // 统计数据
            activeJobs.forEach(function(job) {
                stats.byStatus[job.status]++;
                stats.byType[job.type]++;
                stats.totalHits += job.metadata.hitCount;
                stats.totalErrors += job.metadata.errors.length;
            });
            
            return stats;
        },
        
        /**
         * 显示统计信息
         */
        showStatistics: function() {
            var stats = this.getStatistics();
            
            LOG("\n📊 Hook 任务统计", { c: Color.Cyan });
            LOG("=" + "=".repeat(50), { c: Color.Gray });
            
            LOG("📋 总任务数: " + stats.total, { c: Color.White });
            LOG("🎯 总命中数: " + stats.totalHits, { c: Color.White });
            LOG("❌ 总错误数: " + stats.totalErrors, { c: Color.White });
            
            LOG("\n🚦 按状态分布:", { c: Color.Blue });
            Object.keys(stats.byStatus).forEach(function(status) {
                var count = stats.byStatus[status];
                if (count > 0) {
                    var icon = this.getStatusIcon(status);
                    LOG("   " + icon + " " + status + ": " + count, { c: this.getStatusColor(status) });
                }
            }.bind(this));
            
            LOG("\n📋 按类型分布:", { c: Color.Blue });
            Object.keys(stats.byType).forEach(function(type) {
                var count = stats.byType[type];
                if (count > 0) {
                    LOG("   📌 " + type + ": " + count, { c: Color.White });
                }
            });
            
            LOG("=" + "=".repeat(50), { c: Color.Gray });
        },
        
        /**
         * 添加到历史记录
         * @param {HookJob} job - 任务对象
         */
        addToHistory: function(job) {
            jobHistory.push({
                id: job.id,
                type: job.type,
                target: job.target,
                description: job.description,
                createdAt: job.createdAt,
                finalStatus: job.status
            });
            
            // 限制历史记录大小
            if (jobHistory.length > maxHistorySize) {
                jobHistory = jobHistory.slice(-maxHistorySize);
            }
        },
        
        /**
         * 显示历史记录
         * @param {number} limit - 显示数量限制
         */
        showHistory: function(limit) {
            limit = limit || 20;
            var recentHistory = jobHistory.slice(-limit);
            
            if (recentHistory.length === 0) {
                LOG("📚 没有历史记录", { c: Color.Yellow });
                return;
            }
            
            LOG("\n📚 Hook 任务历史 (最近 " + recentHistory.length + " 个)", { c: Color.Cyan });
            LOG("=" + "=".repeat(70), { c: Color.Gray });
            
            recentHistory.forEach(function(record) {
                var timeStr = record.createdAt.toLocaleTimeString();
                LOG("#" + record.id + " | " + timeStr + " | " + record.description, { c: Color.White });
            });
            
            LOG("=" + "=".repeat(70), { c: Color.Gray });
        },
        
        /**
         * 清理已完成的任务
         * @returns {number} 清理的任务数量
         */
        cleanup: function() {
            var cleanupCount = 0;
            var jobsToRemove = [];
            
            activeJobs.forEach(function(job, jobId) {
                if (job.status === JobStatus.COMPLETED || 
                    job.status === JobStatus.CANCELLED || 
                    job.status === JobStatus.FAILED) {
                    jobsToRemove.push(jobId);
                }
            });
            
            jobsToRemove.forEach(function(jobId) {
                activeJobs.delete(jobId);
                cleanupCount++;
            });
            
            LOG("🧹 已清理 " + cleanupCount + " 个已完成的任务", { c: Color.Green });
            return cleanupCount;
        },
        
        /**
         * 导出任务配置
         * @returns {string} JSON 配置
         */
        exportJobs: function() {
            var exportData = {
                timestamp: new Date().toISOString(),
                jobs: [],
                statistics: this.getStatistics()
            };
            
            activeJobs.forEach(function(job) {
                exportData.jobs.push({
                    id: job.id,
                    type: job.type,
                    target: job.target,
                    options: job.options,
                    status: job.status,
                    description: job.description,
                    metadata: job.metadata
                });
            });
            
            return JSON.stringify(exportData, null, 2);
        },
        
        // 辅助方法
        getStatusIcon: function(status) {
            switch (status) {
                case JobStatus.PENDING: return "⏳";
                case JobStatus.ACTIVE: return "✅";
                case JobStatus.PAUSED: return "⏸️";
                case JobStatus.COMPLETED: return "✔️";
                case JobStatus.FAILED: return "❌";
                case JobStatus.CANCELLED: return "🚫";
                default: return "❓";
            }
        },
        
        getStatusColor: function(status) {
            switch (status) {
                case JobStatus.PENDING: return Color.Yellow;
                case JobStatus.ACTIVE: return Color.Green;
                case JobStatus.PAUSED: return Color.Blue;
                case JobStatus.COMPLETED: return Color.Cyan;
                case JobStatus.FAILED: return Color.Red;
                case JobStatus.CANCELLED: return Color.Gray;
                default: return Color.White;
            }
        },
        
        formatTimeInfo: function(job) {
            var now = new Date();
            var diffMs = now - job.createdAt;
            var diffSec = Math.floor(diffMs / 1000);
            var diffMin = Math.floor(diffSec / 60);
            var diffHour = Math.floor(diffMin / 60);
            
            if (diffHour > 0) {
                return diffHour + "小时前";
            } else if (diffMin > 0) {
                return diffMin + "分钟前";
            } else {
                return diffSec + "秒前";
            }
        },

        /**
         * 自动注册Hook任务（用于未使用WithJob后缀的函数）
         * @param {string} functionName - 函数名称
         * @param {Array} args - 函数参数
         * @returns {number} 任务ID
         */
        autoRegisterHook: function(functionName, args) {
            try {
                var hookType = this.detectHookType(functionName);
                var target = this.formatHookTarget(functionName, args);
                
                var job = new HookJob(
                    hookType,
                    target,
                    { autoTracked: true, originalFunction: functionName, args: args },
                    null  // 自动追踪的任务没有具体的hook函数
                );
                
                job.updateStatus(JobStatus.ACTIVE);
                activeJobs.set(job.id, job);
                
                // 记录到历史
                this.addToHistory(job);
                
                LOG("🤖 自动注册任务 #" + job.id + ": " + job.description, { c: Color.Green });
                
                return job.id;
            } catch (error) {
                LOG("❌ 自动注册任务失败: " + error.message, { c: Color.Red });
                return null;
            }
        },

        /**
         * 检测Hook类型
         * @param {string} functionName - 函数名称
         * @returns {string} Hook类型
         */
        detectHookType: function(functionName) {
            if (functionName.toLowerCase().includes('native')) {
                return JobType.NATIVE_HOOK;
            } else if (functionName.toLowerCase().includes('class') || functionName.toLowerCase().includes('trace')) {
                return JobType.CLASS_HOOK;
            } else if (functionName.toLowerCase().includes('method')) {
                return JobType.METHOD_HOOK;
            } else if (functionName.startsWith('hook')) {
                return JobType.LOCATION_HOOK;
            } else if (functionName.toLowerCase().includes('batch') || functionName.toLowerCase().includes('advanced')) {
                return JobType.ADVANCED_HOOK;
            } else {
                return JobType.AUTO_HOOK;
            }
        },

        /**
         * 格式化Hook目标描述
         * @param {string} functionName - 函数名称
         * @param {Array} args - 函数参数
         * @returns {string} 格式化的目标描述
         */
        formatHookTarget: function(functionName, args) {
            var target = functionName + "(";
            if (args && args.length > 0) {
                var argStrs = [];
                for (var i = 0; i < Math.min(args.length, 3); i++) {  // 最多显示3个参数
                    var arg = args[i];
                    if (typeof arg === 'string') {
                        argStrs.push("'" + (arg.length > 20 ? arg.substring(0, 20) + "..." : arg) + "'");
                    } else if (typeof arg === 'number' || typeof arg === 'boolean') {
                        argStrs.push(arg.toString());
                    } else {
                        argStrs.push(typeof arg);
                    }
                }
                target += argStrs.join(", ");
                if (args.length > 3) {
                    target += ", ...";
                }
            }
            target += ")";
            return target;
        },

        /**
         * 更新自动追踪任务的状态（当有Hook命中时调用）
         * @param {number} jobId - 任务ID
         * @param {Object} hitInfo - 命中信息
         */
        updateAutoTaskHit: function(jobId, hitInfo) {
            var job = activeJobs.get(jobId);
            if (job && job.options.autoTracked) {
                job.metadata.hitCount++;
                job.metadata.lastHit = new Date();
                
                if (hitInfo && hitInfo.executionTime) {
                    job.metadata.performance.totalTime += hitInfo.executionTime;
                    job.metadata.performance.avgTime = job.metadata.performance.totalTime / job.metadata.hitCount;
                }
            }
        },

        /**
         * 获取指定任务
         * @param {number} jobId - 任务ID
         * @returns {HookJob|null} 任务对象
         */
        getJob: function(jobId) {
            return activeJobs.get(jobId) || null;
        },
        
        /**
         * 通用Hook注册方法 - 支持多种Hook类型
         * @param {number} taskId - 任务ID
         * @param {Object} hookInfo - Hook信息
         */
        registerHookMethod: function(taskId, hookInfo) {
            var job = this.getJob(taskId);
            if (!job) return;
            
            switch (hookInfo.type) {
                case 'implementation':
                    // 标准implementation Hook
                    job.originalImplementations.push({
                        target: hookInfo.target,
                        original: hookInfo.original,
                        description: hookInfo.description
                    });
                    break;
                    
                case 'interceptor':
                    // Interceptor Hook
                    job.interceptors.push(hookInfo.interceptor);
                    break;
                    
                case 'custom':
                    // 自定义取消处理器
                    job.customCancelHandlers.push(hookInfo.cancelHandler);
                    break;
                    
                default:
                    LOG("⚠️  未知的Hook类型: " + hookInfo.type, { c: Color.Yellow });
            }
        }
    };
})();

// 全局快捷访问
var JobManager = HookJobManager;
