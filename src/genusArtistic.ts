import { CLOUD_GENERA, type CloudGenus } from './genusProfile';

export type LangText = { en: string; zh: string };

/** Source: procedural-clouds-threejs/cloud-types.md artistic sections. */
export const GENUS_ARTISTIC: Record<CloudGenus, LangText> = {
  cumulus: {
    en: 'The "hero" cloud. Brilliant white tops in direct sun, grey base gradient, distinctly puffy edges—friendly and solid. At sunset, tops turn gold/pink while bases go deep purple.',
    zh: '「英雄」云。直射光下顶部洁白，底部灰影渐变，边缘蓬松分明——友好扎实。日落时顶转金/粉，底沉深紫。',
  },
  stratus: {
    en: 'Overcast day: uniform soft light, white-grey to dark grey by thickness. Beauty is subtle thickness variation. At sunset the bottom can catch warm light while the upper sheet stays grey.',
    zh: '阴天感：均匀柔光，厚薄决定白灰到深灰。美在细微厚薄变化。日落时底部可接暖光，上层仍偏灰。',
  },
  stratocumulus: {
    en: 'Blanket with holes—gaps show blue sky. Each lump has a bright top and darker underside. The sunset cloud: lit from below, lumps paint gold, pink, and purple in golden hour.',
    zh: '带孔的毯子，缝隙透蓝天。每团亮顶暗底。日落神器：逆光自下而上，金/粉/紫分块上色。',
  },
  cumulonimbus: {
    en: 'Maximum drama: near-black base, brilliant cauliflower tower, flat anvil with wispy edges. Backlit outline glows silver/gold; optional warm interior flashes. Epic-scene cloud.',
    zh: '极致戏剧：近黑云底、洁白花椰菜塔、扁平砧顶带丝缕边。逆光轮廓银/金；可有暖色内部闪光。史诗场景用云。',
  },
  altocumulus: {
    en: 'Pattern is the beauty—regular small cloudlets like fish scales or waffle, blue sky between. At sunset each cloudlet colors separately. High Worley blend for cellular repetition.',
    zh: '美在图案：规则小云胞如鱼鳞/华夫，缝间蓝天。日落时各胞独立上色。高 Worley 混合做胞状重复。',
  },
  altostratus: {
    en: 'Translucent curtain; sun as a bright diffuse disc. Subtle thicker/darker and thinner/brighter patches. Quiet beauty—high SSS, low absorption.',
    zh: '半透明帷幕；太阳呈朦胧日盘。厚处略暗、薄处略亮。安静之美——高 SSS、低吸收。',
  },
  nimbostratus: {
    en: 'Dark, oppressive, featureless grey ceiling. No silver linings—weight and mood. Beauty from atmosphere: rain below, faint lighter patches. Pair with fog.',
    zh: '沉重压抑、无特征的灰顶。无银边——只有重量与情绪。美在氛围：雨幕、隐约亮斑。宜配雾。',
  },
  cirrus: {
    en: 'Calligraphy on deep blue: thin curved strokes with hooks at ends. Catch sun brilliantly; first to turn gold/pink at sunset. Domain warp for streaking fibers.',
    zh: '深蓝上的书法：细弯笔触、末端弯钩。强烈受光；日落最先转金/粉。域扭曲做纤维丝缕。',
  },
  cirrostratus: {
    en: 'Barely-there milky wash whitening the sky. Hallmark is the ~22° ice-crystal halo around the sun. Beauty in restraint.',
    zh: '几乎看不见的乳状薄纱，略漂白天空。标志是太阳约 22° 冰晶日晕。美在克制。',
  },
  cirrocumulus: {
    en: 'Like altocumulus but higher, tinier, thinner—delicate ripples or grains, almost pointillistic. Sunset makes a fine color tapestry. Very high-frequency Worley.',
    zh: '似高积云但更高更细更薄——精致涟漪/米粒，近点彩。日落成细密色毯。极高频率 Worley。',
  },
};

export function assertCompleteGenusArtistic(keys: readonly string[] = CLOUD_GENERA): void {
  for (const key of keys) {
    const entry = GENUS_ARTISTIC[key as CloudGenus];
    if (!entry?.en?.trim() || !entry?.zh?.trim()) {
      throw new Error(`Missing genus artistic copy for ${key}`);
    }
  }
}

assertCompleteGenusArtistic();
