import React, { useState } from 'react';
import Room from './components/Room';
import './App.css';

function App() {
    const [roomId, setRoomId] = useState('');
    const [inRoom, setInRoom] = useState(false);

    const joinRoom = () => {
      if (roomId) setInRoom(true);
    }
    return (
        <div className="app">
            <h1>Video Conference</h1>
            {!inRoom ? (
                <div className="join-room">
                    <label htmlFor="room-id">Enter Room ID:</label>
                    <input
                        type="text"
                        id="room-id"
                        placeholder="Room ID"
                        value={roomId}
                        onChange={(e) => setRoomId(e.target.value)}
                    />
                    <button onClick={joinRoom}>Join Room</button>
                </div>
            ) : (
                <Room roomId={roomId} />
            )}
        </div>
    );
}

export default App;