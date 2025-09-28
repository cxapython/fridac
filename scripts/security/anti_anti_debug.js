/**
 * 反调试/反代理/反 Frida 检测绕过（Java 层常见路径）
 * @description 关闭常见 Java 层反调试检测：Debug.isDebuggerConnected、TracerPid 读取、VPN/代理检测等；Native 对抗建议结合内置 nativeAntiDebug
 * @example antiAntiDebug({ vpn: true, proxy: true })
 */
function antiAntiDebug(options) {
    options = options || {};
    var bypassVpn = options.vpn !== false;
    var bypassProxy = options.proxy !== false;

    try {
        Java.perform(function(){
            // 1) Debug.isDebuggerConnected → false
            try {
                var Debug = Java.use('android.os.Debug');
                var m = Debug.isDebuggerConnected.overload();
                m.implementation = function(){ return false; };
                LOG('✅ Debug.isDebuggerConnected() 已固定为 false', { c: Color.Green });
            } catch(_) { LOG('ℹ️ Debug.isDebuggerConnected 不可用', { c: Color.Gray }); }

            // 2) 读取 /proc/self/status 中 TracerPid → 拦截常见读取 API
            try {
                var FileInputStream = Java.use('java.io.FileInputStream');
                var fis = FileInputStream.$init.overload('java.lang.String');
                fis.implementation = function(path){
                    if (String(path).indexOf('/proc/self/status') !== -1) {
                        LOG('🛡️ 拦截读取 TracerPid 尝试: ' + path, { c: Color.Yellow });
                        // 可选择返回真实 FIS，但后续读取被替换；此处直接调用原始构造
                    }
                    return fis.call(this, path);
                };
            } catch(_) {}

            try {
                var BufferedReader = Java.use('java.io.BufferedReader');
                var br = BufferedReader.readLine.overload();
                br.implementation = function(){
                    var line = br.call(this);
                    try {
                        if (line && String(line).indexOf('TracerPid:') !== -1) {
                            LOG('🛡️ 替换 TracerPid 行', { c: Color.Yellow });
                            return 'TracerPid:\t0';
                        }
                    } catch(_){ }
                    return line;
                };
            } catch(_) {}

            // 3) VPN/代理检测绕过（可选）
            if (bypassVpn) {
                try {
                    var NetworkInfo = Java.use('android.net.NetworkInfo');
                    var isAvailable = NetworkInfo.isAvailable.overload();
                    isAvailable.implementation = function(){ return true; };
                    LOG('✅ VPN 可用性固定为 true（避免被当作异常网络）', { c: Color.Green });
                } catch(_) {}
            }
            if (bypassProxy) {
                try {
                    var System = Java.use('java.lang.System');
                    var getenv = System.getenv.overload('java.lang.String');
                    getenv.implementation = function(name){
                        var n = String(name||'').toLowerCase();
                        if (n.indexOf('http_proxy') !== -1 || n.indexOf('https_proxy') !== -1) return null;
                        return getenv.call(this, name);
                    };
                    LOG('✅ 代理环境变量隐藏 (http_proxy / https_proxy)', { c: Color.Green });
                } catch(_) {}
            }
        });

        LOG('✅ antiAntiDebug 已启用', { c: Color.Green });
        return true;
    } catch (e) {
        LOG('❌ antiAntiDebug 失败: ' + e.message, { c: Color.Red });
        if (typeof TASK_ID !== 'undefined') { try { notifyTaskError(e); } catch(_){} }
        return false;
    }
}


