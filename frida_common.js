/**
 * 将字节数组转换为字符串
 * @param {Array|Uint8Array} byteArray - 字节数组
 * @returns {string} 转换后的字符串
 */
function convertBytesToString(byteArray) {
    var resultString = '';
    var uint8Array = new Uint8Array(byteArray);
    for (var byteIndex in uint8Array) {
        resultString += String.fromCharCode(uint8Array[byteIndex]);
    }
    return resultString;
}

// 保持向后兼容性
var bytesToString = convertBytesToString;
  var Color = {
    RESET: "\x1b[39;49;00m", Black: "0;01", Blue: "4;01", Cyan: "6;01", Gray: "7;11", Green: "2;01", Purple: "5;01", Red: "1;01", Yellow: "3;01",
    Light: {
        Black: "0;11", Blue: "4;11", Cyan: "6;11", Gray: "7;01", Green: "2;11", Purple: "5;11", Red: "1;11", Yellow: "3;11"
    }
  };
  
  /**
   * 增强的日志输出函数，支持颜色和格式化
   * @param {string|object} messageContent - 要输出的消息内容
   * @param {object} logOptions - 日志选项
   * @param {string} logOptions.c - 颜色代码
   * @param {string} logOptions.l - 日志级别 (log, warn, error)
   * @param {boolean} logOptions.i - 是否缩进 JSON 格式
   * @returns {void}
   */
  var enhancedLog = function (messageContent, logOptions) {
    logOptions = logOptions || {};
    var logLevel = logOptions.l || 'log';
    var colorPrefix = '\x1b[3';
    var colorSuffix = 'm';
    var formattedMessage = messageContent;
    
    // 格式化对象为 JSON
    if (typeof messageContent === 'object') {
        formattedMessage = JSON.stringify(messageContent, null, logOptions.i ? 2 : null);
    }
    
    // 添加颜色
    if (logOptions.c) {
        formattedMessage = colorPrefix + logOptions.c + colorSuffix + formattedMessage + Color.RESET;
    }
    
    console[logLevel](formattedMessage);
  };
  
  // 保持向后兼容性
  var LOG = enhancedLog;
  
  /**
   * 打印完整的 Java 调用堆栈
   * @param {boolean} showCompleteStack - 是否显示完整堆栈信息，默认为 false
   * @param {number} maxStackLines - 最大显示行数，默认为 50
   * @returns {void}
   */
  var printJavaCallStack = function (showCompleteStack, maxStackLines) {
    showCompleteStack = showCompleteStack || false;
    maxStackLines = maxStackLines || 50;
    
    Java.perform(function() {
        try {
            var androidLogClass = Java.use('android.util.Log');
            var javaExceptionClass = Java.use('java.lang.Exception');
            
            // 获取完整堆栈信息
            var fullStackTrace = androidLogClass.getStackTraceString(javaExceptionClass.$new());
            var stackLines = fullStackTrace.split('\n');
            
            LOG("📚 Java 调用堆栈 (共 " + stackLines.length + " 行):", { c: Color.Cyan });
            
            if (showCompleteStack) {
                // 显示完整堆栈，只过滤掉生成异常的行
                for (var lineIndex = 0; lineIndex < stackLines.length && lineIndex < maxStackLines; lineIndex++) {
                    var currentLine = stackLines[lineIndex].trim();
                    
                    // 只跳过生成异常的行，保留所有其他信息
                    if (currentLine.includes('java.lang.Exception') && 
                        currentLine.includes('<init>')) {
                        continue;
                    }
                    
                    if (currentLine === '') {
                        continue;
                    }
                    
                    LOG("  [" + String(lineIndex + 1).padStart(2, '0') + "] " + currentLine, { c: Color.White });
                }
                
                if (stackLines.length > maxStackLines) {
                    LOG("  ⋯ (还有 " + (stackLines.length - maxStackLines) + " 行堆栈信息)", { c: Color.Gray });
                }
            } else {
                // 显示简化的应用相关堆栈
                var applicationStackEntries = [];
                
                for (var lineIndex = 0; lineIndex < stackLines.length; lineIndex++) {
                    var currentLine = stackLines[lineIndex].trim();
                    
                    // 跳过系统内部调用
                    if (currentLine.includes('java.lang.Exception') || 
                        currentLine.includes('android.util.Log.getStackTraceString') ||
                        currentLine.includes('dalvik.system') ||
                        currentLine.includes('java.lang.Thread.getStackTrace') ||
                        currentLine.startsWith('Caused by:') ||
                        currentLine === '') {
                        continue;
                    }
                    
                    // 解析堆栈行信息
                    var methodWithLocationMatch = currentLine.match(/at\s+([^(]+)\(([^:]+):(\d+)\)/);
                    if (methodWithLocationMatch) {
                        var fullMethodName = methodWithLocationMatch[1];
                        var sourceFileName = methodWithLocationMatch[2];
                        var sourceLineNumber = methodWithLocationMatch[3];
                        
                        LOG("  📍 " + fullMethodName + " (" + sourceFileName + ":" + sourceLineNumber + ")", { c: Color.White });
                        applicationStackEntries.push(currentLine);
                    } else {
                        // 处理没有行号的情况
                        var methodWithoutLocationMatch = currentLine.match(/at\s+([^(]+)\(([^)]+)\)/);
                        if (methodWithoutLocationMatch) {
                            var methodName = methodWithoutLocationMatch[1];
                            var locationInfo = methodWithoutLocationMatch[2];
                            
                            LOG("  📍 " + methodName + " (" + locationInfo + ")", { c: Color.White });
                            applicationStackEntries.push(currentLine);
                        } else if (currentLine.startsWith('at ')) {
                            // 显示其他格式的堆栈行
                            LOG("  📍 " + currentLine, { c: Color.White });
                            applicationStackEntries.push(currentLine);
                        }
                    }
                }
                
                if (applicationStackEntries.length === 0) {
                    LOG("  ❌ 没有找到应用相关的堆栈信息", { c: Color.Yellow });
                } else {
                    LOG("  💡 显示了 " + applicationStackEntries.length + " 个应用调用，使用 printJavaCallStack(true) 查看完整堆栈", { c: Color.Gray });
                }
            }
            
        } catch (stackError) {
            LOG("❌ 获取堆栈信息失败: " + stackError.message, { c: Color.Red });
        }
    });
  };
  
  // 保持向后兼容性
  var printStack = printJavaCallStack;
  
    /**
   * 根据模式查找匹配的 Java 类
   * @param {string|RegExp} searchPattern - 搜索模式，可以是字符串或正则表达式
   * @param {boolean} includeMethodDetails - 是否包含方法详细信息，默认为 false
   * @returns {Array<string|object>} 匹配的类列表，如果包含方法详情则返回对象数组
   */
  function findJavaClassesByPattern(searchPattern, includeMethodDetails) {
      includeMethodDetails = includeMethodDetails || false;
      
      var allAvailableClasses = enumerateAllLoadedClasses(searchPattern);
      var matchingClasses = [];
      var searchRegex;
      
      // 转换搜索模式为正则表达式
      if (typeof searchPattern === 'string') {
          searchRegex = new RegExp(searchPattern);
      } else {
          searchRegex = searchPattern;
      }

      allAvailableClasses.forEach(function(currentClassName) {
          try {
              if (currentClassName.match(searchRegex)) {
                  if (includeMethodDetails) {
                      var javaClass = Java.use(currentClassName);
                      var declaredMethods = javaClass.class.getDeclaredMethods();
                      
                      matchingClasses.push({
                          className: currentClassName,
                          methodList: declaredMethods.map(function(methodObject) {
                              return methodObject.toString();
                          }),
                          methodCount: declaredMethods.length
                      });
                  } else {   
                      matchingClasses.push(currentClassName);
                  }
              }
          } catch (classLoadError) {
              LOG("警告: 无法加载类 " + currentClassName + ": " + classLoadError.message, { c: Color.Yellow });
          } 
      });

      return matchingClasses;
  }
  
  // 保持向后兼容性
  var findClasses = findJavaClassesByPattern;
  /**
   * 在所有 ClassLoader 中查找指定的 Java 类
   * @param {string} targetClassName - 要查找的类名 (包名.类名)
   * @returns {Object|null} 找到的 ClassLoader 对象，如果未找到则返回 null
   */
  function findTargetClassLoaderForClass(targetClassName) {
      var allClassLoaders = Java.enumerateClassLoadersSync();
      var foundClassLoader = null;
      
      LOG("🔍 开始在 " + allClassLoaders.length + " 个 ClassLoader 中搜索类: " + targetClassName, { c: Color.Cyan });
      
      allClassLoaders.forEach(function(currentLoader) {
          try {
              var foundClass = currentLoader.findClass(targetClassName);
              if (foundClass) {
                  foundClassLoader = Java.retain(currentLoader);
                  
                  // 获取并显示 ClassLoader 的详细信息
                  var classLoaderDetails = extractClassLoaderInformation(currentLoader);
                  LOG("✅ 在 ClassLoader 中找到目标类 '" + targetClassName + "': " + currentLoader, { c: Color.Green });
                  LOG("📁 ClassLoader 类型: " + classLoaderDetails.type, { c: Color.Cyan });
                  
                  if (classLoaderDetails.paths && classLoaderDetails.paths.length > 0) {
                      LOG("📂 包含的文件路径 (" + classLoaderDetails.paths.length + " 个):", { c: Color.Yellow });
                      classLoaderDetails.paths.forEach(function(filePath, pathIndex) {
                          LOG("   [" + (pathIndex + 1) + "] " + filePath, { c: Color.White });
                      });
                  } else {
                      LOG("📂 未找到相关文件路径信息", { c: Color.Gray });
                  }
                  
                  if (classLoaderDetails.parentLoader) {
                      LOG("🔗 父 ClassLoader: " + classLoaderDetails.parentLoader, { c: Color.Blue });
                  }
                  
                  // 找到第一个匹配的就返回
                  return;
              }
          } catch (classSearchError) {
              // 在某些 ClassLoader 中可能无法找到类，这是正常的
              // 不需要输出错误信息，避免日志混乱
          }
      });
      
      if (!foundClassLoader) {
          LOG("❌ 在所有 " + allClassLoaders.length + " 个 ClassLoader 中都未找到类: " + targetClassName, { c: Color.Red });
      }
      
      return foundClassLoader;
  }
  
  // 保持向后兼容性 (注意：原函数名有拼写错误)
  var findTragetClassLoader = findTargetClassLoaderForClass;
  
  /**
   * 获取 ClassLoader 的详细信息
   * @param {Object} classLoaderInstance - ClassLoader 实例
   * @returns {Object} 包含类型、路径和父加载器信息的对象
   */
  function extractClassLoaderInformation(classLoaderInstance) {
      var classLoaderInfo = {
          type: "Unknown",
          paths: [],
          parentLoader: null
      };
      
      try {
          // 获取 ClassLoader 的具体类型
          classLoaderInfo.type = classLoaderInstance.getClass().getName();
          
          // 获取父 ClassLoader 信息
          var parentClassLoader = classLoaderInstance.getParent();
          if (parentClassLoader) {
              classLoaderInfo.parentLoader = parentClassLoader.getClass().getName();
          }
          
          // 尝试获取文件路径信息 - 适用于 DexClassLoader 和 PathClassLoader
          try {
              // 检查是否存在 pathList 字段
              var pathListField = classLoaderInstance.getClass().getDeclaredField("pathList");
              if (pathListField) {
                  pathListField.setAccessible(true);
                  var pathListObject = pathListField.get(classLoaderInstance);
                  
                  if (pathListObject) {
                      // 获取 dexElements 数组
                      try {
                          var dexElementsField = pathListObject.getClass().getDeclaredField("dexElements");
                          if (dexElementsField) {
                              dexElementsField.setAccessible(true);
                              var dexElementsArray = dexElementsField.get(pathListObject);
                              
                              if (dexElementsArray && dexElementsArray.length > 0) {
                                  for (var elementIndex = 0; elementIndex < dexElementsArray.length; elementIndex++) {
                                      try {
                                          var currentElement = dexElementsArray[elementIndex];
                                          // 尝试获取文件路径信息
                                          var pathField = currentElement.getClass().getDeclaredField("path");
                                          if (pathField) {
                                              pathField.setAccessible(true);
                                              var filePath = pathField.get(currentElement);
                                              if (filePath) {
                                                  classLoaderInfo.paths.push(filePath.toString());
                                              }
                                          }
                                      } catch (e) {
                                          // 忽略单个element的错误
                                      }
                                  }
                              }
                          }
                      } catch (e) {
                          // 可能是不同版本的Android，尝试其他方法
                      }
                  }
              }
          } catch (pathExtractionError) {
              // 如果标准方法失败，尝试从 toString() 解析路径信息
              try {
                  var classLoaderString = classLoaderInstance.toString();
                  if (classLoaderString.includes("[") && classLoaderString.includes("]")) {
                      var pathSection = classLoaderString.substring(
                          classLoaderString.indexOf("[") + 1, 
                          classLoaderString.indexOf("]")
                      );
                      if (pathSection && pathSection.trim() !== "") {
                          classLoaderInfo.paths.push(pathSection.trim());
                      }
                  }
              } catch (fallbackError) {
                  // 所有尝试都失败，保持空路径数组
                  LOG("无法获取 ClassLoader 路径信息: " + fallbackError.message, { c: Color.Gray });
              }
          }
          
      } catch (generalError) {
          LOG("获取 ClassLoader 信息时发生错误: " + generalError.message, { c: Color.Red });
      }
      
      return classLoaderInfo;
  }
  
  // 保持向后兼容性
  var getClassLoaderInfo = extractClassLoaderInformation;
  /**
   * 枚举所有已加载的 Java 类
   * @param {string} classNameFilter - 类名过滤器，可选
   * @returns {Array<string>} 符合条件的类名列表
   */
  function enumerateAllLoadedClasses(classNameFilter) {
      var filteredClassList = [];
      
      Java.perform(function() {
          var loadedJavaClasses = Java.enumerateLoadedClassesSync();
          
          loadedJavaClasses.forEach(function(currentClassName) {
              try {
                  // 如果没有过滤器或类名包含过滤字符串，则添加到结果
                  if (!classNameFilter || currentClassName.includes(classNameFilter)) {
                      filteredClassList.push(currentClassName);
                  }
              } catch (enumerationError) {
                  // 忽略无法处理的类，避免 TypeError
                  LOG("枚举类时出错: " + currentClassName + " - " + enumerationError.message, { c: Color.Gray });
              }
          });
      });
      
      return filteredClassList;
  }
  
  // 保持向后兼容性
  var enumAllClasses = enumerateAllLoadedClasses;
    /**
   * Hook 指定的 Java 方法并跟踪其调用
   * @param {string} fullyQualifiedMethodName - 完整的方法名 (包名.类名.方法名)
   * @param {boolean} enableStackTrace - 是否显示调用堆栈，默认为 false
   * @param {any} customReturnValue - 自定义返回值，如果提供则替换原返回值
   * @returns {boolean} 是否成功 Hook
   */
  function hookJavaMethodWithTracing(fullyQualifiedMethodName, enableStackTrace, customReturnValue) {
      enableStackTrace = enableStackTrace || false;
      
      // 自动注册任务
      var taskId = null;
      if (typeof HookJobManager !== 'undefined') {
          taskId = HookJobManager.autoRegisterHook('hookJavaMethodWithTracing', [fullyQualifiedMethodName, enableStackTrace, customReturnValue]);
      }
      
      var methodDelimiterIndex = fullyQualifiedMethodName.lastIndexOf(".");
      if (methodDelimiterIndex === -1) {
          LOG("❌ 无效的方法名格式: " + fullyQualifiedMethodName + " (应为: 包名.类名.方法名)", { c: Color.Red });
          return false;
      }

      var targetClassName = fullyQualifiedMethodName.slice(0, methodDelimiterIndex);
      var targetMethodName = fullyQualifiedMethodName.slice(methodDelimiterIndex + 1);
      var javaClassHook = null;
      try {
          javaClassHook = Java.use(targetClassName);
      } catch (classLoadError) {
          if (classLoadError.message.includes("ClassNotFoundException")) {
              LOG("❌ 类 '" + targetClassName + "' 未在默认ClassLoader中找到，正在搜索其他ClassLoader...", { c: Color.Yellow });
              var customClassLoader = findTargetClassLoaderForClass(targetClassName);
              if (customClassLoader) {
                  javaClassHook = Java.ClassFactory.get(customClassLoader).use(targetClassName);
                  LOG("🎯 成功使用自定义ClassLoader加载类，开始Hook方法: " + targetMethodName, { c: Color.Green });
              } else {
                  LOG("❌ 在所有ClassLoader中都未找到类: " + targetClassName, { c: Color.Red });
                  return false;
              }
          } else {
              LOG("❌ 加载类时发生其他错误: " + classLoadError.message, { c: Color.Red });
              return false;
          }
      }
            var methodOverloads = javaClassHook[targetMethodName].overloads;
      var overloadCount = methodOverloads.length;

      LOG("🎯 开始跟踪方法: " + fullyQualifiedMethodName + " [" + overloadCount + " 个重载版本]", { c: Color.Green });

      for (var overloadIndex = 0; overloadIndex < overloadCount; overloadIndex++) {
  
          methodOverloads[overloadIndex].implementation = function() {
              // 检查任务是否已被取消
              if (taskId && typeof HookJobManager !== 'undefined') {
                  var job = HookJobManager.getJob(taskId);
                  if (job && job.status === 'cancelled') {
                      // 任务已取消，静默执行原方法
                      return this[targetMethodName].apply(this, arguments);
                  }
                  // 更新任务命中统计
                  if (job && job.status === 'active') {
                      HookJobManager.updateAutoTaskHit(taskId, { executionTime: 1 });
                  }
              }
              
              LOG("\n🎯 ===== ENTERED " + fullyQualifiedMethodName + " =====", { c: Color.Green });
              
              if (enableStackTrace) {
                  printJavaCallStack()
              }
              
              // 格式化和显示方法参数
              var methodArguments = arguments;
              if (methodArguments.length > 0) {
                  LOG("\n📥 方法参数列表 (" + methodArguments.length + " 个):", { c: Color.Cyan });
                  for (var argumentIndex = 0; argumentIndex < methodArguments.length; argumentIndex++) {
                      var argumentValue = methodArguments[argumentIndex];
                      var argumentType = typeof argumentValue;
                      var formattedDisplayValue = argumentValue;
                      
                      // 根据参数类型进行格式化
                      if (argumentValue === null) {
                          formattedDisplayValue = "null";
                          argumentType = "null";
                      } else if (argumentValue === undefined) {
                          formattedDisplayValue = "undefined"; 
                          argumentType = "undefined";
                      } else if (argumentType === "string" && argumentValue.length > 100) {
                          formattedDisplayValue = argumentValue.substring(0, 100) + "... (总长度: " + argumentValue.length + " 字符)";
                      } else if (argumentType === "object") {
                          try {
                              if (argumentValue.toString && argumentValue.toString() !== "[object Object]") {
                                  formattedDisplayValue = argumentValue.toString();
                              } else {
                                  formattedDisplayValue = JSON.stringify(argumentValue, null, 2);
                              }
                              if (formattedDisplayValue.length > 200) {
                                  formattedDisplayValue = formattedDisplayValue.substring(0, 200) + "... (内容被截断)";
                              }
                          } catch (objectFormatError) {
                              try {
                                  formattedDisplayValue = "[Object " + argumentValue.getClass().getName() + "]";
                              } catch (classNameError) {
                                  formattedDisplayValue = "[无法获取对象信息]";
                              }
                          }
                      }
                      
                      LOG("  [" + argumentIndex + "] (" + argumentType + ") " + formattedDisplayValue, { c: Color.White });
                  }
              } else {
                  LOG("\n📥 无参数", { c: Color.Yellow });
              }

              // 调用原始方法
              var originalMethodResult = this[targetMethodName].apply(this, methodArguments);
            
              // 如果提供了自定义返回值，则替换原返回值
              if (customReturnValue !== undefined) {
                  LOG("\n🔄 返回值被修改为自定义值: " + customReturnValue, { c: Color.Magenta });
                  originalMethodResult = customReturnValue;
              }
              
              // 格式化返回值输出
              var returnValueType = typeof originalMethodResult;
              var formattedReturnValue = originalMethodResult;
              
              if (originalMethodResult === null) {
                  formattedReturnValue = "null";
                  returnValueType = "null";
              } else if (originalMethodResult === undefined) {
                  formattedReturnValue = "undefined";
                  returnValueType = "undefined";
              } else if (returnValueType === "string" && originalMethodResult.length > 200) {
                  formattedReturnValue = originalMethodResult.substring(0, 200) + "... (总长度: " + originalMethodResult.length + " 字符)";
              } else if (returnValueType === "object") {
                  try {
                      if (originalMethodResult.toString && originalMethodResult.toString() !== "[object Object]") {
                          formattedReturnValue = originalMethodResult.toString();
                      } else {
                          formattedReturnValue = JSON.stringify(originalMethodResult, null, 2);
                      }
                      if (formattedReturnValue.length > 300) {
                          formattedReturnValue = formattedReturnValue.substring(0, 300) + "... (内容被截断)";
                      }
                  } catch (returnValueFormatError) {
                      try {
                          formattedReturnValue = "[Object " + originalMethodResult.getClass().getName() + "]";
                      } catch (classNameError) {
                          formattedReturnValue = "[无法获取返回值信息]";
                      }
                  }
              }
              
              LOG("\n📤 返回值 (" + returnValueType + "): " + formattedReturnValue, { c: Color.Blue });
              LOG("\n🏁 ===== EXITED " + fullyQualifiedMethodName + " =====\n", { c: Color.Red });
              
              return originalMethodResult;
          }
      }
      
      LOG("✅ 成功 Hook 方法: " + fullyQualifiedMethodName + " (共 " + overloadCount + " 个重载版本)", { c: Color.Green });
      return true;
  }
  
  // 保持向后兼容性
  var traceMethod = hookJavaMethodWithTracing;
  
  
  
  
  /**
   * 根据指定的键函数去除数组中的重复项
   * @param {Array} inputArray - 输入数组
   * @param {Function} keyExtractorFunction - 用于提取比较键的函数
   * @returns {Array} 去重后的数组
   */
  function removeDuplicatesByKey(inputArray, keyExtractorFunction) {
      var seenKeys = {};
      return inputArray.filter(function(currentItem) {
          var itemKey = keyExtractorFunction(currentItem);
          if (seenKeys.hasOwnProperty(itemKey)) {
              return false; // 已经见过这个键，过滤掉
          } else {
              seenKeys[itemKey] = true;
              return true; // 第一次见到这个键，保留
          }
      });
  }
  
  // 保持向后兼容性
  var uniqBy = removeDuplicatesByKey;
  
  /**
   * Hook 指定 Java 类的所有方法
   * @param {string} fullyQualifiedClassName - 完整的类名 (包名.类名)
   * @returns {boolean} 是否成功 Hook
   */
  function hookAllMethodsInJavaClass(fullyQualifiedClassName) {
      // 自动注册任务
      var taskId = null;
      if (typeof HookJobManager !== 'undefined') {
          taskId = HookJobManager.autoRegisterHook('hookAllMethodsInJavaClass', [fullyQualifiedClassName]);
      }
      
      var javaClassWrapper = null;
      
      try {
          javaClassWrapper = Java.use(fullyQualifiedClassName);
      } catch (classLoadError) {
          if (classLoadError.message.includes("ClassNotFoundException")) {
              LOG("❌ 类 '" + fullyQualifiedClassName + "' 未在默认ClassLoader中找到，正在搜索其他ClassLoader...", { c: Color.Yellow });
              var customClassLoader = findTargetClassLoaderForClass(fullyQualifiedClassName);
              if (customClassLoader) {
                  javaClassWrapper = Java.ClassFactory.get(customClassLoader).use(fullyQualifiedClassName);
                  LOG("🎯 成功使用自定义ClassLoader加载类，开始枚举所有方法...", { c: Color.Green });
              } else {
                  LOG("❌ 在所有ClassLoader中都未找到类: " + fullyQualifiedClassName, { c: Color.Red });
                  // 标记任务失败
                  if (taskId && typeof HookJobManager !== 'undefined') {
                      var job = HookJobManager.getJob(taskId);
                      if (job) {
                          job.updateStatus('failed', new Error('在所有ClassLoader中都未找到类'));
                      }
                  }
                  return false;
              }
          } else {
              LOG("❌ 加载类时发生其他错误: " + classLoadError.message, { c: Color.Red });
              // 标记任务失败
              if (taskId && typeof HookJobManager !== 'undefined') {
                  var job = HookJobManager.getJob(taskId);
                  if (job) {
                      job.updateStatus('failed', classLoadError);
                  }
              }
              return false;
          }
      }
      
      if (!javaClassWrapper) {
          LOG("❌ 无法加载类: " + fullyQualifiedClassName, { c: Color.Red });
          // 标记任务失败
          if (taskId && typeof HookJobManager !== 'undefined') {
              var job = HookJobManager.getJob(taskId);
              if (job) {
                  job.updateStatus('failed', new Error('无法加载类'));
              }
          }
          return false;
      }
      
      var allDeclaredMethods = javaClassWrapper.class.getDeclaredMethods();
      LOG("🔍 在类 '" + fullyQualifiedClassName + "' 中发现 " + allDeclaredMethods.length + " 个声明的方法", { c: Color.Cyan });

      var extractedMethodNames = [];
      allDeclaredMethods.forEach(function(methodObject) {
          try {
              // 提取方法名，移除类名前缀
              var methodSignature = methodObject.toString();
              var methodNameMatch = methodSignature.replace(fullyQualifiedClassName + ".", "PLACEHOLDER").match(/\sPLACEHOLDER(.*)\(/);
              if (methodNameMatch && methodNameMatch[1]) {
                  extractedMethodNames.push(methodNameMatch[1]);
              }
          } catch (methodParseError) {
              LOG("解析方法时出错: " + methodParseError.message, { c: Color.Yellow });
          }
      });

      var uniqueMethodNames = removeDuplicatesByKey(extractedMethodNames, JSON.stringify);
      LOG("📋 去重后找到 " + uniqueMethodNames.length + " 个唯一方法，开始批量Hook...", { c: Color.Green });
      
      var successfulHooks = 0;
      uniqueMethodNames.forEach(function(methodName) {
          var fullMethodName = fullyQualifiedClassName + "." + methodName;
          if (hookJavaMethodWithTracing(fullMethodName)) {
              successfulHooks++;
          }
      });
      
      LOG("✅ 成功Hook了 " + successfulHooks + "/" + uniqueMethodNames.length + " 个方法" + (taskId ? " (任务ID: #" + taskId + ")" : ""), { c: Color.Green });
      
      // 更新任务统计
      if (taskId && typeof HookJobManager !== 'undefined') {
          var job = HookJobManager.getJob(taskId);
          if (job) {
              job.metadata.hitCount = successfulHooks;
              job.metadata.lastHit = new Date();
              if (successfulHooks > 0) {
                  job.updateStatus('active');
              } else {
                  job.updateStatus('failed', new Error('没有成功Hook任何方法'));
              }
          }
      }
      
      return taskId || (successfulHooks > 0);
  }
  
  // 保持向后兼容性
  var traceClass = hookAllMethodsInJavaClass;
  
  
  /**
   * 描述Java类的详细信息，包括方法和字段
   * @param {string} fullyQualifiedClassName - 完整的类名 (包名.类名)
   * @returns {Object|null} 类的详细信息对象，失败时返回null
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
  
  // 保持向后兼容性
  var describeJavaClass = describeJavaClassDetails;

/**
 * 根据HashMap的key值查找对应的value值，Hook HashMap.put方法进行监控
 * @param {string} searchKey - 要搜索的键（支持部分匹配）
 * @param {number} enableStackTrace - 是否显示堆栈跟踪，1为启用，0为禁用
 * @returns {boolean} 是否成功设置监控
 */
function hookHashMapToFindValue(searchKey, enableStackTrace) {
    enableStackTrace = enableStackTrace || 0;
    var shouldShowStack = enableStackTrace === 1;
    
    // 自动注册任务
    var taskId = null;
    if (typeof HookJobManager !== 'undefined') {
        taskId = HookJobManager.autoRegisterHook('hookHashMapToFindValue', [searchKey, enableStackTrace]);
    }
    
    try {
        var hashMapClass = Java.use("java.util.HashMap");
        LOG("🔍 开始监控 HashMap.put 操作，搜索键: '" + searchKey + "'", { c: Color.Cyan });
        
        hashMapClass.put.implementation = function (keyParameter, valueParameter) {
            // 检查任务是否已被取消
            if (taskId && typeof HookJobManager !== 'undefined') {
                var job = HookJobManager.getJob(taskId);
                if (job && job.status === 'cancelled') {
                    // 任务已取消，静默执行原方法
                    return this.put(keyParameter, valueParameter);
                }
                // 更新任务命中统计
                if (job && job.status === 'active') {
                    HookJobManager.updateAutoTaskHit(taskId, { executionTime: 1 });
                }
            }
            
            var keyString = keyParameter ? keyParameter.toString() : "";
            var valueString = valueParameter ? valueParameter.toString() : "";
            
            // 检查键是否包含搜索字符串
            if (keyString.indexOf(searchKey) !== -1) {
                LOG("🎯 找到匹配的 HashMap 条目:", { c: Color.Green });
                LOG("  📝 Key: " + keyString, { c: Color.Yellow });
                LOG("  💎 Value: " + valueString, { c: Color.Green });
                
                if (shouldShowStack) {
                    printJavaCallStack(false);
                }
            }
            
            // 调用原始的put方法
            return this.put(keyParameter, valueParameter);
        };
    
        // 同时监控 LinkedHashMap
        try {
            var linkedHashMapClass = Java.use("java.util.LinkedHashMap");
            LOG("🔗 同时监控 LinkedHashMap.put 操作", { c: Color.Blue });
            
            linkedHashMapClass.put.implementation = function (keyParameter, valueParameter) {
                // 检查任务是否已被取消
                if (taskId && typeof HookJobManager !== 'undefined') {
                    var job = HookJobManager.getJob(taskId);
                    if (job && job.status === 'cancelled') {
                        // 任务已取消，静默执行原方法
                        return this.put(keyParameter, valueParameter);
                    }
                    // 更新任务命中统计
                    if (job && job.status === 'active') {
                        HookJobManager.updateAutoTaskHit(taskId, { executionTime: 1 });
                    }
                }
                
                var keyString = keyParameter ? keyParameter.toString() : "";
                var valueString = valueParameter ? valueParameter.toString() : "";
                
                if (keyString.indexOf(searchKey) !== -1) {
                    LOG("🎯 找到匹配的 LinkedHashMap 条目:", { c: Color.Green });
                    LOG("  📝 Key: " + keyString, { c: Color.Yellow });
                    LOG("  💎 Value: " + valueString, { c: Color.Green });
                    
                    if (shouldShowStack) {
                        printJavaCallStack(false);
                    }
                }
                
                return this.put(keyParameter, valueParameter);
            };
        } catch (linkedHashMapError) {
            LOG("❌ LinkedHashMap Hook 失败: " + linkedHashMapError.message, { c: Color.Red });
        }
        
        LOG("✅ HashMap 监控设置成功", { c: Color.Green });
        return true;
        
    } catch (hashMapError) {
        LOG("❌ HashMap Hook 失败: " + hashMapError.message, { c: Color.Red });
        return false;
    }
}

// 保持向后兼容性
var findStrInMap = hookHashMapToFindValue;

/**
 * 加载 Native Hook 支持工具
 * @returns {boolean} 是否成功加载或已加载Native Hook工具
 */
function loadNativeHookingSupport() {
    try {
        // 检查是否已经加载了 Native Hook 工具
        if (typeof nativeHookNativeFunction !== 'undefined') {
            LOG("✅ Native Hook 工具已可用", { c: Color.Green });
            return true;
        }
        
        // 尝试加载 frida_native_common.js
        LOG("🔄 正在尝试加载 Native Hook 工具...", { c: Color.Yellow });
        
        // 检查常见的Native Hook函数是否存在
        var nativeFunctions = [
            'nativeHookNativeFunction',
            'nativeEnumerateModules', 
            'nativeEnumerateExports',
            'nativeEnumerateImports'
        ];
        
        var availableNativeFunctions = 0;
        nativeFunctions.forEach(function(functionName) {
            if (typeof eval('typeof ' + functionName) !== 'undefined') {
                availableNativeFunctions++;
            }
        });
        
        if (availableNativeFunctions > 0) {
            LOG("🎯 检测到 " + availableNativeFunctions + "/" + nativeFunctions.length + " 个 Native Hook 函数可用", { c: Color.Cyan });
            return true;
        }
        
        // 这里可以通过 fridac 动态加载 native 工具
        LOG("⚠️ 请手动加载 frida_native_common.js 以使用完整的 Native Hook 功能", { c: Color.Gray });
        LOG("💡 在 fridac 中运行: exec(open('frida_native_common.js').read())", { c: Color.Blue });
        return false;
        
    } catch (loadError) {
        LOG("❌ 加载 Native Hook 工具失败: " + loadError.message, { c: Color.Red });
        return false;
    }
}

// 保持向后兼容性
var loadNativeSupport = loadNativeHookingSupport;

// 智能 Hook 助手
/**
 * 智能识别并Hook目标（Java类/方法或Native函数）
 * @param {string} targetIdentifier - 目标标识符（类名、方法名或函数名）
 * @param {Object} hookOptions - Hook选项
 * @param {boolean} hookOptions.enableStackTrace - 是否启用堆栈跟踪
 * @param {boolean} hookOptions.isMethodExplicit - 明确指定为方法
 * @param {any} hookOptions.customReturnValue - 自定义返回值
 * @param {boolean} hookOptions.showCompleteStack - 是否显示完整堆栈
 * @returns {boolean|null} Hook结果，成功返回true，失败返回false，无法处理返回null
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
var smartTrace = intelligentHookDispatcher;