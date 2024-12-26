import React, { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import Video from './Video';
import './Room.css';
import { MdCallEnd, MdMic, MdMicOff, MdVideocam, MdVideocamOff } from "react-icons/md";

const socket = io('https://videocall-viic.onrender.com');

function Room({ roomId }) {
    const [myStream, setMyStream] = useState(null);
    const remoteStreams = useRef(new Map());
    const [userId, setUserId] = useState(null);
    const [isAudioMuted, setIsAudioMuted] = useState(false);
    const [isVideoMuted, setIsVideoMuted] = useState(false);
    const peers = useRef({});
    const myVideo = useRef(null);
    const streamRefs = useRef(new Map());
    const localStream = useRef(null)
    const [, updateState] = useState();
    const forceUpdate = useCallback(() => updateState({}), []);

    useEffect(() => {
        socket.on('connect', () => {
            setUserId(socket.id);
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
           remoteStreams.current = new Map()
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
             localStream.current = stream;
        } catch (error) {
            console.error('Error accessing media:', error);
        }
    };

    const toggleAudio = () => {
        if (localStream.current) {
           localStream.current.getAudioTracks().forEach((track) => track.enabled = !isAudioMuted)
           setIsAudioMuted(!isAudioMuted);
            console.log("Audio toggled", localStream.current.getAudioTracks()[0].enabled)
       }
   }

    const toggleVideo = () => {
        if (localStream.current) {
           localStream.current.getVideoTracks().forEach((track) => track.enabled = !isVideoMuted)
            setIsVideoMuted(!isVideoMuted);
            console.log("Video toggled", localStream.current.getVideoTracks()[0].enabled)
       }
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
       window.location.reload();
    };

     const startCall = async (target) => {
         console.log(`starting call with ${target}`)
         const peerConnection = new RTCPeerConnection({
             iceServers: [{
                 urls: ['stun:stun.l.google.com:19302',
                     'stun:stun1.l.google.com:19302']
             }]
         });
           peers.current = { ...peers.current, [target]: peerConnection };
         if (myStream) myStream.getTracks().forEach((track) => peerConnection.addTrack(track, myStream));


         peerConnection.onicecandidate = (event) => {
             if (event.candidate) {
                console.log("ICE Candidate", event.candidate)
                 socket.emit('ice-candidate', {
                     target,
                     candidate: event.candidate,
                     sender: userId
                 });
             }
         };

       peerConnection.ontrack = (event) => {
         if (!event.streams || event.streams.length === 0) {
                console.log(`No streams in ontrack event from ${target}`)
             return;
          };
         const stream = event.streams[0];
         streamRefs.current.set(target, stream);
            const newRemoteStreams = new Map(remoteStreams.current);
        newRemoteStreams.set(target,stream);
        remoteStreams.current = newRemoteStreams;
         forceUpdate();
           console.log(`Received ontrack for ${target}`, stream)
       };

         const offer = await peerConnection.createOffer();
         await peerConnection.setLocalDescription(offer);
       console.log(`Offer created for ${target}`, offer)
         socket.emit('offer', {
             target,
             offer,
             sender: userId
         });
     };


    const handleOffer = async (payload) => {
        const { offer, sender } = payload;
        console.log("Received offer from", sender)
        const peerConnection = new RTCPeerConnection({
             iceServers: [{
                 urls: ['stun:stun.l.google.com:19302',
                     'stun:stun1.l.google.com:19302']
            }]
         });
       peers.current = { ...peers.current, [sender]: peerConnection };


         if (myStream) myStream.getTracks().forEach((track) => peerConnection.addTrack(track, myStream));


         peerConnection.onicecandidate = (event) => {
             if (event.candidate) {
                  console.log("ICE Candidate", event.candidate)
                 socket.emit('ice-candidate', {
                     target: sender,
                     candidate: event.candidate,
                     sender: userId
                 });
             }
         };

        peerConnection.ontrack = (event) => {
             if (!event.streams || event.streams.length === 0) {
                console.log(`No streams in ontrack event from ${sender}`)
                return;
            };
          const stream = event.streams[0];
         streamRefs.current.set(sender, stream);
           const newRemoteStreams = new Map(remoteStreams.current);
           newRemoteStreams.set(sender,stream);
           remoteStreams.current = newRemoteStreams;
            forceUpdate();
            console.log(`Received ontrack for ${sender}`, stream)
        };

        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
         const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
       console.log(`Answer created for ${sender}`, answer)
         socket.emit('answer', {
             target: sender,
             answer,
             sender: userId
         });
    };

    const handleAnswer = async (payload) => {
        const { answer, sender } = payload;
       console.log(`Received answer from ${sender}`, answer);
        const peerConnection = peers.current[sender];
        if (peerConnection) {
           await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        }
     };


    const handleIceCandidate = async (payload) => {
         const { candidate, sender } = payload;
         console.log(`Received ICE candidate from ${sender}`, candidate);
         const peerConnection = peers.current[sender];
        if (peerConnection) {
           try {
              await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
               console.error("Error adding ICE", e)
            }
        }
     };

    const handleUserDisconnect = (userId) => {
        console.log(`User ${userId} disconnected`)
         const newRemoteStreams = new Map(remoteStreams.current);
          newRemoteStreams.delete(userId);
        remoteStreams.current = newRemoteStreams;
          forceUpdate();

        if (peers.current[userId]) {
            peers.current[userId].close();
            const newPeers = {...peers.current};
            delete newPeers[userId];
            peers.current = newPeers;
        }
       streamRefs.current.delete(userId)
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