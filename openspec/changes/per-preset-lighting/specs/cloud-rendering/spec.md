## ADDED Requirements

### Requirement: 密度缓存附带主导云属索引
密度求值 SHALL 在对多云体求和密度时，记录贡献密度最大的云体的预设索引（主导云属），并随密度一起提供给着色：cached 模式 SHALL 把主导云属索引写入密度缓存的空闲通道；realtime 模式 SHALL 在每步求密度时一并产出该索引。密度 `r` 通道的数值 MUST NOT 因此改变，使 cached 模式密度保持像素级一致。统一取样分发入口 SHALL 同时返回密度与主导云属索引，供主 raymarch 着色按云属调制。

#### Scenario: 缓存写入主导索引
- **WHEN** 密度 compute pass 写入某体素
- **THEN** 该体素 SHALL 在密度之外附带贡献最大云体的预设索引，且密度 `r` 通道值与未引入索引前一致

#### Scenario: 取样返回云属索引
- **WHEN** 着色器经统一分发入口取密度
- **THEN** 入口 SHALL 同时返回该样本的主导云属索引

#### Scenario: realtime 模式产出索引
- **WHEN** 质量模式为 realtime
- **THEN** 每步直接求密度时 SHALL 一并确定主导云属索引，无需读缓存
