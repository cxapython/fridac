/**
 * 网络监控自定义脚本
 * @description 高级网络监控和分析工具
 * @author fridac-user
 */

/**
 * 监控所有HTTP请求并分析请求模式
 * @description 全面监控应用的HTTP/HTTPS请求，包括请求头、参数、响应等
 * @example monitorAllNetworkRequests(true)
 * @param {boolean} showDetails - 是否显示详细信息
 */
function monitorAllNetworkRequests(showDetails) {
    showDetails = showDetails || false;
    
    try {
        LOG("🌐 开始监控所有网络请求...", { c: Color.Cyan });
        
        var requestCount = 0;
        var uniqueHosts = {};
        var suspiciousRequests = [];
        
        // Hook HttpURLConnection
        try {
            var HttpURLConnection = Java.use("java.net.HttpURLConnection");
            var connect = HttpURLConnection.connect.overload();
            
            connect.implementation = function() {
                try {
                    requestCount++;
                    var url = this.getURL().toString();
                    var method = this.getRequestMethod();
                    var host = this.getURL().getHost();
                    
                    // 统计主机
                    uniqueHosts[host] = (uniqueHosts[host] || 0) + 1;
                    
                    // 检测可疑请求
                    if (url.toLowerCase().indexOf('login') !== -1 || 
                        url.toLowerCase().indexOf('auth') !== -1 ||
                        url.toLowerCase().indexOf('password') !== -1) {
                        suspiciousRequests.push({
                            url: url,
                            method: method,
                            time: new Date().toISOString()
                        });
                        LOG("🚨 检测到敏感请求: " + method + " " + url, { c: Color.Red });
                    }
                    
                    if (showDetails || requestCount <= 5) {
                        LOG("🌐 HTTP请求 #" + requestCount + ": " + method + " " + url, { c: Color.Blue });
                        LOG("  Host: " + host, { c: Color.White });
                    }
                    
                    if (typeof TASK_ID !== 'undefined') {
                        notifyTaskHit({
                            operation: "http_request",
                            method: method,
                            url: url,
                            host: host,
                            request_count: requestCount
                        });
                    }
                    
                } catch (e) {
                    LOG("⚠️ 处理HTTP请求时出错: " + e.message, { c: Color.Yellow });
                }
                
                return connect.call(this);
            };
            
            LOG("✅ HttpURLConnection Hook已设置", { c: Color.Green });
            
        } catch (e) {
            LOG("⚠️ 设置HttpURLConnection Hook失败: " + e.message, { c: Color.Yellow });
        }
        
        // Hook OkHttp (如果存在)
        try {
            var OkHttpClient = Java.use("okhttp3.OkHttpClient");
            LOG("✅ 检测到OkHttp，设置高级监控...", { c: Color.Green });
            
            // 这里可以添加OkHttp的Hook逻辑
            
        } catch (e) {
            LOG("ℹ️ 未检测到OkHttp", { c: Color.Gray });
        }
        
        // 定期统计报告
        setTimeout(function() {
            LOG("\n📊 网络监控统计报告:", { c: Color.Cyan });
            LOG("  总请求数: " + requestCount, { c: Color.White });
            LOG("  唯一主机数: " + Object.keys(uniqueHosts).length, { c: Color.White });
            LOG("  敏感请求数: " + suspiciousRequests.length, { c: Color.White });
            
            if (Object.keys(uniqueHosts).length > 0) {
                LOG("  主要主机:", { c: Color.Blue });
                Object.keys(uniqueHosts).forEach(function(host) {
                    LOG("    " + host + ": " + uniqueHosts[host] + " 次", { c: Color.White });
                });
            }
        }, 30000); // 30秒后显示统计
        
        return true;
        
    } catch (error) {
        LOG("❌ 设置网络监控失败: " + error.message, { c: Color.Red });
        if (typeof TASK_ID !== 'undefined') {
            notifyTaskError(error);
        }
        return false;
    }
}

/**
 * 检测SSL证书绕过
 * @description 检测应用是否使用了SSL证书绕过技术
 * @example detectSSLBypass()
 */
function detectSSLBypass() {
    try {
        LOG("🔐 检测SSL证书绕过...", { c: Color.Cyan });
        
        var detectedBypass = false;
        
        // 检测常见的SSL绕过类
        var suspiciousClasses = [
            'javax.net.ssl.X509TrustManager',
            'javax.net.ssl.HostnameVerifier',
            'javax.net.ssl.HttpsURLConnection'
        ];
        
        suspiciousClasses.forEach(function(className) {
            try {
                var clazz = Java.use(className);
                LOG("🔍 检查类: " + className, { c: Color.Blue });
                
                // 检测X509TrustManager
                if (className === 'javax.net.ssl.X509TrustManager') {
                    var checkServerTrusted = clazz.checkServerTrusted.overload('[Ljava.security.cert.X509Certificate;', 'java.lang.String');
                    checkServerTrusted.implementation = function(chain, authType) {
                        LOG("🚨 SSL证书验证被绕过!", { c: Color.Red });
                        detectedBypass = true;
                        
                        if (typeof TASK_ID !== 'undefined') {
                            notifyTaskHit({
                                operation: "ssl_bypass",
                                class: className,
                                method: "checkServerTrusted"
                            });
                        }
                        
                        // 调用原方法或直接返回（绕过）
                        try {
                            return checkServerTrusted.call(this, chain, authType);
                        } catch (e) {
                            LOG("  原始验证失败，但被绕过", { c: Color.Yellow });
                            return; // 绕过验证
                        }
                    };
                }
                
            } catch (e) {
                LOG("  类不存在或无法访问: " + className, { c: Color.Gray });
            }
        });
        
        if (detectedBypass) {
            LOG("⚠️ 检测到SSL证书绕过机制", { c: Color.Red });
        } else {
            LOG("✅ 未检测到SSL证书绕过", { c: Color.Green });
        }
        
        return detectedBypass;
        
    } catch (error) {
        LOG("❌ SSL绕过检测失败: " + error.message, { c: Color.Red });
        if (typeof TASK_ID !== 'undefined') {
            notifyTaskError(error);
        }
        return false;
    }
}

/**
 * 快速网络安全评估
 * @description 对应用的网络安全实现进行快速评估
 * @example quickNetworkSecurityAssessment()
 */
function quickNetworkSecurityAssessment() {
    try {
        LOG("🛡️ 开始网络安全评估...", { c: Color.Cyan });
        
        var results = {
            sslBypass: false,
            httpUsage: false,
            weakCiphers: false,
            certificatePinning: false
        };
        
        // 检测SSL绕过
        results.sslBypass = detectSSLBypass();
        
        // 检测HTTP使用
        var URL = Java.use("java.net.URL");
        var urlInit = URL.$init.overload('java.lang.String');
        urlInit.implementation = function(spec) {
            if (spec.startsWith('http://')) {
                LOG("⚠️ 检测到HTTP连接: " + spec, { c: Color.Yellow });
                results.httpUsage = true;
            }
            return urlInit.call(this, spec);
        };
        
        // 检测证书绑定
        try {
            var CertificatePinner = Java.use("okhttp3.CertificatePinner");
            LOG("✅ 检测到证书绑定实现", { c: Color.Green });
            results.certificatePinning = true;
        } catch (e) {
            LOG("⚠️ 未检测到证书绑定", { c: Color.Yellow });
        }
        
        // 生成报告
        setTimeout(function() {
            LOG("\n📋 网络安全评估报告:", { c: Color.Cyan });
            LOG("  SSL绕过: " + (results.sslBypass ? "❌ 检测到" : "✅ 未发现"), { c: results.sslBypass ? Color.Red : Color.Green });
            LOG("  HTTP使用: " + (results.httpUsage ? "⚠️ 检测到" : "✅ 未发现"), { c: results.httpUsage ? Color.Yellow : Color.Green });
            LOG("  证书绑定: " + (results.certificatePinning ? "✅ 已实现" : "⚠️ 未实现"), { c: results.certificatePinning ? Color.Green : Color.Yellow });
            
            var score = 0;
            if (!results.sslBypass) score += 30;
            if (!results.httpUsage) score += 25;
            if (results.certificatePinning) score += 45;
            
            LOG("  安全评分: " + score + "/100", { c: score >= 80 ? Color.Green : score >= 60 ? Color.Yellow : Color.Red });
            
            if (typeof TASK_ID !== 'undefined') {
                notifyTaskHit({
                    operation: "security_assessment",
                    score: score,
                    results: results
                });
            }
        }, 5000);
        
        return results;
        
    } catch (error) {
        LOG("❌ 网络安全评估失败: " + error.message, { c: Color.Red });
        if (typeof TASK_ID !== 'undefined') {
            notifyTaskError(error);
        }
        return null;
    }
}
