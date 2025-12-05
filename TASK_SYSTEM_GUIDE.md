# fridac 任务管理系统指南

## 概述

fridac 使用 **Frida Script 隔离** 的任务系统，每个 Hook 独立运行：
- ✅ 任务完全隔离
- ✅ `killall` 真正清理
- ✅ 命中统计、最后命中时间
- ✅ 输出标识 `[#任务ID]`

## 任务命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `tasks` / `jobs` | 显示所有任务 | `tasks` |
| `kill <id>` | 终止任务 | `kill 1` |
| `killall [type]` | 终止所有/指定类型 | `killall trace_class` |
| `taskinfo <id>` | 任务详情 | `taskinfo 1` |
| `taskstats` | 任务统计 | `taskstats` |

## Hook 命令

### 类/方法追踪
```bash
traceclass com.app.Main true              # 追踪类
tracemethod com.app.Class.method true 10  # 追踪方法，10行栈
advancedtrace com.app.Class.method true   # 高级追踪
```

### 定位 Hook
```bash
hookbase64 true       # Base64
hookurl true          # URL
hooktoast true        # Toast
hookhashmap key true  # HashMap
hooklog true          # Log
hookedittext true     # EditText
```

### 网络抓包
```bash
hookfetch api/        # 网络抓包任务
fetch('api')          # 直接执行
```

## 参数说明

```
<command> [target] [show_stack] [stack_lines]
```
- `show_stack`: `true`/`1` 或 `false`/`0`
- `stack_lines`: 调用栈行数限制

## 任务状态

| 状态 | 图标 | 说明 |
|------|------|------|
| pending | ⏳ | 等待执行 |
| running | 🟢 | 运行中 |
| completed | ✅ | 已完成 |
| failed | ❌ | 失败 |
| cancelled | 🚫 | 已取消 |

## 任务类型

| 类型 | 说明 |
|------|------|
| `method_hook` | 方法 Hook |
| `class_hook` | 类 Hook |
| `native_hook` | Native Hook |
| `location_hook` | 定位 Hook |
| `trace_class` | 类追踪 |
| `trace_method` | 方法追踪 |
| `custom_hook` | 自定义函数 |
