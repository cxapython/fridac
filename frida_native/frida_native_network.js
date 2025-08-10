// Frida Native 网络相关 Hook（connect/accept/send/recv/sendmsg/recvmsg/TLS/Conscrypt/BIO）

function sockaddrToString(addrPtr) {
    try {
        if (!addrPtr) return 'NULL';
        var family = Memory.readU16(addrPtr);
        if (family === 2) { // AF_INET
            var port = (Memory.readU8(addrPtr.add(2)) << 8) + Memory.readU8(addrPtr.add(3));
            var ip = [4,5,6,7].map(function(i){ return Memory.readU8(addrPtr.add(i)); }).join('.');
            return ip + ':' + port;
        } else if (family === 10) {
            return 'IPv6';
        } else if (family === 1) {
            try { return 'unix:' + Memory.readCString(addrPtr.add(2)); } catch(_) { return 'unix'; }
        }
    } catch(_) {}
    return 'unknown';
}

function nativeHookNetworkFunctions(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    try {
        var connect = Module.findExportByName(null, 'connect');
        if (connect) {
            Interceptor.attach(connect, {
                onEnter: function(args) {
                    try {
                        var sockfd = args[0].toInt32();
                        var peer = sockaddrToString(args[1]);
                        if (__rateLimiter.shouldLog('connect:'+peer, 50, 2000)) emitEvent('net_connect', { fd: sockfd, peer: peer });
                        if (needStack) LOG(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n'));
                    } catch(_){}
                }
            });
        }

        var send = Module.findExportByName(null, 'send');
        if (send) {
            Interceptor.attach(send, {
                onEnter: function(args) {
                    try {
                        var sockfd = args[0].toInt32();
                        var len = args[2].toInt32();
                        if (__rateLimiter.shouldLog('send:'+sockfd, 100, 1000)) emitEvent('net_send', { fd: sockfd, len: len });
                        if (len > 0 && len <= 1024 && __rateLimiter.shouldLog('send:dump', 10, 1000)) LOG(hexdump(args[1], { length: Math.min(len, 128) }));
                        if (needStack) LOG(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n'));
                    } catch(_){}
                }
            });
        }

        var recv = Module.findExportByName(null, 'recv');
        if (recv) {
            Interceptor.attach(recv, {
                onEnter: function(args) { this.sockfd=args[0].toInt32(); this.buf=args[1]; this.len=args[2].toInt32(); },
                onLeave: function(retval) {
                    try { var n=retval.toInt32(); if (n>0) { if (__rateLimiter.shouldLog('recv:'+this.sockfd, 100, 1000)) emitEvent('net_recv', { fd: this.sockfd, len: n }); if (n<=1024 && this.buf && __rateLimiter.shouldLog('recv:dump', 10, 1000)) LOG(hexdump(this.buf, { length: Math.min(n, 128) })); } } catch(_){}
                }
            });
        }

        var accept = Module.findExportByName(null, 'accept');
        if (accept) {
            Interceptor.attach(accept, {
                onEnter: function(args) { this.server_fd=args[0].toInt32(); this.addr=args[1]; },
                onLeave: function(retval) {
                    try { var cfd=retval.toInt32(); if (cfd>=0) { var peer='unknown'; try { if (this.addr && !this.addr.isNull()) peer=sockaddrToString(this.addr); } catch(_){ } if (__rateLimiter.shouldLog('accept:'+cfd, 50, 1000)) emitEvent('net_accept', { fd: cfd, server_fd: this.server_fd, peer: peer }); } } catch(_){}
                }
            });
        }

        var sendmsg = Module.findExportByName(null, 'sendmsg');
        if (sendmsg) {
            Interceptor.attach(sendmsg, {
                onEnter: function(args) { try { this.sockfd=args[0].toInt32(); } catch(_){ this.sockfd=-1; } },
                onLeave: function(retval) { try { var n=retval.toInt32(); if (n>0) emitEvent('net_sendmsg', { fd: this.sockfd, len: n }); } catch(_){ } }
            });
        }

        var recvmsg = Module.findExportByName(null, 'recvmsg');
        if (recvmsg) {
            Interceptor.attach(recvmsg, {
                onEnter: function(args) { this.sockfd=args[0].toInt32(); this.msg=args[1]; },
                onLeave: function(retval) { try { var n=retval.toInt32(); if (n>0) emitEvent('net_recvmsg', { fd: this.sockfd, len: n }); } catch(_){ } }
            });
        }

        var getaddrinfo = Module.findExportByName(null, 'getaddrinfo');
        if (getaddrinfo) {
            Interceptor.attach(getaddrinfo, {
                onEnter: function(args) { try { var node=args[0].isNull()?'':Memory.readCString(args[0]); var service=args[1].isNull()?'':Memory.readCString(args[1]); if (__rateLimiter.shouldLog('getaddrinfo:'+node+':'+service, 50, 1000)) emitEvent('dns_query', { node: node, service: service }); } catch(_){} }
            });
        }

        LOG('[+] 网络函数Hook已启用', { c: Color.Green });
    } catch (e) { LOG('[-] 网络函数Hook失败: ' + e.message, { c: Color.Red }); }
}

function nativeHookTLSFunctions(showStack) {
    showStack = showStack || 0; var needStack = showStack === 1;
    try {
        [{ lib:'libssl.so', name:'SSL_write', dir:'send' },{ lib:'libssl.so', name:'SSL_read', dir:'recv' },{ lib:null, name:'SSL_write', dir:'send' },{ lib:null, name:'SSL_read', dir:'recv' }].forEach(function(t){
            var addr = Module.findExportByName(t.lib, t.name); if (!addr) return;
            Interceptor.attach(addr, {
                onEnter: function(args){ this.buf=args[1]; this.len=args[2].toInt32?args[2].toInt32():parseInt(args[2]); this.dir=t.dir; if (__rateLimiter.shouldLog(t.name+':'+t.dir, 20, 1000)) { LOG('🔐 '+t.name+'('+t.dir+') len='+this.len); if (needStack) { try { LOG(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n')); } catch(_){} } } },
                onLeave: function(retval){ try { var n=retval.toInt32?retval.toInt32():parseInt(retval); if (n>0 && n<=4096 && this.buf && __rateLimiter.shouldLog(t.name+':dump', 10, 1000)) LOG('📦 TLS('+this.dir+') 前256字节:\n' + hexdump(this.buf, { length: Math.min(n, 256) })); } catch(_){} }
            });
        });
    } catch (e) { LOG('[-] TLS Hook失败: ' + e.message); }
}

function nativeHookConscryptTLS(showStack) {
    showStack = showStack || 0; var needStack = showStack === 1;
    function hookAddr(addr, name, dir) {
        try { Interceptor.attach(addr, { onEnter: function(args){ this.buf=args[2]||args[1]; this.len=(args[3]||args[2]); try{ this.n=this.len.toInt32?this.len.toInt32():parseInt(this.len);}catch(_){ this.n=0; } this.dir=dir; if (__rateLimiter.shouldLog('Conscrypt:'+name, 20, 1000)) { LOG('🔐 Conscrypt '+name+'('+dir+') len='+this.n); if (needStack) { try { LOG(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n')); } catch(_){} } } }, onLeave: function(retval){ try { var r=retval.toInt32?retval.toInt32():parseInt(retval); if (r>0 && r<=4096 && this.buf && __rateLimiter.shouldLog('Conscrypt:'+name+':dump', 10, 1000)) { LOG('📦 Conscrypt('+this.dir+') 前256字节:\n' + hexdump(this.buf, { length: Math.min(r, 256) })); } } catch(_){} } }); return true; } catch(e){ return false; }
    }
    try {
        var targets = []; var modules = Process.enumerateModules();
        modules.forEach(function(m){ var name=(m.name||'').toLowerCase(); if (name.indexOf('conscrypt')!==-1 || name.indexOf('javacrypto')!==-1) { try { var exps=m.enumerateExports(); exps.forEach(function(e){ var en=e.name||''; if (/NativeCrypto.*SSL_(read|write)/.test(en) || /Java_.*NativeCrypto.*SSL_(read|write)/.test(en)) { var dir=en.indexOf('write')!==-1 ? 'send' : 'recv'; targets.push({ addr:e.address, name:en, dir:dir, mod:m.name }); } }); } catch(_){} } });
        if (targets.length === 0) { LOG('⚠️ 未找到 Conscrypt NativeCrypto 符号', { c: Color.Yellow }); } else { targets.forEach(function(t){ if (hookAddr(t.addr, t.name, t.dir)) LOG('[+] Hook Conscrypt: ' + t.mod + '!' + t.name); }); }
    } catch (e) { LOG('[-] Conscrypt TLS Hook失败: ' + e.message, { c: Color.Red }); }
}

function nativeHookBIOFunctions(showStack) {
    showStack = showStack || 0; var needStack = showStack === 1;
    try {
        [{name:'BIO_read', dir:'recv'},{name:'BIO_write', dir:'send'}].forEach(function(t){ var addr=Module.findExportByName(null,t.name)||Module.findExportByName('libssl.so',t.name); if (!addr) return; Interceptor.attach(addr,{ onEnter:function(args){ this.buf=args[1]; this.len=args[2].toInt32?args[2].toInt32():parseInt(args[2]); this.dir=t.dir; if (__rateLimiter.shouldLog('BIO:'+t.name, 50, 1000)) { LOG('🔎 '+t.name+'('+t.dir+') len='+this.len); if (needStack) { try { LOG(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n')); } catch(_){} } } }, onLeave:function(retval){ try { var n=retval.toInt32?retval.toInt32():parseInt(retval); if (n>0 && n<=4096 && this.buf && __rateLimiter.shouldLog('BIO:dump',10,1000)) LOG('📦 BIO('+this.dir+') 前256字节:\n' + hexdump(this.buf, { length: Math.min(n, 256) })); } catch(_){} } }); LOG('[+] Hook BIO: '+(addr.moduleName||'any')+'!'+t.name); });
        LOG('[+] BIO 函数Hook已启用', { c: Color.Green });
    } catch (e) { LOG('[-] BIO 函数Hook失败: ' + e.message, { c: Color.Red }); }
}

