/**
 * OkHttp WebSocket 监控（修复版）
 * @description 监控 okhttp3 WebSocket 的发送/接收消息，适配更多版本
 */
function monitorWebSocket(options) {
    options = options || {};
    var filter = options.filter ? String(options.filter) : null;
    var enable = (typeof options.enable === 'boolean') ? options.enable : true;
    const LOG_PREFIX = "[WS监控]";

    // 修复日志函数兼容（假设环境有基础log方法）
    function LOG(msg, opts) {
        const colorMap = {
            Green: '\x1b[32m',
            Blue: '\x1b[34m',
            Gray: '\x1b[90m',
            White: '\x1b[37m',
            Red: '\x1b[31m',
            Reset: '\x1b[0m'
        };
        const color = opts?.c ? colorMap[opts.c] || '' : '';
        console.log(`${LOG_PREFIX} ${color}${msg}${colorMap.Reset}`);
    }

    if (!enable) { try { LOG('ℹ️ WebSocket 监控已禁用 (enable=false)'); } catch(_){} return false; }

    try {
        Java.perform(function () {
            // 增强类查找逻辑（修复类加载器问题）
            function findClass(name) {
                let foundClass = null;
                // 枚举所有类加载器查找目标类
                Java.enumerateClassLoaders({
                    onMatch: function (loader) {
                        try {
                            if (loader.loadClass(name)) {
                                foundClass = Java.ClassFactory.get(loader).use(name);
                                return 'break'; // 找到后停止枚举
                            }
                        } catch (e) { /* 忽略加载失败的类加载器 */ }
                    },
                    onComplete: function () { }
                });
                // 如果没找到，尝试默认类加载器
                if (!foundClass) {
                    try {
                        foundClass = Java.use(name);
                    } catch (e) { /* 忽略 */ }
                }
                return foundClass;
            }

            // 关键类获取（优先Hook实现类而非接口）
            const RealWebSocket = findClass('okhttp3.internal.ws.RealWebSocket');
            const WebSocketListener = findClass('okhttp3.WebSocketListener');
            const ByteString = findClass('okio.ByteString');

            // 调试日志：显示已找到的类
            if (RealWebSocket) LOG("已找到 RealWebSocket 类", { c: 'Green' });
            else LOG("未找到 RealWebSocket 类", { c: 'Red' });
            if (WebSocketListener) LOG("已找到 WebSocketListener 类", { c: 'Green' });
            else LOG("未找到 WebSocketListener 类", { c: 'Red' });

            // 从RealWebSocket获取请求URL（通过反射处理私有字段）
            function getUrlFromWebSocket(wsInstance) {
                try {
                    const cls = wsInstance.getClass();
                    // 尝试常见的请求字段名（不同版本可能不同）
                    const possibleFields = ['request', 'originalRequest', 'webSocketRequest'];
                    for (const fieldName of possibleFields) {
                        try {
                            const field = cls.getDeclaredField(fieldName);
                            field.setAccessible(true);
                            const request = field.get(wsInstance);
                            if (request) {
                                return request.url().toString();
                            }
                        } catch (e) { /* 忽略字段不存在的情况 */ }
                    }
                    return 'unknown-url';
                } catch (e) {
                    LOG(`获取URL失败: ${e.message}`, { c: 'Red' });
                    return 'error-url';
                }
            }

            // 从请求获取 headers
            function getHeadersFromRequest(request) {
                try {
                    const headers = request.headers();
                    const names = headers.names();
                    const headerMap = {};
                    const iterator = names.iterator();
                    while (iterator.hasNext()) {
                        const name = iterator.next();
                        headerMap[name] = headers.get(name);
                    }
                    return headerMap;
                } catch (e) {
                    return {};
                }
            }

            // 从WebSocket实例获取headers
            function getHeadersFromWebSocket(wsInstance) {
                try {
                    const cls = wsInstance.getClass();
                    const possibleFields = ['request', 'originalRequest'];
                    for (const fieldName of possibleFields) {
                        try {
                            const field = cls.getDeclaredField(fieldName);
                            field.setAccessible(true);
                            const request = field.get(wsInstance);
                            if (request) {
                                return getHeadersFromRequest(request);
                            }
                        } catch (e) { /* 忽略 */ }
                    }
                    return {};
                } catch (e) {
                    return {};
                }
            }

            // 消息输出处理
            function emitMessage(direction, info) {
                // 过滤逻辑：仅检查URL
                const url = info.url || '';
                if (filter && !url.includes(filter)) {
                    return;
                }

                // 基础信息
                const summary = `[${direction.toUpperCase()}] ${url} | 类型:${info.type} | 长度:${info.length}`;
                LOG(summary, { c: direction === 'send' ? 'Green' : 'Blue' });

                // 输出headers
                const headers = info.headers || {};
                const headerKeys = Object.keys(headers);
                if (headerKeys.length > 0) {
                    LOG("  Headers:", { c: 'Gray' });
                    headerKeys.forEach(key => {
                        LOG(`    ${key}: ${headers[key]}`, { c: 'White' });
                    });
                }

                // 输出内容预览
                if (info.type === 'text' && info.text) {
                    let preview = info.text;
                    if (preview.length > 1000) preview = preview.substring(0, 1000) + '...(省略后续)';
                    LOG("  内容:", { c: 'Gray' });
                    LOG(`    ${preview}`, { c: 'White' });
                } else if (info.type === 'binary' && info.preview) {
                    LOG("  二进制预览(hex):", { c: 'Gray' });
                    LOG(`    ${info.preview}`, { c: 'White' });
                }
            }

            // 1. Hook RealWebSocket的send方法（发送消息）
            if (RealWebSocket) {
                // 发送文本消息
                try {
                    const sendString = RealWebSocket.send.overload('java.lang.String');
                    sendString.implementation = function (text) {
                        try {
                            const url = getUrlFromWebSocket(this);
                            const headers = getHeadersFromWebSocket(this);
                            emitMessage('send', {
                                url,
                                type: 'text',
                                text: text,
                                length: text ? text.length : 0,
                                headers: headers
                            });
                        } catch (e) {
                            LOG(`send文本消息处理失败: ${e.message}`, { c: 'Red' });
                        }
                        return sendString.call(this, text); // 调用原方法
                    };
                } catch (e) {
                    LOG(`Hook RealWebSocket.send(String)失败: ${e.message}`, { c: 'Red' });
                }

                // 发送二进制消息
                if (ByteString) {
                    try {
                        const sendBinary = RealWebSocket.send.overload('okio.ByteString');
                        sendBinary.implementation = function (byteString) {
                            try {
                                const url = getUrlFromWebSocket(this);
                                const headers = getHeadersFromWebSocket(this);
                                const length = byteString ? byteString.size() : 0;
                                let preview = '';
                                if (byteString) {
                                    const hex = byteString.hex();
                                    preview = hex.substring(0, 64) + (hex.length > 64 ? '...(省略后续)' : '');
                                }
                                emitMessage('send', {
                                    url,
                                    type: 'binary',
                                    length: length,
                                    preview: preview,
                                    headers: headers
                                });
                            } catch (e) {
                                LOG(`send二进制消息处理失败: ${e.message}`, { c: 'Red' });
                            }
                            return sendBinary.call(this, byteString); // 调用原方法
                        };
                    } catch (e) {
                        LOG(`Hook RealWebSocket.send(ByteString)失败: ${e.message}`, { c: 'Red' });
                    }
                }
            }

            // 2. Hook RealWebSocket的接收消息方法
            if (RealWebSocket) {
                // 接收文本消息（处理不同版本的方法名）
                const receiveTextMethods = ['onReadMessage', 'onMessage', 'processTextFrame'];
                receiveTextMethods.forEach(methodName => {
                    try {
                        const method = RealWebSocket[methodName].overload('java.lang.String');
                        method.implementation = function (text) {
                            try {
                                const url = getUrlFromWebSocket(this);
                                const headers = getHeadersFromWebSocket(this);
                                emitMessage('recv', {
                                    url,
                                    type: 'text',
                                    text: text,
                                    length: text ? text.length : 0,
                                    headers: headers
                                });
                            } catch (e) {
                                LOG(`接收文本消息处理失败: ${e.message}`, { c: 'Red' });
                            }
                            return method.call(this, text);
                        };
                    } catch (e) { /* 忽略不匹配的方法 */ }
                });

                // 接收二进制消息
                if (ByteString) {
                    const receiveBinaryMethods = ['onReadMessage', 'onMessage', 'processBinaryFrame'];
                    receiveBinaryMethods.forEach(methodName => {
                        try {
                            const method = RealWebSocket[methodName].overload('okio.ByteString');
                            method.implementation = function (byteString) {
                                try {
                                    const url = getUrlFromWebSocket(this);
                                    const headers = getHeadersFromWebSocket(this);
                                    const length = byteString ? byteString.size() : 0;
                                    let preview = '';
                                    if (byteString) {
                                        const hex = byteString.hex();
                                        preview = hex.substring(0, 64) + (hex.length > 64 ? '...(省略后续)' : '');
                                    }
                                    emitMessage('recv', {
                                        url,
                                        type: 'binary',
                                        length: length,
                                        preview: preview,
                                        headers: headers
                                    });
                                } catch (e) {
                                    LOG(`接收二进制消息处理失败: ${e.message}`, { c: 'Red' });
                                }
                                return method.call(this, byteString);
                            };
                        } catch (e) { /* 忽略不匹配的方法 */ }
                    });
                }
            }

            // 3. 补充Hook WebSocketListener（OkHttp常用回调方式）
            if (WebSocketListener) {
                // 接收文本消息回调
                try {
                    const onMessageText = WebSocketListener.onMessage.overload('okhttp3.WebSocket', 'java.lang.String');
                    onMessageText.implementation = function (webSocket, text) {
                        try {
                            // 从webSocket实例获取URL
                            const url = getUrlFromWebSocket(webSocket);
                            const headers = getHeadersFromWebSocket(webSocket);
                            emitMessage('recv', {
                                url,
                                type: 'text',
                                text: text,
                                length: text ? text.length : 0,
                                headers: headers
                            });
                        } catch (e) {
                            LOG(`WebSocketListener文本消息处理失败: ${e.message}`, { c: 'Red' });
                        }
                        return onMessageText.call(this, webSocket, text);
                    };
                } catch (e) {
                    LOG(`Hook WebSocketListener.onMessage(String)失败: ${e.message}`, { c: 'Red' });
                }

                // 接收二进制消息回调
                if (ByteString) {
                    try {
                        const onMessageBinary = WebSocketListener.onMessage.overload('okhttp3.WebSocket', 'okio.ByteString');
                        onMessageBinary.implementation = function (webSocket, byteString) {
                            try {
                                const url = getUrlFromWebSocket(webSocket);
                                const headers = getHeadersFromWebSocket(webSocket);
                                const length = byteString ? byteString.size() : 0;
                                let preview = '';
                                if (byteString) {
                                    const hex = byteString.hex();
                                    preview = hex.substring(0, 64) + (hex.length > 64 ? '...(省略后续)' : '');
                                }
                                emitMessage('recv', {
                                    url,
                                    type: 'binary',
                                    length: length,
                                    preview: preview,
                                    headers: headers
                                });
                            } catch (e) {
                                LOG(`WebSocketListener二进制消息处理失败: ${e.message}`, { c: 'Red' });
                            }
                            return onMessageBinary.call(this, webSocket, byteString);
                        };
                    } catch (e) {
                        LOG(`Hook WebSocketListener.onMessage(ByteString)失败: ${e.message}`, { c: 'Red' });
                    }
                }
            }
        });

        LOG(`✅ 监控已启动 ${filter ? '(过滤: ' + filter + ')' : ''}`, { c: 'Green' });
        return true;
    } catch (e) {
        LOG(`❌ 监控启动失败: ${e.message}`, { c: 'Red' });
        return false;
    }
}

// 使用示例：monitorWebSocket({ filter: 'wss://example.com' });

/**
 * OkHttp 请求监控（仅 LOG 输出，无事件上报）
 * @description Hook okhttp3.RealCall 的 execute()/enqueue()，打印 URL/Headers/Body
 * @example monitorOkHttp({ filter: 'httpbin.org', previewLimit: 2000 })
 */
function monitorOkHttp(options) {
    options = options || {};
    var filter = options.filter ? String(options.filter) : null;
    var previewLimit = (typeof options.previewLimit === 'number' && options.previewLimit > 0) ? options.previewLimit : 4000;
    var enable = (typeof options.enable === 'boolean') ? options.enable : true;

    function olog(msg, opts) { try { LOG(msg, opts || {}); } catch(_) { try { console.log(msg); } catch(__){} } }

    function __useClass(className) {
        try { return Java.use(className); } catch (e) {
            if ((e.message || '').indexOf('ClassNotFoundException') !== -1) {
                try { var l = (typeof findTragetClassLoader === 'function') ? findTragetClassLoader(className) : null; if (l) return Java.ClassFactory.get(l).use(className); } catch(_){}
            }
            return null;
        }
    }

    function __parseCharsetFromHeaders(headersObj, contentTypeStr) {
        try {
            var ct = contentTypeStr || headersObj['Content-Type'] || headersObj['content-type'] || '';
            var idx = String(ct).toLowerCase().indexOf('charset=');
            if (idx !== -1) {
                var cs = ct.substring(idx + 8).trim();
                var semi = cs.indexOf(';');
                if (semi !== -1) cs = cs.substring(0, semi).trim();
                return cs || null;
            }
        } catch(_){ }
        return null;
    }

    function __bytesToString(byteArray, charsetName) {
        try {
            var StringClz = __useClass('java.lang.String');
            if (charsetName && charsetName.length > 0) {
                var Charset = __useClass('java.nio.charset.Charset');
                var cs = Charset.forName(charsetName);
                return StringClz.$new(byteArray, cs).toString();
            }
            return StringClz.$new(byteArray).toString();
        } catch (_) { return ''; }
    }

    function __headersToObj(headers) {
        var obj = {};
        try {
            var names = headers.names();
            var it = names.iterator();
            while (it.hasNext()) { var n = String(it.next()); obj[n] = String(headers.get(n)); }
        } catch(_){ }
        return obj;
    }

    function __logRequest(prefix, method, url, headersObj, bodyStr, contentTypeStr) {
        var summary = prefix + ' ' + method + ' ' + url;
        var hay = summary + ' ' + JSON.stringify(headersObj || {}) + ' ' + (bodyStr || '');
        if (filter && hay.indexOf(filter) === -1) return;
        olog('┌' + Array(101).join('─'));
        olog('| ' + summary);
        olog('|');
        olog('| Headers:');
        try { Object.keys(headersObj||{}).forEach(function(k){ olog('|   ┌─' + k + ': ' + headersObj[k]); }); } catch(_){ }
        if (bodyStr && bodyStr.length > 0) {
            var preview = bodyStr.length > previewLimit ? (bodyStr.substring(0, previewLimit) + ' ...') : bodyStr;
            olog('|');
            olog('| Body:');
            olog('|   ' + preview);
        }
        olog('└' + Array(101).join('─'));
    }

    if (!enable) { olog('ℹ️ OkHttp 请求监控已禁用 (enable=false)'); return false; }

    try {
        Java.perform(function(){
            var RealCall = __useClass('okhttp3.RealCall') || __useClass('okhttp3.internal.connection.RealCall');
            var BufferClz = __useClass('okio.Buffer');
            if (!RealCall) { olog('⚠️ 未找到 OkHttp RealCall 类'); return false; }

            // execute()
            try {
                var execOver = RealCall.execute.overload();
                execOver.implementation = function(){
                    try {
                        var req = null;
                        try { req = this.request ? this.request() : null; } catch(_){ }
                        if (!req) { try { req = this.originalRequest ? this.originalRequest() : null; } catch(__) { req = null; } }
                        if (req) {
                            var method = 'GET'; try { method = String(req.method()); } catch(_){ }
                            var url = ''; try { url = String(req.url().toString()); } catch(_){ }
                            var headersObj = __headersToObj(req.headers());
                            var bodyStr = '';
                            var contentTypeStr = '';
                            try {
                                var body = req.body();
                                if (body && BufferClz) {
                                    try { var mt = body.contentType(); contentTypeStr = mt ? String(mt.toString()) : ''; } catch(_){ }
                                    var buff = BufferClz.$new();
                                    body.writeTo(buff);
                                    try {
                                        var bytes = buff.readByteArray();
                                        var cs = __parseCharsetFromHeaders(headersObj, contentTypeStr) || 'utf-8';
                                        bodyStr = __bytesToString(bytes, cs);
                                    } catch(_) { try { bodyStr = String(buff.readUtf8()); } catch(__){ bodyStr = ''; } }
                                }
                            } catch(_){ }
                            __logRequest('[HTTP]', method, url, headersObj, bodyStr, contentTypeStr);
                        }
                    } catch(_){ }
                    return execOver.call(this);
                };
            } catch(_){ }

            // enqueue(Callback)
            try {
                var enqOver = RealCall.enqueue.overload('okhttp3.Callback');
                enqOver.implementation = function(cb){
                    try {
                        var req = null;
                        try { req = this.request ? this.request() : null; } catch(_){ }
                        if (!req) { try { req = this.originalRequest ? this.originalRequest() : null; } catch(__) { req = null; } }
                        if (req) {
                            var method = 'GET'; try { method = String(req.method()); } catch(_){ }
                            var url = ''; try { url = String(req.url().toString()); } catch(_){ }
                            var headersObj = __headersToObj(req.headers());
                            var bodyStr = '';
                            var contentTypeStr = '';
                            try {
                                var body = req.body();
                                if (body && BufferClz) {
                                    try { var mt = body.contentType(); contentTypeStr = mt ? String(mt.toString()) : ''; } catch(_){ }
                                    var buff = BufferClz.$new();
                                    body.writeTo(buff);
                                    try {
                                        var bytes = buff.readByteArray();
                                        var cs = __parseCharsetFromHeaders(headersObj, contentTypeStr) || 'utf-8';
                                        bodyStr = __bytesToString(bytes, cs);
                                    } catch(_) { try { bodyStr = String(buff.readUtf8()); } catch(__){ bodyStr = ''; } }
                                }
                            } catch(_){ }
                            __logRequest('[HTTP-ASYNC]', method, url, headersObj, bodyStr, contentTypeStr);
                        }
                    } catch(_){ }
                    return enqOver.call(this, cb);
                };
            } catch(_){ }

            olog('✅ OkHttp 请求监控已启用' + (filter ? (' (过滤: ' + filter + ')') : ''));
        });
        return true;
    } catch (e) {
        olog('❌ OkHttp 请求监控失败: ' + e.message);
        return false;
    }
}