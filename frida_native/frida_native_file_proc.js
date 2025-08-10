// Frida Native 文件与进程/内存管理 Hook（open/read/write/mmap/mprotect/ptrace/execve 等）

function nativeHookFileIOFunctions(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    try {
        [ 'open','openat','creat','read','write','fopen','fread','fwrite','fclose','rename','unlink','stat','lstat','fstat' ].forEach(function(name){
            var addr = Module.findExportByName(null, name);
            if (!addr) return;
            Interceptor.attach(addr, {
                onEnter: function(args) {
                    this.fn = name; this.args = args;
                    if (!__rateLimiter.shouldLog('fs:'+name, 50, 1000)) return;
                    try {
                        if (name === 'open' || name === 'creat' || name === 'fopen') { LOG('📁 '+name+': ' + Memory.readCString(args[0])); }
                        else if (name === 'openat') { LOG('📁 openat dfd=' + args[0].toInt32() + ', path=' + Memory.readCString(args[1])); }
                        else if (name === 'read' || name === 'write') { LOG('📄 '+name+': fd=' + args[0].toInt32() + ', len=' + args[2].toInt32()); }
                        else if (name === 'rename') { LOG('🔀 rename: ' + Memory.readCString(args[0]) + ' -> ' + Memory.readCString(args[1])); }
                        else if (name === 'unlink') { LOG('🗑️ unlink: ' + Memory.readCString(args[0])); }
                        if (needStack) LOG(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n'));
                    } catch(_){}
                }
            });
        });
    } catch (e) { LOG('[-] 文件IO Hook失败: ' + e.message); }
}

function nativeHookProcessMemoryFunctions(showStack) {
    showStack = showStack || 0; var needStack = showStack === 1;
    function decodeProt(p){ try { var v=p.toInt32?p.toInt32():p; var flags=[]; if(v&1) flags.push('PROT_READ'); if(v&2) flags.push('PROT_WRITE'); if(v&4) flags.push('PROT_EXEC'); if(flags.length===0) flags.push('PROT_NONE'); return flags.join('|'); } catch(_) { return String(p); } }
    try {
        var mmap = Module.findExportByName(null, 'mmap'); if (mmap) { Interceptor.attach(mmap, { onEnter: function(args){ try { LOG('🧩 mmap addr='+args[0]+', len='+args[1].toInt32()+', prot='+decodeProt(args[2])); if (needStack) LOG(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n')); } catch(_){} } }); }
        var mprotect = Module.findExportByName(null, 'mprotect'); if (mprotect) { Interceptor.attach(mprotect, { onEnter: function(args){ try { LOG('🛡️ mprotect addr='+args[0]+', len='+args[1].toInt32()+', prot='+decodeProt(args[2])); } catch(_){} } }); }
        var munmap = Module.findExportByName(null, 'munmap'); if (munmap) { Interceptor.attach(munmap, { onEnter: function(args){ try { LOG('🧹 munmap addr='+args[0]+', len='+args[1].toInt32()); } catch(_){} } }); }
        var prctl = Module.findExportByName(null, 'prctl'); if (prctl) { Interceptor.attach(prctl, { onEnter: function(args){ try { LOG('⚙️ prctl option='+args[0].toInt32()); } catch(_){} } }); }
        var ptrace = Module.findExportByName(null, 'ptrace'); if (ptrace) { Interceptor.attach(ptrace, { onEnter: function(args){ try { var req=args[0].toInt32(); if (__rateLimiter.shouldLog('ptrace:'+req, 20, 2000)) LOG('🧪 ptrace request='+req); if (needStack) LOG(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n')); } catch(_){} } }); }
        var execve = Module.findExportByName(null, 'execve'); if (execve) { Interceptor.attach(execve, { onEnter: function(args){ try { LOG('🚀 execve ' + (args[0].isNull()?'':Memory.readCString(args[0]))); } catch(_){} } }); }
        var systemFn = Module.findExportByName(null, 'system'); if (systemFn) { Interceptor.attach(systemFn, { onEnter: function(args){ try { LOG('🚀 system ' + (args[0].isNull()?'':Memory.readCString(args[0]))); } catch(_){} } }); }
        LOG('[+] 进程/内存函数Hook已启用', { c: Color.Green });
    } catch (e) { LOG('[-] 进程/内存函数Hook失败: ' + e.message, { c: Color.Red }); }
}

