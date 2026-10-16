'use strict'

const nbt = require('prismarine-nbt')
const UUID = require('uuid-1345')
const zlib = require('zlib')
const [, writeVarInt, sizeOfVarInt] = require('protodef').types.varint
const [readLpVec3, writeLpVec3, sizeOfLpVec3] = require('./lpVec3')
const [readVecDelta, writeVecDelta, sizeOfVecDelta] = require('./vecDelta')

module.exports = {
  varlong: [readVarLong, writeVarLong, sizeOfVarLong],
  UUID: [readUUID, writeUUID, 16],
  compressedNbt: [readCompressedNbt, writeCompressedNbt, sizeOfCompressedNbt],
  restBuffer: [readRestBuffer, writeRestBuffer, sizeOfRestBuffer],
  entityMetadataLoop: [readEntityMetadata, writeEntityMetadata, sizeOfEntityMetadata],
  topBitSetTerminatedArray: [readTopBitSetTerminatedArray, writeTopBitSetTerminatedArray, sizeOfTopBitSetTerminatedArray],
  lpVec3: [readLpVec3, writeLpVec3, sizeOfLpVec3],
  vecDelta: [readVecDelta, writeVecDelta, sizeOfVecDelta]
}
const PartialReadError = require('protodef').utils.PartialReadError

// vanilla's VarLong: a signed 64-bit long written as up to 10 groups of 7 bits, two's complement (a negative long
// always takes 10 bytes). Read as a Number while it is a safe integer (every value a 32-bit varint read got right
// stays a Number, so `record >> 12` and the like keep working), as a BigInt beyond that. Written from a Number,
// a BigInt or protodef's [hi, lo] i64 pair.
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER)

function readVarLong (buffer, offset) {
  let cursor = offset
  // up to 4 bytes (28 bits): plain Number arithmetic
  let result = 0
  for (let shift = 0; shift < 28; shift += 7) {
    if (cursor >= buffer.length) throw new PartialReadError('Unexpected buffer end while reading VarLong')
    const byte = buffer[cursor++]
    result |= (byte & 0x7F) << shift
    if (!(byte & 0x80)) return { value: result, size: cursor - offset }
  }
  let big = BigInt(result)
  for (let shift = 28n; ; shift += 7n) {
    if (shift > 63n) throw new Error('VarLong is too big')
    if (cursor >= buffer.length) throw new PartialReadError('Unexpected buffer end while reading VarLong')
    const byte = buffer[cursor++]
    big |= BigInt(byte & 0x7F) << shift
    if (!(byte & 0x80)) break
  }
  big = BigInt.asIntN(64, big)
  return { value: (big <= MAX_SAFE && big >= -MAX_SAFE) ? Number(big) : big, size: cursor - offset }
}

function toUnsignedLong (value) {
  if (Array.isArray(value)) value = (BigInt(value[0]) << 32n) | BigInt(value[1] >>> 0)
  return BigInt.asUintN(64, BigInt(value))
}

function writeVarLong (value, buffer, offset) {
  if (typeof value === 'number' && value >= 0 && value <= 0x7FFFFFFF) return writeVarInt(value, buffer, offset)
  let v = toUnsignedLong(value)
  while (v > 0x7Fn) {
    buffer.writeUInt8(Number(v & 0x7Fn) | 0x80, offset++)
    v >>= 7n
  }
  buffer.writeUInt8(Number(v), offset++)
  return offset
}

function sizeOfVarLong (value) {
  if (typeof value === 'number' && value >= 0 && value <= 0x7FFFFFFF) return sizeOfVarInt(value)
  let v = toUnsignedLong(value)
  let size = 1
  while (v > 0x7Fn) {
    v >>= 7n
    size++
  }
  return size
}

function readUUID (buffer, offset) {
  if (offset + 16 > buffer.length) { throw new PartialReadError() }
  return {
    value: UUID.stringify(buffer.slice(offset, 16 + offset)),
    size: 16
  }
}

function writeUUID (value, buffer, offset) {
  const buf = value.length === 32 ? Buffer.from(value, 'hex') : UUID.parse(value)
  buf.copy(buffer, offset)
  return offset + 16
}

function sizeOfNbt (value, { tagType } = { tagType: 'nbt' }) {
  return nbt.proto.sizeOf(value, tagType)
}

// Length-prefixed compressed NBT, see differences: http://wiki.vg/index.php?title=Slot_Data&diff=6056&oldid=4753
function readCompressedNbt (buffer, offset) {
  if (offset + 2 > buffer.length) { throw new PartialReadError() }
  const length = buffer.readInt16BE(offset)
  if (length === -1) return { size: 2 }
  if (offset + 2 + length > buffer.length) { throw new PartialReadError() }

  const compressedNbt = buffer.slice(offset + 2, offset + 2 + length)

  let nbtBuffer
  try {
    nbtBuffer = zlib.gunzipSync(compressedNbt) // TODO: async
  } catch (err) {
    throw new PartialReadError('zlib decompress failed: ' + err.message)
  }

  const results = nbt.proto.read(nbtBuffer, 0, 'nbt')
  return {
    size: length + 2,
    value: results.value
  }
}

function writeCompressedNbt (value, buffer, offset) {
  if (value === undefined) {
    buffer.writeInt16BE(-1, offset)
    return offset + 2
  }
  const nbtBuffer = Buffer.alloc(sizeOfNbt(value))
  nbt.proto.write(value, nbtBuffer, 0, 'nbt')

  const compressedNbt = zlib.gzipSync(nbtBuffer) // TODO: async
  compressedNbt.writeUInt8(0, 9) // clear the OS field to match MC

  buffer.writeInt16BE(compressedNbt.length, offset)
  compressedNbt.copy(buffer, offset + 2)
  return offset + 2 + compressedNbt.length
}

function sizeOfCompressedNbt (value) {
  if (value === undefined) { return 2 }

  const nbtBuffer = Buffer.alloc(sizeOfNbt(value, { tagType: 'nbt' }))
  nbt.proto.write(value, nbtBuffer, 0, 'nbt')

  const compressedNbt = zlib.gzipSync(nbtBuffer) // TODO: async

  return 2 + compressedNbt.length
}

function readRestBuffer (buffer, offset) {
  return {
    value: buffer.slice(offset),
    size: buffer.length - offset
  }
}

function writeRestBuffer (value, buffer, offset) {
  value.copy(buffer, offset)
  return offset + value.length
}

function sizeOfRestBuffer (value) {
  return value.length
}

function readEntityMetadata (buffer, offset, { type, endVal }) {
  let cursor = offset
  const metadata = []
  let item
  while (true) {
    if (offset + 1 > buffer.length) { throw new PartialReadError() }
    item = buffer.readUInt8(cursor)
    if (item === endVal) {
      return {
        value: metadata,
        size: cursor + 1 - offset
      }
    }
    const results = this.read(buffer, cursor, type, {})
    metadata.push(results.value)
    cursor += results.size
  }
}

function writeEntityMetadata (value, buffer, offset, { type, endVal }) {
  const self = this
  value.forEach(function (item) {
    offset = self.write(item, buffer, offset, type, {})
  })
  buffer.writeUInt8(endVal, offset)
  return offset + 1
}

function sizeOfEntityMetadata (value, { type }) {
  let size = 1
  for (let i = 0; i < value.length; ++i) {
    size += this.sizeOf(value[i], type, {})
  }
  return size
}

function readTopBitSetTerminatedArray (buffer, offset, { type }) {
  let cursor = offset
  const values = []
  let item
  while (true) {
    if (offset + 1 > buffer.length) { throw new PartialReadError() }
    item = buffer.readUInt8(cursor)
    // the element reads its first byte without the top bit; the caller's buffer gets it back afterwards
    buffer[cursor] = item & 127
    let results
    try { results = this.read(buffer, cursor, type, {}) } finally { buffer[cursor] = item }
    values.push(results.value)
    cursor += results.size
    if ((item & 128) === 0) { // check if top bit is set, if not last value
      return {
        value: values,
        size: cursor - offset
      }
    }
  }
}

function writeTopBitSetTerminatedArray (value, buffer, offset, { type }) {
  const self = this
  let prevOffset = offset
  value.forEach(function (item, i) {
    prevOffset = offset
    offset = self.write(item, buffer, offset, type, {})
    buffer[prevOffset] = i !== value.length - 1 ? (buffer[prevOffset] | 128) : buffer[prevOffset] // set top bit for all values but last
  })
  return offset
}

function sizeOfTopBitSetTerminatedArray (value, { type }) {
  let size = 0
  for (let i = 0; i < value.length; ++i) {
    size += this.sizeOf(value[i], type, {})
  }
  return size
}
