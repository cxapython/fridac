# 📋 fridacli 新任务管理系统使用指南

## 🚀 快速开始

### 1. 启动 fridac
```bash
# 使用 Python 3.8 (兼容 3.6.8+)
python3.8 fridac -f com.your.app
```

### 2. 基本命令速查

| 命令 | 说明 | 示例 |
|------|------|------|
| `taskhelp` | 显示帮助 | `taskhelp` |
| `tasks` / `jobs` | 查看所有任务 | `tasks` |
| `kill <id>` | 终止指定任务 | `kill 1` |
| `killall` | 终止所有任务 | `killall` |

### 3. 创建Hook任务

#### 方法Hook
```javascript
// Hook特定方法 (带堆栈跟踪)
fridac> hookmethod com.example.MainActivity.onCreate true

// Hook特定方法 (不显示堆栈)  
fridac> hookmethod com.example.NetworkClient.request
```

#### 类Hook
```javascript
// Hook类的所有方法 (带堆栈跟踪)
fridac> hookclass com.example.NetworkClient true

// Hook类的所有方法 (不显示堆栈)
fridac> hookclass com.example.MainActivity
```

#### 定位Hook
```javascript
// Hook Base64 编解码
fridac> hookbase64 true

// Hook Toast 消息
fridac> hooktoast

// Hook Native 函数
fridac> hooknative open true
fridac> hooknative malloc
```

### 4. 任务管理

#### 查看任务状态
```javascript
// 查看所有任务
fridac> tasks
📋 任务列表
================================================================================
ID   类型         状态    目标                           创建时间
--------------------------------------------------------------------------------
1    method_hook  🟢 running com.example.MainActivity.onCreate 14:23:15 (命中:5)
2    class_hook   🟢 running com.example.NetworkClient        14:23:20 (命中:12)
3    location_hook🟢 running base64                           14:23:25 (命中:3)
--------------------------------------------------------------------------------
📊 总计: 3 个任务

// 查看运行中的任务
fridac> jobs running

// 查看任务详情
fridac> taskinfo 1
```

#### 任务清理
```javascript
// 终止单个任务
fridac> kill 1
🗑️ 任务 #1 已终止: Hook方法: com.example.MainActivity.onCreate

// 终止特定类型的任务
fridac> killall method_hook
🧹 已终止 1 个任务

// 终止所有任务 (真正清理！)
fridac> killall
🧹 已终止 2 个任务

// 验证清理效果
fridac> tasks
📋 没有找到任务
```

#### 统计信息
```javascript
fridac> taskstats
📊 任务统计信息
========================================
总任务数: 0
总命中数: 15
下一个ID: 4
```

## 🔧 技术特性

### ✅ 真正的任务隔离
- 每个任务运行在独立的 Frida Script 中
- 任务之间完全隔离，互不干扰
- 支持并发运行多个相同类型的Hook

### ✅ 可靠的清理机制
- 利用 Frida 的 `script.unload()` API
- **真正清理** Hook，不留残留
- `killall` 命令现在完全有效！

### ✅ 实时状态跟踪
- 任务创建时间和状态
- Hook 命中次数统计
- 最后命中时间记录

### ✅ 向下兼容
- 所有原有命令仍然可用
- 现有脚本和workflow不受影响
- 渐进式升级体验

## 🆚 新旧系统对比

| 特性 | 旧系统 | 新系统 |
|------|--------|--------|
| Hook 清理 | ❌ 不完全 | ✅ 完全清理 |
| 任务隔离 | ❌ 单脚本 | ✅ 多脚本隔离 |
| killall 效果 | ❌ 残留Hook | ✅ 真正清理 |
| 任务管理 | ❌ 复杂状态检查 | ✅ 简单可靠 |
| 用户体验 | ⚠️ 混淆 | ✅ 直观清晰 |

## 🧪 测试建议

### 1. 基本流程测试
```javascript
// 创建多个任务
fridac> hookmethod com.example.Class1.method1
fridac> hookmethod com.example.Class2.method2  
fridac> hookbase64

// 验证Hook生效 (触发相应操作)
// 查看命中统计
fridac> tasks

// 清理验证
fridac> killall
fridac> tasks  // 应该显示"没有找到任务"
```

### 2. 选择性清理测试
```javascript
// 创建不同类型任务
fridac> hookmethod com.example.Test.method
fridac> hookclass com.example.Test
fridac> hookbase64

// 只清理特定类型
fridac> killall method_hook
fridac> tasks  // 应该只剩下其他类型任务
```

### 3. 并发任务测试
```javascript
// 创建多个相同目标的任务 (应该都能正常工作)
fridac> hookmethod com.example.Test.method
fridac> hookmethod com.example.Test.method
fridac> tasks  // 应该显示2个独立任务
```

## 💡 最佳实践

1. **使用新命令**: 优先使用 `hookmethod` 等新命令，获得更好的管理体验
2. **定期清理**: 测试完成后使用 `killall` 清理所有任务
3. **查看统计**: 使用 `taskstats` 了解Hook活动情况
4. **任务命名**: 创建任务时使用有意义的目标名称
5. **分类管理**: 使用 `killall <type>` 按类型管理任务

## ⚠️ 注意事项

1. **兼容性**: 需要 Python 3.6.8+ 和对应 Frida 版本
2. **内存使用**: 多脚本会有少量额外内存开销  
3. **学习成本**: 新用户需要学习任务管理命令
4. **设备连接**: 需要正确设置 frida-server

## 🎊 总结

新的任务管理系统彻底解决了 Hook 清理问题，让 fridacli 具备了 **objection 级别** 的任务管理能力。现在你可以：

- ✅ 放心使用 `killall`，不用担心残留
- ✅ 创建多个独立的Hook任务  
- ✅ 实时监控Hook活动状态
- ✅ 享受更可靠的调试体验

快来体验全新的 fridacli 吧！🚀