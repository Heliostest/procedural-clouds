## ADDED Requirements

### Requirement: 版本化十属参考表
系统 SHALL 提供 `temperate-demo-v1` genus profile set，为每个 `CLOUD_TYPES` 键给出 `recommendedBaseRangeM`、`defaultBaseM`、`defaultThicknessM`、`defaultHorizontalHalfExtentM` 与 `sourceNote`。profile set SHALL 声明 `datum="scene-ground"`，并明确推荐层级范围与项目艺术默认值不是通用 WMO 固定海拔。

#### Scenario: 十属均有完整 profile
- **WHEN** 遍历任一 `CLOUD_TYPES` 键
- **THEN** SHALL 返回同一 profile set 中的完整且有限数值条目

#### Scenario: 高云与低云默认位置可区分
- **WHEN** 比较 `cirrus` 与 `cumulus` 默认 profile
- **THEN** `cirrus.defaultBaseM` SHALL 高于 `cumulus.defaultBaseM + cumulus.defaultThicknessM`

### Requirement: 默认 placement 与锁定策略
新增云体 SHALL 使用其 genus profile 的默认 placement。换属 SHALL 经过集中 `BodyStore.setType()` 或等价单一入口：`placementLocked=false` 时应用目标 profile 的 base、thickness 与水平半宽；`placementLocked=true` 时只修改 genus 并保留 placement。GUI MUST NOT 直接写 `body.type` 绕过该入口。

#### Scenario: 未锁定换属应用默认位置
- **WHEN** 用户将未锁定的 cumulus 云体切换为 cirrus
- **THEN** 云体 placement SHALL 更新为 cirrus profile 默认值

#### Scenario: 已锁定换属保留位置
- **WHEN** 用户手动编辑 placement 后将已锁定云体切换 genus
- **THEN** genus SHALL 更新而 base/thickness/bounds SHALL 保持不变

#### Scenario: 显式恢复云属默认位置
- **WHEN** 用户执行“应用云属默认位置”
- **THEN** placement SHALL 重置为当前 genus profile 默认值并解除旧手动 placement 的影响

### Requirement: CPU 物理约束模式
系统 SHALL 提供 `enforcePhysicalPlacement`，默认 false。关闭时 SHALL 接受合法有限 placement 并仅可显示警告；开启时 SHALL 在 CPU 将 base clamp 到当前 profile 的 `recommendedBaseRangeM`，保证 thickness 为正且 `base+thickness<=cloudHeight`。默认 thickness MUST NOT 被当作气象硬上限。

#### Scenario: 约束关闭允许艺术摆放
- **WHEN** `enforcePhysicalPlacement=false` 且将 cirrus 放在 `base=100`
- **THEN** 系统 SHALL 保留该值并可显示越界警告

#### Scenario: 约束开启 clamp 云底
- **WHEN** `enforcePhysicalPlacement=true` 且将 cirrus 放在 `base=100`
- **THEN** 系统 SHALL 将 base clamp 到 cirrus 推荐范围下限

#### Scenario: 实例顶部不超过场景层顶
- **WHEN** enforcement 开启且 `base+thickness` 超过 `cloudHeight`
- **THEN** 系统 SHALL 缩减有效 thickness 使顶部不超过场景层顶

