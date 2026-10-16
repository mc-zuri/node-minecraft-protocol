/* eslint-env mocha */
const assert = require('assert')
const mc = require('../')

// entity_equipment (ClientboundSetEquipmentPacket): each slot byte has the top bit set when another entry follows.
// Reading must leave the caller's buffer as it was (it used to clear that bit in place).
describe('topBitSetTerminatedArray', () => {
  for (const version of ['1.21.11', '26.3']) {
    it(`reads entity_equipment without changing the buffer (${version})`, () => {
      const reader = mc.createDeserializer({ state: 'play', isServer: false, version, noErrorLogging: true })
      const writer = mc.createSerializer({ state: 'play', isServer: true, version })
      // a happy ghast's body (harness) and saddle slots, as a 26.3 server sent them
      const packet = writer.createPacketBuffer({
        name: 'entity_equipment',
        params: { entityId: 55, equipments: [{ slot: 6, item: { itemCount: 1, itemId: 950, addedComponentCount: 0, removedComponentCount: 0, components: [], removeComponents: [] } }, { slot: 7, item: { itemCount: 1, itemId: 949, addedComponentCount: 0, removedComponentCount: 0, components: [], removeComponents: [] } }] }
      })
      const before = Buffer.from(packet)
      const parsed = reader.parsePacketBuffer(packet)
      assert.deepStrictEqual(packet, before)
      assert.deepStrictEqual(parsed.data.params.equipments.map(e => e.slot), [6, 7])
      assert.deepStrictEqual(writer.createPacketBuffer(parsed.data), before)
    })
  }
})
