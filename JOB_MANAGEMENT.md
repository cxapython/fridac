# fridacli 任务管理系统

参考 objection 设计，为 fridacli 实现了完整的 Hook 任务管理系统，提供任务跟踪、控制和监控功能。

## 🎯 设计理念

### 为什么需要任务管理？

在复杂的逆向分析中，我们经常需要：
- 同时运行多个 Hook
- 动态启用/禁用特定 Hook
- 监控 Hook 的执行状态
- 管理资源占用
- 追踪分析历史

传统的 Frida 脚本一旦运行就难以管理，fridacli 的任务管理系统解决了这个痛点。

## 🏗️ 架构设计

### 核心组件

1. **HookJobManager** - 任务管理核心
2. **HookJob** - 单个任务对象
3. **JobCommands** - 用户命令接口

### 任务生命周期

```
创建 → 执行 → 活跃 → [暂停/恢复] → 完成/取消
```

### 任务状态

- 🟡 **pending** - 等待执行
- 🟢 **active** - 正在运行
- 🔵 **paused** - 已暂停
- 🟦 **completed** - 已完成
- 🔴 **failed** - 执行失败
- ⚫ **cancelled** - 已取消

## 📋 核心功能

### 1. 查看任务

#### `jobs()` - 显示所有活跃任务
```javascript
// 显示所有任务
jobs()

// 只显示特定状态的任务
jobs('active')
jobs('paused')
jobs('failed')
```

#### `job(id)` - 显示任务详情
```javascript
// 显示任务 #1 的详细信息
job(1)
```

#### `jobstats()` - 显示统计信息
```javascript
// 显示任务统计和性能数据
jobstats()
```

### 2. 控制任务

#### `kill(id)` - 取消指定任务
```javascript
// 取消任务 #1
kill(1)
```

#### `killall()` - 取消所有任务
```javascript
// 取消所有任务
killall()

// 只取消特定类型的任务
killall('method_hook')
killall('class_hook')
```

#### `pause(id)` / `resume(id)` - 暂停/恢复
```javascript
// 暂停任务 #1
pause(1)

// 恢复任务 #1
resume(1)
```

### 3. 维护任务

#### `history()` - 查看历史
```javascript
// 显示最近 20 个任务
history()

// 显示最近 50 个任务
history(50)
```

#### `cleanup()` - 清理已完成任务
```javascript
// 清理所有已完成/取消/失败的任务
cleanup()
```

#### `exportJobs()` - 导出配置
```javascript
// 导出当前任务配置
exportJobs()
```

## 🎯 带任务管理的 Hook 函数

### 方法 Hook

```javascript
// 传统方式（无法管理）
traceMethod('com.example.MainActivity.onCreate', true)

// 任务管理方式（可控制）
var jobId = traceMethodWithJob('com.example.MainActivity.onCreate', true)
// 随时可以取消
kill(jobId)
```

### 类 Hook

```javascript
// 传统方式
traceClass('com.example.MainActivity')

// 任务管理方式
var jobId = traceClassWithJob('com.example.MainActivity')
// 查看详情
job(jobId)
```

### 高级追踪

```javascript
// 任务管理的高级追踪
var jobId = advancedMethodTracingWithJob(
    'com.example.LoginActivity.doLogin', 
    true,  // 启用字段检查
    true   // 启用彩色输出
)
```

### 批量 Hook

```javascript
// 任务管理的批量 Hook
var jobId = batchHookWithJob(
    'com.example',  // 白名单
    'test',         // 黑名单
    null            // ClassLoader
)
```

## 🔍 实际使用场景

### 场景 1: 登录分析

```javascript
// 1. 创建多个相关 Hook
var loginJobId = traceMethodWithJob('com.example.LoginActivity.doLogin', true)
var authJobId = traceMethodWithJob('com.example.AuthService.authenticate', true)
var validateJobId = traceMethodWithJob('com.example.Validator.checkCredentials', true)

// 2. 查看所有任务
jobs()

// 3. 进行登录操作...

// 4. 分析完成后清理
kill(loginJobId)
kill(authJobId)
kill(validateJobId)
```

### 场景 2: 调试特定功能

```javascript
// 1. 启动批量 Hook
var batchJobId = batchHookWithJob('com.example.payment', 'test', null)

// 2. 发现性能问题，暂停批量 Hook
pause(batchJobId)

// 3. 启动精确 Hook
var preciseJobId = traceMethodWithJob('com.example.payment.PaymentProcessor.process', true)

// 4. 分析完成后恢复或取消
resume(batchJobId)
// 或者
kill(batchJobId)
```

### 场景 3: 长期监控

```javascript
// 1. 启动关键功能监控
var securityJobId = traceMethodWithJob('com.example.security.SecurityChecker.verify', true)
var cryptoJobId = traceMethodWithJob('com.example.crypto.CryptoHelper.encrypt', true)

// 2. 定期检查状态
jobstats()

// 3. 导出配置备份
exportJobs()

// 4. 定期清理
cleanup()
```

## 📊 任务监控

### 详细信息包含

- **基本信息**: ID、类型、目标、状态
- **时间信息**: 创建时间、最后修改时间
- **性能数据**: 命中次数、平均执行时间
- **错误记录**: 错误历史和堆栈
- **资源信息**: 拦截器数量、内存使用

### 统计数据

```javascript
jobstats()
```

输出示例：
```
📊 Hook 任务统计
==================================================
📋 总任务数: 5
🎯 总命中数: 1,234
❌ 总错误数: 2

🚦 按状态分布:
   ✅ active: 3
   ⏸️ paused: 1
   ❌ failed: 1

📋 按类型分布:
   📌 method_hook: 3
   📌 class_hook: 2
==================================================
```

## ⚙️ 高级配置

### 任务选项

每个任务都可以配置选项：

```javascript
{
    enableStackTrace: true,
    customReturnValue: "modified",
    enableFieldInspection: true,
    enableColorOutput: true
}
```

### 性能监控

任务会自动记录：
- 执行次数
- 执行时间
- 错误统计
- 内存使用

### 错误处理

- 自动捕获和记录错误
- 提供错误历史查看
- 支持任务自动重试

## 🛠️ 与现有功能集成

### 兼容性

- **向后兼容**: 原有的 Hook 函数继续可用
- **渐进式采用**: 可以逐步迁移到任务管理
- **零依赖**: 任务管理系统独立运行

### 性能影响

- **最小开销**: 任务管理只增加微量开销
- **资源控制**: 支持暂停/恢复减少资源占用
- **内存优化**: 自动清理完成的任务

## 🚀 最佳实践

### 1. 命名规范

```javascript
// 好的实践
var loginHookId = traceMethodWithJob('com.example.LoginActivity.doLogin', true)
var paymentHookId = traceClassWithJob('com.example.payment.PaymentProcessor')

// 避免的实践
var job1 = traceMethodWithJob('method1', true)
var job2 = traceClassWithJob('class1')
```

### 2. 资源管理

```javascript
// 及时清理不需要的任务
kill(temporaryJobId)

// 定期清理已完成的任务
cleanup()

// 监控资源使用
jobstats()
```

### 3. 错误处理

```javascript
// 检查任务创建是否成功
var jobId = traceMethodWithJob('com.example.Class.method', true)
if (jobId) {
    console.log("任务创建成功: " + jobId)
} else {
    console.log("任务创建失败")
}
```

### 4. 批量操作

```javascript
// 批量取消相关任务
killall('method_hook')

// 或者保存 jobId 数组进行精确控制
var loginJobs = [jobId1, jobId2, jobId3]
loginJobs.forEach(function(id) { kill(id) })
```

## 🎯 快捷命令

为了提高效率，系统提供快捷别名：

```javascript
j()         // 等同于 jobs()
k(1)        // 等同于 kill(1)
ka()        // 等同于 killall()
jh()        // 等同于 jobhelp()
```

## 🔮 未来扩展

### 计划功能

1. **任务模板**: 保存和重用常用任务配置
2. **任务依赖**: 支持任务间的依赖关系
3. **自动化规则**: 基于条件自动启动/停止任务
4. **性能分析**: 更详细的性能分析和优化建议
5. **远程管理**: 支持远程任务控制
6. **任务编排**: 可视化的任务流程设计

### 扩展接口

系统设计了良好的扩展接口，支持：
- 自定义任务类型
- 自定义状态监控
- 第三方插件集成

---

通过任务管理系统，fridacli 现在具备了企业级 Hook 工具的管理能力，让复杂的逆向分析工作变得更加高效和可控。
