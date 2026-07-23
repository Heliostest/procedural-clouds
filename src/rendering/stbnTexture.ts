import stbnUrl from '../assets/stbn.bin?url';

export const STBN_WIDTH = 128;
export const STBN_HEIGHT = 128;
export const STBN_DEPTH = 64;
export const STBN_BYTE_LENGTH = STBN_WIDTH * STBN_HEIGHT * STBN_DEPTH;
export const STBN_SHA256 = '51f52f21e5578384585050390821a0a486dcb81e11a716fa7b92fbb6515ba852';

export interface StbnTextureResources {
  readonly texture: GPUTexture;
  readonly view: GPUTextureView;
  readonly available: boolean;
  readonly fallbackReason: string;
  readonly byteLength: number;
  destroy(): void;
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function createTexture(device: GPUDevice, width: number, height: number, depth: number, label: string): GPUTexture {
  return device.createTexture({
    label,
    size: [width, height, depth],
    dimension: '3d',
    format: 'r8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
}

export async function createStbnTextureResources(device: GPUDevice): Promise<StbnTextureResources> {
  let texture: GPUTexture | null = null;
  let available = false;
  let fallbackReason = '';
  let byteLength = 0;
  try {
    const response = await fetch(stbnUrl);
    if (!response.ok) throw new Error(`http-${response.status}`);
    const data = await response.arrayBuffer();
    byteLength = data.byteLength;
    if (data.byteLength !== STBN_BYTE_LENGTH) {
      throw new Error(`unexpected-byte-length:${data.byteLength}`);
    }
    if (globalThis.crypto?.subtle) {
      const digest = hex(await crypto.subtle.digest('SHA-256', data));
      if (digest !== STBN_SHA256) throw new Error(`sha256-mismatch:${digest}`);
    }
    texture = createTexture(device, STBN_WIDTH, STBN_HEIGHT, STBN_DEPTH, 'w10b-stbn');
    device.queue.writeTexture(
      { texture },
      data,
      { bytesPerRow: STBN_WIDTH, rowsPerImage: STBN_HEIGHT },
      { width: STBN_WIDTH, height: STBN_HEIGHT, depthOrArrayLayers: STBN_DEPTH },
    );
    available = true;
  } catch (error: unknown) {
    texture?.destroy();
    texture = createTexture(device, 1, 1, 1, 'w10b-stbn-dummy');
    device.queue.writeTexture({ texture }, new Uint8Array([0]), {}, [1, 1, 1]);
    fallbackReason = error instanceof Error ? error.message : String(error);
  }

  const ownedTexture = texture;
  return {
    texture: ownedTexture,
    view: ownedTexture.createView({ dimension: '3d' }),
    available,
    fallbackReason,
    byteLength,
    destroy: () => ownedTexture.destroy(),
  };
}
