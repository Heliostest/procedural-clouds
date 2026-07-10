## 0. Approval and coordination gate

- [ ] 0.1 用户批准本 change 的 proposal、design、spec deltas 与 roadmap；批准前 MUST NOT 修改实现代码
- [ ] 0.2 完成或书面接受 `add-height-weather-shaping` 剩余视觉/性能验收，并冻结其最终 LegacyPuffy 行为
- [ ] 0.3 完成或书面接受 `add-height-ambient-tint` 剩余视觉/性能验收，冻结首次密度重校准使用的光照基线
- [ ] 0.4 将空的 `add-stratocumulus-cumulus-breakup` 标记为由本 roadmap 的 Cellular/Billow 与 fractus 波次吸收，避免并行实现
- [ ] 0.5 确认首期只重构十属主体 Recipe，不新增 CloudBody/scenario variant schema

## 1. Baseline and external-behavior fixtures

- [ ] 1.1 **Commit 01**：增加十属基线场景清单，固定 camera、scene time、body placement、96³ cache、Cached/Hybrid 和密度调试参数；不改变渲染
- [ ] 1.2 **Commit 02**：记录十属 Legacy 正常视图和 density debug 截图索引，以及 cache/cloud pass 中位数记录格式
- [ ] 1.3 **Commit 03**：扩展 genus 静态检查，验证十属 preset/evaluator/dispatcher/recipe 预留顺序一致；在 recipe 尚未加入时保持现有检查通过
- [ ] 1.4 **Wave 1 exit**：`typecheck`、生产 build、genus dispatch 检查通过；Cached/Hybrid 基线完整；不以 Realtime 帧率作为 gate

## 2. Mechanical LegacyPuffy boundary

- [ ] 2.1 **Commit 04**：将兼容五阶段链重命名/封装为明确的 LegacyPuffy 求值函数，调用关系和浮点运算顺序保持不变
- [ ] 2.2 **Commit 05**：将公共坐标准备整理为 Density Context，保留云属在 footprint 采样前修改形态坐标的能力；活动路径不变
- [ ] 2.3 **Commit 06**：抽取无团块含义的 Macro Support 结构和采样函数；LegacyPuffy 使用它但输出保持视觉等价
- [ ] 2.4 **Commit 07**：抽取公共 Finalize（density scale、edge fade、finite/non-negative guard）；LegacyPuffy 输出保持等价
- [ ] 2.5 **Commit 08**：更新静态检查，禁止新云属专属公式进入 dispatcher，并允许 evaluator 直接消费 Context/Support 而非强制 `compatibilityDensity`
- [ ] 2.6 **Wave 2 exit**：全局仍只有 Legacy 行为；十属 Cached/Hybrid A/B 视觉等价；cache/cloud pass 回归在测量噪声内

## 3. Recipe data foundation without visual change

- [ ] 3.1 **Commit 09**：在 TypeScript 定义最小 DensityRecipe、RecipeMode 与成本等级；十属默认全部选择 LegacyPuffy
- [ ] 3.2 **Commit 10**：增加十属 Recipe 完整性与固定顺序断言；只测试公开数据契约
- [ ] 3.3 **Commit 11**：定义首批 DensityRecipeGPU 固定 record 与具名 offset；不接入 renderer
- [ ] 3.4 **Commit 12**：实现 recipe 按名打包及 CPU 布局静态检查；全部默认记录仍表示 LegacyPuffy
- [ ] 3.5 **Commit 13**：增加独立 recipe GPU buffer/binding 和 WGSL 只读布局；shader 暂不读取，不改变画面
- [ ] 3.6 **Commit 14**：增加全局 Legacy/Recipe 模型字段和 GUI/i18n；Recipe 模式因十属均为 LegacyPuffy 而与 Legacy 等价
- [ ] 3.7 **Commit 15**：让十属 evaluator 读取自身 RecipeMode；仍全部路由 LegacyPuffy，验证属级回退机制
- [ ] 3.8 **Wave 3 exit**：两种全局模式像素/视觉等价；recipe buffer CPU/WGSL 布局检查通过；旧 scenario 无迁移即可加载

## 4. Shared operator library, initially unused

- [ ] 4.1 **Commit 16**：增加 vertical profile 基础算子：Thin Sheet、Soft Layer、Flat-base Dome；不接入任何默认 Recipe
- [ ] 4.2 **Commit 17**：增加 Stratiform Field 低频水平拉伸噪声算子；固定 octave 上限；默认未启用
- [ ] 4.3 **Commit 18**：从 LegacyPuffy 提取可复用 Billow Field 包装，保留原调用与输出
- [ ] 4.4 **Commit 19**：增加 Cellular Field 和 cell connectivity/spacing 参数；默认未启用
- [ ] 4.5 **Commit 20**：整理现有 Cirrus 纤维逻辑为可复用 Fiber Field；Legacy Cirrus 调用结果保持不变
- [ ] 4.6 **Commit 21**：增加 Wave/Lens/Roll 解析域与 profile 基础算子；默认未启用
- [ ] 4.7 **Commit 22**：整理现有 Cb 塔胞为 Convective Column 基础算子；Legacy Cb 调用结果保持不变
- [ ] 4.8 **Commit 23**：增加统一 erosion、smooth union 与 attachment 数值 guard；默认未改变现有路径
- [ ] 4.9 **Wave 4 exit**：所有新增算子未启用时十属基线不变；WGSL 无验证错误；静态成本上限可定位

## 5. Stratiform vertical slices

- [ ] 5.1 **Commit 24**：只迁移 Stratus 到 Thin Sheet + Stratiform Field；保留属级 Legacy 回退
- [ ] 5.2 **Commit 25**：校准 Stratus coverage、厚度波动和低幅 erosion；增加 `nebulosus` 基线语义但不新增 variant schema
- [ ] 5.3 **Commit 26**：迁移 Cirrostratus 到 Ultra-thin Stratiform；保持 halo 只在 Optical Profile
- [ ] 5.4 **Commit 27**：迁移 Altostratus 到水平拉伸 Soft Layer；保持 sun-disc 只在 Optical Profile
- [ ] 5.5 **Commit 28**：迁移 Nimbostratus 到 Thick Stratiform，预留底部 attachment 接口但不实现 precipitation field
- [ ] 5.6 **Commit 29**：为四属添加 Recipe 参数说明和 GUI 开发态分组，避免暴露无关 Billow/Cellular 字段
- [ ] 5.7 **Wave 5 exit**：四属分别满足薄层/中层幕/厚雨层轮廓；不执行 Legacy 两组 4D Voronoi；其他六属基线不变；Cached/Hybrid 成本记录完成

## 6. Direct Fiber vertical slice

- [ ] 6.1 **Commit 30**：使 Cirrus Fiber Field 直接从 Support 生成主体密度，不依赖非零 LegacyPuffy
- [ ] 6.2 **Commit 31**：将 fiber length、width、curl、breakup 与 vertical thinness 解耦，映射现有 fiber 参数以保持兼容回退
- [ ] 6.3 **Commit 32**：校准固定旋转、风平流和缓存时间混合下的连续长丝；确保 Support 外为零
- [ ] 6.4 **Wave 6 exit**：Cirrus 长纤维不再被 Legacy 团块随机截断；Cached 有主体骨架，Hybrid/Legacy 均可回退；其他属不变

## 7. Cellular and Wave vertical slices

- [ ] 7.1 **Commit 33**：迁移 Stratocumulus 到 Billow + 大 cell、高 connectivity 的 Cellular Layer
- [ ] 7.2 **Commit 34**：将当前 stratocumulus/cumulus breakup 空 change 的目标记录为已吸收，先只实现 Sc 主体缝隙，不新增 fractus schema
- [ ] 7.3 **Commit 35**：迁移 Altocumulus 到中尺度 Cellular；将现 `tileScale` 映射到 cell scale
- [ ] 7.4 **Commit 36**：迁移 Cirrocumulus 到小 cell、薄 profile、高 ripple 的 Cellular；保持 cell 明显细于 Ac
- [ ] 7.5 **Commit 37**：为 Ac/Sc 增加默认关闭的 Wave/Lens/Roll modifier hook，只验证零强度无额外成本
- [ ] 7.6 **Wave 7 exit**：Sc/Ac/Cc 的 cell 尺度、连通率和厚度可辨；不依赖 Legacy 宏观团块；未启用 Wave/Lens 零成本早退

## 8. Convective vertical slices

- [ ] 8.1 **Commit 38**：将 Cumulus 迁移到 Billow + Flat-base Dome，先匹配 Legacy 视觉锚
- [ ] 8.2 **Commit 39**：增加 Cumulus 高度相关 cell scale 和有限 Convective Column，使顶部比底部更细碎
- [ ] 8.3 **Commit 40**：把高频 Worley/curl 作为明确 Detail/Erosion，解除 legacy `detail` 同时控制宏观 octave 的耦合
- [ ] 8.4 **Commit 41**：迁移 Cumulonimbus 下部高密度 Billow 和中部 Convective Column
- [ ] 8.5 **Commit 42**：迁移 Cb 上部小胞、Anvil Support 和 Fiber Cap；映射现有 anvil/tower/top-cutoff 字段
- [ ] 8.6 **Commit 43**：增加默认关闭的 Mammatus/precipitation-core attachment hook；不实现云下 precipitation field
- [ ] 8.7 **Wave 8 exit**：Cu 平底圆顶与 Cb 塔/砧/纤维顶可分别辨认；所有算子受 Support 限定；十属均已有非 Legacy 主体 Recipe

## 9. Recipe-aware Hybrid detail

- [ ] 9.1 **Commit 44**：为 Recipe 定义有界 HybridDetailMode；Legacy 默认继续使用现全局 4D Perlin
- [ ] 9.2 **Commit 45**：在统一密度入口按主/次云属和 `w2` 选择/混合 detail 参数，暂时所有新 Recipe detail strength 为 0
- [ ] 9.3 **Commit 46**：为 Billow/Convective 启用非空区高频 Worley/curl detail
- [ ] 9.4 **Commit 47**：为 Cellular 启用粒边 breakup/ripple；为 Stratiform 保留无细节或极弱 thickness noise
- [ ] 9.5 **Commit 48**：为 Fiber 启用高频分叉/断续，不改变缓存主体长丝方向
- [ ] 9.6 **Wave 9 exit**：Cached 主体稳定；Hybrid 细节按拓扑可辨；空区不生云；主/光/地影语义一致；无属边界硬切

## 10. Documentation, validation and follow-up changes

- [ ] 10.1 **Commit 49**：更新架构文档、参数说明与旧 roadmap，记录 Recipe 默认、回退和已迁移十属
- [ ] 10.2 **Commit 50**：完成十属 Cached/Hybrid 正常与 density debug 最终矩阵、GPU timing 中位数及已知差异
- [ ] 10.3 **Commit 51**：运行 typecheck、生产 build、genus/recipe 静态检查与严格 OpenSpec validation；修复所有失败
- [ ] 10.4 **Commit 52**：建立独立后续 change 草案：VariantModifier；第一批候选仅在重新批准后实施
- [ ] 10.5 **Commit 53**：建立独立后续 change 草案：precipitation field；不得在本重构尾部顺带实现
- [ ] 10.6 **Commit 54**：建立独立后续 change 草案：Legacy 字段/路径清理；在清理获批前保留全局和属级回退
- [ ] 10.7 **Final exit**：十属 Recipe 通过验收、未迁移/Legacy 契约无遗漏、性能记录完整、所有 tasks 真实完成后才可归档本 change

## Testing decisions

- 测试外部行为和公开契约，不对 WGSL 私有实现逐行断言。
- 自动静态检查覆盖十属顺序、Recipe 完整性、CPU/WGSL 布局、dispatcher 路由、固定上限和零强度早退边界。
- TypeScript 类型检查与生产 build 是每个波次的最低门槛。
- 视觉测试以固定场景的正常视图和 density debug 为主；未迁移属要求视觉等价，迁移属要求目标拓扑可辨。
- 性能只以 Cached/Hybrid 的 cache/cloud pass 中位数为正式预算；Realtime 只验证编译、数值安全和语义一致。
- 现有 `test:genus-dispatch` 是静态检查的先例；新增检查应扩展公开契约，而不是依赖函数内部字符串顺序。

## Out of scope

- 物理大气、光照积分和 optical 参数物理化重写。
- 任意 shader graph、用户自定义 WGSL、运行时无限算子组合。
- 十属全部云种/变种一次性实现。
- 降水帘、雨幡、台风流场、风切变和真实山岳波动力学。
- Realtime 性能优化和 Realtime 60fps 目标。
- 在无独立迁移提案时删除 Legacy preset 字段、修改 scenario schema 或移除 LegacyPuffy。
