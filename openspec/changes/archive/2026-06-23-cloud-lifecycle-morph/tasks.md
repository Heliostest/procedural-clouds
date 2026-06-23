## 1. 褰㈡€佸井鍙樹俊鍙凤紙src/lifecycle.ts锛?
- [x] 1.1 `RegionMod` 澧?`morph: number` 瀛楁
- [x] 1.2 `evalRegionMod`锛歡row 娈?`morph = smoothstep(birth,grow,t)`锛?鈫?1锛夈€乵ature 娈?+1銆乨ecay 娈?`morph = 1 - 2*smoothstep(decay,death,t)`锛?1鈫?1锛夈€佸尯闂村 0锛涙棤 env 杩斿洖 `morph=0`

## 2. A 閫氶亾鍐欏叆锛坰rc/weather.ts锛?
- [x] 2.1 `paintRegions`锛氳儨鍑哄尯鍩熷啓 `A = round(((mod.morph ?? 0)+1)/2 * 255)`
- [x] 2.2 鏃犵敓鍛藉懆鏈?/ 榛樿 mods 鏃?A 鍐?0.5锛?28锛夛紝淇濊瘉 morph=0
- [x] 2.3 鍖哄煙澶栧儚绱?A 鍐?0.5锛堜笌榛樿涓€鑷达紝閬垮厤 morph=-1 璇镜铓€锛?
## 3. shader 瑙ｇ爜涓庡簲鐢紙shaders/cloud.wgsl锛?
- [x] 3.1 `Params` 澧?`morphStrength : f32`锛堜笌 params.ts 鍋忕Щ瀵归綈锛?- [x] 3.2 澶╂皵鍥惧垎鏀В鐮?`morph = w.a * 2.0 - 1.0`锛沗detailBoost = max(morph,0)`銆乣erosion = max(-morph,0)`
- [x] 3.3 `detailStrength_eff = detailStrength * (1 + morphStrength * detailBoost)`
- [x] 3.4 `worleyBlend_eff = clamp01(worleyBlend + morphStrength * erosion)`锛屾浛鎹㈠悗缁娇鐢ㄥ
- [x] 3.5 `morphStrength=0` 鏃朵袱鑰呴€€鍖栦负鍘熷€硷紙楠岃瘉锛?
## 4. 鍙傛暟涓?GUI锛坰rc/params.ts + src/gui.ts锛?
- [x] 4.1 `CloudParams` 澧?`morphStrength`锛堥粯璁?0锛夛紝`PARAM_OFFSETS`/`PARAMS_FLOAT_COUNT` 鎵╁睍
- [x] 4.2 `buildParams`/`packParams` 浼?`morphStrength`
- [x] 4.3 GUI Weather 鍖哄姞 `morphStrength` 婊戞潌 [0,1]

## 5. 楠屾敹

- [x] 5.1 `vite build` 閫氳繃
- [x] 5.2 `morphStrength=0`锛堥粯璁わ級鏃剁敾闈笌鏀瑰姩鍓嶄竴鑷达紙鍏抽棴鎬佹棤宸紓锛?- [x] 5.3 寮€鍚悗锛屽尯鍩熸垚闀挎湡缁嗚妭閫愭笎澧炲
- [x] 5.4 寮€鍚悗锛屽尯鍩熸秷鏁ｆ湡杈圭紭鐮寸/渚佃殌澧炲己
- [x] 5.5 `openspec validate cloud-lifecycle-morph --strict` 閫氳繃
