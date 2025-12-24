# Small-Trace (QBDI) 汇编追踪分析指南

本文档记录了使用 fridac 的 Small-Trace 功能对 `libjnicalculator.so` 中 `encryptString` 方法进行汇编级追踪和算法还原的完整过程。

## 目录

- [1. 概述](#1-概述)
- [2. 获取函数偏移](#2-获取函数偏移)
- [3. 执行追踪](#3-执行追踪)
- [4. Trace 文件格式解析](#4-trace-文件格式解析)
- [5. 算法还原实战](#5-算法还原实战)
- [6. 验证还原结果](#6-验证还原结果)
- [7. 常用分析技巧](#7-常用分析技巧)

---

## 1. 概述

### 1.1 什么是 Small-Trace

Small-Trace 是基于 [QBDI (QuarkslaB Dynamic binary Instrumentation)](https://qbdi.quarkslab.com/) 的 SO 汇编追踪工具。它可以：

- 追踪 Native 函数执行的**每一条汇编指令**
- 记录**内存读写**操作（地址、大小、值）
- 输出**寄存器变化**
- 生成完整的执行流日志

### 1.2 适用场景

| 场景 | 说明 |
|------|------|
| 算法逆向 | 无源码情况下还原加密/解密算法 |
| 漏洞分析 | 追踪崩溃点附近的执行流 |
| 协议分析 | 分析数据包加解密过程 |
| 混淆对抗 | 绕过代码混淆，直接观察运行时行为 |

### 1.3 本次分析目标

- **目标 SO**: `libjnicalculator.so`
- **目标函数**: `encryptToMd5Hex` (偏移 `0x21244`)
- **功能**: 输入字符串 → transformChar 变换 → MD5 哈希 → 输出 32 位十六进制

---

## 2. 获取函数偏移

在使用 `smalltrace` 命令之前，需要先确定目标函数在 SO 文件中的偏移地址。

### 2.1 方法一：使用 Ghidra / IDA Pro

1. 打开 `libjnicalculator.so`
2. 在符号表中搜索 `encryptToMd5Hex`
3. 查看函数地址，减去基址即为偏移

```
Ghidra 中显示:
  encryptToMd5Hex @ 0x00021244
  transformChar   @ 0x0001f5e0
  MD5Init         @ 0x0001f6b0
  MD5Final        @ 0x00021004
```

### 2.2 方法二：使用 fridac 内置功能

```bash
# 连接到目标应用
fridac -p com.example.jnicalculator

# 查找导出符号
fridac> nativeFindExports('libjnicalculator.so', 'encrypt')
```

输出示例：
```
[*] 模块: libjnicalculator.so
    encryptToMd5Hex @ 0x21244
    encryptString2  @ 0x1ed98
```

### 2.3 方法三：使用命令行工具

```bash
# 使用 nm 查看符号表
nm -D libjnicalculator.so | grep -i encrypt

# 或使用 readelf
readelf -s libjnicalculator.so | grep -i encrypt

# 或使用 objdump
objdump -T libjnicalculator.so | grep -i encrypt
```

### 2.4 方法四：使用 Frida 脚本

```javascript
// 在 fridac 中执行
var mod = Process.findModuleByName("libjnicalculator.so");
console.log("模块基址: " + mod.base);

mod.enumerateExports().forEach(function(exp) {
    if (exp.name.toLowerCase().indexOf("encrypt") >= 0) {
        var offset = exp.address.sub(mod.base);
        console.log(exp.name + " @ 0x" + offset.toString(16));
    }
});
```

---

## 3. 执行追踪

### 3.1 启动追踪

```bash
# 连接目标应用
fridac -p com.example.jnicalculator

# 执行 smalltrace 命令
fridac> smalltrace libjnicalculator.so 0x21244
```

输出：
```
🔬 Small-Trace SO 汇编追踪
   目标: libjnicalculator.so @ 0x21244
🔍 检查 Small-Trace 追踪库...
✅ Small-Trace 追踪库已就绪 (18MB)
🔓 关闭 SELinux...
✅ SELinux 已设为 Permissive
📜 注入追踪脚本...
✅ Small-Trace 已启动
   📦 目标应用: com.example.jnicalculator
   📁 输出文件: ~/Desktop/qbdi_trace_com_example_jnicalculator_20251224_142550.log
   触发目标函数后，使用 'smalltrace_pull' 拉取追踪日志
```

### 3.2 触发目标函数

在 APP 中执行加密操作（例如输入 "HelloWorld"，密钥 "1234qwer"）。

### 3.3 拉取追踪日志

```bash
fridac> smalltrace_pull
📥 拉取追踪日志
   📦 应用: com.example.jnicalculator
   📁 保存到: ~/Desktop/qbdi_trace_com_example_jnicalculator_20251224_142550.log
✅ 追踪日志已保存
   文件大小: 15MB, 行数: 384,970
```

### 3.4 分析追踪日志

```bash
fridac> smalltrace_analyze ~/Desktop/qbdi_trace_com_example_jnicalculator_20251224_142550.log
```

输出摘要：
```
╔════════════════════════════════════════════════════════════╗
║               QBDI Trace 分析报告                           ║
╚════════════════════════════════════════════════════════════╝

📋 基本信息:
   目标地址: 0x7dd0462244
   参数数量: 5
   执行结果: ✅ 成功
   返回值: 0x1 (1)

📊 统计信息:
   总行数: 384,970
   指令数: 59,930
   内存读: 26,625
   内存写: 9,465
   函数调用: 170

📈 指令类型 Top 10:
    1. ldr        11,735 ( 19.6%) ███░░░░░░░░░░░░░░░░░
    2. ldur        9,300 ( 15.5%) ███░░░░░░░░░░░░░░░░░
    3. add         9,205 ( 15.4%) ███░░░░░░░░░░░░░░░░░
    ...
```

---

## 4. Trace 文件格式解析

### 4.1 文件结构概览

```
[hook] target=0x... argc=...          ← 头部信息
====== ENTER 0x... ======             ← 函数入口
0x地址  偏移  汇编指令  ;寄存器变化     ← 指令记录
memory read/write at 0x...            ← 内存访问
 hexdump...                           ← 内存内容
====== LEAVE 0x... ======             ← 函数出口
[gqb] vm.call ok=1, ret=0x...         ← 执行结果
```

### 4.2 各部分详解

#### 4.2.1 头部信息

```
[hook] target=0x7dd0462244 argc=5
```

| 字段 | 说明 |
|------|------|
| `target` | 被追踪函数的绝对地址 |
| `argc` | 函数参数数量 |

#### 4.2.2 函数入口/出口

```
====== ENTER 0x7dd0462244 (global) ======
...
====== LEAVE 0x7dd0462244 ======
```

标记函数调用的开始和结束，嵌套调用会有多层 ENTER/LEAVE。

#### 4.2.3 指令记录

```
0x0000007dd04605e0    0x1f5e0    sub    sp, sp, #16    ;X8=0x140 -> 0x4b
│                     │          │                     │
│                     │          │                     └─ 寄存器变化
│                     │          └─ 汇编指令
│                     └─ 模块内偏移
└─ 绝对地址
```

**偏移的重要性**：`0x1f5e0` 对应 `transformChar` 函数入口，可以用来识别函数调用。

#### 4.2.4 内存访问

```
memory write at 0xb400007d6890ce9f, instruction address = 0x7dd04605e4, data size = 1, data value = 48
```

| 字段 | 说明 |
|------|------|
| `write/read` | 内存操作类型 |
| `at 0x...` | 访问的内存地址 |
| `instruction address` | 执行该操作的指令地址 |
| `data size` | 数据大小（字节） |
| `data value` | 写入/读取的值 |

#### 4.2.5 内存 Dump

```
*0000007d6890ce90  4B 00 00 00 00 00 00 00 48 00 00 00 00 4B 4B 48 |K       H    KKH|
 │                 │                                               │
 │                 │                                               └─ ASCII 显示
 │                 └─ 16 字节十六进制内容
 └─ 地址（* 标记当前访问位置）
```

#### 4.2.6 执行结果

```
[gqb] vm.call ok=1, ret=0x1
```

| 字段 | 说明 |
|------|------|
| `ok=1` | 执行成功 |
| `ret=0x1` | 返回值 |

---

## 5. 算法还原实战

### 5.1 源码参考

`transformChar` 函数源码 (`encrypto.cpp`):

```cpp
char transformChar(char c, char keyChar) {
    uint8_t k = (keyChar == 0) ? 1 : static_cast<uint8_t>(keyChar);
    
    int32_t val = static_cast<int32_t>(c);
    val = val + (k % 13);              // 步骤1: 加法
    val = val - ((k >> 2) & 0x0F);     // 步骤2: 减法
    val = val * ((k & 0x07) + 1);      // 步骤3: 乘法
    
    int32_t divisor = ((k >> 4) & 0x0F) + 1;
    val = val / divisor;               // 步骤4: 除法
    
    val = val ^ k;                     // 步骤5: 异或
    val = val & 0xFF;                  // 步骤6: 截断到字节
    
    return static_cast<char>(val);
}
```

### 5.2 从 Trace 还原过程

以 `transformChar('H', 'K')` 为例，追踪 trace 第 3420-3720 行：

#### 输入参数

```
行 3421-3422:
0x7dd04605e4  0x1f5e4  strb  w0, [sp, #15]    ; 写入 0x48 ('H')
memory write ... data value = 48

行 3431-3432:
0x7dd04605e8  0x1f5e8  strb  w1, [sp, #14]    ; 写入 0x4B ('K')
memory write ... data value = 4b
```

**识别**: `w0 = 0x48` (第一个参数 'H'), `w1 = 0x4B` (第二个参数 'K')

#### 步骤1: 加法 `val = val + (k % 13)`

```
行 3532-3536:
0x7dd0460620  0x1f620  mov   w11, #13         ; w11 = 13
0x7dd0460624  0x1f624  sdiv  w10, w9, w11     ; w10 = 0x4B / 13 = 5
0x7dd0460628  0x1f628  mul   w10, w10, w11    ; w10 = 5 * 13 = 0x41
0x7dd046062c  0x1f62c  subs  w9, w9, w10      ; w9 = 0x4B - 0x41 = 0x0A (k % 13)
0x7dd0460630  0x1f630  add   w8, w8, w9       ; w8 = 0x48 + 0x0A = 0x52
```

**计算**: `val = 0x48 + (0x4B % 13) = 0x48 + 0x0A = 0x52`

#### 步骤2: 减法 `val = val - ((k >> 2) & 0x0F)`

```
行 3567-3569:
0x7dd0460640  0x1f640  asr   w9, w9, #2       ; w9 = 0x4B >> 2 = 0x12
0x7dd0460644  0x1f644  and   w9, w9, #0xf     ; w9 = 0x12 & 0x0F = 0x02
0x7dd0460648  0x1f648  subs  w8, w8, w9       ; w8 = 0x52 - 0x02 = 0x50
```

**计算**: `val = 0x52 - ((0x4B >> 2) & 0x0F) = 0x52 - 0x02 = 0x50`

#### 步骤3: 乘法 `val = val * ((k & 0x07) + 1)`

```
行 3600-3602:
0x7dd0460658  0x1f658  and   w9, w9, #0x7     ; w9 = 0x4B & 0x07 = 0x03
0x7dd046065c  0x1f65c  add   w9, w9, #1       ; w9 = 0x03 + 1 = 0x04
0x7dd0460660  0x1f660  mul   w8, w8, w9       ; w8 = 0x50 * 0x04 = 0x140
```

**计算**: `val = 0x50 * ((0x4B & 0x07) + 1) = 0x50 * 0x04 = 0x140`

#### 步骤4: 除法 `val = val / (((k >> 4) & 0x0F) + 1)`

```
行 3623-3625, 3655:
0x7dd046066c  0x1f66c  asr   w8, w8, #4       ; w8 = 0x4B >> 4 = 0x04
0x7dd0460670  0x1f670  add   w8, w8, #1       ; w8 = 0x04 + 1 = 0x05 (divisor)
...
0x7dd0460680  0x1f680  sdiv  w8, w8, w9       ; w8 = 0x140 / 0x05 = 0x40
```

**计算**: `val = 0x140 / (((0x4B >> 4) & 0x0F) + 1) = 0x140 / 0x05 = 0x40`

#### 步骤5: 异或 `val = val ^ k`

```
行 3686:
0x7dd0460690  0x1f690  eor   w8, w8, w9       ; w8 = 0x40 ^ 0x4B = 0x0B
```

**计算**: `val = 0x40 ^ 0x4B = 0x0B`

#### 步骤6: 截断 `val = val & 0xFF`

```
行 3707:
0x7dd046069c  0x1f69c  and   w8, w8, #0xff    ; 保持 0x0B
```

**最终结果**: `0x0B`

### 5.3 完整算法还原

```
transformChar(c='H'=0x48, k='K'=0x4B):
  val = 0x48
  val = val + (0x4B % 13)           = 0x48 + 0x0A = 0x52
  val = val - ((0x4B >> 2) & 0x0F)  = 0x52 - 0x02 = 0x50
  val = val * ((0x4B & 0x07) + 1)   = 0x50 * 0x04 = 0x140
  val = val / (((0x4B >> 4) & 0x0F) + 1) = 0x140 / 0x05 = 0x40
  val = val ^ 0x4B                  = 0x40 ^ 0x4B = 0x0B
  return 0x0B
```

---

## 6. 验证还原结果

### 6.1 Python 实现验证

```python
def transform_char(c: int, key_char: int) -> int:
    """还原的 transformChar 算法"""
    k = key_char if key_char != 0 else 1
    
    val = c
    val = val + (k % 13)                    # 加法
    val = val - ((k >> 2) & 0x0F)           # 减法
    val = val * ((k & 0x07) + 1)            # 乘法
    val = val // (((k >> 4) & 0x0F) + 1)    # 除法
    val = val ^ k                           # 异或
    
    return val & 0xFF

# 验证
result = transform_char(0x48, 0x4B)  # 'H', 'K'
print(f"transformChar('H', 'K') = 0x{result:02x}")
# 输出: transformChar('H', 'K') = 0x0b  ✅
```

### 6.2 完整加密函数验证

```python
import hashlib

def transform_char(c: int, key_char: int) -> int:
    k = key_char if key_char != 0 else 1
    val = c
    val = val + (k % 13)
    val = val - ((k >> 2) & 0x0F)
    val = val * ((k & 0x07) + 1)
    val = val // (((k >> 4) & 0x0F) + 1)
    val = val ^ k
    return val & 0xFF

def encrypt_to_md5_hex(input_str: str, key: str) -> str:
    """还原的 encryptToMd5Hex 算法"""
    if not key:
        key = "default_key"
    
    # 步骤1: transformChar 变换每个字节
    transformed = bytes([
        transform_char(ord(c), ord(key[i % len(key)]))
        for i, c in enumerate(input_str)
    ])
    
    # 步骤2: MD5 哈希
    md5_hash = hashlib.md5(transformed).hexdigest()
    
    return md5_hash

# 测试
result = encrypt_to_md5_hex("HelloWorld", "1234qwer")
print(f"加密结果: {result}")
```

---

## 7. 常用分析技巧

### 7.1 快速定位关键函数

```bash
# 搜索特定偏移出现的位置
grep "0x1f5e0" trace.log | head -20

# 统计函数调用次数
grep -c "0x1f5e0.*sub.*sp" trace.log
```

### 7.2 提取内存访问模式

```bash
# 查看所有内存写入
grep "memory write" trace.log | head -50

# 查看特定地址的访问
grep "0x7d6890ce" trace.log
```

### 7.3 分析函数调用链

```bash
# 统计 ENTER/LEAVE 对
grep -E "ENTER|LEAVE" trace.log | head -30
```

### 7.4 提取算术运算

```bash
# 查找加法指令
grep -E "add\s+w[0-9]+" trace.log | head -20

# 查找乘法指令
grep -E "mul\s+w[0-9]+" trace.log | head -20

# 查找异或指令
grep -E "eor\s+w[0-9]+" trace.log | head -20
```

### 7.5 使用 fridac 内置分析器

```bash
fridac> smalltrace_analyze ~/Desktop/trace.log

# 分析结果包含:
# - 指令类型分布
# - 内存访问热点
# - 函数调用概览
```

---

## 附录

### A. 关键偏移对照表

| 偏移 | 函数名 | 说明 |
|------|--------|------|
| `0x21244` | `encryptToMd5Hex` | 主加密函数入口 |
| `0x1f5e0` | `transformChar` | 字节变换函数 |
| `0x1f6b0` | `MD5Init` | MD5 初始化 |
| `0x1f710` | `MD5Update` | MD5 更新 |
| `0x21004` | `MD5Final` | MD5 完成 |

### B. ARM64 常用指令速查

| 指令 | 说明 | 示例 |
|------|------|------|
| `add` | 加法 | `add w8, w8, w9` |
| `sub/subs` | 减法 | `subs w8, w8, w9` |
| `mul` | 乘法 | `mul w8, w8, w9` |
| `sdiv` | 有符号除法 | `sdiv w8, w8, w9` |
| `eor` | 异或 | `eor w8, w8, w9` |
| `and` | 与 | `and w8, w8, #0xff` |
| `orr` | 或 | `orr w8, w8, w9` |
| `lsr/asr` | 右移 | `asr w8, w8, #4` |
| `ldr` | 加载 | `ldr w8, [sp, #8]` |
| `str` | 存储 | `str w8, [sp, #8]` |
| `ldrb` | 加载字节 | `ldrb w8, [sp, #15]` |
| `strb` | 存储字节 | `strb w8, [sp, #15]` |

### C. 参考资料

- [QBDI 官方文档](https://qbdi.quarkslab.com/)
- [Small-Trace 项目](https://github.com/user-attachments/files/18245555/libqdbi.so.zip)
- [ARM64 指令集参考](https://developer.arm.com/documentation/ddi0596/latest)
- [fridac 项目](https://github.com/cxapython/fridac)

---

*文档生成时间: 2024-12-24*
*作者: fridac*

