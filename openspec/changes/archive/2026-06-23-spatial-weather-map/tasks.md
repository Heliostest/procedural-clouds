## 1. 澶╂皵鍥剧汗鐞嗕笌缁戝畾

- [x] 1.1 `src/weather.ts`锛氬畾涔?`weatherMap` 瑙勬牸锛?56脳256 `rgba8unorm`锛岄€氶亾 R=coverage/G=type/B=densityScale/A=id锛夛紝CPU 绔?`Uint8Array` 鍚庡缂撳啿
- [x] 1.2 `src/renderer.ts`锛歚device.createTexture` 寤?`weatherMap` + sampler锛坈lamp-to-edge锛宭inear锛?- [x] 1.3 `src/renderer.ts`锛歝ompute bind group layout 鍦?`@group(0)` 鏂板 binding锛堝ぉ姘斿浘绾圭悊 + sampler锛夛紝鏇存柊 `computeBindGroup`
- [x] 1.4 `shaders/cloud.wgsl`锛氬０鏄?`@group(0)` 澶╂皵鍥剧汗鐞?sampler 缁戝畾锛宐inding 鍙蜂笌 renderer 涓€鑷?
## 2. 棰勮鍙傛暟鏁扮粍 uniform

- [x] 2.1 `src/params.ts`锛氭妸 `CLOUD_PRESETS` 褰㈡€佸瓧娈垫寜棰勮椤哄簭鎵撳寘涓?uniform 鏁扮粍锛堟瘡棰勮鑻ュ共 vec4f锛夛紝瀹氫箟绱㈠紩鍋忕Щ
- [x] 2.2 `shaders/cloud.wgsl`锛氬０鏄庨璁炬暟缁?uniform锛屾彁渚涙寜 type 绱㈠紩鍙栭璁惧弬鏁扮殑璁块棶鍣?- [x] 2.3 涓婁紶棰勮鏁扮粍 buffer锛堥潤鎬侊紝鍒濆鍖栦竴娆★級

## 3. 閲囨牱涓?mix

- [x] 3.1 `cloudDensity()`锛氱敤骞虫祦鍚?`objPos.xz` 褰掍竴鍖栧埌 [0,1] 閲囨牱 `weatherMap`锛岃В鐮?R/G/B
- [x] 3.2 灞€閮?`coverage` 瑕嗙洊鍏ㄥ眬 `coverage`锛宍densityScale` 涔樺埌瀵嗗害杈撳嚭
- [x] 3.3 type 绱㈠紩锛圙 閫氶亾锛夆啋 鍙?floor/ceil 涓や釜鍊欓€夐璁撅紝鎸夊皬鏁伴儴鍒?`mix` 褰㈡€佸弬鏁帮紙鈮? 鍊欓€夛紝鏃犲垎鏀垎鐐革級
- [x] 3.4 鍖哄煙澶栵紙coverage鈮?锛夆啋 杈撳嚭鏅寸┖锛堝瘑搴?0锛?
## 4. Region API 涓?GUI

- [x] 4.1 `src/weather.ts`锛歚Region` 绫诲瀷 `{ shape: 'rect'|'circle', bounds, type, coverage, feather }`
- [x] 4.2 杞瑪鍒风粯鍒讹細rect/circle 鎸?`feather` 杈圭紭缇藉寲鍐欏叆鍚庡缂撳啿锛屽啀 `writeTexture` 涓婁紶
- [x] 4.3 `paintRegions(regions)` 娓呯┖骞堕噸缁樺叏閮ㄥ尯鍩?- [x] 4.4 `src/gui.ts`锛氱粡 hooks 娉ㄥ叆鍖哄煙鎺т欢锛坰hape/bounds/type/coverage/feather锛夛紝鏀瑰姩瑙﹀彂閲嶇粯

## 5. 楠屾敹

- [x] 5.1 `vite build` 閫氳繃
- [x] 5.2 鐭╁舰鍖哄煙 A 璁?cumulus銆佸渾褰㈠尯鍩?B 璁?cirrus锛欰/B 鍐呭垎鍒憟瀵瑰簲浜戝睘
- [x] 5.3 鍖哄煙澶栨櫞绌猴紙鏃犱簯锛?- [x] 5.4 鍖哄煙杈圭紭闅?`feather` 鑷劧杩囨浮锛屾棤纭竟
- [x] 5.5 `openspec validate spatial-weather-map --strict` 閫氳繃

