import React, { useEffect, useRef, useState } from 'react';
import './App.css';
import Peer from 'peerjs';
import { send } from 'process';

type PeerMessage = {
  id: number
  delivered: NodeClock[]
  message: string
  sender_id: string
};
type NodeClock = {
  node_id: string
  delivered: number
}
function randId(): string {
  let roomLength = 6
  let lowChar = "A".charCodeAt(0)
  let highChar = "Z".charCodeAt(0)
  let possibleChars = highChar - lowChar + 1
  let randChar = () => {
    let r = Math.round(Math.random() * possibleChars) + lowChar
    return String.fromCharCode(r)
  }
  return [...new Array(roomLength).keys()].map(randChar).join("");
}

function App() {
  const [myPeerClient] = useState<Peer>(new Peer(randId(), {
    host: '45.79.192.219',
    port: 9000,
    path: '/myapp'
  }))
  const [chatLog, setChatLog] = useState<string[]>([''])
  const [receivedMessages, setReceivedMessages] = useState<number[]>([])
  const [listOfConnections, setListOfConnections] = useState<Peer.DataConnection[]>([])
  const [delivered, setDelivered] = useState<NodeClock[]>([])
  const [buffer, setBuffer] = useState<PeerMessage[]>([])
  const [sendSequence, setSendSequence] = useState<number>(0)
  const receivedMessagesRef = useRef<number[]>(receivedMessages)
  const connectionsRef = useRef<Peer.DataConnection[]>(listOfConnections)
  const deliveredRef = useRef<NodeClock[]>(delivered)
  const bufferRef = useRef<PeerMessage[]>(buffer)

  connectionsRef.current = listOfConnections
  receivedMessagesRef.current = receivedMessages
  deliveredRef.current = delivered
  bufferRef.current = buffer
  var inputBoxConnectionId = ''
  var inputBoxChatMessage = ''

  useEffect(() => {
    myPeerClient.on('connection', function (conn) {
      console.log('New connection from' + conn.peer)
      conn.on('data', function (data: PeerMessage) {
        //check if id is in delivered

        console.log(data)
        console.log(deliveredRef.current)
        //check in incoming connection is not already in list
        if (connectionsRef.current.findIndex(x => x.peer === data.sender_id) === -1 && data.sender_id !== myPeerClient.id) {
          var connection = myPeerClient.connect(data.sender_id)
          setListOfConnections(currentListOfConnections => ([...currentListOfConnections, connection]))
        }
        //check if message is already received
        //if not broadcast message to all connections
        if (receivedMessagesRef.current.findIndex(message => message === data.id) === -1) {
          const broadcastedMessage: PeerMessage = { id: data.id, delivered: data.delivered, message: data.message, sender_id: data.sender_id }
          connectionsRef.current.forEach(x => x.send(broadcastedMessage))
        }
        //add message id to received messages
        setReceivedMessages(currentReceivedMessages => ([...currentReceivedMessages, data.id]))
        //add message to buffer
        setBuffer(buffer => [...buffer, data])
      });
    });
  }, []);

  useEffect(() => {
    var updated_vector_clock = deliveredRef.current
    bufferRef.current.forEach(message => {
      //check if sent by this node
      if (message.sender_id === myPeerClient.id) {
        if (receivedMessagesRef.current.findIndex(x => x === message.id) === -1) {
          setReceivedMessages(currentReceivedMessageIds => ([...currentReceivedMessageIds, message.id]))
          setChatLog(currentChatLog => ([...currentChatLog, parseMessage(message, deliveredRef.current)]))
        }
        return
      }
      //check if sender id is in vector clock, if not initialize it
      if (deliveredRef.current.findIndex(clock => clock.node_id === message.sender_id) === -1) {
        updated_vector_clock = [...updated_vector_clock, { node_id: message.sender_id, delivered: 0 }]
      }
      var smaller_than_delivered = true
      message.delivered.forEach(clock => {
        //check if clock id is in vector clock, if not add it
        if (deliveredRef.current.findIndex(clock => clock.node_id === clock.node_id) === -1) {
          //check if its own id
          if (clock.node_id !== myPeerClient.id) {
            updated_vector_clock = [...updated_vector_clock, clock]
          }
          return
        }
        //check if clock is smaller than current clock
        var corresponding_clock = deliveredRef.current.find(x => x.node_id === clock.node_id)
        if (corresponding_clock) {
          if (clock.delivered > corresponding_clock?.delivered) {
            smaller_than_delivered = false
          }
        }
      })
      if (smaller_than_delivered) {
        //update vector clock with a copy of it where the message sender id lamport clock is incremented
        var new_vector_clock = updated_vector_clock.map(old_clock => {
          if (old_clock.node_id === message.sender_id) {
            return { node_id: old_clock.node_id, delivered: old_clock.delivered + 1 }
          }
          else {
            return old_clock
          }
        })
        setDelivered(delivered => (new_vector_clock))
        setChatLog(currentChatLog => ([...currentChatLog, parseMessage(message, new_vector_clock)]))
        //remove from buffer
        setBuffer(buffer => buffer.filter(x => x.id !== message.id))
      }
      else {
        console.log('kept in buffer')
      }
    })
  }, [buffer])


  function parseMessage(message: PeerMessage, updatedClock: NodeClock[]) {
    //create a string for the vector clock with the format: (node_id:lamport_clock)
    var vector_clock_string = ''
    updatedClock.forEach(clock => {
      vector_clock_string += `(${clock.node_id}:${clock.delivered})`
    })
    return `Sender(${message.sender_id}) SendSequence(${sendSequence}) Vector Clock(${vector_clock_string}): ${message.message}`
  }

  function onConnectionIdChange(e: React.ChangeEvent<HTMLInputElement>) {
    inputBoxConnectionId = e.target.value
  }
  function onAddNewConnection(id: string) {
    const conn = myPeerClient.connect(id);
    deliveredRef.current.push({ node_id: conn.peer, delivered: 0 })
    setListOfConnections(prev => [...prev, conn])
  }
  function onChatChange(e: React.ChangeEvent<HTMLInputElement>) {
    inputBoxChatMessage = e.target.value
  }
  function onSubmitConnectionRequest() {
    onAddNewConnection(inputBoxConnectionId)
  }
  function onSubmitChat() {
    var deps = deliveredRef.current.map(x => {
      if (x.node_id === myPeerClient.id) {
        return { node_id: x.node_id, delivered: sendSequence }
      }
      else {
        return x
      }
    })
    var message: PeerMessage = { id: Math.floor(Math.random() * 1000000), delivered: deps, message: inputBoxChatMessage, sender_id: myPeerClient.id }
    listOfConnections.forEach(connection => {
      connection.send(message)
    });
    setSendSequence(currentSendSequence => currentSendSequence + 1)
    setBuffer(buffer => [...buffer, message])
  }

  return (
    <div className="container">
      <h1>ID: {myPeerClient.id}</h1>
      <div>
        <label>
          Connect to id:
          <input type="text" name="name" onChange={onConnectionIdChange} />
        </label>
        <input className="btn btn-primary" type="submit" value="Submit" onClick={onSubmitConnectionRequest}></input>
      </div>
      <div>
        <h4>Current Connections</h4>
        {listOfConnections.map((connection, index) => {
          return <p key={index}>{connection.peer}</p>
        })}
      </div>
      <div>
        <h2>Chat</h2>
        {chatLog.map((message, index) => {
          return <p key={index}>{message}</p>
        })}
      </div>
      {listOfConnections.length == 0 ?
        <p>not connected</p> :
        <div>
          <label>
            Chat:
            <input type="text" name="name" onChange={onChatChange} />
          </label>
          <input className="btn btn-primary" type="submit" value="Submit" onClick={onSubmitChat}></input>
        </div>
      }
    </div>
  );
}

export default App;