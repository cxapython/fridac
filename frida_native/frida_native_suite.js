// Frida Native 便捷总开关入口（ARM 套件）

function nativeEnableArmSuite(options) {
    options = options || {};
    var showStack = options.showStack ? 1 : 0;
    try {
        nativeHookDlopenFamily(showStack);
        nativeHookNetworkFunctions(showStack);
        nativeHookTLSFunctions(showStack);
        nativeHookConscryptTLS(showStack);
        nativeHookBIOFunctions(showStack);
        nativeHookFileIOFunctions(showStack);
        nativeHookProcessMemoryFunctions(showStack);
        nativeHookCryptoPrimitives(showStack);
        nativeHookJNIAndART(showStack);
        LOG('[+] ARM 套件已启用', { c: Color.Green });
    } catch (e) { LOG('ARM 套件启用失败: ' + e.message, { c: Color.Red }); }
}

