# Procedural Clouds (WebGPU)

Real-time procedural volumetric clouds rendered with WebGPU. The project combines a compute pass that populates a 3D density cache with a full-screen ray-march render pass, exposing a set of artistic controls via `lil-gui`.

## Features
- WebGPU ray-marched volumetric clouds
- Compute shader density cache for faster rendering
- Three switchable ground-shadow paths: Legacy, Adaptive, and cached Transmittance
- Adjustable cloud appearance and lighting controls
- Cities: Skylines–style camera: WASD pan, Q/E height, drag orbit, scroll zoom (wall-clock, independent of simulation speed)
- Performance panel via `stats.js`

## Requirements
- A WebGPU-capable browser. If WebGPU is unavailable, the page renders a simple message instead of the scene.
- Node.js + npm for local development

## Quick Start
```bash
npm install
npm run dev
```
Then open the URL printed by Vite (typically `http://localhost:5173`).

## Public Debugging

Start the Vite development server and a temporary Cloudflare Quick Tunnel with one command:

```bash
npm run dev:public
```

Open the HTTPS `https://...trycloudflare.com` URL printed by the `tunnel` process. No Cloudflare account or token is required. The public URL remains available only while this command is running; press `Ctrl+C` to stop both the tunnel and the local server.

Quick Tunnels are intended only for temporary testing. Anyone with the generated URL can reach the development server, so do not expose sensitive local content or share the URL more widely than necessary.

## Controls
The UI panel exposes these parameters:
- `Density`: Overall cloud density multiplier
- `Coverage`: Macro coverage factor
- `Scale`: Noise scale (now up to 15)
- `Altitude`: Base altitude of the cloud layer
- `Detail`: Higher-frequency noise contribution
- `Wind Speed (m/s)`: Horizontal density-advection speed in metres per second
- `Wind Dir °`: Direction the density moves toward (`0° = +X`, `90° = +Z`)
- `Reset Wind Phase`: Clears accumulated manual advection without moving the body control bounds
- `Simulation Speed`: Game-style `0× / 1× / 2× / 4×` button group. `0×` replaces the old manual pause checkbox and freezes cloud evolution without stopping rendering or camera controls
- `Skip Light March`: Toggles light marching in the shader
- `Ray Steps`: Number of ray-march steps per pixel
- `Light Steps`: Number of light-march steps
- `Shadow Dark`: Shadow intensity
- `Sun Intensity`: Direct light intensity
- `Cloud Height`: Vertical thickness of the cloud layer
- `Cache Res`: Density cache resolution (3D texture size)
- `Cache Update`: Update frequency of the cache (every N frames)
- `Cache Smooth`: Blend smoothing between cache updates
- `Shadow Mode`: `Legacy` fixed-step baseline, `Adaptive` world-stable integration, or `Transmittance` world-space cache
- `Map Resolution`: Ground-shadow transmittance map size (`256`, `512`, or `1024`)
- `Map Update Interval`, `History Weight`, and `Filter Radius`: Temporal/spatial stability controls for Transmittance mode

Camera controls (Cities: Skylines–style):
- Drag to orbit around the look-at target
- Scroll to zoom
- `W` `A` `S` `D` / arrow keys: pan the target on XZ
- `Q` / `E`: lower / raise the target
- `Shift`: move faster
- Gizmo handle drags take priority over orbit

Cloud-body bounds define the saved authoring placement. At runtime, integrated wind displacement transports the complete cloud footprint and density through world XZ; wireframes and gizmos follow the transported position while the saved bounds remain unchanged.

Scenario exports use `schemaVersion: 3`, `distanceUnit: "m"`, and `windUnit: "m/s"`. The loader still accepts v2 and unversioned scenarios; their legacy wind speeds are interpreted as world-units per second and converted with `horizontalMetersPerWorldUnit` so existing motion is preserved.

Simulation speed is a runtime preference, not scenario data. It scales the manual clock, lifecycle, wind advection, morph time, and scenario playhead from one CPU time source. Scenario play/pause remains independent, while manual freezing uses the `0×` button. Timeline scrub always selects an absolute scene time. Rendering, camera motion, TAA, and performance timing continue at wall-clock speed.

## How It Works

For a source-level Chinese walkthrough of parameter flow, density mathematics, all ten genera, Cached/Hybrid sampling, and the rendering pipeline, see [docs/cloud-density-rendering-architecture.md](docs/cloud-density-rendering-architecture.md).

1. **Compute pass** (`shaders/noise.wgsl` + `shaders/cloud.wgsl`):
   - Writes a 3D density texture (the cache) at a configurable resolution.
2. **Render pass** (`shaders/cloud.wgsl`):
   - Ray-marches through the cached density to shade clouds with lighting.
3. **Ground-shadow passes** (`shaders/cloud.wgsl` + `shaders/ground-shadow-resolve.wgsl`):
   - Optionally build a world-space 2D transmittance map, apply separable tent filtering, and accumulate independent temporal history.
4. **Parameter packing** (`src/params.ts`):
   - UI values are packed into a uniform buffer and consumed by both passes.

## WebGPU Implementation Details
The renderer uses two pipelines and a small set of bind groups to keep per-frame work minimal.

### Pipelines
- **Compute pipeline** (`cs` entry point): populates a 3D density cache each update.
- **Ground-shadow pipelines** (`csGroundShadow`, `csGroundShadowFilter`, `csGroundShadowResolve`): build and stabilize the optional 2D transmittance cache.
- **Render pipeline** (`vs`/`fs` entry points): draws a single full-screen triangle and performs ray marching in the fragment shader.

### Resources and Bind Groups
- **Uniform buffers**:
  - `cameraBuffer` (80 bytes): inverse view-projection matrix (64 bytes) + camera position (vec3 + pad).
  - `paramsBuffer` (1200 bytes): globals plus twelve packed cloud-body records, shared by compute and render stages.
- **Bind groups**:
  - Group 0: `cameraBuffer`, `paramsBuffer`.
  - Group 1: sampler + two 3D texture views (for sampling the density cache).
  - Group 2 (compute only): storage texture view for writing the current cache.
  - Group 3 (render only): sampler + current ground-shadow transmittance history.

### Density Cache (3D Texture)
- Format: `rgba16float`, size `cacheResolution³`.
- Usage: `STORAGE_BINDING | TEXTURE_BINDING`.
- Two textures are used for **ping-pong**:
  - One texture is written by the compute pass.
  - The other is sampled by the render pass.
  - The roles swap based on `cacheUpdateRate`, with optional temporal smoothing via `cacheSmooth`.

### Sampling Strategy
- The density cache is sampled with a linear sampler for smooth transitions.
- The render pass uses the two cached volumes and blends between them to avoid popping.
- Adaptive ground shadows derive their bounded step count from the effective light path and density-voxel size, with stable world-space stratified jitter.
- Transmittance mode amortizes the same integrator into a default `512² rgba16float` world-space map. Invalid or out-of-bounds samples fall back to Adaptive, with a blended guard band at map edges.

### Camera and Matrices
- Cities: Skylines–style look-at camera: pan the target with WASD, raise/lower with Q/E, orbit with drag, zoom with scroll.
- Spherical coordinates `(theta, phi, dist)` around a movable target; each frame builds `view`, `projection`, and `inverse view-projection` on the CPU.
- The inverse view-projection is used in the fragment shader to reconstruct world-space ray directions.
- Camera motion uses exponential smoothing (inertia) and wall-clock time (independent of simulation speed).

### Render Loop Overview
1. Update camera smoothing and time-dependent parameters.
2. Update uniform buffers via `queue.writeBuffer`.
3. If needed, run the compute pass to refresh the density cache.
4. If Transmittance mode needs an update, rebuild/filter/accumulate its independent shadow history.
5. Run the render pass to ray-march clouds into the swap chain texture.

## Performance Notes
- Increasing `Ray Steps`, `Light Steps`, and `Cache Res` can be expensive.
- `Cache Update` and `Cache Smooth` let you trade temporal stability for speed.
- Legacy and Adaptive bypass the transmittance compute/filter passes. At the default `512²`, Transmittance uses about 8 MiB across raw, filtered, and two history textures.

## License
See `LICENSE`.
