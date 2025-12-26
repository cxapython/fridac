// 轻量级 JNI Hook - encryptString
// 只 hook JNI 入口，不做全量指令追踪

(function() {
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("     JNI Hook - encryptString (轻量模式)");
    console.log("═══════════════════════════════════════════════════════════════");

    const moduleName = "libjnicalculator.so";
    const offset = 0x1ed98;  // encryptString JNI 入口

    const mod = Process.findModuleByName(moduleName);
    if (!mod) {
        console.log("[-] 模块未加载: " + moduleName);
        return;
    }

    const targetAddr = mod.base.add(offset);
    console.log("[+] 目标地址: " + targetAddr);

    Interceptor.attach(targetAddr, {
        onEnter: function(args) {
            console.log("\n┌─────────────────────────────────────────────────");
            console.log("│ [ENTER] encryptString");
            console.log("├─────────────────────────────────────────────────");
            
            // args[0] = JNIEnv*
            // args[1] = jobject (this)
            // args[2] = jstring input
            // args[3] = jstring key
            
            this.env = args[0];
            this.input = args[2];
            this.key = args[3];
            
            // 读取 Java 字符串
            const JNIEnv = Java.vm.tryGetEnv();
            if (JNIEnv && this.input) {
                try {
                    const inputStr = JNIEnv.getStringUtfChars(this.input, null);
                    console.log("│ 📥 input: \"" + inputStr.readUtf8String() + "\"");
                    JNIEnv.releaseStringUtfChars(this.input, inputStr);
                } catch(e) {
                    console.log("│ 📥 input: " + this.input);
                }
            }
            
            if (JNIEnv && this.key) {
                try {
                    const keyStr = JNIEnv.getStringUtfChars(this.key, null);
                    console.log("│ 🔑 key: \"" + keyStr.readUtf8String() + "\"");
                    JNIEnv.releaseStringUtfChars(this.key, keyStr);
                } catch(e) {
                    console.log("│ 🔑 key: " + this.key);
                }
            }
            
            this.startTime = Date.now();
        },
        onLeave: function(retval) {
            const elapsed = Date.now() - this.startTime;
            
            console.log("├─────────────────────────────────────────────────");
            console.log("│ [LEAVE] encryptString");
            
            // 读取返回的 jstring
            const JNIEnv = Java.vm.tryGetEnv();
            if (JNIEnv && retval && !retval.isNull()) {
                try {
                    const resultStr = JNIEnv.getStringUtfChars(retval, null);
                    console.log("│ 📤 result: \"" + resultStr.readUtf8String() + "\"");
                    JNIEnv.releaseStringUtfChars(retval, resultStr);
                } catch(e) {
                    console.log("│ 📤 result: " + retval);
                }
            }
            
            console.log("│ ⏱️ 耗时: " + elapsed + "ms");
            console.log("└─────────────────────────────────────────────────\n");
        }
    });

    console.log("[+] Hook 已安装");
    console.log("[*] 等待触发 encryptString...\n");
})();

