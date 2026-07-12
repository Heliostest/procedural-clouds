## 0. Approval and baseline gate

- [x] 0.1 用户批准本 proposal、design、`density-recipe-schema` 新 spec 与 `density-cache-production` delta（2026-07-12）
- [x] 0.2 记录 W1 基线 `9aa8f60`、W2 基线 `3e5fd15`，并确认工作区不存在与 V2 layout/Producer 重叠的未提交修改
- [x] 0.3 记录 W0 只有人工视觉签核、无定量 GPU timing；W3 不作性能加速声明
- [x] 0.4 确认 W3 不实现 W4 tile mask、W5 atlas/macro fields、W6 云属密度算子或 Legacy 删除

## 1. V2 contracts and canonical layout

- [x] 1.1 扩展 Producer candidate/lifecycle/selection contract，加入 idle/creating/warming/ready/failed 与 selector `activeGeneration`；保持 `densityProducerMode` 数值不变；单独提交
- [x] 1.2 建立 `DensityFrameGPU=64B`、`DensityBodyGPU=128B`、`DensityRecipeGPU=256B` 的集中 layout descriptor、version、offset、stride 和 enum 定义；不修改 Legacy `PARAM_OFFSETS/BODY_BASE`
- [x] 1.3 实现基于同一 descriptor 的 CPU `ArrayBuffer` packer 与 WGSL struct/prefix 生成或逐字段机器对照；浮点、u32、alignment、reserved-zero 和 byte-size 失败必须有限报错；单独提交
- [x] 1.4 增加 `test:density-v2-layout` 静态检查，覆盖 CPU/WGSL field 顺序、stride、minBindingSize、MAX_BODIES=12、Recipe count=10 与 layout version

## 2. Orthogonal profiles and static ten-genus table

- [x] 2.1 定义 CPU `GenusRecipeDescriptor`，分别引用 placement、density recipe 与 optical profile identity；三套 payload 不合并
- [x] 2.2 建立十属完整静态表与稳定 genus/recipe ID；W3 所有 Recipe `enabled=0`，参数有限且 reserved lane 为零
- [x] 2.3 为 topology/profile 模式和 `maxBaseSamples/maxDetailSamples/maxOctaves` 建立有界枚举/上限；W3 上限为零，不允许变长 operator list、bytecode 或 interpreter
- [x] 2.4 增加 no-cloud、single-body、multi-body、invalid-genus packing fixtures；无效 genus 必须禁用 body 且不越界；单独提交

## 3. Dedicated empty-density shader and pipeline

- [ ] 3.1 新增 V2 专用 WGSL source，只包含 generated V2 ABI、gid bounds check 与一次 `textureStore(vec4f(0))`
- [ ] 3.2 建立显式 group 0（Frame/Body/Recipe）与 group 1（storage output）bind-group layouts、pipeline layout 和 async compute pipeline factory
- [ ] 3.3 支持合法 workgroup override，并同时校验 device X/Y/Z 与 invocation product limits；W3 不寻找最优 workgroup
- [ ] 3.4 扩展 source-closure 检查：V2 禁止 Legacy evaluator、genus modules、4D Voronoi/fBm、body/recipe loop、texture sample、atomics、workgroup storage 和额外 entry；单独提交

## 4. RecipeDensityV2Adapter resources and frame semantics

- [ ] 4.1 实现 V2 Adapter 惰性 construction，拥有 Frame/Body/Recipe buffers、双 RGBA16F 3D textures、sampled/storage views、sampler、bind groups 与 pipeline
- [ ] 4.2 实现 prepare/encode/getOutput，保持 update-rate、wind threshold、ping-pong、transition/cacheBlend、revision 与同一 command encoder pass 顺序；W3 每个有效体素始终写 RGBA 零
- [ ] 4.3 实现 resolution/workgroup rebuild、resource generation、强制 activation refresh、active body/record packing 与 output byte 统计
- [ ] 4.4 实现 structured failure、device loss、幂等 destroy 和销毁后有限拒绝；不得公开 writable texture、storage bind group 或 pipeline
- [ ] 4.5 代码分析确认默认 Legacy 未请求 V2 时不创建任何 V2 GPU 对象或 pass；单独提交

## 5. Lazy candidate selection and atomic promotion

- [ ] 5.1 将 selector 的 V2 unavailable 槽位替换为 async lazy factory；创建期间 requested=Recipe V2、active=Legacy、fallback/creation reason 可见
- [ ] 5.2 候选用当前 frame input prepare；候选 encode 成功并使 output valid 后才 promotion，encode 前拒绝或创建失败时继续当前 Legacy plan
- [ ] 5.3 Producer promotion/回退/切回递增 selector `activeGeneration`；consumer binding key 使用 activeGeneration + output resourceGeneration
- [ ] 5.4 切换 Producer 时重建 Cached/Hybrid density bindings并硬失效 ground-shadow/TAA history；不得因两个 Adapter 的局部 generation 相同而保留旧 view
- [ ] 5.5 selector 保存并向 active/candidate 同步最新 resolution/workgroup；切回长期 inactive Producer 前强制用当前 frame input 刷新
- [ ] 5.6 active quality=Realtime 时 V2 request 不创建/编码无人消费的 cache；回到 Cached/Hybrid 时再启动或刷新候选；V2 active 时不要求后台更新 Legacy；单独提交

## 6. Diagnostics and explicit W3 semantics

- [ ] 6.1 扩展 stats/HUD：requested/active Producer、candidate lifecycle、active generation、creation/rebuild latency、source length、record/output bytes、dispatch dimensions 与 failure reason
- [ ] 6.2 HUD 在 V2 active 时明确显示 `W3 empty-density`；零云输出是 valid，不得显示为 fallback/failure
- [ ] 6.3 timestamp query 可用时记录实际 V2 cache pass；不可用时显示 unavailable，CPU latency不得填入 GPU timing
- [ ] 6.4 默认 Legacy 正常帧确认没有 V2 dispatch、额外 density texture 或额外 cloud/ground-shadow pass；单独提交

## 7. Automated validation

- [ ] 7.1 运行 `npm run test:density-v2-layout` 与扩展后的 `npm run test:pipeline-isolation`
- [ ] 7.2 运行 `npm run test:genus-dispatch`，确认 Legacy 十属与 Realtime 路由未变
- [ ] 7.3 运行 `npm run typecheck` 与 `npm run build`
- [ ] 7.4 静态验证 V2 compute 每体素只有 bounds check + zero store，body attempts/noise samples/texture samples/atomics 均为零
- [ ] 7.5 静态验证默认 Legacy 路径不构造 V2 factory resources，W4/W5/W6 符号和资源不存在

## 8. Manual WebGPU acceptance

- [ ] 8.1 默认 Legacy + Cached/Hybrid 正常视图、density debug 与 ground shadow 对比 W2 基线无视觉差异
- [ ] 8.2 首次请求 V2：确认 idle→creating/warming→ready，创建期间 Legacy 继续显示，promotion 后正常视图仍有天空/地面但无云、density debug 为零
- [ ] 8.3 在 no-cloud、single-body 与 invalid-genus fixture 下确认 V2 output valid、无 NaN/WebGPU validation error、地面云影为全透射
- [ ] 8.4 往返切换 Legacy/V2 并改变 resolution/workgroup，确认 sampled bindings/history 无悬空引用、generation 碰撞或黑屏
- [ ] 8.5 记录默认 96³ V2 output bytes、首次创建 latency、一次零 compute GPU timing（可用时）和切换状态；不得表述为形态或 steady-state 加速证据

## 9. OpenSpec and handoff gate

- [ ] 9.1 运行 `openspec validate establish-density-recipe-v2-shell --strict --no-interactive`
- [ ] 9.2 W3 完成前不得创建或实施 W4/W5/W6 change
- [ ] 9.3 只有 1–8 全部完成且项目所有者确认 W3 空输出语义后，才能归档并开始 W4 proposal
