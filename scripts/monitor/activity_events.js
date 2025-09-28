/**
 * Activity 生命周期监控
 * @description 监控 onCreate/onStart/onResume/onPause/onStop/onDestroy，打印类名与可选栈
 * @example monitorActivityEvents({ stack: false })
 */
function monitorActivityEvents(options) {
    options = options || {};
    var showStack = !!options.stack;

    try {
        Java.perform(function(){
            var Activity = Java.use('android.app.Activity');
            function wrap(name, sig){
                try {
                    var m = sig ? Activity[name].overload(sig) : Activity[name].overload();
                    m.implementation = function(){
                        try {
                            LOG('Activity.' + name + ': ' + this.getClass().getName(), { c: Color.Blue });
                            if (showStack) { printStack(); }
                        } catch(_){}
                        return m.apply(this, arguments);
                    };
                } catch(_){}
            }
            wrap('onCreate', 'android.os.Bundle');
            wrap('onStart');
            wrap('onResume');
            wrap('onPause');
            wrap('onStop');
            wrap('onDestroy');
        });
        LOG('✅ Activity 生命周期监控已启用', { c: Color.Green });
        return true;
    } catch (e) {
        LOG('❌ Activity 生命周期监控失败: ' + e.message, { c: Color.Red });
        if (typeof TASK_ID !== 'undefined') { try { notifyTaskError(e); } catch(_){} }
        return false;
    }
}


