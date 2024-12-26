import React, { useRef, useEffect } from 'react';
import './Video.css';

function Video({ stream, muted, autoPlay, participantName }) {
    const videoRef = useRef(null);

    useEffect(() => {
      if (videoRef.current && stream) {
        videoRef.current.srcObject = stream;
      }
    }, [stream]);


    return (
        <div className="video-container">
          <video ref={videoRef} autoPlay={autoPlay} muted={muted} playsInline className="video-frame"/>
            {participantName && <div className="participant-name">{participantName}</div>}
        </div>
    );
}

export default Video;