## ADDED Requirements

### Requirement: 世界步长米制到 Ray Δt 换算

world-step 的 `minPrimaryStepMeters` / `maxPrimaryStepMeters` / `maxPrimaryRayDistanceMeters` SHALL 通过集中换算使用 `horizontalMetersPerWorldUnit` 与 `verticalMetersPerWorldUnit` 映射为沿当前射线的 render-space `Δt`。CPU 与 WGSL MUST NOT 混用未换算米值与 world unit；MUST NOT 假定水平与垂直缩放相同。

#### Scenario: 各向异性比例

- **WHEN** 水平与垂直 meters-per-world-unit 不同
- **THEN** 沿任意射线方向的步长换算 SHALL 使用该方向上的有效比例，不得只用水平或垂直单一比例

#### Scenario: 禁止混用单位

- **WHEN** world-step 启用
- **THEN** shader 主循环推进所用 `Δt` SHALL 来自已换算的 render-space 步长，MUST NOT 直接把米值当作 world-unit 步长
