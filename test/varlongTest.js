/* eslint-env mocha */
const assert = require('assert')
const [readVarLong, writeVarLong, sizeOfVarLong] = require('../src/datatypes/minecraft').varlong

// The smallest and largest value of every encoded length, as VarLong.write emits them.
// A negative long always takes the full 10 bytes.
const VANILLA_ENCODINGS = [
  [0n, '00'],
  [127n, '7f'],
  [128n, '8001'],
  [16383n, 'ff7f'],
  [16384n, '808001'],
  [2097151n, 'ffff7f'],
  [2097152n, '80808001'],
  [268435455n, 'ffffff7f'],
  [268435456n, '8080808001'],
  [34359738367n, 'ffffffff7f'],
  [34359738368n, '808080808001'],
  [4398046511103n, 'ffffffffff7f'],
  [4398046511104n, '80808080808001'],
  [562949953421311n, 'ffffffffffff7f'],
  [562949953421312n, '8080808080808001'],
  [72057594037927935n, 'ffffffffffffff7f'],
  [72057594037927936n, '808080808080808001'],
  [9223372036854775807n, 'ffffffffffffffff7f'],
  [-9223372036854775808n, '80808080808080808001'],
  [-2147483648n, '80808080f8ffffffff01'],
  [-1n, 'ffffffffffffffffff01']
]

function write (value) {
  const buffer = Buffer.alloc(sizeOfVarLong(value))
  assert.strictEqual(writeVarLong(value, buffer, 0), buffer.length, 'sizeOf and write disagree for ' + value)
  return buffer.toString('hex')
}

describe('varlong', () => {
  it('covers every encoded length', () => {
    const lengths = new Set(VANILLA_ENCODINGS.map(([, hex]) => hex.length / 2))
    assert.deepStrictEqual([...lengths], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('reads vanilla bytes as a signed 64-bit value', () => {
    for (const [long, hex] of VANILLA_ENCODINGS) {
      const result = readVarLong(Buffer.from(hex, 'hex'), 0)
      assert.strictEqual(result.value, long, 'unexpected value for ' + hex)
      assert.strictEqual(result.size, hex.length / 2)
    }
  })

  it('writes the bytes vanilla writes', () => {
    for (const [long, hex] of VANILLA_ENCODINGS) {
      assert.strictEqual(write(long), hex)
    }
  })

  it('writes numbers and bigints alike', () => {
    for (const value of [-20, -20n]) {
      assert.strictEqual(write(value), 'ecffffffffffffffff01')
    }
  })

  it('rejects an encoding longer than 10 bytes', () => {
    assert.throws(() => readVarLong(Buffer.from('8080808080808080808001', 'hex'), 0))
  })
})
