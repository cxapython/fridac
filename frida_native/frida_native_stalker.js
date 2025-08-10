// Frida Native Stalker 相关（采样与汇总）

var __stalkerState = { running: false, modules: [], threads: [], samples: {}, timer: null };

function nativeStartStalker(options) {
    options = options || {};
    var modules = options.modules || [];
    var threads = options.threads || [];
    var intervalMs = options.intervalMs || 2000;

    function moduleAllowed(moduleName) {
        if (!modules || modules.length === 0) return true;
        try {
            for (var i=0;i<modules.length;i++) {
                var m = modules[i];
                if (m instanceof RegExp && m.test(moduleName)) return true;
                if (typeof m === 'string' && moduleName.indexOf(m) !== -1) return true;
            }
        } catch(_){ }
        return false;
    }

    function followThread(tid) {
        try {
            Stalker.follow(tid, {
                events: { call: true },
                onCallSummary: function (summary) {
                    var addrs = Object.keys(summary);
                    for (var i=0;i<addrs.length;i++) {
                        try {
                            var addr = ptr(addrs[i]);
                            var sym = DebugSymbol.fromAddress(addr);
                            var mod = sym.moduleName || '';
                            if (!moduleAllowed(mod)) continue;
                            var key = (sym.name || addr.toString()) + '@' + mod;
                            __stalkerState.samples[key] = (__stalkerState.samples[key] || 0) + summary[addrs[i]];
                        } catch(_){ }
                    }
                }
            });
        } catch (e) { LOG('Stalker 跟踪线程失败: '+e.message, { c: Color.Yellow }); }
    }

    if (__stalkerState.running) return false;
    __stalkerState.running = true;
    __stalkerState.modules = modules;
    __stalkerState.threads = threads;
    __stalkerState.samples = {};

    var tids = threads.length ? threads : [ Process.getCurrentThreadId() ];
    try { if (!threads.length) { Process.enumerateThreads().slice(0, 1).forEach(function(t){ tids[0] = t.id; }); } } catch(_){ }
    tids.forEach(followThread);

    __stalkerState.timer = setInterval(function(){
        try {
            var top = [];
            Object.keys(__stalkerState.samples).forEach(function(k){ top.push({ key: k, count: __stalkerState.samples[k] }); });
            top.sort(function(a,b){ return b.count - a.count; });
            var report = top.slice(0, 30);
            emitEvent('stalker_summary', { items: report });
            __stalkerState.samples = {};
        } catch(_){ }
    }, intervalMs);

    LOG('[+] Stalker 已启动', { c: Color.Green });
    return true;
}

function nativeStopStalker() {
    try {
        __stalkerState.running = false;
        try { Stalker.unfollow(); } catch(_){ }
        if (__stalkerState.timer) { try { clearInterval(__stalkerState.timer); } catch(_){ } __stalkerState.timer = null; }
        emitEvent('stalker_summary', { items: [] });
        LOG('[+] Stalker 已停止', { c: Color.Green });
        return true;
    } catch (e) { LOG('停止 Stalker 失败: '+e.message, { c: Color.Red }); return false; }
}

