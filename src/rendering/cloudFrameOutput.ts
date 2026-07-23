export const CLOUD_FRAME_OUTPUT_FORMAT = 'rgba16float' as const;

export const CLOUD_FRAME_OUTPUT_CLEAR_VALUES = Object.freeze({
  radianceTransmittance: Object.freeze({ r: 0, g: 0, b: 0, a: 1 }),
  depthVelocity: Object.freeze({ r: 0, g: 0, b: 0, a: 0 }),
  backgroundRadiance: Object.freeze({ r: 0, g: 0, b: 0, a: 0 }),
} satisfies Record<CloudFrameOutputAttachmentName, Readonly<GPUColorDict>>);

export type CloudFrameOutputAttachmentName =
  | 'radianceTransmittance'
  | 'depthVelocity'
  | 'backgroundRadiance';

export interface CloudFrameOutputTextures {
  readonly radianceTransmittance: GPUTexture;
  readonly depthVelocity: GPUTexture;
  readonly backgroundRadiance: GPUTexture;
}

export interface CloudFrameOutputViews {
  readonly radianceTransmittance: GPUTextureView;
  readonly depthVelocity: GPUTextureView;
  readonly backgroundRadiance: GPUTextureView;
}

export type CloudFrameOutputClearAttachments = readonly [
  GPURenderPassColorAttachment,
  GPURenderPassColorAttachment,
  GPURenderPassColorAttachment,
];

export interface CloudFrameOutputResourcesOptions {
  device: GPUDevice;
  width: number;
  height: number;
  label?: string;
}

const BYTES_PER_RGBA16FLOAT_PIXEL = 8;
const ATTACHMENT_COUNT = 3;

interface CloudFrameOutputAllocation {
  textures: CloudFrameOutputTextures;
  views: CloudFrameOutputViews;
}

function normalizedExtent(value: number, dimension: 'width' | 'height'): number {
  if (!Number.isFinite(value) || value < 1) {
    throw new RangeError(`Cloud frame output ${dimension} must be a positive finite number; received ${value}`);
  }
  return Math.floor(value);
}

/**
 * Owns the full-resolution MRT output of the current cloud render.
 *
 * `resourceGeneration` identifies texture allocation changes, while
 * `contentRevision` identifies successful writes into the current allocation.
 * `discontinuityGeneration` is independent so temporal consumers can invalidate
 * history on camera cuts or other non-resource discontinuities.
 */
export class CloudFrameOutputResources {
  private readonly device: GPUDevice;
  private readonly label: string;
  private textureSet: CloudFrameOutputTextures | null = null;
  private viewSet: CloudFrameOutputViews | null = null;
  private destroyed = false;
  private currentWidth = 0;
  private currentHeight = 0;
  private currentAttachmentBytes = 0;
  private currentResourceGeneration = 0;
  private currentContentRevision = 0;
  private currentDiscontinuityGeneration = 0;

  constructor(options: CloudFrameOutputResourcesOptions) {
    this.device = options.device;
    this.label = options.label ?? 'cloud-frame-output';
    this.allocate(
      normalizedExtent(options.width, 'width'),
      normalizedExtent(options.height, 'height'),
    );
  }

  get textures(): CloudFrameOutputTextures {
    return this.requireTextures();
  }

  get views(): CloudFrameOutputViews {
    return this.requireViews();
  }

  get radianceTransmittanceTexture(): GPUTexture {
    return this.requireTextures().radianceTransmittance;
  }

  get depthVelocityTexture(): GPUTexture {
    return this.requireTextures().depthVelocity;
  }

  get backgroundRadianceTexture(): GPUTexture {
    return this.requireTextures().backgroundRadiance;
  }

  get radianceTransmittanceView(): GPUTextureView {
    return this.requireViews().radianceTransmittance;
  }

  get depthVelocityView(): GPUTextureView {
    return this.requireViews().depthVelocity;
  }

  get backgroundRadianceView(): GPUTextureView {
    return this.requireViews().backgroundRadiance;
  }

  get width(): number {
    return this.currentWidth;
  }

  get height(): number {
    return this.currentHeight;
  }

  get attachmentBytes(): number {
    return this.currentAttachmentBytes;
  }

  get resourceGeneration(): number {
    return this.currentResourceGeneration;
  }

  get contentRevision(): number {
    return this.currentContentRevision;
  }

  get discontinuityGeneration(): number {
    return this.currentDiscontinuityGeneration;
  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }

  /**
   * Returns attachments in shader-location order: radiance/transmittance,
   * depth/velocity, then background radiance.
   */
  createClearAttachments(): CloudFrameOutputClearAttachments {
    const views = this.requireViews();
    return [
      {
        view: views.radianceTransmittance,
        clearValue: CLOUD_FRAME_OUTPUT_CLEAR_VALUES.radianceTransmittance,
        loadOp: 'clear',
        storeOp: 'store',
      },
      {
        view: views.depthVelocity,
        clearValue: CLOUD_FRAME_OUTPUT_CLEAR_VALUES.depthVelocity,
        loadOp: 'clear',
        storeOp: 'store',
      },
      {
        view: views.backgroundRadiance,
        clearValue: CLOUD_FRAME_OUTPUT_CLEAR_VALUES.backgroundRadiance,
        loadOp: 'clear',
        storeOp: 'store',
      },
    ];
  }

  /** Returns true only when a new allocation was created. */
  resize(width: number, height: number): boolean {
    this.assertAlive('resize');
    const nextWidth = normalizedExtent(width, 'width');
    const nextHeight = normalizedExtent(height, 'height');
    if (nextWidth === this.width && nextHeight === this.height) return false;

    const nextAllocation = this.createAllocation(nextWidth, nextHeight);
    this.releaseTextures();
    this.installAllocation(nextAllocation, nextWidth, nextHeight);
    return true;
  }

  markContent(): number {
    this.assertAlive('markContent');
    this.currentContentRevision++;
    return this.currentContentRevision;
  }

  markDiscontinuity(): number {
    this.assertAlive('markDiscontinuity');
    this.currentDiscontinuityGeneration++;
    return this.currentDiscontinuityGeneration;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.releaseTextures();
    this.currentWidth = 0;
    this.currentHeight = 0;
    this.currentAttachmentBytes = 0;
    this.currentResourceGeneration++;
    this.currentDiscontinuityGeneration++;
    this.destroyed = true;
  }

  private allocate(width: number, height: number): void {
    this.installAllocation(this.createAllocation(width, height), width, height);
  }

  private createAllocation(width: number, height: number): CloudFrameOutputAllocation {
    const usage = GPUTextureUsage.RENDER_ATTACHMENT
      | GPUTextureUsage.TEXTURE_BINDING
      | GPUTextureUsage.COPY_SRC;
    const created: GPUTexture[] = [];
    const createTexture = (name: CloudFrameOutputAttachmentName): GPUTexture => {
      const texture = this.device.createTexture({
        label: `${this.label}-${name}`,
        size: [width, height, 1],
        dimension: '2d',
        format: CLOUD_FRAME_OUTPUT_FORMAT,
        usage,
      });
      created.push(texture);
      return texture;
    };

    try {
      const radianceTransmittance = createTexture('radianceTransmittance');
      const depthVelocity = createTexture('depthVelocity');
      const backgroundRadiance = createTexture('backgroundRadiance');
      return {
        textures: Object.freeze({
          radianceTransmittance,
          depthVelocity,
          backgroundRadiance,
        }),
        views: Object.freeze({
          radianceTransmittance: radianceTransmittance.createView(),
          depthVelocity: depthVelocity.createView(),
          backgroundRadiance: backgroundRadiance.createView(),
        }),
      };
    } catch (error) {
      for (const texture of created) texture.destroy();
      throw error;
    }
  }

  private installAllocation(
    allocation: CloudFrameOutputAllocation,
    width: number,
    height: number,
  ): void {
    this.textureSet = allocation.textures;
    this.viewSet = allocation.views;
    this.currentWidth = width;
    this.currentHeight = height;
    this.currentAttachmentBytes = width * height * BYTES_PER_RGBA16FLOAT_PIXEL * ATTACHMENT_COUNT;
    this.currentResourceGeneration++;
    this.currentDiscontinuityGeneration++;
  }

  private releaseTextures(): void {
    if (this.textureSet) {
      this.textureSet.radianceTransmittance.destroy();
      this.textureSet.depthVelocity.destroy();
      this.textureSet.backgroundRadiance.destroy();
    }
    this.textureSet = null;
    this.viewSet = null;
  }

  private requireTextures(): CloudFrameOutputTextures {
    this.assertAlive('read textures');
    if (!this.textureSet) throw new Error('Cloud frame output textures are unavailable');
    return this.textureSet;
  }

  private requireViews(): CloudFrameOutputViews {
    this.assertAlive('read views');
    if (!this.viewSet) throw new Error('Cloud frame output views are unavailable');
    return this.viewSet;
  }

  private assertAlive(operation: string): void {
    if (this.destroyed) {
      throw new Error(`CloudFrameOutputResources.${operation} rejected: destroyed`);
    }
  }
}
