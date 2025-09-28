/**
 * SSL Pinning 全量绕过（Java + OkHttp + Conscrypt + BoringSSL）
 * @description 一键启用多路径 SSL 验证绕过，覆盖常见 TrustManager/HostnameVerifier/OkHttp CertificatePinner/Conscrypt 路径，并在 Native 层尝试 BoringSSL 自定义验证放行
 * @example sslBypass({ aggressive: true })
 */
function sslBypass(options) {
    options = options || {};
    var aggressive = !!options.aggressive;

    try {
        LOG("\uD83D\uDD12 启用 SSL Pinning 绕过" + (aggressive ? " (aggressive)" : ""), { c: Color.Cyan });

        Java.perform(function() {
            // TrustManager 放行
            try {
                var X509TrustManager = Java.use('javax.net.ssl.X509TrustManager');
                var SSLContext = Java.use('javax.net.ssl.SSLContext');

                var TrustManager = Java.registerClass({
                    name: 'com.fridac.TrustAllManager',
                    implements: [X509TrustManager],
                    methods: {
                        checkClientTrusted: [{ returnType: 'void', argumentTypes: ['[Ljava.security.cert.X509Certificate;', 'java.lang.String'], implementation: function(chain, authType) {} }],
                        checkServerTrusted: [{ returnType: 'void', argumentTypes: ['[Ljava.security.cert.X509Certificate;', 'java.lang.String'], implementation: function(chain, authType) {} }],
                        getAcceptedIssuers: [{ returnType: '[Ljava.security.cert.X509Certificate;', argumentTypes: [], implementation: function() { return []; } }]
                    }
                });

                var trustAllCerts = [TrustManager.$new()];
                var SSLContext_init = SSLContext.init.overload('[Ljavax.net.ssl.KeyManager;', '[Ljavax.net.ssl.TrustManager;', 'java.security.SecureRandom');
                var TLS = SSLContext.getInstance('TLS');
                SSLContext_init.call(TLS, null, trustAllCerts, null);
                SSLContext.setDefault(TLS);
                LOG('✅ TrustManager 放行已启用', { c: Color.Green });
            } catch (e1) { LOG('⚠️ TrustManager 放行失败: ' + e1.message, { c: Color.Yellow }); }

            // HostnameVerifier 放行
            try {
                var HttpsURLConnection = Java.use('javax.net.ssl.HttpsURLConnection');
                var HostnameVerifier = Java.use('javax.net.ssl.HostnameVerifier');
                var TrustAllHostnameVerifier = Java.registerClass({
                    name: 'com.fridac.TrustAllHostname',
                    implements: [HostnameVerifier],
                    methods: {
                        verify: [{ returnType: 'boolean', argumentTypes: ['java.lang.String', 'javax.net.ssl.SSLSession'], implementation: function(hostname, session) { return true; } }]
                    }
                });
                HttpsURLConnection.setDefaultHostnameVerifier(TrustAllHostnameVerifier.$new());
                LOG('✅ HostnameVerifier 放行已启用', { c: Color.Green });
            } catch (e2) { LOG('⚠️ HostnameVerifier 放行失败: ' + e2.message, { c: Color.Yellow }); }

            // OkHttp3 CertificatePinner 绕过
            try {
                var CertPinner = Java.use('okhttp3.CertificatePinner');
                var b1 = CertPinner.check.overload('java.lang.String', 'java.util.List');
                b1.implementation = function() { return; };
                var b2;
                try { b2 = CertPinner.check.overload('java.lang.String', '[Ljava.security.cert.Certificate;'); } catch(_) {}
                if (b2) b2.implementation = function() { return; };
                LOG('✅ OkHttp3 CertificatePinner 已绕过', { c: Color.Green });
            } catch (e3) { LOG('ℹ️ 未检测到 OkHttp3 CertificatePinner: ' + e3.message, { c: Color.Gray }); }

            // OkHttpClient.Builder sslSocketFactory 放行（兼容多版本）
            try {
                var OkHttpClientBuilder = Java.use('okhttp3.OkHttpClient$Builder');
                var TrustManagerFactory = Java.use('javax.net.ssl.TrustManagerFactory');
                var X509TM = Java.use('javax.net.ssl.X509TrustManager');
                var SSLContext = Java.use('javax.net.ssl.SSLContext');

                function __trustAll() {
                    var tm = Java.array('javax.net.ssl.TrustManager', [Java.use('com.fridac.TrustAllManager').$new()]);
                    var sc = SSLContext.getInstance('TLS');
                    sc.init(null, tm, null);
                    return sc.getSocketFactory();
                }

                try {
                    var m1 = OkHttpClientBuilder.sslSocketFactory.overload('javax.net.ssl.SSLSocketFactory', 'javax.net.ssl.X509TrustManager');
                    m1.implementation = function(factory, tm) { return m1.call(this, __trustAll(), Java.use('com.fridac.TrustAllManager').$new()); };
                    LOG('✅ OkHttp sslSocketFactory 绕过(2-arg)', { c: Color.Green });
                } catch(_) {}

                try {
                    var m0 = OkHttpClientBuilder.sslSocketFactory.overload('javax.net.ssl.SSLSocketFactory');
                    m0.implementation = function(factory) { return m0.call(this, __trustAll()); };
                    LOG('✅ OkHttp sslSocketFactory 绕过(1-arg)', { c: Color.Green });
                } catch(_) {}
            } catch (e4) { LOG('ℹ️ OkHttp sslSocketFactory 未处理: ' + e4.message, { c: Color.Gray }); }

            // Conscrypt / TrustManagerImpl 验证绕过
            try {
                var TrustManagerImpl = Java.use('com.android.org.conscrypt.TrustManagerImpl');
                ['checkServerTrusted','verifyChain'].forEach(function(name){ try { TrustManagerImpl[name].implementation = function(){ return arguments[0] || []; }; } catch(_){} });
                LOG('✅ Conscrypt TrustManagerImpl 已绕过', { c: Color.Green });
            } catch (_) {
                try {
                    var OpenSSLSocketImpl = Java.use('com.android.org.conscrypt.OpenSSLSocketImpl');
                    if (OpenSSLSocketImpl) LOG('ℹ️ 旧版 Conscrypt 存在，通常已被上面 TrustAll 覆盖', { c: Color.Gray });
                } catch(__) {}
            }
        });

        // Native 层（BoringSSL） custom verify 放行
        try {
            var addr = Module.findExportByName(null, 'SSL_CTX_set_custom_verify');
            if (addr) {
                Interceptor.attach(addr, {
                    onEnter: function(args) {
                        try { this.mode = args[1].toInt32(); } catch(_) {}
                        try { var cb = args[2]; if (!cb.isNull()) Memory.writePointer(args[2], ptr('0x0')); } catch(_) {}
                    },
                    onLeave: function() { try { LOG('✅ BoringSSL custom verify 已强制信任', { c: Color.Green }); } catch(_){} }
                });
            } else {
                LOG('ℹ️ 未找到 SSL_CTX_set_custom_verify 符号（可能不是 BoringSSL）', { c: Color.Gray });
            }
        } catch (e5) { LOG('⚠️ BoringSSL 绕过失败: ' + e5.message, { c: Color.Yellow }); }

        LOG('✅ SSL Bypass 完成', { c: Color.Green });
        return true;
    } catch (e) {
        LOG('❌ SSL Bypass 失败: ' + e.message, { c: Color.Red });
        if (typeof TASK_ID !== 'undefined') { try { notifyTaskError(e); } catch(_){} }
        return false;
    }
}


