## 1. 浜戜綋鏁版嵁妯″瀷锛坰rc/body.ts锛?- [x] 1.1 瀹氫箟 `CloudBody` 绫诲瀷锛堟í鍚?鍨傜洿/浜戝睘/寮哄害/椋?lifecycle锛?- [x] 1.2 `BodyStore`锛歚add`/`remove`/`update`/`list` + 鑷 id
- [x] 1.3 榛樿棰勭疆 3~4 涓簯浣擄紙浣?cumulus銆佷腑 altocumulus銆侀珮 cirrus 绛夛級
- [x] 1.4 `evalBodyMod(lifecycle, t)`锛堝鐢?lifecycle 姹傚€硷級

## 2. uniform 甯冨眬锛坰rc/params.ts锛?- [x] 2.1 瀹氫箟 `MAX_BODIES`锛堥粯璁?12锛変笌 `BodyGPU` 涓夋锛坓eom/wind/mod锛夊亸绉?- [x] 2.2 globals + `array<BodyGPU, MAX_BODIES>` + `activeBodyCount`锛岄噸鎺?`PARAM_OFFSETS`/`PARAMS_FLOAT_COUNT`
- [x] 2.3 绉婚櫎 `extraLayers`/鍥哄畾灞傚瓧娈碉紱`packBodies(dst, bodies, mods)`
- [x] 2.4 `packBodyIntensity(dst, mods)`锛堜粎鍐?mod 娈碉紝姣忓抚寤変环锛?
## 3. 鐫€鑹插櫒锛坰haders/cloud.wgsl锛?- [x] 3.1 `Params` 鍚?`bodies : array<BodyGPU, MAX_BODIES>` 涓?`activeBodyCount`
- [x] 3.2 `shapeTex` 鏀?`texture_2d_array<f32>`锛坮8 杞粨锛?- [x] 3.3 `cloudDensity()` 閬嶅巻 `activeBodyCount`锛宍enabled`/`alpha`/band early-continue
- [x] 3.4 `evalBody()` 鐢ㄨ浣?band/wind/type锛屽鐢?5 闃舵瀵嗗害绱姞

## 4. 褰㈢姸鍥撅紙src/weather.ts 鈫?閲嶆瀯锛?- [x] 4.1 `createShapeData()` 杩斿洖 `MAX_BODIES` 灞?r8 缂撳啿
- [x] 4.2 `paintBodyShapes(data, bodies)`锛氭瘡浣撶敾褰掍竴鍖栫窘鍖栬疆寤撳埌瀵瑰簲灞?- [x] 4.3 绉婚櫎 `WeatherConfig`/`buildRegions`/`paintRegions`

## 5. 娓叉煋鍣紙src/renderer.ts锛?- [x] 5.1 `shapeTexture` 鍒涘缓涓?`r8unorm` array锛坉epth=`MAX_BODIES`锛?- [x] 5.2 `setBodies(bodies)`锛氶噸缁樺彉鍖栫殑褰㈢姸灞?+ 鍐?geom/wind uniform + `activeBodyCount`
- [x] 5.3 `updateBodyIntensity(mods)`锛氫粎鍐?mod 娈?uniform
- [x] 5.4 绾挎鎸夋瘡浣?band 楂樺害缁樺埗锛涢€変腑浣撻珮浜?
## 6. 鍦烘櫙锛坰rc/scenario.ts锛?- [x] 6.1 `Scenario.bodies` 鍙栦唬 `regions`锛涗簨浠舵墿灞?`base/thickness/windDeg/windSpeed`
- [x] 6.2 `parseScenario` 鍚戝悗鍏煎鏃?`regions`锛堟槧灏勪负 bodies + 浣庡眰榛樿锛?- [x] 6.3 `ScenarioPlayer.sample(t)` 杈撳嚭 `CloudBody[]`
- [x] 6.4 鏇存柊 `DEMO_SCENARIO` 涓?bodies 缁撴瀯

## 7. GUI锛坰rc/gui.ts锛?- [x] 7.1 銆孋loud Bodies銆嶉潰鏉匡細Add Rect / Add Circle / Remove Selected
- [x] 7.2 姣忎綋鎶樺彔闈㈡澘缂栬緫鍏ㄩ儴瀛楁 + 閫変腑楂樹寒鑱斿姩
- [x] 7.3 绉婚櫎 Shape / Layer / High-Altitude Layers / Weather Regions 闈㈡澘
- [x] 7.4 scenario 闈㈡澘淇濈暀锛涘満鏅惎鐢ㄦ椂浜戜綋闈㈡澘鏍囪琚帴绠?
## 8. 瑁呴厤锛坰rc/main.ts锛?- [x] 8.1 鐢?`BodyStore` 鏇挎崲 weather/extraLayers 瑁呴厤
- [x] 8.2 鎵嬪姩妯″紡姣忓抚姹?lifecycle mod 鈫?`updateBodyIntensity`锛涘嚑浣曞彉鏇存墠 `setBodies`
- [x] 8.3 scenario 妯″紡鐢?player 杈撳嚭 `setBodies`

## 9. 楠屾敹
- [x] 9.1 `vite build` 涓?`tsc --noEmit` 閫氳繃
- [x] 9.2 UI 鏂板涓€鍥㈡寚瀹氶珮搴?鑼冨洿/绫诲瀷鐨勪簯骞舵樉绀?- [x] 9.3 淇敼鏌愪簯浣撳弬鏁板疄鏃剁敓鏁堬紱鍒犻櫎鍚庢秷澶?- [x] 9.4 缁欐煇浜戜綋寮€ lifecycle锛屽彲瑙佺敓鎴愨啋澧炲帤鈫掓秷鏁?- [x] 9.5 鍔犺浇鏃?scenario JSON锛坮egions锛変粛鍙挱鏀撅紙鍚戝悗鍏煎锛?- [x] 9.6 鏂?bodies scenario 鍙挱鏀惧鍥簯浣撴紨鍖?- [x] 9.7 `openspec validate unified-cloud-bodies --strict` 閫氳繃
