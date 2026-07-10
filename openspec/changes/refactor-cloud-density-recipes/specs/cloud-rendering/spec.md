## ADDED Requirements

### Requirement: Recipe-aware Hybrid 微观细节

Hybrid 模式 SHALL 在缓存宏观/中尺度主体之上，根据缓存中的主导云属、次级云属与混合权重选择并混合有界的 Recipe 微观细节。实时细节 MUST 只在缓存基础密度高于有效阈值处渐入，MUST NOT 在空区生成密度。Stratiform MAY 不增加实时细节；Billow/Convective、Cellular 与 Fiber MAY 使用不同的预编译 detail operator。

#### Scenario: 不同拓扑使用不同细节

- **WHEN** Hybrid 分别渲染已迁移 cirrus 与 cumuliform 云体
- **THEN** cirrus MAY 使用纤维分叉/断续细节，cumuliform MAY 使用 Worley/curl 边缘细节，二者不得被迫使用同一全局 Perlin 作为唯一细节

#### Scenario: 空区不生云

- **WHEN** 缓存基础密度低于 Hybrid 有效阈值
- **THEN** Recipe detail SHALL 返回零增量或原密度，不得在缓存空体素中生成孤立云

#### Scenario: 主次云属平滑混合

- **WHEN** 两个使用不同 detail operator 的云属在空间中重叠
- **THEN** Hybrid SHALL 使用既有主/次云属和 `w2` 对细节参数或结果做有界混合，不得在云属边界产生明显硬切换

### Requirement: Recipe 重构保持缓存消费契约

Recipe 迁移 MUST 保持现有 RGBA 密度缓存协议、ping-pong 时间混合和统一 `densityAtTyped()` 入口。Cached 与 Hybrid SHALL 是性能和观感验收基线；Realtime SHALL 编译并保持同一基础 Recipe 语义，但不承担实时帧预算要求。

#### Scenario: 缓存格式不变

- **WHEN** 任一云属从 LegacyPuffy 迁移到新 Recipe
- **THEN** compute cache SHALL 继续写入密度、主云属、次云属和次云属权重，现有 lighting metadata 读取不需迁移

#### Scenario: 主光影统一取样

- **WHEN** 主 raymarch、light march 或地面云影采样已迁移 Recipe
- **THEN** 三者 SHALL 继续经统一密度入口获得同一基础形态与 Hybrid 细节语义

#### Scenario: Realtime 只作正确性路径

- **WHEN** Recipe 重构进行性能验收
- **THEN** Cached/Hybrid SHALL 记录帧成本预算；Realtime 只需无 WGSL 错误、数值安全且与同一 Recipe 语义一致，不要求达到实时目标

