## 1. OpenSpec 与基线

- [x] 1.1 记录 HEAD、原样 status 与仅 `src`/`shaders` unified=0 baseline patch。
- [x] 1.2 建立 proposal、design、tasks 与三个 strict-valid delta。

## 2. Detail consumer contract

- [x] 2.1 创建只读 `DensityDetailResources`，拒绝 private producer object、storage/writable/pipeline 泄漏。
- [x] 2.2 为 Hybrid 固定 read-only detail binding slots 与 renderer-owned dummy Base/Detail 3D resources。
- [x] 2.3 仅 detail resource generation 变化使 TAAU history discontinuity。

## 3. 唯一密度 stage

- [x] 3.1 实现米制风相位、family controls、连续 metadata 混合、预算、distance fade 与 Nyquist。
- [x] 3.2 实现唯一 gain-dilate / pure-erode `remapClamped` stage，保证 early reject、单调性与有限输出。
- [x] 3.3 令三处 Hybrid 组合点调用该 stage；Cached/Realtime 与 hierarchical Cached 保留既有 edge shaping。
- [x] 3.4 main ray 用 final，light/ground shadow 用 rough，Cb 仅一次 hardening remap。

## 4. 参数、默认与 debug

- [x] 4.1 将全局 detail 参数迁移为 erosion/wavelength 调制，保留 GUI 范围并移除 `detailNoise()`。
- [ ] 4.2 切换五项 W12 默认并在 Gate 重采基线。
- [ ] 4.3 新增非破坏 debug 18/19 overlay。

## 5. 检查与 Gate

- [x] 5.1 新增并接入 detail-contract、density-monotonic、sample-budget、light-rough 检查与 isolation 更新。
- [ ] 5.2 采集 W12 视觉、稳定性、fallback、global-only、成本和 iteration 证据。
- [ ] 5.3 Gate 校准 Cu/Sc/Ac；记录远景 Nyquist、Cb 偏离与所有不可豁免缺陷。
