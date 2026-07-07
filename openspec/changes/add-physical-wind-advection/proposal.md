# Change: 建立米制风与连续平流契约

## Why

当前 `CloudBody.windSpeed` 直接以 render world units/second 参与 `wind.dir * wind.speed * sceneTime`。在默认 `horizontalMetersPerWorldUnit=1000` 时，示例值 `0.15`、`0.3`、`0.6` 分别等价于 150、300、600 m/s，但 UI、scenario 与文档均未声明单位；只把标签改成 m/s 会让同一数值的画面速度缩小 1000 倍，也会错误解释既有 JSON。

当前公式还隐含一个连续性问题：运行中改变风向或风速会用新速度重新乘全部历史时间，使密度采样相位瞬移；scenario scrub 的结果虽可重复，却不是速度随时间积分得到的位移。因此本变更建立一个可独立验收的 P1 风运动学层：CPU 使用 m/s 和秒累计水平位移，GPU 只消费换算后的平流偏移。

## What Changes

- **BREAKING（内部数据契约）— 米制风速**：运行时字段从单位不明的 `windSpeed` 迁移为 `windSpeedMps`；风向明确表示云密度移动的“去向”，0°=`+X`、90°=`+Z`（从 `+Y` 俯视顺时针）。
- **连续累计平流**：不再在 shader 中以“当前速度 × 从零开始的总时间”重算位置。CPU 以 `offsetM += velocityMps * deltaSceneSeconds` 累计手动模式位移；scenario 以 `offsetM(t)=∫velocityMps(t)dt` 求任意播放头位置。
- **确定性 scenario**：风关键帧先转为水平速度向量再插值和积分，使播放、暂停、跳转与来回 scrub 在同一时刻得到相同偏移，并避免跨 0°/360° 的角度插值歧义。
- **世界坐标运输语义**：`CloudBody.bounds/feather` 保留作者定义的初始 placement，累计风位移作为运行时 transport offset 同时移动云体足迹、程序化密度、实体调试体、线框与 gizmo；不逐帧改写原始 placement 数据。
- **显式 scenario 单位**：新版 JSON 输出 `schemaVersion: 3`、`distanceUnit: "m"`、`windUnit: "m/s"`。v2 与无版本 JSON 的风速按 legacy world-units/second 读取，并乘 `horizontalMetersPerWorldUnit` 迁移，保持旧画面运动速度。
- **GPU 边界单次换算**：累计位移在 CPU 中以米保存，pack 时除以 `horizontalMetersPerWorldUnit`；`BodyGPU` 接收 render-world 平流偏移，shader 不再解释 m/s 或重复缩放。
- **合理的新默认值**：内置 demo 和新建云体改用明确、温和的演示风速；legacy 场景为保持画面不自动 clamp，只在异常高的迁移值上给出提示。
- **质量模式一致性**：cached、hybrid、realtime 使用同一物理偏移；cache 快照与混合时间必须与该偏移对应，风参数变化不得导致回跳或明显 ghosting。
- **默认场景可观察性**：默认开启坐标轴，并让默认云体携带非零 m/s 风，启动后可直接观察云体沿世界 XZ 坐标运输。

## Non-Goals

- 垂直风、上升气流、湍流、阵风谱、连续三维风场或数值天气模拟。
- 随高度连续变化的风切变；现有每云体独立风仅作为离散层/局部控制。
- 修改作者保存的 `CloudBody.bounds` 或相机位置；世界运输通过独立累计 offset 表达，重置 offset 可回到初始 placement。
- 根据云属推断“真实风速”；风是环境量，不是 genus 的固有属性。
- 借本变更重写生命周期、云属形态、降水或大气散射。

## Capabilities

### Modified Capabilities

- `cloud-wind`：将单位不明、按总时间重算的平流改为米制速度积分、明确方向/控制范围语义，并定义长时间和质量模式行为。
- `cloud-body`：风速字段改为 `windSpeedMps`；作者 placement 保持不变，渲染位置叠加运行时世界运输 offset。
- `cloud-params`：CPU/GPU 风 payload 改为累计物理位移在 pack 边界的一次换算。
- `cloud-scenario`：升级 v3 `windUnit` 契约、旧风速迁移和确定性累计位移采样。
- `cloud-weather`：每体天气图层随对应云体 transport offset 在世界 XZ 中移动，作者纹理数据本身不逐帧重绘。

## Prerequisites

- `physical-credibility` 已归档并提供米制场景空间与 `horizontalMetersPerWorldUnit`。
- `per-preset-lighting` 保持当前冻结状态；实现若同时触碰 `params.ts`/`cloud.wgsl`，必须基于其现有 buffer 布局顺序合并，不能覆盖 active change 的字段。

## Impact

- **代码**：`src/body.ts`、新增 `src/wind.ts`、`src/scenario.ts`、`src/params.ts`、`src/main.ts`、`src/gui.ts`、`src/i18n.ts`、`src/physicalVerification.ts`、`shaders/cloud.wgsl`
- **文档**：`docs/glossary.md`、`README.md`，补充方向约定、单位、世界运输与 legacy 迁移说明
- **JSON**：serializer 从 v2 升级到 v3；loader 继续接受 v2 和无版本格式
- **默认观感**：新建/内置场景的漂移速度会比 legacy 示例慢；旧 JSON 通过数值迁移保持原画面速度
- **回退**：保留 v2/legacy loader；重置平流相位可将所有云体返回作者 placement
