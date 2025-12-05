# fridac 早期 Hook 指南

## 问题背景

某些关键函数（如 `RegisterNatives`）在应用启动极早期调用，传统 attach 模式会错过。

## 解决方案

使用 spawn 模式 + `--hook` 参数在启动瞬间设置 hook。

## 使用方式

### 单个 Hook
```bash
fridac -f com.app --hook traceRegisterNatives
fridac -f com.app --hook hookbase64 --hook-args true
```

### 预设套件
```bash
# JNI 分析
fridac -f com.app --preset jni_analysis

# 加密分析
fridac -f com.app --preset crypto_analysis

# 网络分析
fridac -f com.app --preset network_analysis

# 反调试
fridac -f com.app --preset anti_debug
```

### 输出重定向
```bash
fridac -f com.app --hook traceRegisterNatives -o hooks.log
fridac -f com.app --preset jni_analysis -o analysis.log --append
```

## 自定义预设

编辑 `early_hooks.json`:

```json
{
  "presets": {
    "my_preset": {
      "description": "我的分析套件",
      "hooks": [
        {"function": "traceRegisterNatives", "args": []},
        {"function": "hookbase64", "args": [true]}
      ]
    }
  }
}
```

使用：
```bash
fridac -f com.app --preset my_preset
```

## 注意事项

- 仅限 spawn 模式 (`-f` 参数)
- 需要 root 权限
- 某些 Hook 输出量大，建议用 `-o` 保存
