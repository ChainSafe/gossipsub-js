/* eslint-env mocha */
/* eslint max-nested-callbacks: ["error", 8] */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const delay = require('delay')
const promisify = require('promisify-es6')
const uint8ArrayFromString = require('uint8arrays/from-string')

const {
  createGossipsubs,
  expectSet,
  stopNode,
} = require('./utils')

describe('multiple nodes (more than 2)', () => {
  describe('every peer subscribes to the topic', () => {
    describe('line', () => {
      // line
      // ◉────◉────◉
      // a    b    c
      describe('subscribe', () => {
        let a, b, c, nodes
        const topic = 'Z'

        // Create pubsub nodes
        before(async () => {
          nodes = await createGossipsubs({ number: 3 })

          a = nodes[0]
          b = nodes[1]
          c = nodes[2]

          await Promise.all([
            a._libp2p.dialProtocol(b._libp2p.peerId, a.multicodecs),
            b._libp2p.dialProtocol(c._libp2p.peerId, b.multicodecs)
          ])
        })

        after(() => Promise.all(nodes.map(stopNode)))

        it('subscribe to the topic on all nodes', async () => {
          a.subscribe(topic)
          b.subscribe(topic)
          c.subscribe(topic)

          expectSet(a.subscriptions, [topic])
          expectSet(b.subscriptions, [topic])
          expectSet(c.subscriptions, [topic])

          await delay(30)

          await Promise.all([
            promisify(a.once.bind(a))('gossipsub:heartbeat'),
            promisify(b.once.bind(b))('gossipsub:heartbeat'),
            promisify(c.once.bind(c))('gossipsub:heartbeat')
          ])

          expect(a.peers.size).to.equal(1)
          expect(b.peers.size).to.equal(2)
          expect(c.peers.size).to.equal(1)

          const aPeerId = a.peerId.toB58String()
          const bPeerId = b.peerId.toB58String()
          const cPeerId = c.peerId.toB58String()

          expectSet(a.peers.get(bPeerId).topics, [topic])
          expectSet(b.peers.get(aPeerId).topics, [topic])
          expectSet(b.peers.get(cPeerId).topics, [topic])
          expectSet(c.peers.get(bPeerId).topics, [topic])

          expect(a.mesh.get(topic).size).to.equal(1)
          expect(b.mesh.get(topic).size).to.equal(2)
          expect(c.mesh.get(topic).size).to.equal(1)
        })
      })

      describe('publish', () => {
        let a, b, c, nodes
        const topic = 'Z'

        // Create pubsub nodes
        before(async () => {
          nodes = await createGossipsubs({ number: 3 })

          a = nodes[0]
          b = nodes[1]
          c = nodes[2]

          await Promise.all([
            a._libp2p.dialProtocol(b._libp2p.peerId, a.multicodecs),
            b._libp2p.dialProtocol(c._libp2p.peerId, b.multicodecs)
          ])

          a.subscribe(topic)
          b.subscribe(topic)
          c.subscribe(topic)

          await Promise.all([
            promisify(a.once.bind(a))('gossipsub:heartbeat'),
            promisify(b.once.bind(b))('gossipsub:heartbeat'),
            promisify(c.once.bind(c))('gossipsub:heartbeat')
          ])
        })

        after(() => Promise.all(nodes.map(stopNode)))

        it('publish on node a', async function () {
          this.timeout(10000)
          let msgB = new Promise((resolve) => b.once('Z', resolve))
          let msgC = new Promise((resolve) => c.once('Z', resolve))

          a.publish('Z', uint8ArrayFromString('hey'))
          msgB = await msgB
          msgC = await msgC

          expect(msgB.data.toString()).to.equal('hey')
          expect(msgC.data.toString()).to.equal('hey')
        })

        it('publish array on node a', async function () {
          this.timeout(10000)
          let msgB = new Promise((resolve) => {
            const output = []
            b.on('Z', (msg) => {
              output.push(msg)
              if (output.length === 2) {
                b.removeAllListeners('Z')
                resolve(output)
              }
            })
          })
          let msgC = new Promise((resolve) => {
            const output = []
            c.on('Z', (msg) => {
              output.push(msg)
              if (output.length === 2) {
                c.removeAllListeners('Z')
                resolve(output)
              }
            })
          })

          a.publish('Z', [uint8ArrayFromString('hey'), uint8ArrayFromString('hey')])
          msgB = await msgB
          msgC = await msgC

          expect(msgB.length).to.equal(2)
          expect(msgB[0].data.toString()).to.equal('hey')
          expect(msgB[1].data.toString()).to.equal('hey')
          expect(msgC.length).to.equal(2)
          expect(msgC[0].data.toString()).to.equal('hey')
          expect(msgC[1].data.toString()).to.equal('hey')
        })
      })
    })

    describe('1 level tree', () => {
      // 1 level tree
      //     ┌◉┐
      //     │b│
      //   ◉─┘ └─◉
      //   a     c

      let a, b, c, nodes
      const topic = 'Z'

      // Create pubsub nodes
      before(async () => {
        nodes = await createGossipsubs({ number: 3 })

        a = nodes[0]
        b = nodes[1]
        c = nodes[2]

        await Promise.all([
          a._libp2p.dialProtocol(b._libp2p.peerId, a.multicodecs),
          b._libp2p.dialProtocol(c._libp2p.peerId, b.multicodecs)
        ])

        a.subscribe(topic)
        b.subscribe(topic)
        c.subscribe(topic)

        await Promise.all([
          promisify(a.once.bind(a))('gossipsub:heartbeat'),
          promisify(b.once.bind(b))('gossipsub:heartbeat'),
          promisify(c.once.bind(c))('gossipsub:heartbeat')
        ])
      })

      after(() => Promise.all(nodes.map(stopNode)))

      it('publish on node b', async function () {
        this.timeout(10000)
        let msgA = new Promise((resolve) => a.once('Z', resolve))
        let msgC = new Promise((resolve) => c.once('Z', resolve))

        b.publish('Z', uint8ArrayFromString('hey'))
        msgA = await msgA
        msgC = await msgC

        expect(msgA.data.toString()).to.equal('hey')
        expect(msgC.data.toString()).to.equal('hey')
      })
    })

    describe('2 level tree', () => {
      // 2 levels tree
      //      ┌◉┐
      //      │c│
      //   ┌◉─┘ └─◉┐
      //   │b     d│
      // ◉─┘       └─◉
      // a           e
      let a, b, c, d, e, nodes
      const topic = 'Z'

      // Create pubsub nodes
      before(async () => {
        nodes = await createGossipsubs({ number: 5 })

        a = nodes[0]
        b = nodes[1]
        c = nodes[2]
        d = nodes[3]
        e = nodes[4]

        await Promise.all([
          a._libp2p.dialProtocol(b._libp2p.peerId, a.multicodecs),
          b._libp2p.dialProtocol(c._libp2p.peerId, b.multicodecs),
          c._libp2p.dialProtocol(d._libp2p.peerId, c.multicodecs),
          d._libp2p.dialProtocol(e._libp2p.peerId, d.multicodecs),
        ])

        a.subscribe(topic)
        b.subscribe(topic)
        c.subscribe(topic)
        d.subscribe(topic)
        e.subscribe(topic)

        // give time for subscription propagation
        await delay(30)

        await Promise.all([
          promisify(a.once.bind(a))('gossipsub:heartbeat'),
          promisify(b.once.bind(b))('gossipsub:heartbeat'),
          promisify(c.once.bind(c))('gossipsub:heartbeat'),
          promisify(d.once.bind(d))('gossipsub:heartbeat'),
          promisify(e.once.bind(e))('gossipsub:heartbeat')
        ])
      })

      after(() => Promise.all(nodes.map(stopNode)))

      it('publishes from c', async function () {
        this.timeout(10000)
        let msgA = new Promise((resolve) => a.once('Z', resolve))
        let msgB = new Promise((resolve) => b.once('Z', resolve))
        let msgD = new Promise((resolve) => d.once('Z', resolve))
        let msgE = new Promise((resolve) => e.once('Z', resolve))

        const msg = 'hey from c'
        c.publish('Z', uint8ArrayFromString(msg))

        msgA = await msgA
        msgB = await msgB
        msgD = await msgD
        msgE = await msgE

        expect(msgA.data.toString()).to.equal(msg)
        expect(msgB.data.toString()).to.equal(msg)
        expect(msgD.data.toString()).to.equal(msg)
        expect(msgE.data.toString()).to.equal(msg)
      })
    })
  })
})
