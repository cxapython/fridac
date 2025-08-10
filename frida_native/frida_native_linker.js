// Frida Native 链接器家族 Hook（dlopen/dlsym/android_dlopen_ext）

function nativeHookDlopenFamily(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    try {
        var dlopen = Module.findExportByName(null, "dlopen");
        if (dlopen) {
            Interceptor.attach(dlopen, {
                onEnter: function(args) {
                    try {
                        this.library = Memory.readCString(args[0]);
                        LOG("[+] dlopen 加载库: " + this.library);
                        if (needStack) {
                            LOG(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n'));
                        }
                    } catch(_){}
                },
                onLeave: function(retval) {
                    try { if (!retval.isNull && retval.toString() === '0x0') return; __tryInvokeRehooks(this.library || ''); } catch(_){ }
                }
            });
        }

        var dlsym = Module.findExportByName(null, "dlsym");
        if (dlsym) {
            Interceptor.attach(dlsym, {
                onEnter: function(args) {
                    try {
                        this.symbol = Memory.readCString(args[1]);
                        LOG("[+] dlsym 查找符号: " + this.symbol);
                        if (needStack) {
                            LOG(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n'));
                        }
                    } catch(_){}
                }
            });
        }

        var android_dlopen_ext = Module.findExportByName(null, "android_dlopen_ext");
        if (android_dlopen_ext) {
            Interceptor.attach(android_dlopen_ext, {
                onEnter: function(args) {
                    try {
                        this.library = args[0].isNull() ? '' : Memory.readCString(args[0]);
                        LOG("[+] android_dlopen_ext 加载库: " + this.library);
                        if (needStack) {
                            LOG(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n'));
                        }
                    } catch(_){}
                },
                onLeave: function(retval) {
                    try { if (!retval.isNull && this.library) __tryInvokeRehooks(this.library); } catch(_){ }
                }
            });
        }

        var dl_iterate_phdr = Module.findExportByName(null, "dl_iterate_phdr");
        if (dl_iterate_phdr) {
            Interceptor.attach(dl_iterate_phdr, { onEnter: function(){ LOG("[+] dl_iterate_phdr 调用"); } });
        }

        LOG("[+] dlopen/dlsym/android_dlopen_ext Hook已启用");
    } catch (e) {
        LOG("[-] dlopen/dlsym Hook失败: " + e.message, { c: Color.Red });
    }
}

// 自动重挂钩注册与触发
var __rehookRegistry = [];
var __rehookExecuted = {};
function nativeRegisterRehook(name, match, fn) {
    try { __rehookRegistry.push({ name: name || ('hook_'+(__rehookRegistry.length+1)), match: match, fn: fn }); LOG('[+] 已注册重挂钩: ' + name); return true; } catch(e){ return false; }
}
function __tryInvokeRehooks(libraryName) {
    try {
        __rehookRegistry.forEach(function(item){
            try {
                var key = item.name + '@' + libraryName;
                if (__rehookExecuted[key]) return;
                var ok = false;
                if (!item.match) ok = true;
                else if (typeof item.match === 'function') ok = !!item.match(libraryName);
                else if (item.match instanceof RegExp) ok = item.match.test(libraryName);
                else if (typeof item.match === 'string') ok = libraryName.indexOf(item.match) !== -1;
                if (ok && typeof item.fn === 'function') {
                    try { item.fn(libraryName); __rehookExecuted[key] = 1; } catch(_){ }
                }
            } catch(_){ }
        });
    } catch(_){ }
}

