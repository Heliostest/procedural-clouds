const GENUS_CUMULUS = 0;
const GENUS_STRATUS = 1;
const GENUS_STRATOCUMULUS = 2;
const GENUS_CUMULONIMBUS = 3;
const GENUS_ALTOCUMULUS = 4;
const GENUS_ALTOSTRATUS = 5;
const GENUS_NIMBOSTRATUS = 6;
const GENUS_CIRRUS = 7;
const GENUS_CIRROSTRATUS = 8;
const GENUS_CIRROCUMULUS = 9;

fn evalGenusDensity(genusIndex : i32, compatibilityDensity : f32, pos : vec3f, bodyIndex : i32) -> f32 {
  switch genusIndex {
    case GENUS_CUMULUS: { return evalCumulus(compatibilityDensity); }
    case GENUS_STRATUS: { return evalStratus(compatibilityDensity); }
    case GENUS_STRATOCUMULUS: { return evalStratocumulus(compatibilityDensity); }
    case GENUS_CUMULONIMBUS: { return evalCumulonimbus(compatibilityDensity, pos, bodyIndex); }
    case GENUS_ALTOCUMULUS: { return evalAltocumulus(compatibilityDensity); }
    case GENUS_ALTOSTRATUS: { return evalAltostratus(compatibilityDensity); }
    case GENUS_NIMBOSTRATUS: { return evalNimbostratus(compatibilityDensity); }
    case GENUS_CIRRUS: { return evalCirrus(compatibilityDensity, pos, bodyIndex); }
    case GENUS_CIRROSTRATUS: { return evalCirrostratus(compatibilityDensity); }
    case GENUS_CIRROCUMULUS: { return evalCirrocumulus(compatibilityDensity); }
    default: { return evalCumulus(compatibilityDensity); }
  }
}
