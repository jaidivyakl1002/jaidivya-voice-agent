import React, { useState, useEffect, useRef } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import axios from 'axios';
import './App.css';

// Backend API URL - change this to your deployed backend URL
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

function App() {
  const [room, setRoom] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState(null);
  const [participantName, setParticipantName] = useState('');
  const audioElementsRef = useRef([]);

  useEffect(() => {
    // Generate a random participant name
    setParticipantName(`Recruiter-${Math.random().toString(36).substr(2, 5)}`);
  }, []);

  const cleanupRoom = () => {
    if (room) {
      room.disconnect();
      setRoom(null);
    }
    setIsConnected(false);
    setIsConnecting(false);
    setError(null);
    
    // Clean up audio elements
    audioElementsRef.current.forEach(audio => {
      if (audio && audio.parentNode) {
        audio.parentNode.removeChild(audio);
      }
    });
    audioElementsRef.current = [];
  };

  const connectToRoom = async () => {
    if (isConnecting) return;
    
    setIsConnecting(true);
    setError(null);

    try {
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Create room instance
      const newRoom = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      // Set up event listeners
      newRoom.on(RoomEvent.Connected, () => {
        console.log('Connected to room');
        setIsConnected(true);
        setIsConnecting(false);
      });

      newRoom.on(RoomEvent.Disconnected, (reason) => {
        console.log('Disconnected from room:', reason);
        cleanupRoom();
      });

      newRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        console.log('Track subscribed:', track.kind, participant.identity);
        
        if (track.kind === Track.Kind.Audio && participant.identity !== newRoom.localParticipant?.identity) {
          const audioElement = track.attach();
          audioElement.autoplay = true;
          audioElement.style.display = 'none';
          document.body.appendChild(audioElement);
          audioElementsRef.current.push(audioElement);
          
          // Attempt to play audio
          audioElement.play().catch(e => {
            console.log('Audio autoplay failed, user interaction required:', e);
          });
        }
      });

      newRoom.on(RoomEvent.ParticipantConnected, (participant) => {
        console.log('Participant connected:', participant.identity);
      });

      newRoom.on(RoomEvent.ConnectionStateChanged, (state) => {
        console.log('Connection state changed:', state);
      });

      // Get token and config from backend
      const tokenResponse = await axios.post(`${API_BASE_URL}/api/token`, {
        roomName: `jaidivya-interview-${Date.now()}`,
        participantName: participantName
      });

      const configResponse = await axios.get(`${API_BASE_URL}/api/config`);

      const token = tokenResponse.data.token;
      const wsUrl = configResponse.data.wsUrl;

      if (!wsUrl) {
        throw new Error('WebSocket URL not configured in backend');
      }

      // Connect to the room
      await newRoom.connect(wsUrl, token);
      setRoom(newRoom);

    } catch (err) {
      console.error('Failed to connect:', err);
      setError(err.message || 'Failed to connect to voice chat');
      setIsConnecting(false);
      cleanupRoom();
    }
  };

  const toggleMute = () => {
    if (room && room.localParticipant) {
      const newMutedState = !isMuted;
      room.localParticipant.setMicrophoneEnabled(!newMutedState);
      setIsMuted(newMutedState);
    }
  };

  const disconnect = () => {
    cleanupRoom();
  };

  return (
    <div className="App">
      <div className="container">
        <h1>🤖 Jaidivya AI</h1>
        <p className="subtitle">AI/ML Engineer & Voice Assistant</p>
        
        <div className="profile-section">
          <h3>About Jaidivya</h3>
          <p><strong>Education:</strong> B.Tech in Computer Science (AI Specialization)</p>
          <p><strong>Institution:</strong> Manipal Institute of Technology, Bangalore</p>
          <p><strong>Specialization:</strong> AI/ML, Deep Learning, Generative AI</p>
          <p><strong>Experience:</strong> Backend Development, Speech Recognition, ML Models</p>
        </div>
        
        <div className="instructions">
          <h4>How to interact:</h4>
          <ul>
            <li>Click "Start Voice Chat" to begin</li>
            <li>Allow microphone access when prompted</li>
            <li>Speak naturally - ask about experience, projects, or skills</li>
            <li>The AI will respond in Jaidivya's voice</li>
          </ul>
        </div>
        
        {!isConnected && (
          <button 
            className="connect-button" 
            onClick={connectToRoom}
            disabled={isConnecting}
          >
            {isConnecting ? '🔄 Connecting...' : '🎤 Start Voice Chat'}
          </button>
        )}
        
        {error && (
          <div className="status error">
            ❌ {error}
          </div>
        )}
        
        {isConnecting && (
          <div className="status connecting">
            🔄 Connecting to Jaidivya AI...
          </div>
        )}
        
        {isConnected && (
          <>
            <div className="status connected">
              🎤 Connected! You can now speak with Jaidivya AI
            </div>
            
            <div className="controls">
              <button 
                className={`control-button ${isMuted ? 'muted' : ''}`}
                onClick={toggleMute}
              >
                {isMuted ? '🔇 Unmute' : '🔊 Mute'}
              </button>
              <button 
                className="control-button disconnect"
                onClick={disconnect}
              >
                📞 End Call
              </button>
            </div>
          </>
        )}
        
        <div className="participant-info">
          <small>You are: {participantName}</small>
        </div>
      </div>
    </div>
  );
}

export default App;