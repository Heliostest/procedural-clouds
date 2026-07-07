## MODIFIED Requirements

### Requirement: 场景数据模型

系统 SHALL 提供 `Scenario` 数据模型，包含 `schemaVersion`、`distanceUnit`、`windUnit`、`duration`、可选顶层 `wind`、`bodies`（id → 云体定义：米制横向 `shape`/`bounds`/`feather`、米制垂直 `base`/`thickness`、`type`）与 `events`（关键帧数组，每条含 `t`、`bodyId`，可选 `coverage`/`densityScale`/`type`/`base`/`thickness`/`windDeg`/`windSpeed`/`ease`）。v3 中 `wind.speed` 与 event `windSpeed` SHALL 按 m/s 解释。系统 SHALL 提供 JSON 解析与导出，解析 MUST 校验必填字段、版本和单位，并对事件按时间排序、补默认 `ease`。解析 SHALL 向后兼容 v2 与无版本 `regions`/`regionId` 数据，并迁移为 v3 米制距离与风速模型。

#### Scenario: 解析合法场景 JSON

- **WHEN** 加载一份含 `schemaVersion: 3`、`distanceUnit: "m"`、`windUnit: "m/s"`、duration/bodies/events 的合法 JSON
- **THEN** 系统 SHALL 构造可播放的 v3 `Scenario`，事件按 `t` 升序、缺省 `ease` 补为默认值

#### Scenario: 导出可往返

- **WHEN** 将一个 `Scenario` 导出为 v3 JSON 再重新加载
- **THEN** 加载所得场景 SHALL 与原场景在播放、物理风和 render-world placement 上一致

#### Scenario: 非法 JSON 不崩溃

- **WHEN** 加载缺少必填字段、未知单位、负/非有限风速或格式错误的 JSON
- **THEN** 系统 SHALL 保留当前场景并报告错误，不中断渲染

#### Scenario: 兼容旧版 regions

- **WHEN** 加载旧版含 `regions`/`regionId` 的无版本场景 JSON
- **THEN** 系统 SHALL 将其映射为 `bodies`/`bodyId`，迁移 legacy 距离与风速并正常播放

### Requirement: 场景播放器插值

`ScenarioPlayer` SHALL 按给定 `sceneTime` 为每个云体在相邻事件关键帧间插值其可变字段（`coverage`/`densityScale`，以及可选 `base`/`thickness`，按 `ease` 取 linear 或 smoothstep），`type` 取前一关键帧离散值。风关键帧 SHALL 先由 `windDeg`/`windSpeed` 转为 XZ m/s 速度向量，再按 ease 插值并对时间积分，输出该时刻的物理风与累计 `advectionOffsetM`。首个事件前 SHALL 采用首帧值，末个事件后 SHALL 采用末帧值。

#### Scenario: 关键帧间插值

- **WHEN** `sceneTime` 落在某云体两个事件之间且 `ease=smooth`
- **THEN** 普通可变字段与风速度向量 SHALL 为两关键帧间的平滑插值，而非突变

#### Scenario: 风方向跨零度

- **WHEN** 相邻风关键帧从 350° 过渡到 10°且速度均为正
- **THEN** 插值速度 SHALL 经过接近 0° 的方向，不得沿 180° 长路径旋转

#### Scenario: 同一时刻累计位移确定

- **WHEN** 通过顺序播放、直接跳转或来回 scrub 采样同一 `sceneTime`
- **THEN** 播放器输出的 `advectionOffsetM` SHALL 相同

#### Scenario: 末帧后保持末态

- **WHEN** `sceneTime` 超过某云体最后一个事件的 `t`
- **THEN** 该云体普通字段 SHALL 保持末帧值，风 SHALL 以末帧速度继续累计至场景 duration

### Requirement: Scenario v3 显式单位

新版 scenario SHALL 输出 `schemaVersion: 3`、`distanceUnit: "m"` 与 `windUnit: "m/s"`。v3 中 body 的 `bounds`、`feather`、`base`、`thickness` 以及 event 的 `base`、`thickness` SHALL 按米解释；顶层 `wind.speed` 与 event `windSpeed` SHALL 按 m/s 解释。serializer SHALL 只输出该显式格式，不得生成单位不明的新 JSON。

#### Scenario: v3 米制解析

- **WHEN** 加载 v3 场景，其中 body `base=7000`、wind `speed=20`
- **THEN** 播放器 SHALL 将其解释为场景地面基准上方 7000 m 与 20 m/s 水平风速

#### Scenario: v3 导出声明单位

- **WHEN** 导出当前场景
- **THEN** JSON SHALL 包含 `schemaVersion: 3`、`distanceUnit: "m"` 与 `windUnit: "m/s"`

### Requirement: Legacy world-unit 迁移

v2 与缺少 `schemaVersion` 的 scenario 风字段 SHALL 视为 legacy world-units/second；loader SHALL 将顶层 `wind.speed` 与 event `windSpeed` 乘加载时的 `horizontalMetersPerWorldUnit` 得到 m/s。缺少版本的场景距离仍按既有规则迁移：body 与 event 的 Y 距离乘 `verticalMetersPerWorldUnit`，body 的 XZ 距离与 `feather` 乘 `horizontalMetersPerWorldUnit`。迁移后的 v3 场景重新加载时 SHALL 保持原 render-world placement 与 world-space 平流速度。

#### Scenario: 旧场景位置保持

- **WHEN** 默认比例为 1000 且旧场景 body `base=3.2`、`thickness=1.6`
- **THEN** loader SHALL 得到 `base=3200 m`、`thickness=1600 m`，GPU 映射后仍为 3.2 与 1.6 world units

#### Scenario: v2 风速保持画面速度

- **WHEN** `horizontalMetersPerWorldUnit=1000` 且 v2 `wind.speed=0.15`
- **THEN** loader SHALL 得到 150 m/s，GPU 平流速度仍为 0.15 world-unit/s

#### Scenario: Legacy 往返稳定

- **WHEN** legacy 场景被加载、导出为 v3 并重新加载
- **THEN** 所有 body/event 的 render-world placement、物理风与 world-space 平流速度 SHALL 与首次迁移一致

## RENAMED Requirements

- FROM: `### Requirement: Scenario v2 距离单位`
- TO: `### Requirement: Scenario v3 显式单位`
