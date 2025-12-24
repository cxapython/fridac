/**
 * 追踪 JNICalculatorApp 的 encryptString 方法
 * @description 追踪加密函数执行过程，记录 transformChar 变换和 MD5 计算
 * @example traceEncrypt()
 */
function traceEncrypt() {
    const moduleName = "libjnicalculator.so";
    const mod = Process.findModuleByName(moduleName);
    
    if (!mod) {
        LOG("模块未找到: " + moduleName, { c: Color.Red });
        return;
    }
    
    LOG("╔════════════════════════════════════════════════════════════╗", { c: Color.Cyan });
    LOG("║         追踪 encryptString (libjnicalculator.so)            ║", { c: Color.Cyan });
    LOG("╚════════════════════════════════════════════════════════════╝", { c: Color.Cyan });
    LOG("模块基址: " + mod.base, { c: Color.Green });
    
    // 函数偏移
    const FUNCS = {
        encryptString: 0x1ed98,
        encryptToMd5Hex: 0x21244,
        transformChar: 0x1f5e0,
        MD5Init: 0x1f6b0,
        MD5Update: 0x1f710,
        MD5Final: 0x21004
    };
    
    let transformCalls = [];
    
    // Hook transformChar - 核心变换函数
    const transformCharAddr = mod.base.add(FUNCS.transformChar);
    LOG("Hook transformChar @ " + transformCharAddr, { c: Color.Yellow });
    
    Interceptor.attach(transformCharAddr, {
        onEnter: function(args) {
            this.c = args[0].toInt32() & 0xFF;
            this.k = args[1].toInt32() & 0xFF;
        },
        onLeave: function(retval) {
            const r = retval.toInt32() & 0xFF;
            transformCalls.push({ input: this.c, key: this.k, output: r });
        }
    });
    
    // Hook encryptToMd5Hex - 主加密函数
    const encryptToMd5HexAddr = mod.base.add(FUNCS.encryptToMd5Hex);
    LOG("Hook encryptToMd5Hex @ " + encryptToMd5HexAddr, { c: Color.Yellow });
    
    Interceptor.attach(encryptToMd5HexAddr, {
        onEnter: function(args) {
            this.input = args[0];
            this.inputLen = args[1].toInt32();
            this.key = args[2];
            this.keyLen = args[3].toInt32();
            this.hexOut = args[4];
            
            let inputStr = "", keyStr = "";
            try {
                if (this.inputLen > 0) inputStr = Memory.readCString(this.input, this.inputLen);
                if (this.keyLen > 0) keyStr = Memory.readCString(this.key, this.keyLen);
            } catch(e) {}
            
            LOG("\n╔═══════════════════════════════════════════════════════════╗", { c: Color.Green });
            LOG("║              encryptToMd5Hex 调用                          ║", { c: Color.Green });
            LOG("╚═══════════════════════════════════════════════════════════╝", { c: Color.Green });
            LOG("输入: '" + inputStr + "' (长度: " + this.inputLen + ")", { c: Color.White });
            LOG("密钥: '" + keyStr + "' (长度: " + this.keyLen + ")", { c: Color.White });
            
            transformCalls = []; // 清空
        },
        onLeave: function(retval) {
            let md5Result = "";
            try { md5Result = Memory.readCString(this.hexOut, 32); } catch(e) {}
            
            LOG("\n▶ transformChar 变换记录 (" + transformCalls.length + " 次):", { c: Color.Cyan });
            LOG("────────────────────────────────────────────────────────────", { c: Color.Gray });
            LOG("格式: [序号] input + key -> output", { c: Color.Gray });
            
            for (let i = 0; i < transformCalls.length; i++) {
                const t = transformCalls[i];
                const inputChar = (t.input >= 32 && t.input < 127) ? String.fromCharCode(t.input) : '.';
                const keyChar = (t.key >= 32 && t.key < 127) ? String.fromCharCode(t.key) : '.';
                LOG("  [" + i.toString().padStart(2, ' ') + "] 0x" + 
                    t.input.toString(16).padStart(2, '0') + " ('" + inputChar + "') + 0x" +
                    t.key.toString(16).padStart(2, '0') + " ('" + keyChar + "') -> 0x" +
                    t.output.toString(16).padStart(2, '0'), { c: Color.White });
            }
            
            LOG("\n▶ 变换后数据 (hex):", { c: Color.Cyan });
            LOG("  " + transformCalls.map(t => t.output.toString(16).padStart(2, '0')).join(' '), { c: Color.Yellow });
            
            LOG("\n▶ MD5 结果: " + md5Result, { c: Color.Green });
            LOG("═══════════════════════════════════════════════════════════\n", { c: Color.Green });
            
            // 通知任务系统
            if (typeof notifyTaskHit === 'function') {
                notifyTaskHit({
                    operation: "encryptToMd5Hex",
                    inputLen: this.inputLen,
                    keyLen: this.keyLen,
                    md5: md5Result,
                    transformCount: transformCalls.length
                });
            }
        }
    });
    
    // Hook MD5Init
    Interceptor.attach(mod.base.add(FUNCS.MD5Init), {
        onEnter: function(args) {
            this.ctx = args[0];
        },
        onLeave: function(retval) {
            try {
                const s0 = Memory.readU32(this.ctx);
                const s1 = Memory.readU32(this.ctx.add(4));
                const s2 = Memory.readU32(this.ctx.add(8));
                const s3 = Memory.readU32(this.ctx.add(12));
                LOG("[MD5Init] state = " + 
                    s0.toString(16).padStart(8, '0') + " " +
                    s1.toString(16).padStart(8, '0') + " " +
                    s2.toString(16).padStart(8, '0') + " " +
                    s3.toString(16).padStart(8, '0'), { c: Color.Gray });
            } catch(e) {}
        }
    });
    
    // Hook MD5Final
    Interceptor.attach(mod.base.add(FUNCS.MD5Final), {
        onEnter: function(args) {
            this.digest = args[0];
        },
        onLeave: function(retval) {
            try {
                const hash = Memory.readByteArray(this.digest, 16);
                LOG("[MD5Final] digest = " + 
                    Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join(''), 
                    { c: Color.Gray });
            } catch(e) {}
        }
    });
    
    LOG("\nHook 设置完成! 请在 APP 中触发加密操作", { c: Color.Green });
    LOG("或使用 callEncrypt('input', 'key') 主动调用\n", { c: Color.Yellow });
}

/**
 * 主动调用 encryptString 方法
 * @description 在 APP 中主动调用加密方法进行测试
 * @example callEncrypt('HelloWorld', '1234qwer')
 * @param {string} input - 要加密的明文
 * @param {string} key - 加密密钥
 */
function callEncrypt(input, key) {
    if (!input) input = "HelloWorld";
    if (!key) key = "1234qwer";
    
    Java.perform(function() {
        LOG(">>> 调用 encryptString('" + input + "', '" + key + "')", { c: Color.Cyan });
        
        Java.choose("com.example.jnicalculator.MainActivity", {
            onMatch: function(instance) {
                const result = instance.encryptString(input, key);
                LOG(">>> 加密结果: " + result, { c: Color.Green });
            },
            onComplete: function() {}
        });
    });
}

/**
 * 分析 transformChar 算法
 * @description 显示 transformChar 的算法逻辑
 * @example analyzeTransformChar()
 */
function analyzeTransformChar() {
    LOG("\n╔════════════════════════════════════════════════════════════╗", { c: Color.Cyan });
    LOG("║              transformChar 算法分析                          ║", { c: Color.Cyan });
    LOG("╚════════════════════════════════════════════════════════════╝", { c: Color.Cyan });
    
    LOG("\n算法伪代码:", { c: Color.Yellow });
    LOG("  char transformChar(char c, char keyChar) {", { c: Color.White });
    LOG("      k = (keyChar == 0) ? 1 : keyChar;", { c: Color.White });
    LOG("      val = c;", { c: Color.White });
    LOG("      val = val + (k % 13);            // 加法", { c: Color.Green });
    LOG("      val = val - ((k >> 2) & 0x0F);   // 减法", { c: Color.Green });
    LOG("      val = val * ((k & 0x07) + 1);    // 乘法", { c: Color.Green });
    LOG("      val = val / (((k >> 4) & 0x0F) + 1); // 除法", { c: Color.Green });
    LOG("      val = val ^ k;                   // 异或", { c: Color.Green });
    LOG("      return val & 0xFF;", { c: Color.White });
    LOG("  }", { c: Color.White });
    
    LOG("\n完整加密流程:", { c: Color.Yellow });
    LOG("  1. 对输入的每个字节，与密钥循环字节执行 transformChar", { c: Color.White });
    LOG("  2. 变换后的数据进行 MD5 哈希计算", { c: Color.White });
    LOG("  3. 输出 32 位十六进制字符串", { c: Color.White });
    
    LOG("\n关键特征:", { c: Color.Yellow });
    LOG("  - MD5 初始 state: 67452301 efcdab89 98badcfe 10325476", { c: Color.Gray });
    LOG("  - 输出长度固定 32 字符", { c: Color.Gray });
    LOG("  - 密钥循环使用", { c: Color.Gray });
}

