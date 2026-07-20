# Revision delta from old W9 evidence

旧 `docs/evidence/w9-body-local-bricks/results.raw.json` 与 report 固定在
`125778640168a757fd7d812addfab9e37d987b78`。当前 capture revision 是
`08f4c7683961da047bdb0c971168b7ac8c168f63`。两者之间有三次提交：

## `faac7998`

修改 hierarchical render sampling 的 hot path：

- candidate index 复用已计算 UVW；
- coarse texture sample 延迟到真正 fallback 时才执行；
- `count==0` 的 complete tile 直接返回零；
- `cacheBlend` 位于端点时只采样一张 brick atlas。

这些改动直接影响 cloud main/light/density-debug/ground-shadow 所共享的 hierarchical sampler，
所以旧 GPU timing 与视觉输出不能继承。

## `c513736`

加入 26-case `results.failing-recapture.json`。它只有 `sourceRevision=working-tree`，没有 exact
commit、dirty status、diff fingerprint、browser/GPU/driver/viewport provenance，因此只能作为
历史线索，不能替代同 revision Gate evidence。

## `08f4c76`

- 1,920-byte brick record table 从 storage read 改为 uniform read；
- 抽出 record sampling helper；
- 新增 common single-candidate fast path；
- 保留 invalid record 的 whole-point coarse fallback与 genus metadata round-trip；
- 自动检查同步约束 binding type 与 fast path。

这些改动改变 binding layout、shader source、candidate common path 与性能。旧 `1257786`
报告的 runtime/protocol/visual/performance 结论均不能直接代表 current implementation。

## Attribution result

新 clean capture 与反向 A/B capture 均在 `08f4c76` 上复现性能失败；同设备的 `faac799`
复测反而更慢。因此：

- 失败不是因为沿用旧 evidence；
- 失败不是 global-first 顺序或 warm-up bias；
- `08f4c76` 相对 `faac799` 有真实改善，但仍未达到批准阈值；
- 旧 report 的 Stop 不能直接充当 current final Stop，新 report 独立得出 Stop verdict；
- current final disposition 仍须 owner 正式记录。
