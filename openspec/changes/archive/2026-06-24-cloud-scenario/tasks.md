## 1. 鏁版嵁妯″瀷涓庤В鏋愶紙src/scenario.ts锛?
- [x] 1.1 瀹氫箟 `ScenarioRegion`/`ScenarioEvent`/`Scenario` 绫诲瀷锛坉uration/wind/regions/events锛?- [x] 1.2 `parseScenario(json)`锛氭牎楠屽繀濉瓧娈点€佹寜 regionId 鍒嗙粍銆佹寜 t 鎺掑簭銆佽ˉ榛樿 `ease='linear'`
- [x] 1.3 `serializeScenario(s)`锛氳緭鍑烘牸寮忓寲 JSON
- [x] 1.4 鍐呯疆 `DEMO_SCENARIO`锛氱Н浜戠敓鎴愨啋澧炲帤鈫掑惞杩団啋娑堟暎

## 2. 鎾斁鍣紙src/scenario.ts锛?
- [x] 2.1 `ScenarioPlayer.sample(t)`锛氭瘡鍖哄煙鍦ㄧ浉閭讳簨浠堕棿鎸?ease 鎻掑€?`coverage`/`densityScale`锛宼ype 鍙栧墠甯х鏁ｅ€?- [x] 2.2 棣栦簨浠跺墠鐢ㄩ甯у€笺€佹湯浜嬩欢鍚庣敤鏈抚鍊硷紙coverage 鏈抚閫氬父 0锛?- [x] 2.3 杈撳嚭 `{ regions: Region[], mods: RegionMod[], windDeg, windSpeed }`
- [x] 2.4 `ease` 鏀寔 `linear` 涓?`smooth`锛坰moothstep锛?
## 3. 鎾斁鏃堕挓涓庨泦鎴愶紙src/main.ts锛?
- [x] 3.1 鏂板鎾斁鐘舵€?`{ enabled, playing, speed, loop }` 涓?`playhead`
- [x] 3.2 鍦烘櫙鍚敤鏃讹細`playing` 鎺ㄨ繘 `playhead`锛堝彈 duration 鎴柇鎴?loop 鍙栨ā锛夛紝scrub 鏃剁敤 `timeline.time`
- [x] 3.3 鍦烘櫙鍚敤鏃惰皟 `player.sample(playhead)` 鈫?`renderer.setRegions(regions, mods)`锛屽啓 `params.windDeg/windSpeed`
- [x] 3.4 澶嶇敤璋冨埗鍙樺寲闃堝€艰烦杩囬噸缁橈紱鍦烘櫙绂佺敤鏃跺洖閫€鐜版湁 buildRegions/lifecycle 璺緞

## 4. GUI锛坰rc/gui.ts锛?
- [x] 4.1 Scenario 鏂囦欢澶癸細鍚敤寮€鍏炽€佹挱鏀?鏆傚仠銆佸€嶉€熴€乴oop
- [x] 4.2 scrubber锛堟嫋鍔?`timeline.time` 棰勮锛岃寖鍥撮殢 duration锛?- [x] 4.3 鍔犺浇 JSON锛堟枃浠堕€夋嫨鎴栫矘璐存枃鏈級銆佸鍑?JSON锛堜笅杞?澶嶅埗锛夈€佷竴閿姞杞?DEMO
- [x] 4.4 鍦烘櫙鍚敤鏃堕/鍖哄煙鎵嬪姩鎺т欢鏍囪琚帴绠★紙绂佺敤鎴栧彧璇伙級锛岀鐢ㄦ椂鎭㈠

## 5. 楠屾敹

- [x] 5.1 `vite build` 閫氳繃
- [x] 5.2 鍔犺浇 DEMO 鍦烘櫙骞舵挱鏀撅紝鑷姩婕斿嚭銆岀敓鎴愨啋澧炲帤鈫掑惞杩団啋娑堟暎銆?- [x] 5.3 scrub 鍙嫋鍒颁换鎰忔椂鍒荤湅瀵瑰簲鐘舵€侊紱鏆傚仠/鍊嶉€熺敓鏁?- [x] 5.4 瀵煎嚭鍐嶅姞杞?JSON 鍙鐜板悓涓€鍦烘櫙
- [x] 5.5 鍦烘櫙绂佺敤鏃剁敾闈笌鏀瑰姩鍓嶄竴鑷?- [x] 5.6 `openspec validate cloud-scenario --strict` 閫氳繃
