// Frida Native SO 文件分析工具

function nativeAnalyzeSO(soName, showExports, showImports) {
    showExports = showExports || 1;
    showImports = showImports || 0;
    try {
        var module = Process.getModuleByName(soName);
        if (!module) { LOG('[-] 找不到SO文件: ' + soName); return; }
        LOG('[+] SO文件分析: ' + soName);
        LOG('  基址: ' + module.base);
        LOG('  大小: ' + module.size + ' bytes');
        LOG('  路径: ' + module.path);
        if (showExports) {
            LOG('\n[+] 导出函数 (前20个):');
            var exports = module.enumerateExports();
            exports.slice(0, 20).forEach(function(exp){ LOG('  ' + exp.name + ' @ ' + exp.address + ' (' + exp.type + ')'); });
            if (exports.length > 20) LOG('  ... 还有 ' + (exports.length - 20) + ' 个导出函数');
        }
        if (showImports) {
            LOG('\n[+] 导入函数 (前20个):');
            var imports = module.enumerateImports();
            imports.slice(0, 20).forEach(function(imp){ LOG('  ' + imp.name + ' @ ' + imp.address + ' (来自: ' + imp.module + ')'); });
            if (imports.length > 20) LOG('  ... 还有 ' + (imports.length - 20) + ' 个导入函数');
        }
        LOG('[+] SO文件分析完成');
    } catch (e) { LOG('[-] SO文件分析失败: ' + e.message); }
}

