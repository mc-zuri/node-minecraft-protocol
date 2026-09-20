/* eslint-env mocha */
const assert = require('assert')
const { Duplex } = require('stream')
const debug = require('debug')
const mc = require('../')
const { createSerializer } = require('../src/transforms/serializer')

const version = '1.21.4'

function frame (name, params) {
  const packet = createSerializer({ state: 'play', isServer: true, version }).createPacketBuffer({ name, params })
  return Buffer.concat([Buffer.from([packet.length]), packet])
}

describe('debug logging', () => {
  let namespaces, log

  before(() => {
    namespaces = debug.disable()
    log = debug.log
    debug.log = () => {}
    debug.enable('minecraft-protocol')
  })

  after(() => {
    debug.log = log
    debug.enable(namespaces)
  })

  it('still delivers a packet that holds a BigInt', (done) => {
    const socket = new Duplex({ read () {}, write (chunk, encoding, callback) { callback() } })
    const client = new mc.Client(false, version)
    client.setSocket(socket)
    client.state = 'play'
    client.on('error', done)
    client.on('world_border_lerp_size', (packet) => {
      assert.strictEqual(packet.speed, 5000n)
      done()
    })
    socket.push(frame('world_border_lerp_size', { oldDiameter: 1, newDiameter: 2, speed: 5000n }))
  })
})
