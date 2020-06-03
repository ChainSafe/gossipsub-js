'use strict'
/* eslint-env mocha */
/* eslint max-nested-callbacks: ["error", 5] */
const { Buffer } = require('buffer')
const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect
const sinon = require('sinon')

const { utils } = require('libp2p-pubsub')
const {
  createGossipsub,
  mockRegistrar
} = require('./utils')

describe('Pubsub', () => {
  let gossipsub

  before(async () => {
    gossipsub = await createGossipsub(mockRegistrar, true)
  })

  after(() => gossipsub.stop())

  afterEach(() => {
    sinon.restore()
  })

  describe('publish', () => {
    it('should sign messages on publish', async () => {
      sinon.spy(gossipsub, '_publish')

      await gossipsub.publish('signing-topic', Buffer.from('hello'))

      // Get the first message sent to _publish, and validate it
      const signedMessage = gossipsub._publish.getCall(0).lastArg[0]
      const isValid = await gossipsub.validate(signedMessage)

      expect(isValid).to.eql(true)
    })
  })

  describe('validate', () => {
    it('should drop unsigned messages', () => {
      sinon.spy(gossipsub, '_processRpcMessage')
      sinon.spy(gossipsub, 'validate')
      sinon.stub(gossipsub.peers, 'get').returns({})

      const topic = 'my-topic'
      const rpc = {
        subscriptions: [],
        msgs: [{
          from: gossipsub.peerId.id,
          data: Buffer.from('an unsigned message'),
          seqno: utils.randomSeqno(),
          topicIDs: [topic]
        }]
      }

      gossipsub._onRpc('QmAnotherPeer', rpc)

      return new Promise(resolve => setTimeout(() => {
        expect(gossipsub.validate.callCount).to.eql(1)
        expect(gossipsub._processRpcMessage.called).to.eql(false)
        resolve()
      }, 500))
    })

    it('should not drop signed messages', async () => {
      sinon.spy(gossipsub, '_processRpcMessage')
      sinon.spy(gossipsub, 'validate')
      sinon.stub(gossipsub.peers, 'get').returns({})

      const topic = 'my-topic'
      const signedMessage = await gossipsub._buildMessage({
        from: gossipsub.peerId.id,
        data: Buffer.from('an unsigned message'),
        seqno: utils.randomSeqno(),
        topicIDs: [topic]
      })

      const rpc = {
        subscriptions: [],
        msgs: [signedMessage]
      }

      gossipsub._onRpc('QmAnotherPeer', rpc)

      return new Promise(resolve => setTimeout(() => {
        expect(gossipsub.validate.callCount).to.eql(1)
        expect(gossipsub._processRpcMessage.callCount).to.eql(1)
        resolve()
      }, 500))
    })

    it('should not drop unsigned messages if strict signing is disabled', () => {
      sinon.spy(gossipsub, '_processRpcMessage')
      sinon.spy(gossipsub, 'validate')
      sinon.stub(gossipsub.peers, 'get').returns({})
      // Disable strict signing
      sinon.stub(gossipsub, 'strictSigning').value(false)

      const topic = 'my-topic'
      const rpc = {
        subscriptions: [],
        msgs: [{
          from: gossipsub.peerId.id,
          data: Buffer.from('an unsigned message'),
          seqno: utils.randomSeqno(),
          topicIDs: [topic]
        }]
      }

      gossipsub._onRpc('QmAnotherPeer', rpc)

      return new Promise(resolve => setTimeout(() => {
        expect(gossipsub.validate.callCount).to.eql(1)
        expect(gossipsub._processRpcMessage.callCount).to.eql(1)
        resolve()
      }, 500))
    })
  })
})
