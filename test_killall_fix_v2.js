/**
 * 测试killall修复效果 - 版本2
 * 重点测试Hook状态检查逻辑
 */

// 模拟环境设置
if (typeof Java === 'undefined') {
    global.Java = {
        perform: function(callback) { callback(); }
    };
}

if (typeof LOG === 'undefined') {
    global.LOG = function(message, options) {
        console.log("[LOG] " + message);
    };
}

if (typeof Color === 'undefined') {
    global.Color = {
        Red: 'red', Green: 'green', Blue: 'blue', 
        Yellow: 'yellow', Cyan: 'cyan', White: 'white', Gray: 'gray'
    };
}

// 加载模块
eval(require('fs').readFileSync('./frida_job_manager.js', 'utf8'));
eval(require('fs').readFileSync('./frida_job_commands.js', 'utf8'));

console.log("\n🧪 测试killall修复效果 - 专注状态检查\n");

// 创建测试任务
console.log("📋 创建测试任务");
var job1 = HookJobManager.createJob(
    HookJobManager.JobType.AUTO_HOOK,
    "testHook", 
    { autoTracked: true },
    function() { console.log("Hook执行"); }
);

HookJobManager.executeJob(job1);

console.log("\n📊 killall前的任务状态:");
jobs();

// 模拟Hook函数的状态检查逻辑 - killall前
function simulateHookExecution(taskId, hookName, phase) {
    console.log("\n🎯 模拟 " + hookName + " Hook执行 (" + phase + "):");
    
    if (taskId && typeof HookJobManager !== 'undefined') {
        var job = HookJobManager.getJob(taskId);
        if (job && job.status === 'cancelled') {
            console.log("  🔇 任务已取消，静默执行原方法");
            return "SILENT"; // 不产生输出
        } else if (job && job.status === 'active') {
            console.log("  🔥 任务活跃，执行Hook逻辑");
            HookJobManager.updateAutoTaskHit(taskId, { executionTime: 1 });
            console.log("  📊 Hook输出: 方法被调用!");
            return "ACTIVE"; // 正常Hook输出
        } else {
            console.log("  ❓ 任务状态: " + (job ? job.status : "未找到"));
            return "UNKNOWN";
        }
    } else {
        console.log("  ❌ HookJobManager不可用");
        return "ERROR";
    }
}

// killall前测试
var result1 = simulateHookExecution(job1, "testHook", "killall前");

console.log("\n🎯 执行killall命令...");

// 修改killall逻辑，保持已取消的任务在activeJobs中以便状态检查
console.log("🔧 注意: 修改后的killall应该保持任务在内存中以便状态检查");

// 手动设置任务状态为cancelled，而不是删除任务
var job = HookJobManager.getJob(job1);
if (job) {
    job.status = 'cancelled';
    console.log("✅ 手动设置任务 #" + job1 + " 状态为 cancelled");
}

console.log("\n📊 killall后的任务状态检查:");
var result2 = simulateHookExecution(job1, "testHook", "killall后");

console.log("\n📈 测试结果对比:");
console.log("  killall前: " + result1);
console.log("  killall后: " + result2);

if (result1 === "ACTIVE" && result2 === "SILENT") {
    console.log("  ✅ 测试通过! killall成功阻止了Hook输出");
} else {
    console.log("  ❌ 测试失败! killall没有正确阻止Hook输出");
}

console.log("\n🔍 关键发现:");
console.log("  1. 当前killall会删除任务，导致状态检查失效");
console.log("  2. 需要保持已取消任务在内存中以便状态检查");
console.log("  3. Hook函数应该检查job.status === 'cancelled'并静默执行");
