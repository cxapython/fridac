/**
 * fridacli Java Hook工具集 - 新版本 (无旧任务管理系统)
 * 提供Java应用Hook和调试的核心功能
 * 
 * 特点：
 * - 移除了所有旧的HookJobManager依赖
 * - 简化的Hook实现
 * - 保持所有核心功能
 */

// ===== 基础工具函数 =====

var Color = {
    Red: "\x1b[31m",
    Green: "\x1b[32m", 
    Yellow: "\x1b[33m",
    Blue: "\x1b[34m",
    Magenta: "\x1b[35m",
    Cyan: "\x1b[36m",
    White: "\x1b[37m",
    Gray: "\x1b[90m",
    Reset: "\x1b[0m"
};

function LOG(message, options) {
    try {
        options = options || {};
        var text = (message === null || typeof message === 'undefined') ? '' : String(message);
        // 如果有颜色参数，添加 ANSI 颜色码
        if (options.c) {
            text = options.c + text + Color.Reset;
        }
        send(text);
    } catch (e) {
        // 兜底：即使 send 出错也不抛异常，避免打断执行
        try { send(String(message)); } catch (_) {}
    }
}

// ===== 对象注册表与通用格式化（Wallbreaker 风格实现） =====
var __obj_registry = { byId: {}, order: [], max: 500 };

/**
 * 获取对象句柄（Wallbreaker 核心：使用 Java.retain + $handle/$h）
 */
function __getHandle(object) {
    try {
        object = Java.retain(object);
        var handle = null;
        
        // 优先使用 $handle（新版 Frida）
        if (object.hasOwnProperty('$handle') && object.$handle != undefined) {
            handle = object.$handle;
        }
        // 其次使用 $h（兼容旧版）
        else if (object.hasOwnProperty('$h') && object.$h != undefined) {
            handle = object.$h;
        }
        // 最后使用 hashCode
        else {
            handle = Java.use("java.lang.Object").hashCode.apply(object);
        }
        
        if (handle != null) {
            var handleStr = (typeof handle === 'object') ? handle.toString() : String(handle);
            var className = '';
            try { className = String(object.getClass().getName()); } catch (_) { try { className = object.$className || ''; } catch(__) {} }
            __obj_registry.byId[handleStr] = { obj: object, className: className, time: Date.now() };
            __obj_registry.order.push(handleStr);
            if (__obj_registry.order.length > __obj_registry.max) {
                var removed = __obj_registry.order.shift();
                try { delete __obj_registry.byId[removed]; } catch (_) {}
            }
            return handleStr;
        }
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * 通过句柄获取对象
 */
function __getObjectByHandle(handle) {
    var handleStr = String(handle);
    
    // 先从缓存查找
    if (__obj_registry.byId.hasOwnProperty(handleStr)) {
        return __obj_registry.byId[handleStr].obj;
    }
    
    // 尝试通过指针转换（兼容十六进制句柄）
    if (handleStr.startsWith('0x')) {
        var origClassName = null;
        var resultObj = null;
        Java.perform(function() {
            try {
                var obj = Java.use("java.lang.Object");
                var jObject = Java.cast(ptr(handleStr), obj);
                var objClass = obj.getClass.apply(jObject);
                origClassName = Java.use("java.lang.Class").getName.apply(objClass);
                if (origClassName) {
                    resultObj = Java.cast(ptr(handleStr), Java.use(origClassName));
                    resultObj = Java.retain(resultObj);
                    __obj_registry.byId[handleStr] = { obj: resultObj, className: origClassName, time: Date.now() };
                }
            } catch (e) {}
        });
        return resultObj;
    }
    
    return null;
}

/**
 * 对象转字符串
 */
function __objectToStr(object) {
    try {
        return Java.use("java.lang.Object").toString.apply(object);
    } catch (e) {
        return "" + object;
    }
}

/**
 * 注册对象并返回句柄（兼容旧 API）
 */
function __registerObject(obj) {
    try {
        return __getHandle(obj);
    } catch (e) {
        try { LOG('⚠️ 注册对象失败: ' + e.message, { c: Color.Yellow }); } catch (_) {}
        return null;
    }
}

function __formatTypeName(javaType, fullname) {
    try {
        if (!javaType) return 'unknown';
        if (typeof javaType.getName === 'function' && fullname) return String(javaType.getName());
        if (typeof javaType.getSimpleName === 'function' && !fullname) return String(javaType.getSimpleName());
        if (javaType.class && typeof javaType.class.getName === 'function' && fullname) return String(javaType.class.getName());
        if (javaType.class && typeof javaType.class.getSimpleName === 'function' && !fullname) return String(javaType.class.getSimpleName());
        return String(javaType + '');
    } catch (_) { return 'unknown'; }
}

function __safeToString(val) {
    try {
        if (val === null) return 'null';
        if (typeof val === 'undefined') return 'undefined';
        return String(val);
    } catch (_) {
        try { return Object.prototype.toString.call(val); } catch (__){ return '<unprintable>'; }
    }
}

/**
 * 格式化字段值，如果是对象则自动注册并返回可点击的句柄
 * @param {*} val - 字段值
 * @param {boolean} registerObjects - 是否注册对象引用
 * @returns {object} { display: string, objectId: string|null }
 */
function __formatFieldValue(val, registerObjects) {
    try {
        if (val === null) return { display: 'null', objectId: null };
        if (typeof val === 'undefined') return { display: 'undefined', objectId: null };
        if (val === '<inaccessible>') return { display: '<inaccessible>', objectId: null };
        
        // 检测是否是 Java 对象（有 getClass 方法）
        if (registerObjects && val && typeof val === 'object' && typeof val.getClass === 'function') {
            try {
                var valClass = val.getClass();
                var valClassName = String(valClass.getName());
                
                // 排除基本类型的包装类和常见不可变类型
                var primitiveWrappers = [
                    'java.lang.String', 'java.lang.Integer', 'java.lang.Long',
                    'java.lang.Boolean', 'java.lang.Double', 'java.lang.Float',
                    'java.lang.Short', 'java.lang.Byte', 'java.lang.Character',
                    'java.lang.Number', 'java.math.BigInteger', 'java.math.BigDecimal'
                ];
                
                // 对于基本类型包装类，直接显示值
                if (primitiveWrappers.indexOf(valClassName) !== -1) {
                    return { display: __safeToString(val), objectId: null };
                }
                
                // 对于其他对象，注册并显示句柄
                var objId = __registerObject(val);
                if (objId) {
                    var simpleClassName = valClassName;
                    var lastDot = valClassName.lastIndexOf('.');
                    if (lastDot > 0) simpleClassName = valClassName.substring(lastDot + 1);
                    return { 
                        display: '<' + simpleClassName + '@' + objId + '>', 
                        objectId: objId 
                    };
                }
            } catch (_) {}
        }
        
        return { display: __safeToString(val), objectId: null };
    } catch (_) {
        return { display: '<unprintable>', objectId: null };
    }
}

// ===== 类/对象搜索与转储 =====
function classsearch(pattern) {
    try {
        var isRegex = false;
        var regex = null;
        if (pattern && typeof pattern === 'string' && pattern.length >= 2 && pattern[0] === '/' && pattern[pattern.length - 1] === '/') {
            try { regex = new RegExp(pattern.slice(1, -1)); isRegex = true; } catch (_) { regex = null; isRegex = false; }
        }
        var results = [];
        Java.perform(function() {
            var classes = [];
            try { classes = Java.enumerateLoadedClassesSync(); } catch (_) { classes = []; }
            for (var i = 0; i < classes.length; i++) {
                var cn = classes[i];
                if (isRegex ? regex.test(cn) : (String(cn).toLowerCase().indexOf(String(pattern || '').toLowerCase()) !== -1)) {
                    results.push(cn);
                }
            }
        });
        for (var j = 0; j < results.length; j++) { LOG('📦 ' + results[j], { c: Color.Green }); }
        LOG('✅ 共找到 ' + results.length + ' 个匹配类', { c: Color.Blue });
        return results;
    } catch (e) {
        LOG('❌ classsearch 失败: ' + e.message, { c: Color.Red });
        return [];
    }
}

function objectsearch(className, limit) {
    var items = [];
    var count = 0;
    var max = (typeof limit === 'number' && limit > 0) ? limit : 9999;
    
    LOG('🔍 搜索对象实例: ' + className, { c: Color.Cyan });
    
    Java.perform(function() {
        Java.choose(className, {
            onComplete: function() {},
            onMatch: function(instance) {
                if (count >= max) return 'stop';
                
                var handle = __getHandle(instance);
                if (handle != null) {
                    var preview = __objectToStr(instance);
                    LOG('[' + handle + ']: ' + preview, { c: Color.White });
                    items.push({ id: handle, className: className, preview: preview });
                    count++;
                }
                
                if (count >= max) return 'stop';
            }
        });
    });
    
    LOG('✅ 共找到 ' + count + ' 个对象实例 (使用 objectdump("<handle>") 查看详情)', { c: Color.Green });
    return items;
}

function classdump(className, fullname) {
    fullname = !!fullname;
    try {
        Java.perform(function() {
            try {
                var Cls = null;
                var clazz = null;
                var usedCustomLoader = false;
                try {
                    Cls = Java.use(className);
                    clazz = Cls.class;
                    LOG('----- default ClassLoader -----', { c: Color.Cyan });
                } catch (error) {
                    if ((error.message || '').indexOf('ClassNotFoundException') !== -1) {
                        LOG('----- default ClassLoader: not found, searching other dex -----', { c: Color.Yellow });
                        try {
                            var loader = (typeof findTragetClassLoader === 'function') ? findTragetClassLoader(className) : null;
                            if (loader) {
                                Cls = Java.ClassFactory.get(loader).use(className);
                                clazz = Cls.class;
                                usedCustomLoader = true;
                                LOG('----- custom ClassLoader -----', { c: Color.Cyan });
                            } else {
                                LOG('❌ 未在其他ClassLoader中找到类: ' + className, { c: Color.Red });
                                return;
                            }
                        } catch (e2) {
                            LOG('❌ 搜索其他ClassLoader失败: ' + e2.message, { c: Color.Red });
                            return;
                        }
                    } else {
                        throw error;
                    }
                }
                LOG('📘 Class: ' + className, { c: Color.Cyan });
                // 继承与接口
                try {
                    var superClz = clazz.getSuperclass();
                    if (superClz) LOG('  ├─ extends: ' + __formatTypeName(superClz, true), { c: Color.Gray });
                } catch(_){}
                try {
                    var ifaces = clazz.getInterfaces();
                    if (ifaces && ifaces.length) {
                        for (var i = 0; i < ifaces.length; i++) {
                            LOG('  ├─ implements: ' + __formatTypeName(ifaces[i], true), { c: Color.Gray });
                        }
                    }
                } catch(_){}

                // 字段
                LOG('  📄 Fields:', { c: Color.Blue });
                try {
                    var fields = clazz.getDeclaredFields();
                    for (var f = 0; f < fields.length; f++) {
                        var field = fields[f];
                        try {
                            var type = __formatTypeName(field.getType(), fullname);
                            var name = String(field.getName());
                            var mods = '';
                            try { mods = String(field.toString()).split(' ')[0]; } catch(_){}
                            LOG('    - ' + (mods ? (mods + ' ') : '') + type + ' ' + name, { c: Color.White });
                        } catch(_){}
                    }
                } catch(_) { LOG('    <unavailable>', { c: Color.Yellow }); }

                // 构造函数
                LOG('  🏗️ Constructors:', { c: Color.Blue });
                try {
                    var ctors = clazz.getDeclaredConstructors();
                    for (var c = 0; c < ctors.length; c++) {
                        var ctor = ctors[c];
                        try {
                            var ptypes = ctor.getParameterTypes();
                            var parts = [];
                            for (var pi = 0; pi < ptypes.length; pi++) { parts.push(__formatTypeName(ptypes[pi], fullname)); }
                            LOG('    - ' + className + '(' + parts.join(', ') + ')', { c: Color.White });
                        } catch(_){}
                    }
                } catch(_) { LOG('    <unavailable>', { c: Color.Yellow }); }

                // 方法
                LOG('  🧠 Methods:', { c: Color.Blue });
                try {
                    var methods = clazz.getDeclaredMethods();
                    for (var m = 0; m < methods.length; m++) {
                        var method = methods[m];
                        try {
                            var ret = __formatTypeName(method.getReturnType(), fullname);
                            var mn = String(method.getName());
                            var params = method.getParameterTypes();
                            var pnames = [];
                            for (var k = 0; k < params.length; k++) { pnames.push(__formatTypeName(params[k], fullname)); }
                            var mods2 = '';
                            try { mods2 = String(method.toString()).split(' ')[0]; } catch(_){}
                            LOG('    - ' + (mods2 ? (mods2 + ' ') : '') + ret + ' ' + mn + '(' + pnames.join(', ') + ')', { c: Color.White });
                        } catch(_){}
                    }
                } catch(_) { LOG('    <unavailable>', { c: Color.Yellow }); }

                LOG('✅ classdump 完成', { c: Color.Green });
            } catch (e2) {
                LOG('❌ classdump 失败: ' + e2.message, { c: Color.Red });
            }
        });
        return true;
    } catch (e) {
        LOG('❌ classdump 失败: ' + e.message, { c: Color.Red });
        return false;
    }
}

function objectdump(handle, fullname) {
    // 默认显示完整类名（与 wallbreaker 行为一致）
    fullname = (fullname === false) ? false : true;
    try {
        var id = String(handle);
        var obj = __getObjectByHandle(id);
        if (!obj) { LOG('❌ 未找到对象句柄 ' + id + '，请先执行 objectsearch()', { c: Color.Red }); return false; }
        Java.perform(function() {
            try {
                var clazz = obj.getClass ? obj.getClass() : (obj.class ? obj.class : null);
                var className = '';
                try { className = clazz ? String(clazz.getName()) : (obj.$className || 'Object'); } catch(_) { className = obj.$className || 'Object'; }
                
                var Modifier = Java.use('java.lang.reflect.Modifier');
                
                // 包名
                var pkgName = '';
                try {
                    var lastDot = className.lastIndexOf('.');
                    if (lastDot > 0) pkgName = className.substring(0, lastDot);
                } catch(_) {}
                LOG('package ' + pkgName, { c: Color.Gray });
                LOG('', { c: Color.White });
                
                // 类名（简短形式）
                var simpleClassName = className;
                try {
                    var lastDot2 = className.lastIndexOf('.');
                    if (lastDot2 > 0) simpleClassName = className.substring(lastDot2 + 1);
                } catch(_) {}
                LOG('class ' + simpleClassName + ' {', { c: Color.Cyan });
                
                // ===== 静态字段 =====
                var referencedObjects = [];
                LOG('', { c: Color.White });
                LOG('    /* static fields */', { c: Color.Gray });
                try {
                    var fields = clazz.getDeclaredFields();
                    var hasStaticField = false;
                    for (var i = 0; i < fields.length; i++) {
                        try {
                            var f = fields[i];
                            var mods = f.getModifiers();
                            if (!Modifier.isStatic(mods)) continue;
                            hasStaticField = true;
                            try { f.setAccessible(true); } catch(_){}
                            var name = String(f.getName());
                            var type = __formatTypeName(f.getType(), fullname);
                            var val = null;
                            try { val = f.get(null); } catch (_) { val = '<inaccessible>'; }
                            var formatted = __formatFieldValue(val, true);
                            if (formatted.objectId) {
                                referencedObjects.push({ name: name, id: formatted.objectId });
                            }
                            LOG('    static ' + type + ' ' + name + '; => ' + formatted.display, { c: Color.Yellow });
                        } catch(_){}
                    }
                    if (!hasStaticField) LOG('    (无静态字段)', { c: Color.Gray });
                } catch (_) { LOG('    <无法获取静态字段>', { c: Color.Yellow }); }
                
                // ===== 实例字段 =====
                LOG('', { c: Color.White });
                LOG('    /* instance fields */', { c: Color.Gray });
                try {
                    var fields = clazz.getDeclaredFields();
                    var hasInstanceField = false;
                    for (var i = 0; i < fields.length; i++) {
                        try {
                            var f = fields[i];
                            var mods = f.getModifiers();
                            if (Modifier.isStatic(mods)) continue;
                            hasInstanceField = true;
                            try { f.setAccessible(true); } catch(_){}
                            var name = String(f.getName());
                            var type = __formatTypeName(f.getType(), fullname);
                            var val = null;
                            try { val = f.get(obj); } catch (_) { val = '<inaccessible>'; }
                            var formatted = __formatFieldValue(val, true);
                            if (formatted.objectId) {
                                referencedObjects.push({ name: name, id: formatted.objectId });
                            }
                            LOG('    ' + type + ' ' + name + '; => ' + formatted.display, { c: Color.White });
                        } catch(_){}
                    }
                    if (!hasInstanceField) LOG('    (无实例字段)', { c: Color.Gray });
                } catch (_) { LOG('    <无法获取实例字段>', { c: Color.Yellow }); }
                
                // ===== 构造方法 =====
                LOG('', { c: Color.White });
                LOG('    /* constructor methods */', { c: Color.Gray });
                try {
                    var ctors = clazz.getDeclaredConstructors();
                    if (ctors.length === 0) {
                        LOG('    (无构造方法)', { c: Color.Gray });
                    }
                    for (var c = 0; c < ctors.length; c++) {
                        var ctor = ctors[c];
                        try {
                            var ptypes = ctor.getParameterTypes();
                            var parts = [];
                            for (var pi = 0; pi < ptypes.length; pi++) { parts.push(__formatTypeName(ptypes[pi], fullname)); }
                            LOG('    ' + simpleClassName + '(' + parts.join(', ') + ');', { c: Color.White });
                        } catch(_){}
                    }
                } catch(_) { LOG('    <无法获取构造方法>', { c: Color.Yellow }); }
                
                // ===== 静态方法 =====
                LOG('', { c: Color.White });
                LOG('    /* static methods */', { c: Color.Gray });
                try {
                    var methods = clazz.getDeclaredMethods();
                    var hasStaticMethod = false;
                    for (var m = 0; m < methods.length; m++) {
                        var method = methods[m];
                        try {
                            var mods = method.getModifiers();
                            if (!Modifier.isStatic(mods)) continue;
                            hasStaticMethod = true;
                            var ret = __formatTypeName(method.getReturnType(), fullname);
                            var mn = String(method.getName());
                            var params = method.getParameterTypes();
                            var pnames = [];
                            for (var k = 0; k < params.length; k++) { pnames.push(__formatTypeName(params[k], fullname)); }
                            LOG('    static ' + ret + ' ' + mn + '(' + pnames.join(', ') + ');', { c: Color.Magenta });
                        } catch(_){}
                    }
                    if (!hasStaticMethod) LOG('    (无静态方法)', { c: Color.Gray });
                } catch(_) { LOG('    <无法获取静态方法>', { c: Color.Yellow }); }
                
                // ===== 实例方法 =====
                LOG('', { c: Color.White });
                LOG('    /* instance methods */', { c: Color.Gray });
                try {
                    var methods = clazz.getDeclaredMethods();
                    var hasInstanceMethod = false;
                    for (var m = 0; m < methods.length; m++) {
                        var method = methods[m];
                        try {
                            var mods = method.getModifiers();
                            if (Modifier.isStatic(mods)) continue;
                            hasInstanceMethod = true;
                            var ret = __formatTypeName(method.getReturnType(), fullname);
                            var mn = String(method.getName());
                            var params = method.getParameterTypes();
                            var pnames = [];
                            for (var k = 0; k < params.length; k++) { pnames.push(__formatTypeName(params[k], fullname)); }
                            LOG('    ' + ret + ' ' + mn + '(' + pnames.join(', ') + ');', { c: Color.Green });
                        } catch(_){}
                    }
                    if (!hasInstanceMethod) LOG('    (无实例方法)', { c: Color.Gray });
                } catch(_) { LOG('    <无法获取实例方法>', { c: Color.Yellow }); }
                
                LOG('', { c: Color.White });
                LOG('}', { c: Color.Cyan });
                LOG('✅ objectdump 完成 (共 ' + (clazz.getDeclaredFields().length) + ' 个字段, ' + (clazz.getDeclaredMethods().length) + ' 个方法)', { c: Color.Green });
                
                // 显示可深入查看的对象引用
                if (referencedObjects.length > 0) {
                    LOG('', { c: Color.White });
                    LOG('📎 可深入查看的对象引用:', { c: Color.Cyan });
                    for (var ri = 0; ri < referencedObjects.length; ri++) {
                        var ref = referencedObjects[ri];
                        LOG('    objectdump(' + ref.id + ')  // ' + ref.name, { c: Color.Blue });
                    }
                }
            } catch (e2) {
                LOG('❌ objectdump 失败: ' + e2.message, { c: Color.Red });
            }
        });
        return true;
    } catch (e) {
        LOG('❌ objectdump 失败: ' + e.message, { c: Color.Red });
        return false;
    }
}

// ===== Wallbreaker-style 深度对象查看器 =====

/**
 * 获取对象所有字段（包含继承链上的所有字段）
 */
function __getAllFields(clazz) {
    var allFields = [];
    var visited = {};
    var current = clazz;
    while (current != null) {
        try {
            var className = String(current.getName());
            if (className === 'java.lang.Object') break;
            var fields = current.getDeclaredFields();
            for (var i = 0; i < fields.length; i++) {
                var f = fields[i];
                var key = String(f.getName());
                if (!visited[key]) {
                    visited[key] = true;
                    allFields.push({ field: f, declaredIn: className });
                }
            }
            current = current.getSuperclass();
        } catch (_) { break; }
    }
    return allFields;
}

/**
 * 智能格式化字段值（支持常见类型的详细展示）
 */
function __formatFieldValue(val, depth, maxDepth, visited) {
    if (val === null) return 'null';
    if (typeof val === 'undefined') return 'undefined';
    
    try {
        // 基本类型直接返回
        var valType = typeof val;
        if (valType === 'number' || valType === 'boolean') return String(val);
        if (valType === 'string') return '"' + val + '"';
        
        // Java 对象
        if (val.$h !== undefined || (val.getClass && typeof val.getClass === 'function')) {
            var objClass = '';
            try { objClass = String(val.getClass().getName()); } catch (_) { objClass = 'Object'; }
            
            // 字符串类型
            if (objClass === 'java.lang.String') {
                try { return '"' + String(val) + '"'; } catch (_) { return '<String>'; }
            }
            
            // 数字包装类
            if (objClass.match(/^java\.lang\.(Integer|Long|Short|Byte|Float|Double|Boolean|Character)$/)) {
                try { return String(val) + ' (' + objClass.split('.').pop() + ')'; } catch (_) {}
            }
            
            // 集合类型
            if (objClass.match(/^java\.util\.(ArrayList|LinkedList|HashSet|TreeSet|Vector)/) || 
                objClass.indexOf('List') !== -1 || objClass.indexOf('Set') !== -1) {
                try {
                    var size = val.size ? val.size() : '?';
                    return '<' + objClass.split('.').pop() + '> size=' + size;
                } catch (_) {}
            }
            
            // Map 类型
            if (objClass.match(/^java\.util\.(HashMap|TreeMap|LinkedHashMap|Hashtable|ConcurrentHashMap)/) ||
                objClass.indexOf('Map') !== -1) {
                try {
                    var mapSize = val.size ? val.size() : '?';
                    return '<' + objClass.split('.').pop() + '> size=' + mapSize;
                } catch (_) {}
            }
            
            // 数组类型
            if (objClass.startsWith('[')) {
                try {
                    var arrLen = Java.use('java.lang.reflect.Array').getLength(val);
                    return '<Array> length=' + arrLen;
                } catch (_) { return '<Array>'; }
            }
            
            // 其他对象：返回类名和 identityHashCode
            try {
                var System = Java.use('java.lang.System');
                var hashCode = System.identityHashCode(val);
                return '<' + objClass.split('.').pop() + '@' + hashCode + '>';
            } catch (_) {
                return '<' + objClass + '>';
            }
        }
        
        return String(val);
    } catch (_) {
        return '<格式化失败>';
    }
}

/**
 * objectview - Wallbreaker 风格的深度对象查看器
 * @param {number|string} handle - objectsearch 返回的对象句柄
 * @param {object} options - 选项: { depth: 1, fullname: false, showStatic: false, showInherited: true }
 */
function objectview(handle, options) {
    options = options || {};
    var maxDepth = (typeof options === 'number') ? options : (options.depth || 1);
    var fullname = options.fullname || false;
    var showStatic = options.showStatic !== false;
    var showInherited = options.showInherited !== false;
    
    try {
        var id = String(handle);
        var obj = __getObjectByHandle(id);
        if (!obj) {
            LOG('❌ 未找到对象句柄 ' + id + '，请先执行 objectsearch()', { c: Color.Red });
            return false;
        }
        
        Java.perform(function() {
            try {
                var clazz = obj.getClass ? obj.getClass() : (obj.class ? obj.class : null);
                var className = '';
                try { className = clazz ? String(clazz.getName()) : (obj.$className || 'Object'); } catch(_) { className = 'Object'; }
                
                // 标题
                LOG('', { c: Color.White });
                LOG('╔══════════════════════════════════════════════════════════════', { c: Color.Cyan });
                LOG('║ 📦 Object ' + id + ' <' + className + '>', { c: Color.Cyan });
                LOG('╠══════════════════════════════════════════════════════════════', { c: Color.Cyan });
                
                // 类层次结构
                LOG('║ 📊 Class Hierarchy:', { c: Color.Yellow });
                var hierarchy = [];
                var tmpClazz = clazz;
                while (tmpClazz != null) {
                    try {
                        var hName = String(tmpClazz.getName());
                        if (hName === 'java.lang.Object') break;
                        hierarchy.push(hName);
                        tmpClazz = tmpClazz.getSuperclass();
                    } catch (_) { break; }
                }
                for (var h = 0; h < hierarchy.length; h++) {
                    var indent = '  '.repeat(h);
                    LOG('║   ' + indent + (h === 0 ? '└─ ' : '   └─ ') + hierarchy[h], { c: Color.Gray });
                }
                
                // 获取所有字段（包含继承）
                var allFields = showInherited ? __getAllFields(clazz) : [];
                if (!showInherited) {
                    try {
                        var declaredFields = clazz.getDeclaredFields();
                        for (var i = 0; i < declaredFields.length; i++) {
                            allFields.push({ field: declaredFields[i], declaredIn: className });
                        }
                    } catch (_) {}
                }
                
                // 分类字段
                var instanceFields = [];
                var staticFields = [];
                var Modifier = Java.use('java.lang.reflect.Modifier');
                
                for (var fi = 0; fi < allFields.length; fi++) {
                    var fInfo = allFields[fi];
                    var f = fInfo.field;
                    try {
                        var mods = f.getModifiers();
                        if (Modifier.isStatic(mods)) {
                            staticFields.push(fInfo);
                        } else {
                            instanceFields.push(fInfo);
                        }
                    } catch (_) {
                        instanceFields.push(fInfo);
                    }
                }
                
                // 实例字段
                LOG('║', { c: Color.Cyan });
                LOG('║ 🔷 Instance Fields (' + instanceFields.length + '):', { c: Color.Blue });
                if (instanceFields.length === 0) {
                    LOG('║   (无实例字段)', { c: Color.Gray });
                }
                for (var ii = 0; ii < instanceFields.length; ii++) {
                    var iInfo = instanceFields[ii];
                    var iField = iInfo.field;
                    try {
                        try { iField.setAccessible(true); } catch(_){}
                        var iName = String(iField.getName());
                        var iType = __formatTypeName(iField.getType(), fullname);
                        var iVal = null;
                        try { iVal = iField.get(obj); } catch (ee) { iVal = '<inaccessible: ' + ee.message + '>'; }
                        var iValStr = __formatFieldValue(iVal, 0, maxDepth, {});
                        
                        var declaredHint = (showInherited && iInfo.declaredIn !== className) ? 
                            ' [from ' + iInfo.declaredIn.split('.').pop() + ']' : '';
                        
                        LOG('║   • ' + iType + ' ' + iName + declaredHint, { c: Color.White });
                        LOG('║       = ' + iValStr, { c: Color.Green });
                    } catch (_) {}
                }
                
                // 静态字段
                if (showStatic && staticFields.length > 0) {
                    LOG('║', { c: Color.Cyan });
                    LOG('║ 🔶 Static Fields (' + staticFields.length + '):', { c: Color.Yellow });
                    for (var si = 0; si < staticFields.length; si++) {
                        var sInfo = staticFields[si];
                        var sField = sInfo.field;
                        try {
                            try { sField.setAccessible(true); } catch(_){}
                            var sName = String(sField.getName());
                            var sType = __formatTypeName(sField.getType(), fullname);
                            var sVal = null;
                            try { sVal = sField.get(null); } catch (ee) { 
                                try { sVal = sField.get(obj); } catch (ee2) { sVal = '<inaccessible>'; }
                            }
                            var sValStr = __formatFieldValue(sVal, 0, maxDepth, {});
                            
                            LOG('║   ◆ ' + sType + ' ' + sName, { c: Color.White });
                            LOG('║       = ' + sValStr, { c: Color.Cyan });
                        } catch (_) {}
                    }
                }
                
                LOG('║', { c: Color.Cyan });
                LOG('╚══════════════════════════════════════════════════════════════', { c: Color.Cyan });
                LOG('✅ objectview 完成 (共 ' + (instanceFields.length + staticFields.length) + ' 个字段)', { c: Color.Green });
                
            } catch (e2) {
                LOG('❌ objectview 失败: ' + e2.message, { c: Color.Red });
            }
        });
        return true;
    } catch (e) {
        LOG('❌ objectview 失败: ' + e.message, { c: Color.Red });
        return false;
    }
}

/**
 * objectfields - 获取对象完整字段列表（包含继承链）
 */
function objectfields(handle, fullname) {
    fullname = !!fullname;
    try {
        var id = String(handle);
        var obj = __getObjectByHandle(id);
        if (!obj) {
            LOG('❌ 未找到对象句柄 ' + id + '，请先执行 objectsearch()', { c: Color.Red });
            return [];
        }
        
        var result = [];
        Java.perform(function() {
            try {
                var clazz = obj.getClass();
                var allFields = __getAllFields(clazz);
                var Modifier = Java.use('java.lang.reflect.Modifier');
                
                for (var i = 0; i < allFields.length; i++) {
                    var fInfo = allFields[i];
                    var f = fInfo.field;
                    try {
                        try { f.setAccessible(true); } catch(_){}
                        var name = String(f.getName());
                        var type = __formatTypeName(f.getType(), fullname);
                        var mods = f.getModifiers();
                        var isStatic = Modifier.isStatic(mods);
                        var val = null;
                        try { val = isStatic ? f.get(null) : f.get(obj); } catch (_) { val = '<inaccessible>'; }
                        
                        result.push({
                            name: name,
                            type: type,
                            value: __safeToString(val),
                            isStatic: isStatic,
                            declaredIn: fInfo.declaredIn
                        });
                    } catch (_) {}
                }
            } catch (e) {
                LOG('❌ objectfields 失败: ' + e.message, { c: Color.Red });
            }
        });
        
        return result;
    } catch (e) {
        LOG('❌ objectfields 失败: ' + e.message, { c: Color.Red });
        return [];
    }
}

/**
 * objectrefresh - 刷新对象当前值（直接实时读取）
 */
function objectrefresh(handle) {
    try {
        var id = String(handle);
        var obj = __getObjectByHandle(id);
        if (!obj) {
            LOG('❌ 未找到对象句柄 ' + id, { c: Color.Red });
            return false;
        }
        LOG('🔄 刷新对象 ' + id + ' 的字段值...', { c: Color.Cyan });
        return objectview(handle, { showInherited: true, showStatic: true });
    } catch (e) {
        LOG('❌ objectrefresh 失败: ' + e.message, { c: Color.Red });
        return false;
    }
}

/**
 * objectexpand - 展开对象的某个字段（支持嵌套对象查看）
 */
function objectexpand(handle, fieldName) {
    try {
        var id = String(handle);
        var obj = __getObjectByHandle(id);
        if (!obj) {
            LOG('❌ 未找到对象句柄 ' + id, { c: Color.Red });
            return null;
        }
        
        var result = null;
        Java.perform(function() {
            try {
                var clazz = obj.getClass();
                var allFields = __getAllFields(clazz);
                var found = false;
                
                for (var i = 0; i < allFields.length; i++) {
                    var fInfo = allFields[i];
                    var f = fInfo.field;
                    if (String(f.getName()) === fieldName) {
                        found = true;
                        try { f.setAccessible(true); } catch(_){}
                        var Modifier = Java.use('java.lang.reflect.Modifier');
                        var isStatic = Modifier.isStatic(f.getModifiers());
                        var val = isStatic ? f.get(null) : f.get(obj);
                        
                        if (val === null) {
                            LOG('⚠️ 字段 ' + fieldName + ' 的值为 null', { c: Color.Yellow });
                            return;
                        }
                        
                        // 检查是否是对象类型
                        if (val.$h !== undefined || (val.getClass && typeof val.getClass === 'function')) {
                            var newId = __registerObject(val);
                            var valClass = String(val.getClass().getName());
                            LOG('🔗 已注册字段 ' + fieldName + ' 为对象 #' + newId + ' <' + valClass + '>', { c: Color.Green });
                            LOG('   使用 objectview(' + newId + ') 查看详情', { c: Color.Cyan });
                            result = newId;
                        } else {
                            LOG('ℹ️ 字段 ' + fieldName + ' 是基本类型: ' + __safeToString(val), { c: Color.Blue });
                            result = val;
                        }
                        break;
                    }
                }
                
                if (!found) {
                    LOG('❌ 未找到字段: ' + fieldName, { c: Color.Red });
                }
            } catch (e) {
                LOG('❌ objectexpand 失败: ' + e.message, { c: Color.Red });
            }
        });
        
        return result;
    } catch (e) {
        LOG('❌ objectexpand 失败: ' + e.message, { c: Color.Red });
        return null;
    }
}

/**
 * objectlist - 展开 List/Set 集合类型
 */
function objectlist(handle, limit) {
    limit = (typeof limit === 'number' && limit > 0) ? limit : 20;
    try {
        var id = String(handle);
        var obj = __getObjectByHandle(id);
        if (!obj) {
            LOG('❌ 未找到对象句柄 ' + id, { c: Color.Red });
            return [];
        }
        
        var items = [];
        Java.perform(function() {
            try {
                var className = String(obj.getClass().getName());
                
                // 检查是否是集合类型
                var Collection = Java.use('java.util.Collection');
                var isCollection = false;
                try { isCollection = Collection.class.isInstance(obj); } catch(_){}
                
                if (!isCollection) {
                    LOG('⚠️ 对象 #' + id + ' 不是 Collection 类型', { c: Color.Yellow });
                    return;
                }
                
                var size = obj.size();
                LOG('📋 Collection #' + id + ' <' + className + '> size=' + size, { c: Color.Cyan });
                
                var iterator = obj.iterator();
                var idx = 0;
                while (iterator.hasNext() && idx < limit) {
                    var item = iterator.next();
                    var itemStr = __formatFieldValue(item, 0, 1, {});
                    
                    if (item !== null && (item.$h !== undefined || (item.getClass && typeof item.getClass === 'function'))) {
                        var itemId = __registerObject(item);
                        LOG('  [' + idx + '] #' + itemId + ' ' + itemStr, { c: Color.White });
                        items.push({ index: idx, id: itemId, value: itemStr });
                    } else {
                        LOG('  [' + idx + '] ' + itemStr, { c: Color.White });
                        items.push({ index: idx, id: null, value: itemStr });
                    }
                    idx++;
                }
                
                if (size > limit) {
                    LOG('  ... 共 ' + size + ' 项，显示前 ' + limit + ' 项', { c: Color.Gray });
                }
                LOG('✅ objectlist 完成', { c: Color.Green });
            } catch (e) {
                LOG('❌ objectlist 失败: ' + e.message, { c: Color.Red });
            }
        });
        
        return items;
    } catch (e) {
        LOG('❌ objectlist 失败: ' + e.message, { c: Color.Red });
        return [];
    }
}

/**
 * objectmap - 展开 Map 类型
 */
function objectmap(handle, limit) {
    limit = (typeof limit === 'number' && limit > 0) ? limit : 20;
    try {
        var id = String(handle);
        var obj = __getObjectByHandle(id);
        if (!obj) {
            LOG('❌ 未找到对象句柄 ' + id, { c: Color.Red });
            return [];
        }
        
        var items = [];
        Java.perform(function() {
            try {
                var className = String(obj.getClass().getName());
                
                // 检查是否是 Map 类型
                var Map = Java.use('java.util.Map');
                var isMap = false;
                try { isMap = Map.class.isInstance(obj); } catch(_){}
                
                if (!isMap) {
                    LOG('⚠️ 对象 #' + id + ' 不是 Map 类型', { c: Color.Yellow });
                    return;
                }
                
                var size = obj.size();
                LOG('🗺️ Map #' + id + ' <' + className + '> size=' + size, { c: Color.Cyan });
                
                var entrySet = obj.entrySet();
                var iterator = entrySet.iterator();
                var idx = 0;
                while (iterator.hasNext() && idx < limit) {
                    var mapEntry = iterator.next();
                    var key = mapEntry.getKey();
                    var value = mapEntry.getValue();
                    
                    var keyStr = __formatFieldValue(key, 0, 1, {});
                    var valueStr = __formatFieldValue(value, 0, 1, {});
                    
                    var valueId = null;
                    if (value !== null && (value.$h !== undefined || (value.getClass && typeof value.getClass === 'function'))) {
                        valueId = __registerObject(value);
                        LOG('  ' + keyStr + ' => #' + valueId + ' ' + valueStr, { c: Color.White });
                    } else {
                        LOG('  ' + keyStr + ' => ' + valueStr, { c: Color.White });
                    }
                    items.push({ key: keyStr, value: valueStr, valueId: valueId });
                    idx++;
                }
                
                if (size > limit) {
                    LOG('  ... 共 ' + size + ' 项，显示前 ' + limit + ' 项', { c: Color.Gray });
                }
                LOG('✅ objectmap 完成', { c: Color.Green });
            } catch (e) {
                LOG('❌ objectmap 失败: ' + e.message, { c: Color.Red });
            }
        });
        
        return items;
    } catch (e) {
        LOG('❌ objectmap 失败: ' + e.message, { c: Color.Red });
        return [];
    }
}

function printStack(showComplete, maxLines) {
    try {
        var exception = Java.use("java.lang.Exception").$new();
        var trace = exception.getStackTrace();
        LOG("📚 调用堆栈:", { c: Color.Cyan });
        
        var limit = showComplete ? trace.length : (typeof maxLines === 'number' && maxLines > 0 ? maxLines : 20);
        var printed = 0;
        for (var i = 0; i < trace.length && printed < limit; i++) {
            var element = trace[i].toString();
            if (element.indexOf("java.lang.Exception") === -1 &&
                element.indexOf("android.util.Log") === -1 &&
                element.indexOf("dalvik.system") === -1) {
                LOG("📍 " + element, { c: Color.Gray });
                printed++;
            }
        }
    } catch (e) {
        LOG("⚠️ 无法获取堆栈信息: " + e.message, { c: Color.Yellow });
    }
}

// 兼容别名：printJavaCallStack -> printStack
function printJavaCallStack(showComplete, maxLines) {
    try { printStack(showComplete, maxLines); } catch (_) { }
}

// 参数类型获取
function __getArgType(value) {
    try {
        if (value === null) return 'null';
        if (typeof value === 'undefined') return 'undefined';
        if (typeof value.getClass === 'function') {
            try { return String(value.getClass().getName()); } catch(_) {}
        }
        if (value && value.$className) {
            try { return String(value.$className); } catch(_) {}
        }
        if (value && value.class && typeof value.class.getName === 'function') {
            try { return String(value.class.getName()); } catch(_) {}
        }
        var t = typeof value;
        if (t === 'object') {
            try { return Object.prototype.toString.call(value); } catch(_) {}
        }
        return t;
    } catch (_) {
        return 'unknown';
    }
}

// ClassLoader 搜索功能
function findTragetClassLoader(className) {
    var foundLoader = null;
    try {
        Java.enumerateClassLoadersSync().forEach(function(loader) {
            try {
                var factory = Java.ClassFactory.get(loader);
                factory.use(className);
                foundLoader = loader;
                return;
            } catch (e) {
                // 忽略错误，继续查找
            }
        });
    } catch (e) {
        LOG("⚠️ 搜索ClassLoader时出错: " + e.message, { c: Color.Yellow });
    }
    return foundLoader;
}

// ===== 核心Hook函数 =====

// 已移除 smartTrace（请使用 intelligentHookDispatcher）

// 跟踪类的所有方法
// @param className - 类名 (com.example.Class)
// @param showStack - 是否显示调用栈 (可选，默认false，传1或true启用)
// @param stackLines - 调用栈显示行数 (可选，默认20行)
function traceClass(className, showStack, stackLines) {
    // 参数处理：支持数字1或布尔true
    var enableStack = showStack === true || showStack === 1 || showStack === '1' || showStack === 'true';
    var maxStackLines = (typeof stackLines === 'number' && stackLines > 0) ? stackLines : 20;
    
    LOG("🏛️ 跟踪类: " + className + (enableStack ? " (含调用栈, " + maxStackLines + "行)" : ""), { c: Color.Cyan });
    
    Java.perform(function() {
        try {
            var targetClass = null;
            
            // 尝试加载类
            try {
                targetClass = Java.use(className);
            } catch (error) {
                if ((error.message || '').indexOf("ClassNotFoundException") !== -1) {
                    LOG("❌ 类未在默认ClassLoader中找到，搜索其他ClassLoader...", { c: Color.Yellow });
                    var foundLoader = findTragetClassLoader(className);
                    if (foundLoader) {
                        targetClass = Java.ClassFactory.get(foundLoader).use(className);
                        LOG("🎯 成功使用自定义ClassLoader加载类", { c: Color.Green });
                    } else {
                        LOG("❌ 在所有ClassLoader中都未找到类: " + className, { c: Color.Red });
                        return;
                    }
                } else {
                    throw error;
                }
            }
            
            // Hook类的所有方法
            var methods = targetClass.class.getDeclaredMethods();
            var hookedCount = 0;
            
            methods.forEach(function(method) {
                try {
                    var methodName = method.getName();
                    
                    // 跳过特殊方法
                    if (methodName.indexOf("$") !== -1 || methodName.indexOf("<") !== -1) {
                        return;
                    }
                    
                    var originalImpl = targetClass[methodName];
                    if (originalImpl) {
                        targetClass[methodName].implementation = function() {
                            var fullMethodName = className + "." + methodName;
                            LOG("\n*** 进入 " + fullMethodName, { c: Color.Green });
                            
                            // 显示调用栈
                            if (enableStack) {
                                printStack(false, maxStackLines);
                            }
                            
                            // 打印参数
                            if (arguments.length > 0) {
                                LOG("📥 参数:", { c: Color.Blue });
                                for (var i = 0; i < arguments.length; i++) {
                                    LOG("  arg[" + i + "]: " + arguments[i], { c: Color.White });
                                }
                            }
                            
                            var retval = originalImpl.apply(this, arguments);
                            
                            LOG("📤 返回值: " + retval, { c: Color.Blue });
                            LOG("🏁 退出 " + fullMethodName + "\n", { c: Color.Green });
                            
                            return retval;
                        };
                        hookedCount++;
                    }
                } catch (e) {
                    // 忽略无法Hook的方法
                }
            });
            
            LOG("✅ 类Hook设置成功: " + hookedCount + " 个方法", { c: Color.Green });
            
        } catch (error) {
            LOG("❌ 类Hook设置失败: " + error.message, { c: Color.Red });
        }
    });
}

// 跟踪特定方法（功能最全版本，合并了 hookJavaMethodWithTracing 和 advancedMethodTracing）
// @param fullyQualifiedMethodName - 完整方法名 (com.example.Class.method)
// @param showStack - 是否显示调用栈 (可选，默认false，传1或true启用)
// @param stackLines - 调用栈显示行数 (可选，默认20行)
// @param customReturnValue - 自定义返回值 (可选，设置后替换原始返回值)
// @param showFieldInfo - 是否显示对象字段信息 (可选，默认false，传1或true启用)
function traceMethod(fullyQualifiedMethodName, showStack, stackLines, customReturnValue, showFieldInfo) {
    // 参数处理：支持数字1或布尔true
    var enableStack = showStack === true || showStack === 1 || showStack === '1' || showStack === 'true';
    var maxStackLines = (typeof stackLines === 'number' && stackLines > 0) ? stackLines : 20;
    var hasCustomReturn = customReturnValue !== undefined && customReturnValue !== null;
    var enableFieldInfo = showFieldInfo === true || showFieldInfo === 1 || showFieldInfo === '1' || showFieldInfo === 'true';
    
    var logMsg = "🎯 跟踪方法: " + fullyQualifiedMethodName;
    if (enableStack) logMsg += " [调用栈:" + maxStackLines + "行]";
    if (hasCustomReturn) logMsg += " [自定义返回:" + customReturnValue + "]";
    if (enableFieldInfo) logMsg += " [字段信息]";
    LOG(logMsg, { c: Color.Cyan });

    // 解析类名和方法名
    var lastDotIndex = fullyQualifiedMethodName.lastIndexOf('.');
    if (lastDotIndex === -1) {
        LOG("❌ 方法名格式错误，应为: com.example.Class.method", { c: Color.Red });
        return;
    }

    var className = fullyQualifiedMethodName.substring(0, lastDotIndex);
    var methodName = fullyQualifiedMethodName.substring(lastDotIndex + 1);

    Java.perform(function() {
        try {
            var targetClass = null;

            // 尝试加载类，支持 ClassLoader 回退
            try {
                targetClass = Java.use(className);
            } catch (error) {
                if ((error.message || '').indexOf('ClassNotFoundException') !== -1) {
                    LOG("❌ 类未在默认ClassLoader中找到，搜索其他ClassLoader...", { c: Color.Yellow });
                    var foundLoader = findTragetClassLoader(className);
                    if (foundLoader) {
                        targetClass = Java.ClassFactory.get(foundLoader).use(className);
                        LOG("🎯 成功使用自定义ClassLoader加载类", { c: Color.Green });
                    } else {
                        LOG("❌ 在所有ClassLoader中都未找到类: " + className, { c: Color.Red });
                        return;
                    }
                } else {
                    throw error;
                }
            }

            if (!targetClass || !targetClass[methodName]) {
                LOG("❌ 未找到方法: " + fullyQualifiedMethodName, { c: Color.Red });
                return;
            }

            var methodWrapper = targetClass[methodName];
            var overloads = methodWrapper.overloads || [];

            // Hook 实现的核心逻辑（复用）
            var createHookImpl = function(originalCall) {
                return function() {
                    LOG("\n*** 进入 " + fullyQualifiedMethodName, { c: Color.Green });

                    // 显示调用栈
                    if (enableStack) {
                        printStack(false, maxStackLines);
                    }

                    // 显示对象字段信息
                    if (enableFieldInfo) {
                        try {
                            var fields = this.class.getDeclaredFields();
                            LOG("📋 对象字段 (最多5个):", { c: Color.Blue });
                            for (var f = 0; f < Math.min(fields.length, 5); f++) {
                                var field = fields[f];
                                field.setAccessible(true);
                                try {
                                    var fieldValue = field.get(this);
                                    LOG("  " + field.getName() + " (" + field.getType().getName() + "): " + fieldValue, { c: Color.Gray });
                                } catch (fe) {
                                    LOG("  " + field.getName() + " (" + field.getType().getName() + "): <无法访问>", { c: Color.Gray });
                                }
                            }
                            if (fields.length > 5) {
                                LOG("  ... 还有 " + (fields.length - 5) + " 个字段", { c: Color.Gray });
                            }
                        } catch (e) {
                            LOG("⚠️ 无法获取字段信息: " + e.message, { c: Color.Yellow });
                        }
                    }

                    // 打印参数
                    if (arguments.length > 0) {
                        LOG("📥 参数:", { c: Color.Blue });
                        for (var j = 0; j < arguments.length; j++) {
                            var __t = __getArgType(arguments[j]);
                            LOG("  arg[" + j + "] (" + __t + "): " + arguments[j], { c: Color.White });
                        }
                    }

                    // 调用原始方法或返回自定义值
                    var retval;
                    if (hasCustomReturn) {
                        LOG("🔄 使用自定义返回值: " + customReturnValue, { c: Color.Yellow });
                        retval = customReturnValue;
                    } else {
                        retval = originalCall.apply(this, arguments);
                    }

                    LOG("📤 返回值: " + retval, { c: Color.Blue });
                    LOG("🏁 退出 " + fullyQualifiedMethodName + "\n", { c: Color.Green });
                    return retval;
                };
            };

            // 当存在多个重载时，逐个设置 implementation；否则直接设置
            if (overloads.length > 0) {
                LOG("🔀 发现 " + overloads.length + " 个重载，逐个设置Hook...", { c: Color.Blue });
                for (var i = 0; i < overloads.length; i++) {
                    try {
                        (function(over){
                            over.implementation = createHookImpl(over);
                        })(overloads[i]);
                    } catch(_) {}
                }
            } else {
                // 无 overload 信息时的兜底
                var origMethod = methodWrapper;
                methodWrapper.implementation = createHookImpl(function() {
                    return origMethod.apply(this, arguments);
                });
            }

            LOG("✅ 方法Hook设置成功: " + fullyQualifiedMethodName, { c: Color.Green });

        } catch (error) {
            LOG("❌ 方法Hook设置失败: " + error.message, { c: Color.Red });
        }
    });
}

// 向后兼容别名：hookJavaMethodWithTracing -> traceMethod
function hookJavaMethodWithTracing(methodName, enableStackTrace, customReturnValue) {
    return traceMethod(methodName, enableStackTrace, 20, customReturnValue, false);
}

// 向后兼容别名：advancedMethodTracing -> traceMethod
function advancedMethodTracing(methodName, enableStackTrace, enableFieldInfo) {
    return traceMethod(methodName, enableStackTrace, 20, undefined, enableFieldInfo);
}

// 查找类
function findClasses(pattern, showDetails) {
    showDetails = showDetails || false;
    var foundClasses = [];
    
    LOG("🔍 搜索类: " + pattern, { c: Color.Cyan });
    
    Java.perform(function() {
        // 使用同步API以避免在部分Frida版本中需要callbacks导致的"onMatch of undefined"错误
        var loadedClasses = [];
        try {
            loadedClasses = Java.enumerateLoadedClassesSync();
        } catch (_) {
            loadedClasses = [];
        }
        loadedClasses.forEach(function(className) {
            if (className.toLowerCase().indexOf(pattern.toLowerCase()) !== -1) {
                foundClasses.push(className);
                
                if (showDetails) {
                    try {
                        var clazz = Java.use(className);
                        var methods = clazz.class.getDeclaredMethods();
                        LOG("📦 " + className + " (" + methods.length + " 方法)", { c: Color.Green });
                    } catch (e) {
                        LOG("📦 " + className, { c: Color.Yellow });
                    }
                } else {
                    LOG("📦 " + className, { c: Color.Green });
                }
            }
        });
    });
    
    LOG("✅ 找到 " + foundClasses.length + " 个匹配的类", { c: Color.Blue });
    return foundClasses;
}

// 枚举包下的所有类
function enumAllClasses(packageName) {
    var packageClasses = [];
    
    LOG("📚 枚举包: " + packageName, { c: Color.Cyan });
    
    Java.perform(function() {
        // 使用同步API避免回调对象缺失导致的异常
        var loadedClasses = [];
        try {
            loadedClasses = Java.enumerateLoadedClassesSync();
        } catch (_) {
            loadedClasses = [];
        }
        loadedClasses.forEach(function(className) {
            if (className.indexOf(packageName) === 0) {
                packageClasses.push(className);
                LOG("📦 " + className, { c: Color.Green });
            }
        });
    });
    
    LOG("✅ 包 " + packageName + " 下共有 " + packageClasses.length + " 个类", { c: Color.Blue });
    return packageClasses;
}

// ===== 接口实现类查找工具 =====

/**
 * 辅助函数：在多个 ClassLoader 中尝试加载类
 * @param {string} className - 类名
 * @returns {object|null} - { wrapper: Java.use结果, clazz: class对象, loader: 使用的ClassLoader }
 */
function __tryLoadClass(className) {
    try {
        // 先尝试默认 ClassLoader
        try {
            var wrapper = Java.use(className);
            return { wrapper: wrapper, clazz: wrapper.class, loader: null };
        } catch (e) {
            if ((e.message || '').indexOf('ClassNotFoundException') === -1) {
                return null;
            }
        }
        
        // 回退到其他 ClassLoader
        if (typeof findTragetClassLoader === 'function') {
            var loader = findTragetClassLoader(className);
            if (loader) {
                try {
                    var wrapper = Java.ClassFactory.get(loader).use(className);
                    return { wrapper: wrapper, clazz: wrapper.class, loader: loader };
                } catch (_) {}
            }
        }
        return null;
    } catch (_) {
        return null;
    }
}

/**
 * 查找实现指定接口的所有类
 * 支持多 ClassLoader 查找，与 traceMethod 行为一致
 * @param {string} interfaceName - 接口的完整类名
 * @param {string} packageFilter - 可选，只在此包下搜索，提高效率
 */
function findImplementations(interfaceName, packageFilter) {
    var implementations = [];
    
    LOG("🔍 查找接口实现类: " + interfaceName, { c: Color.Cyan });
    if (packageFilter) {
        LOG("📦 限定包范围: " + packageFilter, { c: Color.Gray });
    }
    
    Java.perform(function() {
        // 加载目标接口（支持多 ClassLoader）
        var targetInfo = __tryLoadClass(interfaceName);
        if (!targetInfo) {
            LOG("❌ 无法加载接口: " + interfaceName, { c: Color.Red });
            LOG("💡 提示: 确保目标应用已加载该接口所在的类", { c: Color.Yellow });
            return;
        }
        
        var targetInterface = targetInfo.clazz;
        if (targetInfo.loader) {
            LOG("🔗 使用自定义ClassLoader加载目标接口", { c: Color.Yellow });
        }
        
        // 检查是否是接口或类
        var isInterface = false;
        try { isInterface = targetInterface.isInterface(); } catch (_) {}
        LOG("📋 目标类型: " + (isInterface ? "接口 (interface)" : "类 (class)"), { c: Color.Blue });
        
        // 枚举所有已加载的类
        var loadedClasses = [];
        try { loadedClasses = Java.enumerateLoadedClassesSync(); } catch (_) {}
        LOG("📊 正在扫描 " + loadedClasses.length + " 个类...", { c: Color.Gray });
        
        for (var i = 0; i < loadedClasses.length; i++) {
            var className = loadedClasses[i];
            
            // 包过滤
            if (packageFilter && className.indexOf(packageFilter) !== 0) {
                continue;
            }
            
            // 跳过目标接口自身
            if (className === interfaceName) {
                continue;
            }
            
            // 尝试在多个 ClassLoader 中加载类
            var classInfo = __tryLoadClass(className);
            if (!classInfo) continue;
            
            try {
                var clazz = classInfo.clazz;
                
                // 检查是否实现/继承了目标接口/类
                if (targetInterface.isAssignableFrom(clazz)) {
                    // 获取额外信息
                    var extraInfo = "";
                    try {
                        if (clazz.isInterface()) {
                            extraInfo = " (子接口)";
                        } else if (clazz.getSuperclass() && 
                                   clazz.getSuperclass().getName() === interfaceName) {
                            extraInfo = " (直接继承)";
                        } else {
                            // 检查是否直接实现
                            var interfaces = clazz.getInterfaces();
                            for (var j = 0; j < interfaces.length; j++) {
                                if (interfaces[j].getName() === interfaceName) {
                                    extraInfo = " (直接实现)";
                                    break;
                                }
                            }
                        }
                    } catch (_) {}
                    
                    implementations.push(className);
                    LOG("✅ " + className + extraInfo, { c: Color.Green });
                }
            } catch (_) {}
        }
        
        LOG("", { c: Color.Reset });
        LOG("📊 找到 " + implementations.length + " 个实现类", { c: Color.Cyan });
    });
    
    return implementations;
}

/**
 * 查找直接实现指定接口的类（不包含间接继承）
 * @param {string} interfaceName - 接口的完整类名
 * @param {string} packageFilter - 可选，只在此包下搜索
 */
function findDirectImplementations(interfaceName, packageFilter) {
    var directImpls = [];
    
    LOG("🔍 查找直接实现类: " + interfaceName, { c: Color.Cyan });
    
    Java.perform(function() {
        var targetInfo = __tryLoadClass(interfaceName);
        if (!targetInfo) {
            LOG("❌ 无法加载接口: " + interfaceName, { c: Color.Red });
            return;
        }
        
        if (targetInfo.loader) {
            LOG("🔗 使用自定义ClassLoader加载目标接口", { c: Color.Yellow });
        }
        
        var loadedClasses = [];
        try { loadedClasses = Java.enumerateLoadedClassesSync(); } catch (_) {}
        
        for (var i = 0; i < loadedClasses.length; i++) {
            var className = loadedClasses[i];
            
            if (packageFilter && className.indexOf(packageFilter) !== 0) continue;
            if (className === interfaceName) continue;
            
            var classInfo = __tryLoadClass(className);
            if (!classInfo) continue;
            
            try {
                var clazz = classInfo.clazz;
                var interfaces = clazz.getInterfaces();
                
                for (var j = 0; j < interfaces.length; j++) {
                    if (interfaces[j].getName() === interfaceName) {
                        directImpls.push(className);
                        LOG("✅ " + className, { c: Color.Green });
                        break;
                    }
                }
            } catch (_) {}
        }
        
        LOG("📊 找到 " + directImpls.length + " 个直接实现类", { c: Color.Cyan });
    });
    
    return directImpls;
}

/**
 * 查找某个类的所有子类
 * @param {string} parentClassName - 父类的完整类名
 * @param {string} packageFilter - 可选，只在此包下搜索
 */
function findSubclasses(parentClassName, packageFilter) {
    var subclasses = [];
    
    LOG("🔍 查找子类: " + parentClassName, { c: Color.Cyan });
    
    Java.perform(function() {
        var parentInfo = __tryLoadClass(parentClassName);
        if (!parentInfo) {
            LOG("❌ 无法加载父类: " + parentClassName, { c: Color.Red });
            return;
        }
        
        var parentClass = parentInfo.clazz;
        if (parentInfo.loader) {
            LOG("🔗 使用自定义ClassLoader加载父类", { c: Color.Yellow });
        }
        
        var loadedClasses = [];
        try { loadedClasses = Java.enumerateLoadedClassesSync(); } catch (_) {}
        
        for (var i = 0; i < loadedClasses.length; i++) {
            var className = loadedClasses[i];
            
            if (packageFilter && className.indexOf(packageFilter) !== 0) continue;
            if (className === parentClassName) continue;
            
            var classInfo = __tryLoadClass(className);
            if (!classInfo) continue;
            
            try {
                var clazz = classInfo.clazz;
                
                // 检查是否是子类（排除接口）
                if (!clazz.isInterface() && parentClass.isAssignableFrom(clazz)) {
                    // 判断是直接子类还是间接子类
                    var isDirect = false;
                    try {
                        var superClass = clazz.getSuperclass();
                        if (superClass && superClass.getName() === parentClassName) {
                            isDirect = true;
                        }
                    } catch (_) {}
                    
                    subclasses.push(className);
                    LOG("✅ " + className + (isDirect ? " (直接子类)" : ""), { c: Color.Green });
                }
            } catch (_) {}
        }
        
        LOG("📊 找到 " + subclasses.length + " 个子类", { c: Color.Cyan });
    });
    
    return subclasses;
}

/**
 * 分析类的继承层次结构
 * 显示类的完整继承链和实现的所有接口
 * @param {string} className - 要分析的类名
 */
function analyzeClassHierarchy(className) {
    LOG("📊 分析类层次结构: " + className, { c: Color.Cyan });
    
    Java.perform(function() {
        var classInfo = __tryLoadClass(className);
        if (!classInfo) {
            LOG("❌ 无法加载类: " + className, { c: Color.Red });
            return;
        }
        
        var clazz = classInfo.clazz;
        if (classInfo.loader) {
            LOG("🔗 使用自定义ClassLoader加载", { c: Color.Yellow });
        }
        
        // 显示继承链
        LOG("", { c: Color.Reset });
        LOG("🔗 继承链:", { c: Color.Blue });
        var current = clazz;
        var level = 0;
        while (current) {
            var prefix = "";
            for (var i = 0; i < level; i++) prefix += "  ";
            
            var typeName = current.getName();
            var typeKind = current.isInterface() ? "(接口)" : "(类)";
            
            if (level === 0) {
                LOG(prefix + "📦 " + typeName + " " + typeKind, { c: Color.Cyan });
            } else {
                LOG(prefix + "└─ " + typeName + " " + typeKind, { c: Color.White });
            }
            
            try { current = current.getSuperclass(); } catch (_) { current = null; }
            level++;
        }
        
        // 显示实现的接口
        LOG("", { c: Color.Reset });
        LOG("🔌 实现的接口:", { c: Color.Blue });
        
        var allInterfaces = [];
        try {
            var interfaceSet = {};
            var currentClass = clazz;
            while (currentClass) {
                var interfaces = currentClass.getInterfaces();
                for (var j = 0; j < interfaces.length; j++) {
                    var ifaceName = interfaces[j].getName();
                    if (!interfaceSet[ifaceName]) {
                        interfaceSet[ifaceName] = true;
                        allInterfaces.push({
                            name: ifaceName,
                            declaredIn: currentClass.getName()
                        });
                    }
                }
                currentClass = currentClass.getSuperclass();
            }
        } catch (_) {}
        
        if (allInterfaces.length === 0) {
            LOG("  (无)", { c: Color.Gray });
        } else {
            for (var k = 0; k < allInterfaces.length; k++) {
                var iface = allInterfaces[k];
                var note = (iface.declaredIn === className) ? "" : " (来自 " + iface.declaredIn + ")";
                LOG("  🔹 " + iface.name + note, { c: Color.Green });
            }
        }
        
        LOG("", { c: Color.Reset });
        LOG("📊 统计: 继承深度 " + level + " 层, 实现 " + allInterfaces.length + " 个接口", { c: Color.Cyan });
    });
}

// 向后兼容别名：hookAllMethodsInJavaClass -> traceClass（不带调用栈）
function hookAllMethodsInJavaClass(className) {
    return traceClass(className, false, 20);
}

// HashMap特定值查找Hook
function hookHashMapToFindValue(searchKey, enableStackTrace) {
    enableStackTrace = enableStackTrace || false;
    
    Java.perform(function() {
        try {
            var HashMap = Java.use("java.util.HashMap");
            
            HashMap.put.implementation = function(key, value) {
                var keyStr = key ? key.toString() : "null";
                var valueStr = value ? value.toString() : "null";
                
                if (keyStr.indexOf(searchKey) !== -1) {
                    LOG("🔍 HashMap匹配: " + keyStr + " = " + valueStr, { c: Color.Cyan });
                    
                    if (enableStackTrace) {
                        printStack();
                    }
                }
                
                return this.put(key, value);
            };
            
            LOG("✅ HashMap查找Hook已启用 (搜索: " + searchKey + ")", { c: Color.Green });
            
        } catch (error) {
            LOG("❌ HashMap Hook失败: " + error.message, { c: Color.Red });
        }
    });
}

// ===== 网络抓取与请求转换（fetch） =====
// 关键Hook点说明：
// - OkHttp: 优先Hook okhttp3.RealCall.execute() 与 enqueue(Callback)，在请求发送前提取 Request 信息
// - HttpURLConnection: 辅助Hook connect()/getInputStream()/getOutputStream() 以覆盖常见标准库网络请求
// - 输出：生成等价的 Python requests 代码，发送结构化事件给 Python 端写入日志，同时控制台打印与调用栈
// - 过滤：fetch(filterStr) 传入字符串，仅当 URL 或 Headers 含该字符串时才处理与输出
var __fetch_installed = false;
var __fetch_filter = null;

function __getStackArray(maxLines) {
    try {
        var exception = Java.use("java.lang.Exception").$new();
        var trace = exception.getStackTrace();
        var limit = typeof maxLines === 'number' && maxLines > 0 ? maxLines : 20;
        var frames = [];
        var printed = 0;
        for (var i = 0; i < trace.length && printed < limit; i++) {
            var element = trace[i].toString();
            if (element.indexOf("java.lang.Exception") === -1 &&
                element.indexOf("android.util.Log") === -1 &&
                element.indexOf("dalvik.system") === -1) {
                frames.push(element + "");
                printed++;
            }
        }
        return frames;
    } catch (_) {
        return [];
    }
}

function __useClass(className) {
    try {
        return Java.use(className);
    } catch (e) {
        if ((e.message || '').indexOf('ClassNotFoundException') !== -1) {
            try {
                var loader = findTragetClassLoader(className);
                if (loader) {
                    return Java.ClassFactory.get(loader).use(className);
                }
            } catch (_) {}
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
    } catch(_){}
    return null;
}

function __bytesToString(byteArray, charsetName) {
    try {
        var StringClz = Java.use('java.lang.String');
        if (charsetName && charsetName.length > 0) {
            var Charset = Java.use('java.nio.charset.Charset');
            var cs = Charset.forName(charsetName);
            return StringClz.$new(byteArray, cs).toString();
        }
        return StringClz.$new(byteArray).toString();
    } catch (e) {
        return '';
    }
}

function __genRequestsCode(method, url, headersObj, cookieStr, bodyStr, contentTypeStr) {
    try {
        var pythonHeaders = headersObj || {};
        var cookiesPy = null;
        if (cookieStr && String(cookieStr).length > 0) {
            try {
                var parts = String(cookieStr).split(';');
                var cobj = {};
                for (var i = 0; i < parts.length; i++) {
                    var kv = parts[i].trim();
                    if (!kv) continue;
                    var idx = kv.indexOf('=');
                    if (idx > 0) {
                        var k = kv.substring(0, idx).trim();
                        var v = kv.substring(idx + 1).trim();
                        if (k) cobj[k] = v;
                    }
                }
                cookiesPy = cobj;
            } catch (_) {}
        }
        var low = (method || 'GET').toLowerCase();
        var fn = (['get','post','put','delete','patch','head','options'].indexOf(low) !== -1) ? low : 'request';
        var args = [];
        if (fn === 'request') {
            args.push("'" + method + "'");
            args.push("'" + url + "'");
        } else {
            args.push("'" + url + "'");
        }
        // headers
        args.push("headers=" + JSON.stringify(pythonHeaders));
        if (cookiesPy) args.push("cookies=" + JSON.stringify(cookiesPy));
        // body
        if (bodyStr && (low === 'post' || low === 'put' || low === 'patch' || low === 'delete')) {
            var ct = (contentTypeStr || pythonHeaders['Content-Type'] || pythonHeaders['content-type'] || '').toLowerCase();
            if (ct.indexOf('application/json') !== -1) {
                // 尝试作为 JSON
                var trimmed = String(bodyStr).trim();
                if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                    args.push("json=" + trimmed);
                } else {
                    args.push("data=" + JSON.stringify(bodyStr));
                }
            } else {
                args.push("data=" + JSON.stringify(bodyStr));
            }
        }
        if (fn === 'request') {
            return "requests.request(" + args.join(', ') + ")";
        }
        return "requests." + fn + "(" + args.join(', ') + ")";
    } catch (e) {
        return "requests.get('" + url + "')";
    }
}

function __handleOkHttpCall(self) {
    try {
        var req = null;
        try { if (typeof self.request === 'function') req = self.request(); } catch(_){}
        if (!req) { try { if (typeof self.originalRequest === 'function') req = self.originalRequest(); } catch(_){ } }
        if (!req) return;

        var method = 'GET';
        try { method = String(req.method()); } catch(_){}
        var url = '';
        try { url = String(req.url().toString()); } catch(_){ }

        var headersObj = {};
        try {
            var headers = req.headers();
            var names = headers.names();
            var it = names.iterator();
            while (it.hasNext()) {
                var name = String(it.next());
                var value = String(headers.get(name));
                headersObj[name] = value;
            }
        } catch(_){ }

        var cookieStr = '';
        try { cookieStr = headersObj['Cookie'] || headersObj['cookie'] || ''; } catch(_){ }

        if (__fetch_filter) {
            var hay = url + ' ' + JSON.stringify(headersObj);
            if (hay.indexOf(__fetch_filter) === -1) return;
        }

        // 读取RequestBody
        var bodyStr = '';
        var contentTypeStr = '';
        try {
            var body = req.body();
            if (body) {
                try { var mt = body.contentType(); contentTypeStr = mt ? String(mt.toString()) : ''; } catch(_){ }
                try {
                    var BufferClz = Java.use('okio.Buffer');
                    var buff = BufferClz.$new();
                    body.writeTo(buff);
                    try {
                        // 先按 charset 转字节再转字符串
                        var bytes = buff.readByteArray();
                        var cs = __parseCharsetFromHeaders(headersObj, contentTypeStr) || 'utf-8';
                        bodyStr = __bytesToString(bytes, cs);
                    } catch(_) {
                        try { bodyStr = String(buff.readUtf8()); } catch(__) { bodyStr = ''; }
                    }
                } catch(_){ }
            }
        } catch(_){ }

        var py = __genRequestsCode(method, url, headersObj, cookieStr, bodyStr, contentTypeStr);
        var stackArr = __getStackArray(20);

        LOG('🌐 捕获请求(OkHttp): ' + method + ' ' + url, { c: Color.Cyan });
        LOG('🐍 ' + py, { c: Color.White });
        printStack();

        send({
            type: 'fetch_request',
            ts: Date.now(),
            items: {
                library: 'okhttp',
                method: method,
                url: url,
                headers: headersObj,
                cookies: cookieStr || null,
                python: py,
                body: bodyStr || null,
                contentType: contentTypeStr || null,
                stack: stackArr
            }
        });
    } catch (e) {
        LOG('⚠️ OkHttp 捕获失败: ' + e.message, { c: Color.Yellow });
    }
}

function __installOkHttpHooks() {
    var installedAny = false;
    var candidates = ['okhttp3.RealCall', 'okhttp3.internal.connection.RealCall'];
    for (var i = 0; i < candidates.length; i++) {
        try {
            var C = __useClass(candidates[i]);
            if (C.execute) {
                var execOver = C.execute.overload();
                execOver.implementation = function() {
                    try { __handleOkHttpCall(this); } catch(_){}
                    return execOver.call(this);
                };
                installedAny = true;
            }
            if (C.enqueue) {
                try {
                    var enqOver = C.enqueue.overload('okhttp3.Callback');
                    enqOver.implementation = function(cb) {
                        try { __handleOkHttpCall(this); } catch(_){}
                        return enqOver.call(this, cb);
                    };
                    installedAny = true;
                } catch(_){ }
            }
        } catch (_) { }
    }
    if (installedAny) {
        LOG('✅ OkHttp Hook 已启用', { c: Color.Green });
    } else {
        LOG('⚠️ 未找到 OkHttp RealCall 类', { c: Color.Yellow });
    }
}

function __installOkHttp2Hooks() {
    var installedAny = false;
    var candidates = ['com.squareup.okhttp.RealCall'];
    for (var i = 0; i < candidates.length; i++) {
        try {
            var C = __useClass(candidates[i]);
            if (C.execute) {
                var execOver = C.execute.overload();
                execOver.implementation = function() {
                    try { __handleOkHttpCall(this); } catch(_){}
                    return execOver.call(this);
                };
                installedAny = true;
            }
            if (C.enqueue) {
                try {
                    var enqOver = C.enqueue.overload('com.squareup.okhttp.Callback');
                    enqOver.implementation = function(cb) {
                        try { __handleOkHttpCall(this); } catch(_){}
                        return enqOver.call(this, cb);
                    };
                    installedAny = true;
                } catch(_){ }
            }
        } catch (_){ }
    }
    if (installedAny) {
        LOG('✅ OkHttp2 Hook 已启用', { c: Color.Green });
    } else {
        LOG('ℹ️ 未检测到 OkHttp2', { c: Color.Gray });
    }
}

function __handleHttpUrlConnection(conn) {
    try {
        var method = '';
        try { method = String(conn.getRequestMethod()); } catch(_){ }
        var url = '';
        try { url = String(conn.getURL().toString()); } catch(_){ }

        var headersObj = {};
        try {
            var map = conn.getRequestProperties();
            var es = map.entrySet();
            var it = es.iterator();
            while (it.hasNext()) {
                var entry = it.next();
                var kObj = entry.getKey();
                var key = kObj ? String(kObj) : '';
                if (!key) continue;
                var list = entry.getValue();
                var vals = [];
                if (list) {
                    var size = list.size();
                    for (var i = 0; i < size; i++) { vals.push(String(list.get(i))); }
                }
                headersObj[key] = vals.join(', ');
            }
        } catch(_){ }

        var cookieStr = '';
        try { cookieStr = headersObj['Cookie'] || headersObj['cookie'] || ''; } catch(_){ }

        if (__fetch_filter) {
            var hay = url + ' ' + JSON.stringify(headersObj);
            if (hay.indexOf(__fetch_filter) === -1) return;
        }

        var py = __genRequestsCode(method || 'GET', url, headersObj, cookieStr);
        var stackArr = __getStackArray(20);

        LOG('🌐 捕获请求(HttpURLConnection): ' + (method || 'GET') + ' ' + url, { c: Color.Cyan });
        LOG('🐍 ' + py, { c: Color.White });
        printStack();

        send({
            type: 'fetch_request',
            ts: Date.now(),
            items: {
                library: 'httpurlconnection',
                method: method || 'GET',
                url: url,
                headers: headersObj,
                cookies: cookieStr || null,
                python: py,
                stack: stackArr
            }
        });
    } catch (e) {
        LOG('⚠️ HttpURLConnection 捕获失败: ' + e.message, { c: Color.Yellow });
    }
}

function __installHttpURLConnectionHooks() {
    try {
        var HUC = __useClass('java.net.HttpURLConnection');
        // getInputStream
        try {
            var gis = HUC.getInputStream.overload();
            gis.implementation = function() {
                try { __handleHttpUrlConnection(this); } catch(_){}
                return gis.call(this);
            };
        } catch(_){ }
        // getOutputStream
        try {
            var gos = HUC.getOutputStream.overload();
            gos.implementation = function() {
                try { __handleHttpUrlConnection(this); } catch(_){}
                return gos.call(this);
            };
        } catch(_){ }
        // connect()
        try {
            var connOver = HUC.connect.overload();
            connOver.implementation = function() {
                try { __handleHttpUrlConnection(this); } catch(_){}
                return connOver.call(this);
            };
        } catch(_){ }
        LOG('✅ HttpURLConnection Hook 已启用', { c: Color.Green });
    } catch (e) {
        LOG('⚠️ 未找到 HttpURLConnection 类: ' + e.message, { c: Color.Yellow });
    }
}

function __installWebViewHooks() {
    try {
        var WV = __useClass('android.webkit.WebView');
        // loadUrl(String)
        try {
            var l1 = WV.loadUrl.overload('java.lang.String');
            l1.implementation = function(u) {
                var url = String(u);
                if (!__fetch_filter || (url + '').indexOf(__fetch_filter) !== -1) {
                    var py = __genRequestsCode('GET', url, {}, null, null, null);
                    var stackArr = __getStackArray(15);
                    LOG('🌐 WebView.loadUrl: ' + url, { c: Color.Cyan });
                    LOG('🐍 ' + py, { c: Color.White });
                    printStack();
                    send({ type: 'fetch_request', ts: Date.now(), items: { library: 'webview', method: 'GET', url: url, headers: {}, cookies: null, python: py, stack: stackArr } });
                }
                return l1.call(this, u);
            };
        } catch(_){ }
        // loadUrl(String, Map)
        try {
            var l2 = WV.loadUrl.overload('java.lang.String', 'java.util.Map');
            l2.implementation = function(u, m) {
                var url = String(u);
                var headersObj = {};
                try {
                    var it = m.entrySet().iterator();
                    while (it.hasNext()) {
                        var e = it.next();
                        headersObj[String(e.getKey())] = String(e.getValue());
                    }
                } catch(_){ }
                if (!__fetch_filter || (url + ' ' + JSON.stringify(headersObj)).indexOf(__fetch_filter) !== -1) {
                    var py = __genRequestsCode('GET', url, headersObj, null, null, null);
                    var stackArr = __getStackArray(15);
                    LOG('🌐 WebView.loadUrl(headers): ' + url, { c: Color.Cyan });
                    LOG('🐍 ' + py, { c: Color.White });
                    printStack();
                    send({ type: 'fetch_request', ts: Date.now(), items: { library: 'webview', method: 'GET', url: url, headers: headersObj, cookies: null, python: py, stack: stackArr } });
                }
                return l2.call(this, u, m);
            };
        } catch(_){ }
        // loadDataWithBaseURL
        try {
            var l3 = WV.loadDataWithBaseURL.overload('java.lang.String','java.lang.String','java.lang.String','java.lang.String','java.lang.String');
            l3.implementation = function(baseUrl, data, mime, enc, hist) {
                var url = String(baseUrl || '');
                if (url && (!__fetch_filter || url.indexOf(__fetch_filter) !== -1)) {
                    var headersObj = { 'Content-Type': String(mime || '') + (enc ? ('; charset=' + enc) : '') };
                    var py = __genRequestsCode('GET', url, headersObj, null, null, null);
                    var stackArr = __getStackArray(10);
                    LOG('🌐 WebView.loadDataWithBaseURL: ' + url, { c: Color.Cyan });
                    LOG('🐍 ' + py, { c: Color.White });
                    printStack();
                    send({ type: 'fetch_request', ts: Date.now(), items: { library: 'webview', method: 'GET', url: url, headers: headersObj, cookies: null, python: py, stack: stackArr } });
                }
                return l3.call(this, baseUrl, data, mime, enc, hist);
            };
        } catch(_){ }
        LOG('✅ WebView Hook 已启用', { c: Color.Green });
    } catch (e) {
        LOG('ℹ️ 未检测到 WebView: ' + e.message, { c: Color.Gray });
    }
}

function __installVolleyHooks() {
    try {
        var RQ = __useClass('com.android.volley.RequestQueue');
        var addOver = RQ.add.overload('com.android.volley.Request');
        addOver.implementation = function(req) {
            try {
                var methodInt = 0;
                try { methodInt = req.getMethod(); } catch(_){ }
                var methods = ['GET','POST','PUT','DELETE','HEAD','OPTIONS','TRACE','PATCH'];
                var method = methods[methodInt] || 'GET';
                var url = '';
                try { url = String(req.getUrl()); } catch(_){ }
                var headersObj = {};
                try {
                    var map = req.getHeaders();
                    var it = map.entrySet().iterator();
                    while (it.hasNext()) {
                        var e = it.next();
                        headersObj[String(e.getKey())] = String(e.getValue());
                    }
                } catch(_){ }
                var bodyStr = '';
                var ct = '';
                try { ct = String(req.getBodyContentType()); if (ct) { headersObj['Content-Type'] = headersObj['Content-Type'] || ct; } } catch(_){ }
                try {
                    var b = req.getBody();
                    if (b) {
                        var cs = __parseCharsetFromHeaders(headersObj, ct) || 'utf-8';
                        bodyStr = __bytesToString(b, cs);
                    }
                } catch(_){ }

                if (!__fetch_filter || (url + ' ' + JSON.stringify(headersObj)).indexOf(__fetch_filter) !== -1) {
                    var py = __genRequestsCode(method, url, headersObj, headersObj['Cookie'] || headersObj['cookie'] || null, bodyStr, ct);
                    var stackArr = __getStackArray(20);
                    LOG('🌐 捕获请求(Volley): ' + method + ' ' + url, { c: Color.Cyan });
                    LOG('🐍 ' + py, { c: Color.White });
                    printStack();
                    send({ type: 'fetch_request', ts: Date.now(), items: { library: 'volley', method: method, url: url, headers: headersObj, cookies: headersObj['Cookie'] || null, python: py, body: bodyStr || null, contentType: ct || null, stack: stackArr } });
                }
            } catch(_){ }
            return addOver.call(this, req);
        };
        LOG('✅ Volley Hook 已启用', { c: Color.Green });
    } catch (e) {
        LOG('ℹ️ 未检测到 Volley: ' + e.message, { c: Color.Gray });
    }
}

function __installApacheHttpClientHooks() {
    var installed = false;
    function hookClient(className) {
        try {
            var Cls = __useClass(className);
            try {
                var exec1 = Cls.execute.overload('org.apache.http.client.methods.HttpUriRequest');
                exec1.implementation = function(request) {
                    try {
                        var method = '';
                        try { method = String(request.getMethod()); } catch(_){ }
                        var url = '';
                        try { url = String(request.getURI().toString()); } catch(_){ }
                        var headersObj = {};
                        try {
                            var hdrs = request.getAllHeaders();
                            if (hdrs) {
                                for (var i = 0; i < hdrs.length; i++) {
                                    try { headersObj[String(hdrs[i].getName())] = String(hdrs[i].getValue()); } catch(__){}
                                }
                            }
                        } catch(_){ }
                        if (!__fetch_filter || (url + ' ' + JSON.stringify(headersObj)).indexOf(__fetch_filter) !== -1) {
                            var py = __genRequestsCode(method || 'GET', url, headersObj, headersObj['Cookie'] || headersObj['cookie'] || null, null, headersObj['Content-Type'] || null);
                            var stackArr = __getStackArray(20);
                            LOG('🌐 捕获请求(ApacheHttpClient): ' + (method || 'GET') + ' ' + url, { c: Color.Cyan });
                            LOG('🐍 ' + py, { c: Color.White });
                            printStack();
                            send({ type: 'fetch_request', ts: Date.now(), items: { library: 'apache_httpclient', method: method || 'GET', url: url, headers: headersObj, cookies: headersObj['Cookie'] || null, python: py, stack: stackArr } });
                        }
                    } catch(_){ }
                    return exec1.call(this, request);
                };
                installed = true;
            } catch(_){ }
        } catch(_){ }
    }
    hookClient('org.apache.http.impl.client.InternalHttpClient');
    if (!installed) hookClient('org.apache.http.impl.client.CloseableHttpClient');
    if (installed) {
        LOG('✅ Apache HttpClient Hook 已启用', { c: Color.Green });
    } else {
        LOG('ℹ️ 未检测到 Apache HttpClient', { c: Color.Gray });
    }
}

function fetch(filterStr) {
    try {
        __fetch_filter = (filterStr && String(filterStr)) ? String(filterStr) : null;
        // 通知Python端初始化日志文件
        try { send({ type: 'fetch_start', ts: Date.now(), items: { filter: __fetch_filter } }); } catch(_){ }
        Java.perform(function() {
            if (!__fetch_installed) {
                __installOkHttpHooks();
                __installOkHttp2Hooks();
                __installHttpURLConnectionHooks();
                __installWebViewHooks();
                __installVolleyHooks();
                __installApacheHttpClientHooks();
                __fetch_installed = true;
            } else {
                LOG('ℹ️ fetch 已启用，更新过滤条件: ' + (__fetch_filter || '(无)'), { c: Color.Cyan });
            }
        });
        LOG('✅ fetch 已启动' + (__fetch_filter ? ' (过滤: ' + __fetch_filter + ')' : ''), { c: Color.Green });
        return true;
    } catch (e) {
        LOG('❌ fetch 启动失败: ' + e.message, { c: Color.Red });
        return false;
    }
}

// ===== OkHttp Logger 功能（媲美 OkHttpLogger-Frida） =====
var __okhttp_state = { installed: false, loader: null, history: [], counter: 0 };

function __okhttp_use(className) {
    try {
        if (__okhttp_state.loader) {
            return Java.ClassFactory.get(__okhttp_state.loader).use(className);
        }
        return Java.use(className);
    } catch (e) {
        if ((e.message || '').indexOf('ClassNotFoundException') !== -1) {
            try {
                var l = findTragetClassLoader(className);
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
        var method = 'GET'; try { method = String(req.method()); } catch(_){}
        var url = ''; try { url = String(req.url().toString()); } catch(_){ }
        var headersObj = {}; try { headersObj = __okhttp_headers_to_obj(req.headers()); } catch(_){}
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
                            var cs = __parseCharsetFromHeaders(headersObj, contentTypeStr) || 'utf-8';
                            bodyStr = __bytesToString(bytes, cs);
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
            LOG('|--> END ' + (contentTypeStr.toLowerCase().indexOf('text') === -1 && contentTypeStr.toLowerCase().indexOf('json') === -1 ? ' (binary body omitted -> isPlaintext)' : ''));
        } else {
            LOG('|');
            LOG('|--> END');
        }

        // 保存到历史
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

        // 事件
        try {
            send({ type: 'fetch_request', ts: Date.now(), items: { library: 'okhttp', method: method, url: url, headers: headersObj, cookies: cookieStr || null, python: __genRequestsCode(method, url, headersObj, cookieStr, bodyStr, contentTypeStr), body: bodyStr || null, contentType: contentTypeStr || null, index: idx } });
        } catch(_){}

        return idx;
    } catch (e) {
        LOG('⚠️ OkHttp 请求日志失败: ' + e.message, { c: Color.Yellow });
        return -1;
    }
}

function __okhttp_log_response(resp) {
    try {
        var code = 0; try { code = resp.code(); } catch(_){}
        var message = ''; try { message = String(resp.message()); } catch(_){}
        var url = ''; try { url = String(resp.request().url().toString()); } catch(_){}
        var headersObj = {}; try { headersObj = __okhttp_headers_to_obj(resp.headers()); } catch(_){}
        var bodyStr = null;
        try {
            if (typeof resp.peekBody === 'function') {
                var pb = resp.peekBody(1024 * 1024);
                try { bodyStr = String(pb.string()); } catch(eStr) {
                    try { var bytes = pb.bytes(); bodyStr = __bytesToString(bytes, __parseCharsetFromHeaders(headersObj, headersObj['Content-Type'] || '')); } catch(_) { bodyStr = null; }
                }
            }
        } catch(_){}

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
        LOG('⚠️ OkHttp 响应日志失败: ' + e.message, { c: Color.Yellow });
    }
}

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
        // OkHttp3 RealCall
        var RC = __okhttp_use('okhttp3.RealCall') || __okhttp_use('okhttp3.internal.connection.RealCall');
        if (RC) {
            try {
                var exec = RC.execute.overload();
                exec.implementation = function() {
                    var idx = -1;
                    try { var req = this.request ? this.request() : (this.originalRequest ? this.originalRequest() : null); if (req) idx = __okhttp_log_request(this, req); } catch(_){ }
                    var resp = exec.call(this);
                    try { __okhttp_log_response(resp); } catch(_){ }
                    // 记录响应到对应历史项
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
        // OkHttp2
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

// ===== 帮助函数 =====
function help() {
    LOG("\n📚 fridacli Hook工具帮助", { c: Color.Cyan });
    LOG("=" + "=".repeat(55), { c: Color.Gray });
    
    // 核心追踪功能
    LOG("\n🎯 核心追踪功能", { c: Color.Yellow });
    var traceCommands = [
        ["traceClass(className, showStack, stackLines)", "跟踪类的所有方法 (showStack: 1=显示调用栈)"],
        ["traceMethod(method, showStack, lines, retVal, fieldInfo)", "跟踪方法 (完整版本，支持所有功能)"],
        ["  示例: traceMethod('com.a.B.m', 1)", "显示调用栈"],
        ["  示例: traceMethod('com.a.B.m', 1, 30)", "显示30行调用栈"],
        ["  示例: traceMethod('com.a.B.m', 0, 0, true)", "修改返回值为true"],
        ["  示例: traceMethod('com.a.B.m', 1, 20, null, 1)", "显示调用栈+字段信息"]
    ];
    traceCommands.forEach(function(cmd) {
        LOG("  🔧 " + cmd[0], { c: Color.Green });
        LOG("     " + cmd[1], { c: Color.White });
    });
    
    // 类和对象搜索
    LOG("\n🔍 类和对象搜索", { c: Color.Yellow });
    var searchCommands = [
        ["findClasses(pattern, details)", "搜索匹配的类名（支持正则）"],
        ["enumAllClasses(package)", "枚举指定包下所有类"],
        ["classsearch(keyword)", "关键字搜索已加载的类"],
        ["objectsearch(className)", "搜索类的实例对象"]
    ];
    searchCommands.forEach(function(cmd) {
        LOG("  🔧 " + cmd[0], { c: Color.Green });
        LOG("     " + cmd[1], { c: Color.White });
    });
    
    // 对象分析工具
    LOG("\n📊 对象分析工具", { c: Color.Yellow });
    var analyzeCommands = [
        ["classdump(className)", "导出类的方法和字段信息"],
        ["objectdump(handle)", "导出对象实例的字段值（仅当前类）"],
        ["printJavaCallStack()", "打印当前Java调用栈"]
    ];
    analyzeCommands.forEach(function(cmd) {
        LOG("  🔧 " + cmd[0], { c: Color.Green });
        LOG("     " + cmd[1], { c: Color.White });
    });
    
    // Wallbreaker 风格对象查看器
    LOG("\n🔬 Wallbreaker 风格对象查看器", { c: Color.Yellow });
    var wallbreakerCommands = [
        ["objectview(handle, options)", "深度查看对象（含继承字段、静态字段）"],
        ["objectfields(handle)", "获取对象完整字段列表（含继承链）"],
        ["objectrefresh(handle)", "刷新对象查看最新值"],
        ["objectexpand(handle, fieldName)", "展开对象的某个字段（注册为新对象）"],
        ["objectlist(handle, limit)", "展开 List/Set 集合内容"],
        ["objectmap(handle, limit)", "展开 Map 集合内容"]
    ];
    wallbreakerCommands.forEach(function(cmd) {
        LOG("  🔧 " + cmd[0], { c: Color.Green });
        LOG("     " + cmd[1], { c: Color.White });
    });
    
    // 网络抓取
    LOG("\n🌐 网络抓取", { c: Color.Yellow });
    var networkCommands = [
        ["fetch([filter])", "抓取网络请求，生成Python代码并保存日志"],
        ["okhttpStart([filter])", "一键启动OkHttp日志（推荐）"],
        ["okhttpFind()", "检测是否使用OkHttp 2/3"],
        ["okhttpHold()", "开启OkHttp拦截"],
        ["okhttpHistory()", "查看可重放的请求列表"],
        ["okhttpResend(index)", "按编号重放请求"],
        ["okhttpClear()", "清空历史记录"]
    ];
    networkCommands.forEach(function(cmd) {
        LOG("  🔧 " + cmd[0], { c: Color.Green });
        LOG("     " + cmd[1], { c: Color.White });
    });
    
    // 任务管理命令（在session中使用）
    LOG("\n📋 任务管理命令（交互式Shell）", { c: Color.Yellow });
    var taskCommands = [
        ["tasks", "列出所有运行中的任务"],
        ["kill <id>", "终止指定任务"],
        ["killall", "终止所有任务"],
        ["taskinfo <id>", "查看任务详情"],
        ["hookmethod <method>", "创建方法Hook任务"],
        ["hookclass <class>", "创建类Hook任务"],
        ["hookbase64", "创建Base64 Hook任务"],
        ["hooktoast", "创建Toast Hook任务"],
        ["hookurl", "创建URL Hook任务"],
        ["hookhashmap", "创建HashMap Hook任务"],
        ["hookjson", "创建JSON Hook任务"],
        ["hookfile", "创建文件操作Hook任务"],
        ["hookedittext", "创建EditText Hook任务"]
    ];
    taskCommands.forEach(function(cmd) {
        LOG("  📌 " + cmd[0], { c: Color.Cyan });
        LOG("     " + cmd[1], { c: Color.White });
    });
    
    // Native Hook（如果可用）
    LOG("\n⚙️  Native Hook（需加载frida_native_common.js）", { c: Color.Yellow });
    var nativeCommands = [
        ["nativeEnableAllHooks()", "启用所有Native Hook"],
        ["nativeHookDlopen()", "Hook dlopen/dlsym"],
        ["nativeHookCrypto()", "Hook OpenSSL加密函数"],
        ["nativeHookNetwork()", "Hook网络相关函数"],
        ["nativeHookFile()", "Hook文件操作函数"]
    ];
    nativeCommands.forEach(function(cmd) {
        LOG("  🔧 " + cmd[0], { c: Color.Gray });
        LOG("     " + cmd[1], { c: Color.Gray });
    });
    
    LOG("\n💡 提示:", { c: Color.Yellow });
    LOG("  • 使用 tasks 命令查看所有运行中的Hook任务", { c: Color.White });
    LOG("  • 使用 killall 可以一键清理所有任务", { c: Color.White });
    LOG("  • 自定义脚本放入 scripts/ 目录自动加载", { c: Color.White });
    LOG("=" + "=".repeat(55), { c: Color.Gray });
}

/**
 * 描述Java类的详细信息
 * @param {string} fullyQualifiedClassName - 完整的类名
 * @returns {object|null} 类的详细信息对象
 */
function describeJavaClassDetails(fullyQualifiedClassName) {
    try {
        var javaClassWrapper = Java.use(fullyQualifiedClassName);
        
        var declaredMethods = javaClassWrapper.class.getDeclaredMethods();
        var publicFields = javaClassWrapper.class.getFields();
        
        var classDescription = {
            className: fullyQualifiedClassName,
            methodCount: declaredMethods.length,
            fieldCount: publicFields.length,
            methods: declaredMethods.map(function(methodObject) {
                return methodObject.toString();
            }),
            fields: publicFields.map(function(fieldObject) {
                return fieldObject.toString();
            })
        };
        
        LOG("📋 类详细信息:", { c: Color.Cyan });
        LOG(JSON.stringify(classDescription, null, 2), { c: Color.White });
        
        return classDescription;
    } catch (classDescribeError) {
        LOG("❌ 无法描述类 '" + fullyQualifiedClassName + "': " + classDescribeError.message, { c: Color.Red });
        return null;
    }
}

/**
 * 智能Hook分发器，自动判断目标类型并选择合适的Hook方法
 * @param {string} targetIdentifier - 目标标识符（类名或方法名）
 * @param {object} hookOptions - Hook选项
 * @returns {*} Hook结果
 */
function intelligentHookDispatcher(targetIdentifier, hookOptions) {
    hookOptions = hookOptions || {};
    
    LOG("🤖 智能分析目标: " + targetIdentifier, { c: Color.Cyan });
    
    // 检测是否为 Java 类或方法
    if (targetIdentifier.includes('.') && targetIdentifier.match(/^[a-z]+\./)) {
        // 1. 检查是否包含方法签名（带括号）
        if (targetIdentifier.includes('(')) {
            LOG("🎯 检测到 Java 方法（包含方法签名），使用方法Hook", { c: Color.Green });
            return hookJavaMethodWithTracing(
                targetIdentifier, 
                hookOptions.enableStackTrace, 
                hookOptions.customReturnValue
            );
        }
        
        // 2. 检查是否明确指定为方法
        if (hookOptions.isMethodExplicit) {
            LOG("🎯 检测到 Java 方法（用户明确指定），使用方法Hook", { c: Color.Green });
            return hookJavaMethodWithTracing(
                targetIdentifier, 
                hookOptions.enableStackTrace, 
                hookOptions.customReturnValue
            );
        }
        
        // 3. 智能判断：基于常见的Android生命周期方法名
        var commonAndroidLifecycleMethods = [
            'onCreate', 'onResume', 'onPause', 'onDestroy', 
            'onStart', 'onStop', 'onRestart', 'onAttach', 
            'onDetach', 'onConfigurationChanged'
        ];
        
        var identifierParts = targetIdentifier.split('.');
        if (identifierParts.length >= 3) {
            var lastIdentifierPart = identifierParts[identifierParts.length - 1];
            
            // 只有当最后一部分明确是已知的方法名时，才当作方法处理
            if (commonAndroidLifecycleMethods.includes(lastIdentifierPart)) {
                LOG("🎯 检测到 Java 方法（智能识别生命周期方法），使用方法Hook", { c: Color.Green });
                return hookJavaMethodWithTracing(
                    targetIdentifier, 
                    hookOptions.enableStackTrace, 
                    hookOptions.customReturnValue
                );
            }
        }
        
        // 4. 默认当作类处理，Hook所有方法
        LOG("📚 检测到 Java 类，Hook所有方法", { c: Color.Blue });
        return hookAllMethodsInJavaClass(targetIdentifier);
    }
    
    // 检测是否为 Native 函数
    if (typeof nativeHookNativeFunction !== 'undefined') {
        LOG("🔧 检测到可能的 Native 函数，尝试 Native Hook", { c: Color.Purple });
        return nativeHookNativeFunction(targetIdentifier, hookOptions);
    } else {
        LOG("⚠️ Native Hook 工具未加载，请先运行 loadNativeSupport()", { c: Color.Yellow });
        return null;
    }
}

// 保持向后兼容性
var describeJavaClass = describeJavaClassDetails;
var findStrInMap = hookHashMapToFindValue;

// ===== 全局导出 =====
global.intelligentHookDispatcher = intelligentHookDispatcher;
global.traceClass = traceClass;
global.traceMethod = traceMethod;
global.advancedMethodTracing = advancedMethodTracing;
global.findClasses = findClasses;
global.enumAllClasses = enumAllClasses;
global.describeJavaClass = describeJavaClass;
// 接口实现类查找
global.findImplementations = findImplementations;
global.findDirectImplementations = findDirectImplementations;
global.findSubclasses = findSubclasses;
global.analyzeClassHierarchy = analyzeClassHierarchy;
global.hookJavaMethodWithTracing = hookJavaMethodWithTracing;
global.hookAllMethodsInJavaClass = hookAllMethodsInJavaClass;
global.hookHashMapToFindValue = hookHashMapToFindValue;
global.findStrInMap = findStrInMap;
global.help = help;

// 导出工具函数
global.LOG = LOG;
global.Color = Color;
global.printStack = printStack;
global.printJavaCallStack = printJavaCallStack;
global.findTragetClassLoader = findTragetClassLoader;
global.fetch = fetch;
// 类和对象搜索
global.classsearch = classsearch;
global.objectsearch = objectsearch;
global.classdump = classdump;
global.objectdump = objectdump;
// Wallbreaker 风格对象查看器
global.objectview = objectview;
global.objectfields = objectfields;
global.objectrefresh = objectrefresh;
global.objectexpand = objectexpand;
global.objectlist = objectlist;
global.objectmap = objectmap;
// OkHttp Logger 导出（已内置）
global.okhttpFind = okhttpFind;
global.okhttpSwitchLoader = okhttpSwitchLoader;
global.okhttpHold = okhttpHold;
global.okhttpHistory = okhttpHistory;
global.okhttpResend = okhttpResend;
global.okhttpClear = okhttpClear;
// okhttpStart 函数（一键启动）
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
        // 可选切换ClassLoader
        if (loaderSample) {
            try { okhttpSwitchLoader(loaderSample); } catch(_){}
        }
        // 检测并开启
        try { okhttpFind(); } catch(_){}
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
global.okhttpStart = okhttpStart;

// 提供 loadNativeSupport 便捷函数（如果 Native 模块已自动加载则提示已就绪）
function loadNativeSupport() {
    try {
        var hasAnyNative =
            (typeof nativeHookNativeFunction === 'function') ||
            (typeof nativeFindModules === 'function') ||
            (typeof nativeHookNetworkFunctions === 'function') ||
            (typeof nativeHookDlopenFamily === 'function');
        if (hasAnyNative) {
            LOG("🟢 Native 支持已就绪", { c: Color.Green });
            return true;
        }
        LOG("🟡 未检测到 Native 工具，请确认已加载 frida_native_common.js 或 frida_native/* 模块", { c: Color.Yellow });
        return false;
    } catch (e) {
        LOG("❌ 检查 Native 支持失败: " + e.message, { c: Color.Red });
        return false;
    }
}
global.loadNativeSupport = loadNativeSupport;

LOG("🚀 fridacli Java Hook工具集已加载 (新版本)!", { c: Color.Green });