/**
 * 测试killall修复效果
 * 验证任务取消后是否真正停止输出
 */

// 模拟Java环境和LOG函数
if (typeof Java === 'undefined') {
    global.Java = {
        perform: function(callback) { callback(); },
        use: function(className) {
            // 模拟Java类
            var mockClass = {
                implementation: null,
                overloads: [{ $name: 'mockMethod' }]
            };
            
            if (className === "java.util.HashMap") {
                return {
                    put: {
                        implementation: null
                    }
                };
            } else if (className === "android.util.Base64") {
                return {
                    encodeToString: {
                        overload: function() {
                            return {
                                implementation: null
                            };
                        }
                    }
                };
            } else {
                return {
                    mockMethod: mockClass
                };
            }
        }
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

// 加载我们的模块
console.log("🔧 加载任务管理器...");
// 这里需要先加载frida_job_manager.js
eval(require('fs').readFileSync('./frida_job_manager.js', 'utf8'));

console.log("🔧 加载任务命令...");
// 然后加载frida_job_commands.js
eval(require('fs').readFileSync('./frida_job_commands.js', 'utf8'));

console.log("\n🧪 开始测试killall修复效果\n");

// 测试1: 创建几个模拟任务
console.log("📋 步骤1: 创建测试任务");
var job1 = HookJobManager.createJob(
    HookJobManager.JobType.METHOD_HOOK,
    "com.test.Method1", 
    {},
    function() { console.log("Hook1 执行"); }
);

var job2 = HookJobManager.createJob(
    HookJobManager.JobType.CLASS_HOOK,
    "com.test.Class1", 
    { autoTracked: true },
    function() { console.log("Hook2 执行"); }
);

var job3 = HookJobManager.createJob(
    HookJobManager.JobType.LOCATION_HOOK,
    "hookBase64", 
    { autoTracked: true },
    function() { console.log("Hook3 执行"); }
);

// 执行任务
HookJobManager.executeJob(job1);
HookJobManager.executeJob(job2);
HookJobManager.executeJob(job3);

console.log("\n📊 步骤2: 查看当前任务状态");
jobs();

console.log("\n🎯 步骤3: 执行killall命令");
var cancelledCount = killall();
console.log("取消了 " + cancelledCount + " 个任务");

console.log("\n📊 步骤4: 查看killall后的任务状态");
jobs();

console.log("\n🧪 步骤5: 测试任务状态检查逻辑");

// 模拟Hook函数中的状态检查
function testHookStatusCheck(taskId, hookName) {
    console.log("\n测试 " + hookName + " Hook状态检查:");
    
    if (taskId && typeof HookJobManager !== 'undefined') {
        var job = HookJobManager.getJob(taskId);
        if (job && job.status === 'cancelled') {
            console.log("  ✅ 任务已取消，应该静默执行原方法");
            return true; // 静默执行
        } else if (job && job.status === 'active') {
            console.log("  🔥 任务活跃，正常执行Hook逻辑");
            return false; // 正常执行
        } else {
            console.log("  ❓ 任务状态异常: " + (job ? job.status : "未找到"));
            return true;
        }
    } else {
        console.log("  ❌ HookJobManager不可用");
        return false;
    }
}

// 测试各个任务的状态检查
testHookStatusCheck(job1, "Method Hook");
testHookStatusCheck(job2, "Class Hook"); 
testHookStatusCheck(job3, "Location Hook");

console.log("\n📈 步骤6: 验证任务管理器统计");
HookJobManager.showStatistics();

console.log("\n✅ 测试完成！");
console.log("🔍 关键验证点:");
console.log("  1. killall应该取消所有任务");
console.log("  2. 取消的任务状态应该为'cancelled'");
console.log("  3. Hook函数应该检查状态并静默执行");
console.log("  4. 不应该再有Hook输出产生");
