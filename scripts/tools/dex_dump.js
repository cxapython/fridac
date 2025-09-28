/**
 * DEX 脱壳（运行时 dump）
 * @description 在 ART 运行时遍历内存中的 dex 结构，导出到 /data/local/tmp 或自定义目录；并监听 dlopen 以便新加载的 dex/so 出现后再次尝试 dump
 * @example dumpDex({ dir: '/sdcard/Download', rehook: true })
 */
function dumpDex(options) {
    options = options || {};
    var outDir = String(options.dir || '/data/local/tmp');
    var enableRehook = options.rehook !== false;

    try {
        var dumped = 0;
        var seen = {};

        function dump_one(base, size, idx) {
            try {
                var file = outDir + '/dump_' + idx + '_' + Process.id + '.dex';
                var bytes = Memory.readByteArray(base, size);
                var f = new File(file, 'wb');
                f.write(bytes);
                f.flush();
                f.close();
                dumped++;
                LOG('✅ 导出 DEX: ' + file + ' size=' + size, { c: Color.Green });
                try { send({ type: 'dex_dump', ts: Date.now(), items: { path: file, size: size, task_id: (typeof TASK_ID!=='undefined'?TASK_ID:null) } }); } catch(_){ }
            } catch (e) { LOG('⚠️ 导出 DEX 失败: ' + e.message, { c: Color.Yellow }); }
        }

        function scan_for_dex() {
            try {
                Process.enumerateRanges('r--').forEach(function(r){
                    try {
                        var p = Memory.scanSync(r.base, r.size, '64 65 78 0a 30 33 35 00'); // dex\n035\0
                        p.forEach(function(hit, i){
                            var addr = hit.address;
                            var key = addr.toString();
                            if (seen[key]) return;
                            seen[key] = 1;
                            // 解析 header，获取 file_size
                            try {
                                var file_size = Memory.readU32(addr.add(0x20));
                                if (file_size > 0 && file_size < 80 * 1024 * 1024) {
                                    dump_one(addr, file_size, Object.keys(seen).length);
                                }
                            } catch(_){}
                        });
                    } catch(_){}
                });
            } catch(e) { LOG('⚠️ 扫描内存失败: ' + e.message, { c: Color.Yellow }); }
        }

        scan_for_dex();

        if (enableRehook) {
            try {
                ['dlopen','android_dlopen_ext'].forEach(function(name){
                    var addr = Module.findExportByName(null, name);
                    if (!addr) return;
                    Interceptor.attach(addr, {
                        onLeave: function() {
                            try { setTimeout(scan_for_dex, 500); } catch(_){ }
                        }
                    });
                });
                LOG('ℹ️ 已启用 dlopen 重挂钩，后续加载将尝试再次 dump', { c: Color.Cyan });
            } catch(_){}
        }

        LOG('✅ DEX dump 完成，已导出: ' + dumped, { c: Color.Green });
        return dumped;
    } catch (e) {
        LOG('❌ DEX dump 失败: ' + e.message, { c: Color.Red });
        if (typeof TASK_ID !== 'undefined') { try { notifyTaskError(e); } catch(_){ }
        }
        return 0;
    }
}


