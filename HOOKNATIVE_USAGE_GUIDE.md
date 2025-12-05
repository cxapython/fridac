# hooknative 使用指南

## 语法

```bash
hooknative <function_name> [show_stack] [stack_lines]
```

## 参数

- `function_name`: 函数名 (`malloc`)、地址 (`0x12345678`)、模块函数 (`libc.so!malloc`)
- `show_stack`: `true`/`false`
- `stack_lines`: 栈行数

## 常用示例

### 内存函数
```bash
hooknative malloc true
hooknative free true
```

### 文件函数
```bash
hooknative open true
hooknative read true
hooknative write true
```

### 网络函数
```bash
hooknative connect true
hooknative send true
hooknative recv true
```

### 加密函数
```bash
hooknative SSL_write true
hooknative SSL_read true
```

### 特定模块
```bash
hooknative libc.so!malloc true
hooknative libssl.so!SSL_write true
```

## 任务管理

```bash
tasks          # 查看任务
kill <id>      # 停止任务
killall        # 停止所有
```

## 注意事项

- 需要 root 权限
- Hook 高频函数可能影响性能
- 使用 `nativeFindExports()` 查找可用函数
