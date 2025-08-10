// Frida Native 反调试相关 Hook 与绕过

function nativeEnableAntiDebugBypass(options) {
    options = options || {};
    var bypassPtrace = options.bypassPtrace !== false;
    var spoofTracerPid = options.spoofTracerPid !== false;

    if (bypassPtrace) {
        try {
            var ptrace = Module.findExportByName(null, 'ptrace');
            if (ptrace) {
                Interceptor.attach(ptrace, {
                    onEnter: function(args) { this.request = args[0].toInt32(); },
                    onLeave: function(retval) { try { if (this.request === 0) retval.replace(ptr(0)); } catch(_){} }
                });
                LOG('[+] 反调试: 已启用 ptrace 绕过');
            }
        } catch(_){ }
    }

    if (spoofTracerPid) {
        try {
            var trackedFds = {};
            var openFn = Module.findExportByName(null, 'open');
            var readFn = Module.findExportByName(null, 'read');
            if (openFn) {
                Interceptor.attach(openFn, {
                    onEnter: function(args) {
                        try { this.isStatus = (Memory.readCString(args[0]).indexOf('/proc/') !== -1 && Memory.readCString(args[0]).indexOf('status') !== -1); } catch(_) { this.isStatus=false; }
                    },
                    onLeave: function(retval) { try { var fd = retval.toInt32(); if (this.isStatus && fd>2) trackedFds[fd]=1; } catch(_){} }
                });
            }
            if (readFn) {
                Interceptor.attach(readFn, {
                    onEnter: function(args) { this.fd=args[0].toInt32(); this.buf=args[1]; this.len=args[2].toInt32(); },
                    onLeave: function(retval) {
                        try {
                            var r = retval.toInt32();
                            if (r>0 && trackedFds[this.fd]) {
                                var s = Memory.readUtf8String(this.buf, r);
                                var idx = s.indexOf('TracerPid:');
                                if (idx !== -1) {
                                    var end = s.indexOf('\n', idx); if (end === -1) end = s.length;
                                    var prefix = s.substring(0, idx + 'TracerPid:'.length);
                                    var suffix = s.substring(end);
                                    var body = s.substring(idx + 'TracerPid:'.length, end);
                                    var replaced = prefix + body.replace(/[0-9]+/g, ' 0') + suffix;
                                    Memory.writeUtf8String(this.buf, replaced.substr(0, r));
                                }
                            }
                        } catch(_){}
                    }
                });
            }
            LOG('[+] 反调试: 已启用 TracerPid 伪造');
        } catch(_){ }
    }

    LOG('[+] 反调试对抗开关已启用', { c: Color.Green });
}

function nativeHookAntiDebug(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    try {
        var ptrace = Module.findExportByName(null, 'ptrace');
        if (ptrace) {
            Interceptor.attach(ptrace, {
                onEnter: function(args) {
                    try { LOG('[+] ptrace 被调用, request=' + args[0].toInt32()); if (needStack) LOG(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n')); } catch(_){}
                },
                onLeave: function(retval) { try { LOG('[+] ptrace 返回: ' + retval); } catch(_){} }
            });
        }
    } catch (e) { LOG('[-] 反调试Hook失败: ' + e.message, { c: Color.Red }); }
}

