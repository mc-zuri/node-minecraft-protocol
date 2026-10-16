/* eslint-env mocha */
const assert = require('assert')
const mc = require('../')
const [readVarLong, writeVarLong, sizeOfVarLong] = require('../src/datatypes/minecraft').varlong

// vanilla's VarLong (FriendlyByteBuf.writeVarLong): 7 bits a byte of the long's two's complement
const CASES = [
  [0, '00'],
  [300, 'ac02'],
  [2147483647, 'ffffffff07'],
  [2147483648, '8080808008'],
  [2 ** 40, '808080808020'],
  [-1, 'ffffffffffffffffff01'],
  // a 26.3 camel's LAST_POSE_CHANGE_TICK (-gameTime), entity data type 2
  [-4828, 'a4daffffffffffffff01'],
  [Number.MAX_SAFE_INTEGER, 'ffffffffffffff0f'],
  [2n ** 63n - 1n, 'ffffffffffffffff7f'],
  [-(2n ** 63n), '80808080808080808001']
]

describe('varlong', () => {
  for (const [value, hex] of CASES) {
    it(`reads and writes ${value} as ${hex}`, () => {
      const read = readVarLong(Buffer.from(hex, 'hex'), 0)
      assert.strictEqual(read.value, value)
      assert.strictEqual(read.size, hex.length / 2)
      assert.strictEqual(sizeOfVarLong(value), hex.length / 2)
      const buffer = Buffer.alloc(hex.length / 2)
      assert.strictEqual(writeVarLong(value, buffer, 0), hex.length / 2)
      assert.strictEqual(buffer.toString('hex'), hex)
    })
  }

  it('writes protodef\'s [hi, lo] i64 pair', () => {
    const buffer = Buffer.alloc(10)
    writeVarLong([-1, -4828 >>> 0], buffer, 0)
    assert.strictEqual(buffer.toString('hex'), 'a4daffffffffffffff01')
  })

  it('round-trips a 26.3 camel\'s entity data byte for byte', () => {
    const bytes = Buffer.from('653406140a1402a4daffffffffffffff01ff', 'hex')
    const packet = mc.createDeserializer({ state: 'play', isServer: false, version: '26.3' }).parsePacketBuffer(bytes)
    assert.deepStrictEqual(packet.data.params.metadata[1], { key: 20, type: 'long', value: -4828 })
    const written = mc.createSerializer({ state: 'play', isServer: true, version: '26.3' }).createPacketBuffer(packet.data)
    assert.strictEqual(written.toString('hex'), bytes.toString('hex'))
  })
})
