## 1. 鍖呯粶姹傚€硷紙src/lifecycle.ts锛?
- [x] 1.1 瀹氫箟 `LifecycleEnvelope` 绫诲瀷锛歚{ birth, grow, mature, decay, death, peakDensity }`锛堢锛岀浉瀵?sceneTime锛?- [x] 1.2 `evalEnvelope(env, t) 鈫?phase 鈭?[0,1]`锛氬垎娈?birth鈫抔row锛?鈫? smoothstep锛夈€乬row鈫抎ecay锛堟亽 1锛夈€乨ecay鈫抎eath锛?鈫? smoothstep锛夈€佸尯闂村 0
- [x] 1.3 `evalRegionMod(env, t) 鈫?{ coverageMul, densityScale }`锛歚coverageMul = phase`銆乣densityScale = phase * peakDensity`锛涙棤 env 鏃惰繑鍥?`{1,1}`
- [x] 1.4 瀵煎嚭 `DENSITY_SCALE_MAX`锛堥粯璁?2.0锛夊父閲忎緵 weather 缂栫爜涓?shader 瑙ｇ爜瀵归綈

## 2. 鍖哄煙鐢熷懡鍛ㄦ湡鎺ュ叆锛坰rc/weather.ts锛?
- [x] 2.1 `Region` 澧炲彲閫?`lifecycle?: LifecycleEnvelope`
- [x] 2.2 `WeatherConfig` 澧炴瘡鍖哄煙鐢熷懡鍛ㄦ湡瀛楁锛圓/B 鐨?birth/grow/mature/decay/death/peak + 鍚敤寮€鍏筹級
- [x] 2.3 `paintRegions(data, regions, mods?)`锛氭帴鍙楁瘡鍖哄煙 `{ coverageMul, densityScale }`锛孯 閫氶亾涔?coverageMul銆丅 閫氶亾鎸?`densityScale/DENSITY_SCALE_MAX` 缂栫爜锛堥粯璁?`{1,1}` 鍏煎鐜扮姸锛?- [x] 2.4 `buildRegions` 鎶婂惎鐢ㄧ殑鐢熷懡鍛ㄦ湡閰嶇疆鎸傚埌瀵瑰簲 Region

## 3. 甯у惊鐜┍鍔紙src/main.ts + src/renderer.ts锛?
- [x] 3.1 main 甯у惊鐜寜 `elapsed`锛坰ceneTime锛夊姣忓尯鍩熻皟 `evalRegionMod`锛屽緱 mods 鏁扮粍
- [x] 3.2 璋?`renderer.setRegions(regions, mods)` 閫愬抚閲嶇粯澶╂皵鍥撅紙`setRegions` 閫忎紶 mods 缁?`paintRegions`锛?- [x] 3.3 phase/mods 杈冧笂甯у彉鍖栧皬浜?epsilon 鏃惰烦杩囬噸缁橈紙mature/鏅寸┖闈欐甯у厤涓婁紶锛?
## 4. shader 瑙ｇ爜瀵归綈锛坰haders/cloud.wgsl锛?
- [x] 4.1 鑻?peakDensity 鏀惧紑 >1锛氬ぉ姘斿浘 B 閫氶亾瑙ｇ爜涔?`DENSITY_SCALE_MAX`锛屼笌 lifecycle 甯搁噺涓€鑷?- [x] 4.2 纭 densityScale=0锛堟秷澶辨湯鎬?/ 鏈嚭鐜帮級鐭矾鏅寸┖锛屼笌闃舵 4 coverage鈮? 鐭矾涓€鑷?
## 5. GUI锛坰rc/gui.ts锛?
- [x] 5.1 缁?hooks 娉ㄥ叆鐢熷懡鍛ㄦ湡鎺т欢锛氭瘡鍖哄煙 鍚敤寮€鍏?+ birth/grow/mature/decay/death + peakDensity
- [x] 5.2 鎻愪緵 sceneTime scrub 婊戞潌锛堟墜鍔ㄩ瑙堜换鎰忔椂鍒伙級锛屾敼鍔ㄨЕ鍙戦噸缁?- [x] 5.3 鎺т欢鏀瑰姩瑙﹀彂 `onWeather` 閲嶅缓 regions

## 6. 楠屾敹

- [x] 6.1 `vite build` 閫氳繃
- [x] 6.2 涓€鍥簯鍦ㄦ寚瀹?birth 鏃跺埢鍑┖鍑虹幇锛坈overage 0鈫掔洰鏍囷級
- [x] 6.3 grow 娈电害 30s 鍐呭鍘氬埌鏈€娴擄紙densityScale 杈?peak锛?- [x] 6.4 decay鈫抎eath 娈电紦鎱㈠彉娣＄洿鍒板畬鍏ㄦ秷澶憋紙coverage鈫?锛屾櫞绌猴級
- [x] 6.5 鏃犵敓鍛藉懆鏈熼厤缃殑鍖哄煙琛屼负涓庨樁娈?4 涓€鑷达紙鎭掑畾锛?- [x] 6.6 `openspec validate cloud-lifecycle --strict` 閫氳繃
