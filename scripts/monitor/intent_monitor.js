/**
 * Intent/Activity/Service 监控
 * @description 统一监控 startActivity/startService/sendBroadcast/registerReceiver/onReceive 等，打印 action/extras/flags/组件
 * @example monitorIntents({ filter: 'com.example', lifecycle: true })
 */
function monitorIntents(options) {
    options = options || {};
    var filter = options.filter ? String(options.filter) : null;
    var enableLifecycle = !!options.lifecycle;

    try {
        Java.perform(function(){
            function __dumpIntent(prefix, intent) {
                try {
                    var act = ''; try { act = String(intent.getAction()); } catch(_){ }
                    var data = ''; try { data = String(intent.getDataString()); } catch(_){ }
                    var cmp = ''; try { cmp = String(intent.getComponent()); } catch(_){ }
                    var flags = 0; try { flags = intent.getFlags(); } catch(_){ }
                    var extras = {};
                    try {
                        var b = intent.getExtras();
                        if (b) {
                            var it = b.keySet().iterator();
                            while (it.hasNext()) { var k = String(it.next()); extras[k] = String(b.get(k)); }
                        }
                    } catch(_){ }
                    var line = prefix + ' action=' + act + ' data=' + data + ' cmp=' + cmp + ' flags=0x' + flags.toString(16) + ' extras=' + JSON.stringify(extras);
                    if (filter && line.indexOf(filter) === -1) return;
                    LOG(line, { c: Color.Cyan });
                    try { send({ type: 'intent_event', ts: Date.now(), items: { line: line, action: act, data: data, component: cmp, flags: flags, extras: extras, task_id: (typeof TASK_ID!=='undefined'?TASK_ID:null) } }); } catch(_){ }
                } catch(_){}
            }

            // Context 路径
            try {
                var Context = Java.use('android.content.Context');
                // startActivity
                try {
                    var sa = Context.startActivity.overload('android.content.Intent');
                    sa.implementation = function(intent) { __dumpIntent('startActivity', intent); return sa.call(this, intent); };
                } catch(_){ }
                // startService
                try {
                    var ss = Context.startService.overload('android.content.Intent');
                    ss.implementation = function(intent) { __dumpIntent('startService', intent); return ss.call(this, intent); };
                } catch(_){ }
                // sendBroadcast
                try {
                    var sb = Context.sendBroadcast.overload('android.content.Intent');
                    sb.implementation = function(intent) { __dumpIntent('sendBroadcast', intent); return sb.call(this, intent); };
                } catch(_){ }
                // registerReceiver
                try {
                    var rr = Context.registerReceiver.overload('android.content.BroadcastReceiver', 'android.content.IntentFilter');
                    rr.implementation = function(rcv, filterObj) {
                        try { LOG('registerReceiver: ' + rcv + ' filter=' + filterObj, { c: Color.Gray }); } catch(_){}
                        return rr.call(this, rcv, filterObj);
                    };
                } catch(_){ }
            } catch(_){ }

            // BroadcastReceiver.onReceive
            try {
                var BR = Java.use('android.content.BroadcastReceiver');
                var onR = BR.onReceive.overload('android.content.Context', 'android.content.Intent');
                onR.implementation = function(ctx, intent) { __dumpIntent('onReceive', intent); return onR.call(this, ctx, intent); };
            } catch(_){ }

            // Activity 生命周期（可选）
            if (enableLifecycle) {
                try {
                    var Activity = Java.use('android.app.Activity');
                    ['onCreate','onStart','onResume','onPause','onStop','onDestroy'].forEach(function(name){
                        try {
                            var m = Activity[name].overload(name==='onCreate'?'android.os.Bundle':[]);
                            var tag = 'Activity.' + name;
                            m.implementation = function(){ try { LOG(tag + ': ' + this.getClass().getName(), { c: Color.Blue }); } catch(_){} return m.apply(this, arguments); };
                        } catch(_){}
                    });
                } catch(_){ }
            }
        });

        LOG('✅ Intent 监控已启用' + (filter ? (' (过滤: ' + filter + ')') : ''), { c: Color.Green });
        return true;
    } catch (e) {
        LOG('❌ Intent 监控失败: ' + e.message, { c: Color.Red });
        if (typeof TASK_ID !== 'undefined') { try { notifyTaskError(e); } catch(_){} }
        return false;
    }
}


