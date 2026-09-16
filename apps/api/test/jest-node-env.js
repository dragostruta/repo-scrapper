'use strict';

const NodeEnvironment = require('jest-environment-node').TestEnvironment;

/**
 * Jest's default node environment runs each test file inside its own V8
 * vm.Context, which gets its own copies of built-in constructors (Array,
 * Float32Array, ...). onnxruntime-node's native addon validates tensor
 * data with a strict `data.constructor === Float32Array` check against the
 * *outer* Node process's Float32Array, so a typed array created inside
 * Jest's sandboxed realm fails that check even though it is, in every
 * practical sense, a Float32Array. This shows up as:
 *
 *   TypeError: A float32 tensor's data must be type of function
 *   Float32Array() { [native code] }
 *
 * Rebinding the typed-array constructors (and a few related globals) in
 * the sandboxed realm to the outer realm's versions fixes the identity
 * check without disabling Jest's module isolation.
 */
class SingleRealmNodeEnvironment extends NodeEnvironment {
  constructor(config, context) {
    super(config, context);

    const globalsToShare = [
      'ArrayBuffer',
      'SharedArrayBuffer',
      'Int8Array',
      'Uint8Array',
      'Uint8ClampedArray',
      'Int16Array',
      'Uint16Array',
      'Int32Array',
      'Uint32Array',
      'Float32Array',
      'Float64Array',
      'BigInt64Array',
      'BigUint64Array',
      'DataView',
    ];

    for (const name of globalsToShare) {
      this.global[name] = global[name];
    }
  }
}

module.exports = SingleRealmNodeEnvironment;
