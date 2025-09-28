/**
 * OkHttp WebSocket 监控
 * @description 监控 okhttp3.WebSocket/RealWebSocket 的 send/receive，输出文本/二进制帧与关联请求 URL
 * @example monitorWebSocket({ filter: 'wss://example.com' })
 */
function monitorWebSocket(options) {
    options = options || {};
    var filter = options.filter ? String(options.filter) : null;

    try {
        Java.perform(function(){
            function __use(name){ try { return Java.use(name); } catch(e){ return null; } }
            function __okhttpUse(name){
                try {
                    if (typeof findTragetClassLoader === 'function') {
                        var ld = findTragetClassLoader(name);
                        if (ld) return Java.ClassFactory.get(ld).use(name);
                    }
                } catch(_){}
                return __use(name);
            }

            var RealWebSocket = __okhttpUse('okhttp3.internal.ws.RealWebSocket');
            var WebSocket = __okhttpUse('okhttp3.WebSocket');
            var OkHttpClient = __okhttpUse('okhttp3.OkHttpClient');

            function __emit(dir, info) {
                var line = '[WS ' + dir + '] ' + (info.url||'') + ' type=' + info.type + ' len=' + (info.length||0) + (info.text?' text='+info.text:'');
                if (filter && line.indexOf(filter) === -1) return;
                LOG(line, { c: dir==='send'?Color.Green:Color.Blue });
                try { send({ type: 'websocket_'+dir, ts: Date.now(), items: { url: info.url||'', type: info.type, text: info.text||null, length: info.length||0, task_id: (typeof TASK_ID!=='undefined'?TASK_ID:null) } }); } catch(_){ }
            }

            function __getUrlFromWebSocket(ws) {
                try { var req = ws.request ? ws.request() : null; if (!req) return ''; return String(req.url().toString()); } catch(_){ return ''; }
            }

            // Hook WebSocket.send(String)
            if (WebSocket) {
                try {
                    var sendStr = WebSocket.send.overload('java.lang.String');
                    sendStr.implementation = function(text){
                        try { __emit('send', { url: __getUrlFromWebSocket(this), type: 'text', text: String(text), length: text ? text.length : 0 }); } catch(_){ }
                        return sendStr.call(this, text);
                    };
                } catch(_) {}

                // Hook WebSocket.send(ByteString)
                try {
                    var ByteString = __okhttpUse('okio.ByteString');
                    var sendBin = WebSocket.send.overload('okio.ByteString');
                    sendBin.implementation = function(bs){
                        var len = 0; try { len = bs ? bs.size() : 0; } catch(_){}
                        __emit('send', { url: __getUrlFromWebSocket(this), type: 'binary', length: len });
                        return sendBin.call(this, bs);
                    };
                } catch(_) {}
            }

            // Hook RealWebSocket.onReadMessage 以获取接收数据（实现细节随版本变动，尽力覆盖）
            if (RealWebSocket) {
                // text message path
                try {
                    var onText = RealWebSocket.onReadMessage.overload('java.lang.String');
                    onText.implementation = function(text){
                        __emit('recv', { url: __getUrlFromWebSocket(this), type: 'text', text: String(text), length: text?text.length:0 });
                        return onText.call(this, text);
                    };
                } catch(_) {}
                // binary path (private methods may vary)
                try {
                    var onMessage = RealWebSocket.onReadMessage.overload('okio.ByteString');
                    onMessage.implementation = function(bs){
                        var len = 0; try { len = bs ? bs.size() : 0; } catch(_){}
                        __emit('recv', { url: __getUrlFromWebSocket(this), type: 'binary', length: len });
                        return onMessage.call(this, bs);
                    };
                } catch(_) {}
            }
        });

        LOG('✅ WebSocket 监控已启用' + (filter?(' (过滤: '+filter+')') : ''), { c: Color.Green });
        return true;
    } catch (e) {
        LOG('❌ WebSocket 监控失败: ' + e.message, { c: Color.Red });
        if (typeof TASK_ID !== 'undefined') { try { notifyTaskError(e); } catch(_){} }
        return false;
    }
}


