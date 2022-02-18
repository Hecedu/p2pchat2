import React, { useEffect, useRef, useState } from 'react';
import './App.css';
import Peer from 'peerjs';

type PeerMessage = {
  id: number
  vectorClock: NodeClock[]
  message: string
  author_node_id: string
};
type NodeClock = {
  node_id: string
  lamportClock: number
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
  const [peer] = useState<Peer>(new Peer(randId(), {
    host: '45.79.192.219',
    port: 9000,
    path: '/myapp'
  }))
  const [chatLog, setChatLog] = useState<string[]>([''])
  const [receivedMessageIds, setReceivedMessageIds] = useState<number[]>([])
  const [listOfConnections, setListOfConnections] = useState<Peer.DataConnection[]>([])
  const [vectorClock, setVectorClock] = useState<NodeClock[]>([{ node_id: peer.id, lamportClock: 0 }])
  const [buffer, setBuffer] = useState<PeerMessage[]>([])
  const [sendSequence, setSendSequence] = useState<number>(0)
  const receivedMessagesRef = useRef<number[]>(receivedMessageIds)
  const connectionsRef = useRef<Peer.DataConnection[]>(listOfConnections)
  const vectorClockRef = useRef<NodeClock[]>(vectorClock)
  const bufferRef = useRef<PeerMessage[]>(buffer)

  connectionsRef.current = listOfConnections
  receivedMessagesRef.current = receivedMessageIds
  vectorClockRef.current = vectorClock
  bufferRef.current = buffer

  var inputBoxConnectionId = ''
  var inputBoxChatMessage = ''

  useEffect(() => {
    peer.on('connection', function (conn) {

      conn.on('data', function (data: PeerMessage) {
        console.log(data)
        //check in incoming connection is not already in list
        if (connectionsRef.current.findIndex(x => x.peer === conn.peer) === -1) {
          var connection = peer.connect(conn.peer)
          setListOfConnections(currentListOfConnections => ([...currentListOfConnections, connection]))
        }
        //check if message is already received
        //if not broadcast message to all connections
        if (receivedMessagesRef.current.findIndex(x => x === data.id) === -1) {
          setReceivedMessageIds(currentReceivedMessageIds => ([...currentReceivedMessageIds, data.id]))
          const broadcastedMessage: PeerMessage = { id: data.id, vectorClock: data.vectorClock, message: data.message, author_node_id: data.author_node_id }
          connectionsRef.current.forEach(x => x.send(broadcastedMessage))
        }
        //add message to buffer
        setBuffer(buffer => [...buffer, data])
      });
    });
  }, []);
  
  useEffect(() => {
    var updated_vector_clock = vectorClockRef.current
    buffer.forEach(message => {
      var smaller_than_vector_clock = false
      message.vectorClock.forEach(clock => {
        //check if clock id is in vector clock, if not add it
        if (vectorClockRef.current.findIndex(x => x.node_id === clock.node_id) === -1) {
          updated_vector_clock = [...updated_vector_clock, clock]
          smaller_than_vector_clock = true
          return
        }
        //check if clock is smaller than current clock
        var corresponding_clock = vectorClockRef.current.find(x => x.node_id === clock.node_id)
        if (corresponding_clock){
          if (clock.lamportClock <= corresponding_clock.lamportClock) {
            smaller_than_vector_clock = true
          }
          else {
            console.log(clock.lamportClock, corresponding_clock.lamportClock)
            smaller_than_vector_clock = false
          }
        }
      })
      if (smaller_than_vector_clock) {
        //update vector clock with a copy of it where the message sender id lamport clock is incremented
        var new_vector_clock = updated_vector_clock.map(x => {
          if (x.node_id === message.author_node_id) {
            return { node_id: x.node_id, lamportClock: x.lamportClock + 1 }
          }
          else {
            return x
          }
        })
        setVectorClock(new_vector_clock)
        setChatLog(currentChatLog => ([...currentChatLog, parseMessage(message)]))
        //remove from buffer
        setBuffer(buffer => buffer.filter(x => x.id !== message.id))
      }
      else {
        console.log('kept in buffer')
      }
    })
  
    return () => {

    }
  }, [buffer])
  

  function parseMessage(message: PeerMessage) {

    //create a string for the vector clock with the format: (node_id:lamport_clock)
    var vector_clock_string = ''
    message.vectorClock.forEach(clock => {
      vector_clock_string += `(${clock.node_id}:${clock.lamportClock})`
    })
    return ` ${vector_clock_string}: ${message.message}`
  }

  function onConnectionIdChange(e: React.ChangeEvent<HTMLInputElement>) {
    inputBoxConnectionId = e.target.value
  }
  function onAddNewConnection(id: string) {
    const conn = peer.connect(id);
    setListOfConnections(prev => [...prev, conn])
  }
  function onChatChange(e: React.ChangeEvent<HTMLInputElement>) {
    inputBoxChatMessage = e.target.value
  }
  function onSubmitConnectionRequest() {
    onAddNewConnection(inputBoxConnectionId)
  }
  function onSubmitChat() {
    var send_vector_clock = vectorClockRef.current.map(x => {
      if (x.node_id === peer.id) {
        return { node_id: x.node_id, lamportClock: sendSequence }
      }
      else {
        return x
      }
    })
    var message: PeerMessage = { id: Math.floor(Math.random() * 1000000), vectorClock:send_vector_clock, message: inputBoxChatMessage, author_node_id: peer.id }
    setSendSequence(sendSequence => sendSequence + 1)
    listOfConnections.forEach(connection => {
      connection.send(message)
    });
    setBuffer(buffer => [...buffer, message])
  }

  return (
    <div className="container">
      <h1>ID: {peer.id}</h1>
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