# fridac 预置二进制文件

本目录存放预置的二进制文件，程序**优先使用本地文件**，不存在时才从网络下载。

> ⚠️ 这些文件较大（约 20MB+），不包含在 Git 仓库中。请按以下说明手动下载。

## 目录结构

```
binaries/
├── README.md
├── arm64/
│   ├── frida-server-16.0.11    # ARM64 frida-server (~40MB)
│   └── libqdbi.so              # Small-Trace 追踪库 (~18MB)
├── arm/
│   └── frida-server-16.0.11    # ARM32 frida-server
├── x86_64/
│   └── frida-server-16.0.11    # x86_64 frida-server
└── x86/
    └── frida-server-16.0.11    # x86 frida-server
```

## 快速下载 (ARM64)

### 方法一：一键脚本

```bash
cd fridac/binaries

# 下载 frida-server 16.0.11 (ARM64)
curl -L -o arm64/frida-server-16.0.11.xz \
  "https://github.com/frida/frida/releases/download/16.0.11/frida-server-16.0.11-android-arm64.xz"
xz -d arm64/frida-server-16.0.11.xz
chmod +x arm64/frida-server-16.0.11

# 下载 libqdbi.so (从 fridac releases)
curl -L -o arm64/libqdbi.so \
  "https://github.com/cxapython/fridac/releases/download/v1.0.0/libqdbi.so"

echo "✅ 下载完成!"
ls -lh arm64/
```

### 方法二：从设备拉取 (如果设备上已有)

```bash
# 拉取 frida-server
adb pull /data/local/tmp/fs16011 binaries/arm64/frida-server-16.0.11

# 拉取 libqdbi.so
adb pull /data/local/tmp/libqdbi.so binaries/arm64/libqdbi.so
```

### 方法三：手动下载

1. **frida-server**: 
   - 访问: https://github.com/frida/frida/releases/tag/16.0.11
   - 下载: `frida-server-16.0.11-android-arm64.xz`
   - 解压后放到: `binaries/arm64/frida-server-16.0.11`

2. **libqdbi.so**: 
   - 访问: https://github.com/cxapython/fridac/releases
   - 下载: `libqdbi.so`
   - 放到: `binaries/arm64/libqdbi.so`

## 文件说明

### frida-server

| 属性 | 值 |
|------|-----|
| **版本** | 16.0.11 (与 Python frida 客户端匹配) |
| **下载地址** | https://github.com/frida/frida/releases/tag/16.0.11 |
| **命名格式** | `frida-server-{version}` 或 `fs{version_no_dots}` |
| **文件大小** | ~40MB (未压缩) |

### libqdbi.so

| 属性 | 值 |
|------|-----|
| **来源** | Small-Trace 项目 |
| **功能** | QBDI 汇编追踪库 |
| **架构** | 仅支持 ARM64 |
| **文件大小** | ~18MB |
| **GitHub** | https://github.com/NiTianErXing666/Small-Trace |

## 使用逻辑

程序启动时按以下优先级查找文件：

```
1. 本地预置文件 (binaries/{arch}/...)
   ↓ 不存在
2. 设备已有文件 (/data/local/tmp/...)
   ↓ 不存在
3. 从网络下载 (GitHub)
```

### frida-server 查找路径
- `binaries/{arch}/frida-server-{version}`
- `binaries/{arch}/frida-server-{version}-android-{arch}`
- `binaries/{arch}/fs{version_no_dots}`

### libqdbi.so 查找路径
- `binaries/arm64/libqdbi.so`

## 验证文件

```bash
# 检查文件大小
ls -lh binaries/arm64/

# 预期输出:
# -rwxr-xr-x  frida-server-16.0.11  ~40M
# -rw-r--r--  libqdbi.so            ~18M
```

