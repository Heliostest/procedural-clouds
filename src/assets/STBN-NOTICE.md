# Spatiotemporal blue-noise asset

`stbn.bin` is imported from
`takram-design-engineering/three-geospatial@b012ad06d858fc035d88aacfd73f092f93c994e4`,
`packages/core/assets/stbn.bin`.

- Dimensions: 128 x 128 x 64
- Format: unsigned 8-bit scalar (`r8unorm` at runtime)
- SHA-256: `51f52f21e5578384585050390821a0a486dcb81e11a716fa7b92fbb6515ba852`
- Upstream project: `three-geospatial`, Copyright (c) 2024 Shota Matsuda
- Upstream license: MIT
- Algorithm/resource role: scalar Spatiotemporal Blue Noise used at screen XY and frame slice Z

The renderer treats this resource as optional. Missing, truncated, or hash-mismatched
data binds a 1 x 1 x 1 dummy texture and selects the deterministic IGN fallback.

## MIT License

Copyright (c) 2024 Shota Matsuda

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
