// Frida Native 加密相关 Hook（高层API与原语）

function nativeHookCryptoFunctions(algorithm, showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    algorithm = algorithm || 'all';
    try {
        if (algorithm === 'aes' || algorithm === 'all') {
            ['libcrypto.so','libssl.so','libc.so'].forEach(function(lib){
                ['AES_encrypt','AES_decrypt','AES_set_encrypt_key','AES_set_decrypt_key'].forEach(function(func){
                    var addr = Module.findExportByName(lib, func);
                    if (!addr) return;
                    Interceptor.attach(addr, {
                        onEnter: function(args) { try { LOG('[+] ' + func + ' 在 ' + lib); if (func.indexOf('encrypt')!==-1 || func.indexOf('decrypt')!==-1) LOG('  输入数据(截断): ' + hexdump(args[0], { length: 16 })); if (needStack) LOG(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n')); } catch(_){} },
                    });
                });
            });
        }

        if (algorithm === 'des' || algorithm === 'all') {
            ['DES_encrypt1','DES_decrypt3','DES_set_key'].forEach(function(func){
                var addr = Module.findExportByName(null, func);
                if (!addr) return;
                Interceptor.attach(addr, { onEnter: function(){ try { LOG('[+] DES 函数 ' + func); if (needStack) LOG(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n')); } catch(_){} } });
            });
        }

        if (algorithm === 'md5' || algorithm === 'all') {
            ['MD5_Init','MD5_Update','MD5_Final','MD5'].forEach(function(func){
                var addr = Module.findExportByName(null, func);
                if (!addr) return;
                Interceptor.attach(addr, { onEnter: function(args){ try { LOG('[+] MD5 函数 ' + func); if (func==='MD5_Update') { LOG('  数据长度: ' + args[2]); LOG('  数据内容: ' + hexdump(args[1], { length: 32 })); } if (needStack) LOG(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n')); } catch(_){} } });
            });
        }

        if (algorithm === 'sha' || algorithm === 'all') {
            ['SHA1_Init','SHA1_Update','SHA1_Final','SHA256_Init','SHA256_Update','SHA256_Final'].forEach(function(func){
                var addr = Module.findExportByName(null, func);
                if (!addr) return;
                Interceptor.attach(addr, { onEnter: function(args){ try { LOG('[+] SHA 函数 ' + func); if (String(func).indexOf('Update')!==-1) { LOG('  数据长度: ' + args[2]); LOG('  数据内容: ' + hexdump(args[1], { length: 32 })); } if (needStack) LOG(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n')); } catch(_){} } });
            });
        }

        LOG('[+] 加密算法Hook已启用 (算法: ' + algorithm + ')');
    } catch (e) { LOG('[-] 加密算法Hook失败: ' + e.message, { c: Color.Red }); }
}

function nativeHookCryptoPrimitives(showStack) {
    showStack = showStack || 0;
    var needStack = showStack === 1;
    function hook(name, lib, onEnter, onLeave) {
        try { var addr = Module.findExportByName(lib, name) || (lib!==null ? Module.findExportByName(null, name) : null); if (!addr) return false; Interceptor.attach(addr, { onEnter: onEnter||function(){}, onLeave: onLeave||function(){} }); LOG('[+] Hook 原语: ' + (lib||'any') + '!' + name); return true; } catch(e){ return false; }
    }
    try {
        hook('EVP_EncryptInit_ex', 'libcrypto.so', function(args){ try { var key=args[3], iv=args[4]; LOG('🔐 EVP_EncryptInit_ex: key前32字节=\n' + hexdump(key, { length: 32 }) + '\niv=' + hexdump(iv, { length: 16 })); if (needStack) LOG(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n')); } catch(_){} });
        hook('EVP_DecryptInit_ex', 'libcrypto.so', function(args){ try { var key=args[3], iv=args[4]; LOG('🔓 EVP_DecryptInit_ex: key前32字节=\n' + hexdump(key, { length: 32 }) + '\niv=' + hexdump(iv, { length: 16 })); if (needStack) LOG(Thread.backtrace(this.context, Backtracer.ACCURATE).map(DebugSymbol.fromAddress).join('\n')); } catch(_){} });
        hook('EVP_EncryptUpdate', 'libcrypto.so', function(args){ try { var inPtr=args[3]; var inLen=args[4].toInt32(); if (inLen>0 && inLen<=4096) LOG('📦 EVP_EncryptUpdate 输入 len=' + inLen + '\n' + hexdump(inPtr, { length: Math.min(inLen, 128) })); } catch(_){} });
        hook('EVP_DecryptUpdate', 'libcrypto.so', function(args){ try { var inPtr=args[3]; var inLen=args[4].toInt32(); if (inLen>0 && inLen<=4096) LOG('📦 EVP_DecryptUpdate 输入 len=' + inLen + '\n' + hexdump(inPtr, { length: Math.min(inLen, 128) })); } catch(_){} });
        hook('EVP_DigestInit_ex', 'libcrypto.so', function(){ if (__rateLimiter.shouldLog('EVP_DigestInit',50,2000)) LOG('🔎 EVP_DigestInit_ex'); });
        hook('EVP_DigestUpdate', 'libcrypto.so', function(args){ try { var data=args[1]; var len=args[2].toInt32(); if (len>0 && len<=2048) LOG('📄 EVP_DigestUpdate len='+len+'\n'+hexdump(data,{length:Math.min(len,128)})); } catch(_){} });
        hook('EVP_DigestFinal_ex', 'libcrypto.so', null, function(){ if (__rateLimiter.shouldLog('EVP_DigestFinal',50,2000)) LOG('✅ EVP_DigestFinal_ex 完成'); });
        hook('HMAC_Init_ex', 'libcrypto.so', function(args){ try { var key=args[1]; var len=args[2].toInt32(); LOG('🔑 HMAC_Init_ex keyLen='+len+'\n'+hexdump(key,{length:Math.min(len,32)})); } catch(_){} });
        hook('HMAC_Update', 'libcrypto.so', function(args){ try { var data=args[1]; var len=args[2].toInt32(); if (len>0 && len<=2048) LOG('📄 HMAC_Update len='+len+'\n'+hexdump(data,{length:Math.min(len,128)})); } catch(_){} });
        hook('HMAC_Final', 'libcrypto.so', function(args){ this.out=args[1]; this.outlen=args[2]; }, function(){ try { var n=this.outlen.readU32(); if (n>0 && n<=64) LOG('✅ HMAC_Final outLen='+n+'\n'+hexdump(this.out,{length:n})); } catch(_){} });
        hook('PKCS5_PBKDF2_HMAC', 'libcrypto.so', function(args){ try { var iter=args[4].toInt32(); var keylen=args[6].toInt32(); LOG('🧪 PKCS5_PBKDF2_HMAC iter='+iter+', keylen='+keylen); } catch(_){} }, function(){ try { LOG('✅ PBKDF2 完成'); } catch(_){} });
        ;['AES_set_encrypt_key','AES_set_decrypt_key','AES_encrypt','AES_decrypt'].forEach(function(nm){ hook(nm,'libcrypto.so', function(){ if (__rateLimiter.shouldLog(nm,50,2000)) LOG('🔧 '+nm+' 调用'); }); });
        LOG('[+] 加密原语Hook已启用', { c: Color.Green });
    } catch (e) { LOG('[-] 加密原语Hook失败: '+ e.message, { c: Color.Red }); }
}

