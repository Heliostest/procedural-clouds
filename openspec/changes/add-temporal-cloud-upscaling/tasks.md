## 1. 参数与路径枚举

- [ ] 1.1 在 `src/params.ts` / GUI 增加 temporal quality 控制（关闭 / full-res TAA / TAAU 4×4），默认 full-res TAA；沿用 `taaEnabled`/`taaBlend`
- [ ] 1.2 HUD/stats 暴露 phase、current 分辨率、history 字节、rejection 比率；禁止把 1/16 texel 写成“1/4 像素”
- [ ] 1.3 Emergency combined fallback（`cloudFrameActivePath !== 'cloud-frame'`）强制禁用 TAAU 并报告原因

## 2. Low-res current pass

- [ ] 2.1 为 TAAU 分配 `⌈W/4⌉×⌈H/4⌉` cloud-only current（radiance/transmittance + depth/velocity），语义继承 W10A
- [ ] 2.2 接线 low-res raymarch 写入上述附件；不得从合成地面/天空反推云深度
- [ ] 2.3 保留 full-res current 可切换路径（真值 / 回归 / 设备 fallback）
- [ ] 2.4 确认文档与诊断声明 raymarched texel 数为 full-res 的 `1/16`

## 3. Bayer phase 与 jitter 一致性

- [ ] 3.1 实现固定 4×4 Bayer（或等价唯一覆盖）序列，`phase = frame % 16`
- [ ] 3.2 TAAU 下 Bayer offset 写入 current ray direction、projection、`previousJitter`/reprojection 与 velocity 约定
- [ ] 3.3 TAAU 禁用 Halton 叠加；full-res TAA 继续 `halton()`（`src/renderer.ts`）
- [ ] 3.4 确认 W10B STBN/IGN 只扰动 ray 起点/步进/采样序列，不改变 pixel phase

## 4. TAAU resolve

- [ ] 4.1 实现 full-res TAAU resolve：当前 phase 直写 current，其余 15 phase 重投影 history
- [ ] 4.2 保留 ping-pong `historyTex` 与 YCoCg 3×3 variance clipping；同一像素禁止 TAA→TAAU 串联
- [ ] 4.3 Velocity 从 low-res 3×3 选最近有效云深度 / 最高 `opacity=1-T`；拒绝 invalid 天空 velocity
- [ ] 4.4 Color / transmittance / representative depth history 策略分离；color clip 不得充当物理深度
- [ ] 4.5 Composite 仍按 W10A 在 temporal resolve 之后唯一合成；gizmo/debug 不进 history

## 5. History rejection 与 reactive mask

- [ ] 5.1 实现视口、depth、derived opacity、generation、camera-cut rejection，且先于 variance clip
- [ ] 5.2 实现 reactive/disocclusion：opacity/深度/`resourceGeneration` 超阈值时提高 current 权重或拒史
- [ ] 5.3 提供 history rejection / phase debug 可视化

## 6. 失效与 generation 语义

- [ ] 6.1 接线 `resourceGeneration`、`contentRevision`、`discontinuityGeneration` 三套独立名字到 TAAU invalidation
- [ ] 6.2 结构性不连续（resize、device loss、producer/storage/quality 切换、sun discontinuity、scene time jump、brick 重分配若发生）整屏 invalidation
- [ ] 6.3 正常 cache 内容更新 / 连续风平流 / `contentRevision` 不得每帧整屏 reset

## 7. Fixture 与自动检查

- [ ] 7.1 新增 `scripts/check-w11-bayer-phase.mjs`：16 phase 唯一覆盖、TAAU 无双重 Halton、STBN 不改 phase
- [ ] 7.2 新增 `scripts/check-w11-lowres-mapping.mjs`：ceil 右/下边界 full→low 映射
- [ ] 7.3 新增 `scripts/check-w11-history-invalidation.mjs`：三代语义分离与整屏/局部失效规则
- [ ] 7.4 新增 `scripts/check-w11-taau-resolve.mjs`：单 history owner、emergency 禁用 TAAU、opacity 派生约定
- [ ] 7.5 将上述检查接入现有验证入口（若项目有 aggregate check 脚本则注册；否则文档化独立运行命令）

## 8. 证据采集与 Gate

- [ ] 8.1 固定比较三条路径：full-res no-TAA、full-res TAA、TAAU 4×4
- [ ] 8.2 采集 normal / raw density / transmittance / depth / velocity / history rejection / phase debug 截图或视频
- [ ] 8.3 固定 case：sparse Ci/Cs、Cc ripple、cloud/sky edge、cloud/ground overlap、快速相机 yaw
- [ ] 8.4 报告 current / resolve / composite / 总 GPU 的 median 与 p90；单独报告 resolve 成本、history 显存与额外 bandwidth（理论 1/16 仅作解释）
- [ ] 8.5 编写 Gate report：静态 16 帧收敛接近 full-res TAA；运动/风/Body 生命周期无明显拖尾、双影、棋盘残留或 16 帧亮度呼吸
- [ ] 8.6 若高运动只能靠过度 current blend 去鬼影并失去重建收益 → Gate=Review，默认保持 full-res TAA 直至目标设备矩阵通过
