import React, { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import Video from './Video';
import './Room.css';
import { MdCallEnd, MdMic, MdMicOff, MdVideocam, MdVideocamOff } from "react-icons/md";

const socket = io('https://videocall-viic.onrender.com');

function Room({ roomId }) {
    const [myStream, setMyStream] = useState(null);
     const remoteStreams = useRef(new Map()); // using ref
    const [userId, setUserId] = useState(null);
    const [roomClients, setRoomClients] = useState([]);
    const [isAudioMuted, setIsAudioMuted] = useState(false);
    const [isVideoMuted, setIsVideoMuted] = useState(false);
    const peers = useRef({});
    const myVideo = useRef(null);
     const streamRefs = useRef(new Map()); //Using ref to keep references
    const [, updateState] = useState(); // Helper function for re-rendering

    const forceUpdate = useCallback(() => updateState({}), []); //Helper function to re-render

    useEffect(() => {
        socket.on('connect', () => {
            setUserId(socket.id);
        })

        socket.on('room-clients', (clients) => {
            setRoomClients(clients)
        })

        socket.on('new-user', (newUserId) => {
            console.log(`New user joined ${newUserId}`)
            startCall(newUserId)
        })

        socket.on('offer', (payload) => {
            console.log(`Offer from ${payload.sender}`);
            handleOffer(payload);
        })

        socket.on('answer', (payload) => {
            console.log(`Answer from ${payload.sender}`);
            handleAnswer(payload);
        })

        socket.on('ice-candidate', (payload) => {
            console.log(`ice-candidate from ${payload.sender}`);
            handleIceCandidate(payload);
        });

        socket.on('user-disconnected', (userId) => {
            console.log(`User ${userId} disconnected`);
            handleUserDisconnect(userId)
        });
    }, []);


    useEffect(() => {
        if (roomId) {
            getMedia();
            socket.emit('join', roomId);
          remoteStreams.current = new Map() // reset remote streams
             forceUpdate();
        }
    }, [roomId]);

    useEffect(() => {
        if (myVideo.current && myStream) {
            myVideo.current.srcObject = myStream;
        }
    }, [myStream])

    const getMedia = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            setMyStream(stream);
        } catch (error) {
            console.error('Error accessing media:', error);
        }
    };

    const toggleAudio = () => {
        if (myStream) {
            myStream.getAudioTracks().forEach((track) => track.enabled = isAudioMuted)
        }
        setIsAudioMuted(!isAudioMuted)
    }

    const toggleVideo = () => {
        if (myStream) {
            myStream.getVideoTracks().forEach((track) => track.enabled = isVideoMuted)
        }
        setIsVideoMuted(!isVideoMuted)
    }

    const clearAllRefs = () => {
        streamRefs.current.clear();
        peers.current = {};
    };


    const leaveCall = () => {
        if (myStream) {
            myStream.getTracks().forEach((track) => track.stop())
            setMyStream(null);
        }
        clearAllRefs()
         window.location.reload(); //quick and easy
    };


    const startCall = async (target) => {
        console.log(`starting call with ${target}`)
        const peerConnection = new RTCPeerConnection({
            iceServers: [{
                urls: ['stun:stun.l.google.com:19302',
                    'stun:stun1.l.google.com:19302']
            }]
        });
        peers.current[target] = peerConnection;

        if (myStream) myStream.getTracks().forEach((track) => peerConnection.addTrack(track, myStream));


        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', {
                    target,
                    candidate: event.candidate,
                    sender: userId
                });
            }
        };
        peerConnection.ontrack = (event) => {
            if (!event.streams || event.streams.length === 0) return;
             const stream = event.streams[0];
             streamRefs.current.set(target,stream);
               const newRemoteStreams = new Map(remoteStreams.current);
             newRemoteStreams.set(target,stream);
             remoteStreams.current = newRemoteStreams; //Update ref value
             forceUpdate(); //Force re-render
        };


        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', {
            target,
            offer,
            sender: userId
        });
    };

    const handleOffer = async (payload) => {
        const { offer, sender } = payload;
        const peerConnection = new RTCPeerConnection({
            iceServers: [{
                urls: ['stun:stun.l.google.com:19302',
                    'stun:stun1.l.google.com:19302']
            }]
        });
        peers.current[sender] = peerConnection;

        if (myStream) myStream.getTracks().forEach((track) => peerConnection.addTrack(track, myStream));


        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', {
                    target: sender,
                    candidate: event.candidate,
                    sender: userId
                });
            }
        };

       peerConnection.ontrack = (event) => {
           if (!event.streams || event.streams.length === 0) return;
             const stream = event.streams[0];
            streamRefs.current.set(sender,stream);
             const newRemoteStreams = new Map(remoteStreams.current);
           newRemoteStreams.set(sender,stream);
          remoteStreams.current = newRemoteStreams;
           forceUpdate(); //Force Re-render
        };

        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit('answer', {
            target: sender,
            answer,
            sender: userId
        });
    };


    const handleAnswer = async (payload) => {
        const { answer, sender } = payload;
        const peerConnection = peers.current[sender];
        if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        }
    };

    const handleIceCandidate = async (payload) => {
        const { candidate, sender } = payload;
        const peerConnection = peers.current[sender];
        if (peerConnection) {
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                console.log("Error adding ice", e)
            }
        }
    };

     const handleUserDisconnect = (userId) => {
           const newRemoteStreams = new Map(remoteStreams.current);
           newRemoteStreams.delete(userId);
          remoteStreams.current = newRemoteStreams;
        forceUpdate(); //Force re-render
          if (peers.current[userId]) {
                peers.current[userId].close();
             delete peers.current[userId];
        }
         streamRefs.current.delete(userId);
    }


     const allStreams = {
         ...(myStream ? { [userId]: myStream } : {}),
       ...Object.fromEntries(remoteStreams.current)
    };


    return (
        <div className="room">
            <div className="videos-area">
                <div className="videos-grid">
                    {Object.entries(allStreams).map(([key, stream]) => (
                        <div key={key} className="video-item">
                            <Video stream={stream} autoPlay muted={key === userId} participantName={key === userId ? "Me" : key}  />
                        </div>
                    ))}
                </div>
            </div>
            <div className="controls">
                <button onClick={toggleAudio} className="control-button">
                    {isAudioMuted ? <MdMicOff /> : <MdMic />}
                </button>
                <button onClick={toggleVideo} className="control-button">
                    {isVideoMuted ? <MdVideocamOff /> : <MdVideocam />}
                </button>
                <button onClick={leaveCall} className="control-button leave-button">
                    <MdCallEnd />
                </button>
            </div>
        </div>
    );
}

export default Room;