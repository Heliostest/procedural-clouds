# 云体类型与演化规律评估

## 结论

10 种云属（genus）已齐全——预设正好覆盖 WMO 标准的全部十属。缺的不是云属本身，而是 **①云的种/形态变型 ②高度分层 ③演化转化链**。

---

## 一、类型覆盖：10 属齐全，但缺“种/变型”

| 云族 | 已有 | 现实高度 |
|---|---|---|
| 高云 | cirrus / cirrostratus / cirrocumulus | 5–13 km |
| 中云 | altocumulus / altostratus / nimbostratus | 2–7 km |
| 低云 | stratus / stratocumulus / cumulus | <2 km |
| 直展 | cumulonimbus | 底低顶高 |

真正缺的是“种(species)与形态特征”，它们对真实感影响很大：

- **积云的发育阶段**：humilis（淡积云）→ mediocris（中积云）→ congestus（浓积云）。现在只有一个 `cumulus`，无法表现“越长越高”的过程。
- **积雨云的砧状顶（incus / anvil）**：现实 Cb 顶部被高空风拉成平铺铁砧，现在 Cb 只是“更高的一坨”，没有砧顶形态。
- **变型缺失**：荚状云 lenticularis（山岳波，透镜状）、乳状云 mammatus、破片云 fractus/pannus、堡状/絮状等完全没有。
- **附属现象**：雨幡 virga、降水拖尾、凝结尾 contrail、雾等（可选）。

---

## 二、高度分层缺失（最大的“不真实”）

现实中云属几乎是由高度定义的（卷云一定在高空，层云一定在低空）。但当前预设里：

- `altBase` / `altTop` / `cloudHeight` 三个字段保留未接入渲染（实际竖直区间由云体的 `Height + Thickness` 决定）；
- 所以一朵 `cirrus` 和一朵 `cumulus` 可以被放在同一高度，genus 不会强制自己的自然高度带。

**建议**：把每个 genus 绑定真实高度带（让 `altBase/altTop` 真正生效），新建该类型云体时自动套用，避免出现“贴地的卷云 / 高空的层云”这种物理矛盾。

---

## 三、演化规律与现实的差距

### 1. 缺少物理转化链（最关键）

现实云沿固定路径演化：

- **对流序列**：Cu → 浓积云 → Cb →（崩解后）残留 Sc / 高空 Ci 砧；
- **暖锋序列**：Ci → Cs → As → Ns（系统性增厚 + 下沉 + 降水）；
- **昼夜**：Sc ↔ St 的日变化。

而现在 `scenario.ts` 里换类型是离散突变——`sampleType` 只取“时间 ≤ t 的最近一个 type 关键帧”，genus 之间没有形态的连续过渡：

```ts
function sampleType(events: ScenarioEvent[], t: number, fallback: string): string {
  let type = fallback;
  for (const e of events) {
    if (e.type !== undefined && e.t <= t) type = e.type;
  }
  ...
}
```

即“积云一瞬间变成积雨云”，而不是逐渐隆起。

### 2. 生命周期是对称钟形，现实多为不对称

`lifecycle.ts` 的包络用对称 `smoothstep`，生长和消散速率一样：

```ts
export function evalEnvelope(env: LifecycleEnvelope, t: number): number {
  if (t < env.birth || t >= env.death) return 0;
  if (t < env.grow) return smoothstep(env.birth, env.grow, t);
  if (t < env.decay) return 1;
  return 1 - smoothstep(env.decay, env.death, t);
}
```

但现实里：积云快速隆起、缓慢消散（或受热爆发性发展）；Cb 发展更突然。缺少“生长曲线形状”这一控制。

### 3. 缺少形态随演化改变

真实云在生命周期中形状本身在变（淡积云逐渐鼓成浓积云、Cb 拉出砧顶、Ns 越压越低）。现在 `morph` 只通过 `worleyBlend` 做轻微侵蚀，没有“竖直发展 / 顶部铺开 / 整体下沉”这类与高度耦合的演化。

### 4. 缺少环境驱动

没有日变化（午后对流）、风切变导致的倾斜、上升气流强度等物理量，演化完全靠手动关键帧。

---

## 优先改进建议（按性价比）

1. **给 genus 绑定真实高度带**（启用 `altBase/altTop`）——成本低、真实感提升最大，也顺便明确 altitude 语义。
2. **增加积云发育阶段**（humilis/congestus）+ **Cb 砧顶形态**。
3. **把 scenario 的 type 突变改成可插值的“形态过渡”**，并内置两条标准演化链（对流链 / 暖锋链）作为预设剧本。
4. **生命周期支持不对称曲线**（独立的生长/消散缓动）。
