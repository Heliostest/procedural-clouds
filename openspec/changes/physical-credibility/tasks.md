## 0. 前置状态

- [x] 0.1 归档已完成的 `lighting-quality`
- [x] 0.2 明确暂停 `per-preset-lighting` 剩余视觉验收（保持 17/20），冻结本变更使用的 preset buffer 布局

## 1. 空间单位与迁移

- [x] 1.1 新增集中空间换算模块：米 ↔ render world units，覆盖 Y、XZ、长度与 bounds
- [x] 1.2 `CloudParams` 增加 `verticalMetersPerWorldUnit`/`horizontalMetersPerWorldUnit`；将 `cloudHeight`/`boxHalfExtent` CPU 语义改为米
- [x] 1.3 `CloudBody.base/thickness/bounds/feather` 改为米；默认数据迁移到气象尺度
- [x] 1.4 scenario 增加 `schemaVersion: 2`、`distanceUnit: "m"`；legacy loader 按当前比例转换 body 与 event 距离，serializer 输出 v2
- [x] 1.5 增加 legacy → v2 → reload 检查，证明转换前后 GPU placement 数值一致

## 2. 完整渲染尺度链

- [x] 2.1 `packBodies()` 将 body placement 从米转换为 world units，禁止 shader 二次转换
- [x] 2.2 `weather.ts`、`axis.ts`、`gizmo.ts`、线框和坐标标签使用同一转换 API
- [x] 2.3 `camera.ts` 根据转换后盒体派生 target、distance、wheel limits 与 near/far
- [x] 2.4 更新 GUI 米制范围与 i18n 单位说明；兼容迁移旧 `altitudeScale/horizontalScale`
- [x] 2.5 验证默认 12000 m × 32000 m × 32000 m 场景在 cached/hybrid/realtime 下均可见且无明显步进跳采样

## 3. Genus profile 与 placement

- [x] 3.1 新增 `src/genusProfile.ts`：`temperate-demo-v1` 十属表、来源说明和完整键检查
- [x] 3.2 `CloudBody` 增加 `placementLocked`；`BodyStore.setType()` 成为唯一换属路径
- [x] 3.3 新建/未锁定换属应用 profile；手动编辑自动锁定；GUI 提供“应用云属默认位置”
- [x] 3.4 `enforcePhysicalPlacement` 在 CPU 执行：默认 warn-only，开启后 clamp base 与场景层顶
- [x] 3.5 验证 cumulus/cirrus 新建位置可区分，locked/unlocked 与 enforcement on/off 四种组合行为确定

## 4. 垂直剖面

- [x] 4.1 将十属 `altBase/altTop` 迁移为云体内部剖面基线 `[0,1]`，清除旧的高/中/低层编码
- [x] 4.2 `shaders/cloud.wgsl` 在 body 局部 Y 中应用 `altBase/altTop` 与 preset `altitude`，且不受 edge-style/edgeSharpening 开关旁路
- [ ] 4.3 对十属分别做 cached 与 realtime A/B；任何非 `[0,1]` 校准必须记录为内部形态理由

## 5. 文档与验收

- [x] 5.1 更新 `docs/glossary.md`：米制 CPU 数据、scene-ground datum、render world units 与 profile 适用范围
- [x] 5.2 更新 `docs/cloud-types-review.md`，区分 WMO 层级范围和项目艺术默认值
- [x] 5.3 `npm.cmd run typecheck` 通过
- [x] 5.4 `npm.cmd run build` 通过
- [x] 5.5 `openspec validate physical-credibility --strict --no-interactive` 通过
- [ ] 5.6 用户完成默认构图、十属高度、legacy scenario 和 enforcement 的视觉验收

## 6. 归档

- [ ] 6.1 仅在以上 P0 任务全部完成后执行 `openspec archive physical-credibility --yes`
- [ ] 6.2 风 m/s/生命周期/genus morph 与种/变型分别创建后续 change，不在本次归档中声明
