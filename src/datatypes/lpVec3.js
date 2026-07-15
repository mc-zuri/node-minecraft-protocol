const [readVarInt, writeVarInt, sizeOfVarInt] = require('protodef').types.varint

// Low-precision Vec3 (vanilla net.minecraft.network.LpVec3). A 48-bit buffer packs a 2-bit scale
// exponent + 3×15-bit quantized components; the 4-byte "highest" word is big-endian (Netty writeInt),
// and the buffer/shifts exceed 32 bits, so BigInt is required for a byte-exact round-trip.
const MAX_QUANTIZED_VALUE = 32766.0
const DATA_BITS_MASK = 32767n
const ABS_MIN_VALUE = 3.051944088384301e-5
const ABS_MAX_VALUE = 1.7179869183e10

function sanitize (value) {
  if (isNaN(value)) return 0.0
  return Math.max(-ABS_MAX_VALUE, Math.min(value, ABS_MAX_VALUE))
}

function pack (value) {
  return Math.round((value * 0.5 + 0.5) * MAX_QUANTIZED_VALUE)
}

function unpack (value) {
  return Math.min(Number(value & DATA_BITS_MASK), MAX_QUANTIZED_VALUE) * 2.0 / MAX_QUANTIZED_VALUE - 1.0
}

function readLpVec3 (buffer, offset) {
  const lowest = buffer.readUInt8(offset)
  if (lowest === 0) {
    return { value: { x: 0, y: 0, z: 0 }, size: 1 }
  }
  const middle = buffer.readUInt8(offset + 1)
  const highest = buffer.readUInt32BE(offset + 2) // Netty writeInt is big-endian
  const buf = (BigInt(highest) << 16n) | (BigInt(middle) << 8n) | BigInt(lowest)

  let scale = BigInt(lowest & 3)
  let size = 6
  if ((lowest & 4) === 4) {
    const { value: cont, size: contSize } = readVarInt(buffer, offset + 6)
    scale |= (BigInt(cont >>> 0)) << 2n
    size += contSize
  }
  const sc = Number(scale)
  return {
    value: {
      x: unpack(buf >> 3n) * sc,
      y: unpack(buf >> 18n) * sc,
      z: unpack(buf >> 33n) * sc
    },
    size
  }
}

function writeLpVec3 (value, buffer, offset) {
  const x = sanitize(value.x)
  const y = sanitize(value.y)
  const z = sanitize(value.z)
  const chessboardLength = Math.max(Math.abs(x), Math.abs(y), Math.abs(z))

  if (chessboardLength < ABS_MIN_VALUE) {
    buffer.writeUInt8(0, offset)
    return offset + 1
  }

  const scale = BigInt(Math.ceil(chessboardLength)) // Mth.ceilLong
  const sc = Number(scale)
  const isPartial = (scale & 3n) !== scale
  const markers = isPartial ? ((scale & 3n) | 4n) : scale
  const buf = markers |
    (BigInt(pack(x / sc)) << 3n) |
    (BigInt(pack(y / sc)) << 18n) |
    (BigInt(pack(z / sc)) << 33n)

  buffer.writeUInt8(Number(buf & 0xFFn), offset)
  buffer.writeUInt8(Number((buf >> 8n) & 0xFFn), offset + 1)
  buffer.writeUInt32BE(Number((buf >> 16n) & 0xFFFFFFFFn), offset + 2)

  if (isPartial) {
    return writeVarInt(Number(scale >> 2n), buffer, offset + 6)
  }
  return offset + 6
}

function sizeOfLpVec3 (value) {
  const chessboardLength = Math.max(Math.abs(value.x), Math.abs(value.y), Math.abs(value.z))
  if (chessboardLength < ABS_MIN_VALUE) return 1
  const scale = BigInt(Math.ceil(chessboardLength))
  if ((scale & 3n) !== scale) {
    return 6 + sizeOfVarInt(Number(scale >> 2n))
  }
  return 6
}

module.exports = [readLpVec3, writeLpVec3, sizeOfLpVec3]
