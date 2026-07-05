## ADDED Requirements

### Requirement: 独立的边缘渲染参数域
系统 SHALL 为每个云属预设提供独立于云属形态的 edge-style 参数，至少包含 `edgeHardness` 与 `edgeErosionStrength`。系统 SHALL 同时提供全局 `edgeSharpening` 总开关和 `edgeHardnessThreshold`。edge-style 参数 MUST 只作用于取得原始密度后的统一取样入口，不得参与云体足迹、垂直包络、砧顶或云底曲线计算。

#### Scenario: 关闭边缘锐化不撤销积雨云结构
- **WHEN** cumulonimbus 使用非零砧顶形态参数且用户关闭 `edgeSharpening`
- **THEN** 系统 SHALL 保留砧顶足迹与顶部轮廓，只恢复柔和的后置密度响应

#### Scenario: 硬化非砧状轮廓
- **WHEN** 云属的砧顶和顶部截断形态参数为 0 且 edge-style 硬度大于 0
- **THEN** 系统 SHALL 只硬化当前原始密度的边缘，不得凭空生成砧顶或改变云底曲线

#### Scenario: 混合云属使用各自边缘风格
- **WHEN** 同一场景样本由不同主导云属提供密度
- **THEN** 统一取样入口 SHALL 使用相应云属的 edge-style 默认值，但形态生成 SHALL 不读取这些值

### Requirement: 单调后置密度传递
对 `edgeHardness` 大于零的样本，系统 SHALL 在 raymarch 统一取样入口围绕 `edgeHardnessThreshold` 执行随硬度收窄的单调密度传递。主 raymarch、光照行进与地面云影 MUST 经同一取样入口取得一致结果。关闭 `edgeSharpening` 时 MUST 原样返回形态阶段提供的密度。

#### Scenario: 提高边缘硬度
- **WHEN** 用户提高某云属 edge-style 的 `edgeHardness`
- **THEN** 该云属密度阈值的传递窗口 SHALL 收窄，且宏观足迹和垂直包络 SHALL 保持不变

#### Scenario: 关闭总开关
- **WHEN** 用户关闭 `edgeSharpening`
- **THEN** cached、hybrid、realtime 的统一取样入口 SHALL 跳过后置传递，无需重载页面或重建密度缓存

#### Scenario: 最大值保守性
- **WHEN** 对缓存密度最大值应用同一传递函数
- **THEN** 单调传递 SHALL 保持最大值的保守性，不得把空区映射为非零密度

### Requirement: 可独立调节的边缘带解析侵蚀
系统 SHALL 使用 `edgeErosionStrength` 独立控制阈值窄带内由 Curl 域扭曲的 3D Worley 信号产生的解析侵蚀。侵蚀 MUST 在 raymarch 取样时计算而不写回密度缓存，MUST 只减少密度，且不得改变云属形态参数或宏观轮廓构造。

#### Scenario: 侵蚀强度为零
- **WHEN** `edgeErosionStrength` 为 0、`edgeSharpening` 关闭或样本远离阈值窄带
- **THEN** 系统 SHALL 跳过 Worley/Curl 边缘侵蚀计算

#### Scenario: 侵蚀不凭空造云
- **WHEN** 解析侵蚀作用于任意样本
- **THEN** 输出密度 SHALL 小于等于输入密度且不小于 0

#### Scenario: 缓存保持形态原始密度
- **WHEN** 密度 compute pass 写入缓存
- **THEN** 缓存 SHALL 保存形态阶段的未侵蚀密度，edge-style 调整 SHALL 不触发缓存内容变化
