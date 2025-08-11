/**
 * fridacli OkHttp Logger 插件
 * 独立插件模式：依赖 frida_common_new.js 中的 LOG/Color/printStack 等基础工具
 * 提供 OkHttp 请求/响应拦截、历史记录和重放能力
 */

// ===== OkHttp Logger 状态与工具 =====
var __okhttp_state = { installed: false, loader: null, history: [], counter: 0 };
var __okhttp_filter = null; // 可选过滤（按URL或Header字符串匹配）

function __okhttp_use(className) {
    try {
        if (__okhttp_state.loader) {
            return Java.ClassFactory.get(__okhttp_state.loader).use(className);
        }
        return Java.use(className);
    } catch (e) {
        if ((e.message || '').indexOf('ClassNotFoundException') !== -1) {
            try {
                var l = (typeof findTragetClassLoader === 'function') ? findTragetClassLoader(className) : null;
                if (l) { __okhttp_state.loader = l; return Java.ClassFactory.get(l).use(className); }
            } catch (_) {}
        }
        return null;
    }
}

function __okhttp_headers_to_obj(headers) {
    var obj = {};
    try {
        var names = headers.names();
        var it = names.iterator();
        while (it.hasNext()) { var n = String(it.next()); obj[n] = String(headers.get(n)); }
    } catch (_) {}
    return obj;
}

function __okhttp_log_request(callObj, req) {
    try {
        var method = 'GET'; try { method = String(req.method()); } catch(_){ }
        var url = ''; try { url = String(req.url().toString()); } catch(_){ }
        var headersObj = {}; try { headersObj = __okhttp_headers_to_obj(req.headers()); } catch(_){ }
        try {
            if (__okhttp_filter) {
                var hay = url + ' ' + JSON.stringify(headersObj);
                if (hay.indexOf(__okhttp_filter) === -1) return -1;
            }
        } catch(_){ }
        var cookieStr = headersObj['Cookie'] || headersObj['cookie'] || '';
        var bodyStr = '';
        var contentTypeStr = '';
        try {
            var body = req.body();
            if (body) {
                try { var mt = body.contentType(); contentTypeStr = mt ? String(mt.toString()) : ''; } catch(_){ }
                try {
                    var BufferClz = __okhttp_use('okio.Buffer');
                    if (BufferClz) {
                        var buff = BufferClz.$new();
                        body.writeTo(buff);
                        try {
                            var bytes = buff.readByteArray();
                            var cs = (typeof __parseCharsetFromHeaders === 'function' ? __parseCharsetFromHeaders(headersObj, contentTypeStr) : null) || 'utf-8';
                            var toStr = (typeof __bytesToString === 'function') ? __bytesToString : function(b){ try { return Java.use('java.lang.String').$new(b).toString(); } catch(__){ return ''; } };
                            bodyStr = toStr(bytes, cs);
                        } catch(_) {
                            try { bodyStr = String(buff.readUtf8()); } catch(__) { bodyStr = ''; }
                        }
                    }
                } catch(_){ }
            }
        } catch(_){ }

        LOG('\n┌' + '─'.repeat(100));
        LOG('| URL: ' + url);
        LOG('|');
        LOG('| Method: ' + method);
        LOG('|');
        LOG('| Headers:');
        try { Object.keys(headersObj).forEach(function(k){ LOG('|   ┌─' + k + ': ' + headersObj[k]); }); } catch(_){}
        if (bodyStr && bodyStr.length > 0) {
            LOG('|');
            LOG('| Body:');
            LOG('|   ' + (bodyStr.length > 4000 ? (bodyStr.substring(0, 4000) + ' ...') : bodyStr));
            LOG('|');
            var ctLower = (contentTypeStr || '').toLowerCase();
            var isPlain = (ctLower.indexOf('text') !== -1 || ctLower.indexOf('json') !== -1);
            LOG('|--> END ' + (isPlain ? '' : ' (binary body omitted -> isPlaintext)'));
        } else {
            LOG('|');
            LOG('|--> END');
        }

        var idx = (++__okhttp_state.counter);
        __okhttp_state.history.push({
            index: idx,
            ts: Date.now(),
            method: method,
            url: url,
            headers: headersObj,
            body: bodyStr || null,
            contentType: contentTypeStr || null,
            callRef: callObj || null,
            requestRef: req || null
        });

        try {
            var gen = (typeof __genRequestsCode === 'function') ? __genRequestsCode : function(m,u,h,c,b,ct){ return 'requests.get(' + JSON.stringify(u) + ')'; };
            send({ type: 'fetch_request', ts: Date.now(), items: { library: 'okhttp', method: method, url: url, headers: headersObj, cookies: cookieStr || null, python: gen(method, url, headersObj, cookieStr, bodyStr, contentTypeStr), body: bodyStr || null, contentType: contentTypeStr || null, index: idx } });
        } catch(_){}

        return idx;
    } catch (e) {
        try { LOG('⚠️ OkHttp 请求日志失败: ' + e.message, { c: Color.Yellow }); } catch(_){ }
        return -1;
    }
}

function __okhttp_log_response(resp) {
    try {
        var code = 0; try { code = resp.code(); } catch(_){ }
        var message = ''; try { message = String(resp.message()); } catch(_){ }
        var url = ''; try { url = String(resp.request().url().toString()); } catch(_){ }
        var headersObj = {}; try { headersObj = __okhttp_headers_to_obj(resp.headers()); } catch(_){ }
        var bodyStr = null;
        try {
            if (typeof resp.peekBody === 'function') {
                var pb = resp.peekBody(1024 * 1024);
                try { bodyStr = String(pb.string()); } catch(eStr) {
                    try {
                        var bytes = pb.bytes();
                        var parseCS = (typeof __parseCharsetFromHeaders === 'function') ? __parseCharsetFromHeaders : function(){ return null; };
                        var toStr = (typeof __bytesToString === 'function') ? __bytesToString : function(b){ try { return Java.use('java.lang.String').$new(b).toString(); } catch(__){ return ''; } };
                        bodyStr = toStr(bytes, parseCS(headersObj, headersObj['Content-Type'] || ''));
                    } catch(_) { bodyStr = null; }
                }
            }
        } catch(_){ }

        LOG('|');
        LOG('| Status Code: ' + code + ' / ' + (message || ''));
        LOG('|');
        LOG('| Headers:');
        try { Object.keys(headersObj).forEach(function(k){ LOG('|   ┌─' + k + ': ' + headersObj[k]); }); } catch(_){}
        LOG('| ');
        if (bodyStr !== null) {
            LOG('| Body:');
            LOG('|   ' + (bodyStr.length > 4000 ? (bodyStr.substring(0, 4000) + ' ...') : bodyStr));
            LOG('| ');
        }
        LOG('|<-- END HTTP');
        LOG('└' + '─'.repeat(100));

        try { send({ type: 'fetch_response', ts: Date.now(), items: { library: 'okhttp', url: url, code: code, message: message, headers: headersObj, body: bodyStr } }); } catch(_){}
    } catch (e) {
        try { LOG('⚠️ OkHttp 响应日志失败: ' + e.message, { c: Color.Yellow }); } catch(_){ }
    }
}

// ===== 对外API =====
function okhttpFind() {
    try {
        var has3 = false, has2 = false;
        Java.perform(function(){
            try {
                var classes = Java.enumerateLoadedClassesSync();
                for (var i = 0; i < classes.length; i++) {
                    var cn = classes[i];
                    if (!has3 && cn.indexOf('okhttp3.') === 0) has3 = true;
                    if (!has2 && cn.indexOf('com.squareup.okhttp.') === 0) has2 = true;
                    if (has3 && has2) break;
                }
            } catch(_){ }
        });
        if (has3) {
            LOG('✅ 检测到 OkHttp3', { c: Color.Green });
        } else if (has2) {
            LOG('✅ 检测到 OkHttp2', { c: Color.Green });
        } else {
            LOG('❌ 未检测到 OkHttp', { c: Color.Red });
        }
        return { ok3: has3, ok2: has2 };
    } catch (e) {
        LOG('❌ okhttpFind 失败: ' + e.message, { c: Color.Red });
        return { ok3: false, ok2: false };
    }
}

function okhttpSwitchLoader(sampleClassName) {
    try {
        if (typeof findTragetClassLoader !== 'function') { LOG('⚠️ 缺少 findTragetClassLoader', { c: Color.Yellow }); return false; }
        var l = findTragetClassLoader(sampleClassName);
        if (l) { __okhttp_state.loader = l; LOG('🎯 已切换 OkHttp ClassLoader', { c: Color.Green }); return true; }
        LOG('⚠️ 未找到可用的 ClassLoader', { c: Color.Yellow });
        return false;
    } catch (e) {
        LOG('❌ switchLoader 失败: ' + e.message, { c: Color.Red });
        return false;
    }
}

function __installOkHttpLoggerHooks() {
    if (__okhttp_state.installed) { LOG('ℹ️ OkHttp hold 已启用', { c: Color.Cyan }); return true; }
    var installed = false;
    Java.perform(function(){
        var RC = __okhttp_use('okhttp3.RealCall') || __okhttp_use('okhttp3.internal.connection.RealCall');
        if (RC) {
            try {
                var exec = RC.execute.overload();
                exec.implementation = function() {
                    var idx = -1;
                    try { var req = this.request ? this.request() : (this.originalRequest ? this.originalRequest() : null); if (req) idx = __okhttp_log_request(this, req); } catch(_){ }
                    var resp = exec.call(this);
                    try { __okhttp_log_response(resp); } catch(_){ }
                    try { if (idx > 0) { var h = __okhttp_state.history.find(function(x){ return x.index === idx; }); if (h) h.responseRef = resp; } } catch(_){ }
                    return resp;
                };
                installed = true;
            } catch(_){ }
            try {
                var enq = RC.enqueue.overload('okhttp3.Callback');
                enq.implementation = function(cb) {
                    try { var req = this.request ? this.request() : (this.originalRequest ? this.originalRequest() : null); if (req) { __okhttp_log_request(this, req); } } catch(_){ }
                    return enq.call(this, cb);
                };
                installed = true;
            } catch(_){ }
        }
        var RC2 = __okhttp_use('com.squareup.okhttp.RealCall');
        if (RC2) {
            try {
                var exec2 = RC2.execute.overload();
                exec2.implementation = function() {
                    try { var req = this.request ? this.request() : null; if (req) __okhttp_log_request(this, req); } catch(_){ }
                    var resp = exec2.call(this);
                    try { __okhttp_log_response(resp); } catch(_){ }
                    return resp;
                };
                installed = true;
            } catch(_){ }
            try {
                var enq2 = RC2.enqueue.overload('com.squareup.okhttp.Callback');
                enq2.implementation = function(cb) {
                    try { var req = this.request ? this.request() : null; if (req) __okhttp_log_request(this, req); } catch(_){ }
                    return enq2.call(this, cb);
                };
                installed = true;
            } catch(_){ }
        }
    });
    if (installed) { __okhttp_state.installed = true; LOG('✅ OkHttp hold 已启用', { c: Color.Green }); return true; }
    LOG('⚠️ 未找到 OkHttp RealCall 类', { c: Color.Yellow });
    return false;
}

function okhttpHold() { try { return __installOkHttpLoggerHooks(); } catch (e) { LOG('❌ hold 启动失败: ' + e.message, { c: Color.Red }); return false; } }

function okhttpHistory() {
    try {
        var list = __okhttp_state.history || [];
        if (!list.length) { LOG('ℹ️ 无历史记录', { c: Color.Gray }); return []; }
        for (var i = 0; i < list.length; i++) {
            var h = list[i];
            LOG('#' + h.index + ' ' + h.method + ' ' + h.url, { c: Color.Cyan });
        }
        return list.map(function(h){ return { index: h.index, method: h.method, url: h.url }; });
    } catch (e) { LOG('❌ history 失败: ' + e.message, { c: Color.Red }); return []; }
}

function okhttpResend(index) {
    try {
        var idx = parseInt(index);
        var h = (__okhttp_state.history || []).find(function(x){ return x.index === idx; });
        if (!h) { LOG('❌ 未找到历史项 #' + idx, { c: Color.Red }); return false; }
        var resp = null;
        try {
            if (h.callRef && typeof h.callRef.clone === 'function') {
                var cloned = h.callRef.clone();
                resp = cloned.execute();
            } else if (h.requestRef) {
                var Builder = __okhttp_use('okhttp3.OkHttpClient$Builder');
                if (Builder) {
                    var builder = Builder.$new();
                    var client = builder.build();
                    var call = client.newCall(h.requestRef);
                    resp = call.execute();
                }
            }
        } catch (e2) {
            LOG('⚠️ 重放失败: ' + e2.message, { c: Color.Yellow });
        }
        if (resp) { __okhttp_log_response(resp); return true; }
        LOG('❌ 重放失败，无法构造请求', { c: Color.Red });
        return false;
    } catch (e) { LOG('❌ resend 失败: ' + e.message, { c: Color.Red }); return false; }
}

function okhttpClear() { try { __okhttp_state.history = []; __okhttp_state.counter = 0; LOG('🧹 已清空 OkHttp 历史', { c: Color.Green }); return true; } catch (_) { return false; } }

// 一键启动：可传入过滤字符串或选项对象 { filter: 'kw', loaderSample: 'okhttp3.OkHttpClient' }
function okhttpStart(arg) {
    try {
        var filter = null;
        var loaderSample = null;
        if (typeof arg === 'string') {
            filter = arg;
        } else if (arg && typeof arg === 'object') {
            filter = arg.filter || null;
            loaderSample = arg.loaderSample || arg.sample || null;
        }
        // 设置过滤
        __okhttp_filter = (filter && String(filter)) ? String(filter) : null;
        // 可选切换ClassLoader
        if (loaderSample && typeof okhttpSwitchLoader === 'function') {
            try { okhttpSwitchLoader(loaderSample); } catch(_){ }
        }
        // 检测并开启
        try { if (typeof okhttpFind === 'function') okhttpFind(); } catch(_){ }
        var ok = okhttpHold();
        if (ok) {
            LOG('✅ OkHttp Logger 已启动' + (filter ? (' (过滤: ' + filter + ')') : ''), { c: Color.Green });
        } else {
            LOG('⚠️ OkHttp Logger 启动失败，未检测到 RealCall', { c: Color.Yellow });
        }
        return ok;
    } catch (e) {
        LOG('❌ okhttpStart 失败: ' + e.message, { c: Color.Red });
        return false;
    }
}

// ===== 全局导出 =====
try {
    global.okhttpFind = okhttpFind;
    global.okhttpSwitchLoader = okhttpSwitchLoader;
    global.okhttpHold = okhttpHold;
    global.okhttpHistory = okhttpHistory;
    global.okhttpResend = okhttpResend;
    global.okhttpClear = okhttpClear;
    global.okhttpStart = okhttpStart;
} catch (_) {}

try { LOG('🧩 OkHttp Logger 插件已加载', { c: Color.Green }); } catch(_){ }


