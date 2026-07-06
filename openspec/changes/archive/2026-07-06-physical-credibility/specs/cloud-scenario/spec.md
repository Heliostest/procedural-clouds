## ADDED Requirements

### Requirement: Scenario v2 距离单位
新版 scenario SHALL 输出 `schemaVersion: 2` 与 `distanceUnit: "m"`。v2 中 body 的 `bounds`、`feather`、`base`、`thickness` 以及 event 的 `base`、`thickness` SHALL 按米解释。serializer SHALL 只输出该显式格式，不得生成单位不明的新 JSON。

#### Scenario: v2 米制解析
- **WHEN** 加载 `schemaVersion=2`、`distanceUnit="m"` 且 body `base=7000` 的场景
- **THEN** 播放器 SHALL 将其解释为场景地面基准上方 7000 m

#### Scenario: v2 导出声明单位
- **WHEN** 导出当前场景
- **THEN** JSON SHALL 包含 `schemaVersion: 2` 与 `distanceUnit: "m"`

### Requirement: Legacy world-unit 迁移
缺少 `schemaVersion` 的 scenario SHALL 视为 legacy world units。loader SHALL 将 body 与 event 的 Y 距离乘 `verticalMetersPerWorldUnit`，将 body 的 XZ 距离与 `feather` 乘 `horizontalMetersPerWorldUnit`；转换后的 v2 场景重新加载时 SHALL 产生相同的 render-world placement。风字段 SHALL 保持既有 legacy 语义，本变更不得将其隐式解释为 m/s。

#### Scenario: 旧场景位置保持
- **WHEN** 默认比例为 1000 且旧场景 body `base=3.2`、`thickness=1.6`
- **THEN** loader SHALL 得到 `base=3200 m`、`thickness=1600 m`，GPU 映射后仍为 3.2 与 1.6 world units

#### Scenario: Legacy 往返稳定
- **WHEN** legacy 场景被加载、导出为 v2 并重新加载
- **THEN** 所有 body 与 event 的 render-world bounds/base/thickness/feather SHALL 与首次加载一致

## MODIFIED Requirements

### Requirement: 场景数据模型
系统 SHALL 提供 `Scenario` 数据模型，包含 `schemaVersion`、`distanceUnit`、`duration`、可选 `wind`、`bodies`（id → 云体定义：米制横向 `shape`/`bounds`/`feather`、米制垂直 `base`/`thickness`、`type`）与 `events`（关键帧数组，每条含 `t`、`bodyId`，可选 `coverage`/`densityScale`/`type`/`base`/`thickness`/`windDeg`/`windSpeed`/`ease`）。系统 SHALL 提供 JSON 解析与导出，解析 MUST 校验必填字段、版本和单位，并对事件按时间排序、补默认 `ease`。解析 SHALL 向后兼容旧版 `regions`/`regionId` 与无版本 world-unit 数据，并迁移为 v2 米制模型。

#### Scenario: 解析合法场景 JSON
- **WHEN** 加载一份含版本、单位、duration/bodies/events 的合法 v2 JSON
- **THEN** 系统 SHALL 构造可播放的米制 `Scenario`，事件按 `t` 升序、缺省 `ease` 补为默认值

#### Scenario: 导出可往返
- **WHEN** 将一个 `Scenario` 导出为 v2 JSON 再重新加载
- **THEN** 加载所得场景 SHALL 与原场景在播放和 render-world placement 上一致

#### Scenario: 非法 JSON 不崩溃
- **WHEN** 加载缺少必填字段、未知单位或格式错误的 JSON
- **THEN** 系统 SHALL 保留当前场景并报告错误，不中断渲染

#### Scenario: 兼容旧版 regions
- **WHEN** 加载旧版含 `regions`/`regionId` 的无版本场景 JSON
- **THEN** 系统 SHALL 将其映射为 `bodies`/`bodyId`，按 legacy 比例迁移距离并正常播放
