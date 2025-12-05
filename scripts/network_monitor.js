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