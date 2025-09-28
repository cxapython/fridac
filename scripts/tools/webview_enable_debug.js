/**
 * WebView 调试启用与关键回调监控
 * @description setWebContentsDebuggingEnabled(true) 并监控常见回调
 * @example enableWebViewDebug({ verbose: true })
 */
function enableWebViewDebug(options) {
    options = options || {};
    var verbose = !!options.verbose;

    try {
        Java.perform(function(){
            try {
                var WebView = Java.use('android.webkit.WebView');
                WebView.setWebContentsDebuggingEnabled(true);
                LOG('✅ WebView 调试已启用', { c: Color.Green });

                if (verbose) {
                    try {
                        var WebViewClient = Java.use('android.webkit.WebViewClient');
                        ['onPageStarted','onPageFinished','onReceivedError'].forEach(function(name){
                            try {
                                var m;
                                if (name === 'onPageStarted') m = WebViewClient[name].overload('android.webkit.WebView', 'java.lang.String', 'android.graphics.Bitmap');
                                else if (name === 'onPageFinished') m = WebViewClient[name].overload('android.webkit.WebView', 'java.lang.String');
                                else m = WebViewClient[name].overload('android.webkit.WebView', 'android.webkit.WebResourceRequest', 'android.webkit.WebResourceError');
                                m.implementation = function(){
                                    try { LOG('🌐 WebView.' + name + ' url=' + arguments[1], { c: Color.Cyan }); } catch(_){ }
                                    return m.apply(this, arguments);
                                };
                            } catch(_){}
                        });
                    } catch(_){}
                }
            } catch(e1) { LOG('⚠️ 启用 WebView 调试失败: ' + e1.message, { c: Color.Yellow }); }
        });
        return true;
    } catch (e) {
        LOG('❌ enableWebViewDebug 失败: ' + e.message, { c: Color.Red });
        if (typeof TASK_ID !== 'undefined') { try { notifyTaskError(e); } catch(_){} }
        return false;
    }
}


