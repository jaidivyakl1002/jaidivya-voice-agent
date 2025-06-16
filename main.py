import asyncio
import os
from dotenv import load_dotenv
from livekit import agents, api
from livekit.agents import WorkerOptions, cli
from livekit.agents import (
    AgentSession,
    Agent,
    llm,
    RoomInputOptions,
)
from livekit.plugins import (
    openai,
    silero,
    noise_cancellation,
)
from context import jaidivya_context
from livekit.agents.llm.chat_context import ChatContext, ChatMessage
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
from datetime import datetime, timedelta
import jwt
import threading

# Load environment variables
load_dotenv()

def format_context(ctx_dict):
    lines = []
    for k, v in ctx_dict.items():
        if isinstance(v, list):
            lines.append(f"{k}: {', '.join(map(str, v))}")
        elif isinstance(v, dict):
            lines.append(f"{k}:")
            for sub_k, sub_v in v.items():
                lines.append(f"  {sub_k}: {sub_v}")
        else:
            lines.append(f"{k}: {v}")
    return "\n".join(lines)

context_text = format_context(jaidivya_context)

chat_ctx = ChatContext()
chat_ctx.add_message(
    role="system",
    content=f"""You are Jaidivya Kumar Lohani, a B.Tech graduate specializing in AI/ML. 
    You are being interviewed by a recruiter. Be conversational, professional, and enthusiastic about your work.
    
    Your background:
    {context_text}
    
    Guidelines:
    - Speak in first person as Jaidivya
    - Be friendly and conversational
    - Highlight your projects and experience naturally
    - Show enthusiasm for AI/ML work
    - Ask engaging questions about the role/company when appropriate
    - Keep responses concise but informative (30-60 seconds when spoken)
    """
)

class JaidivyaAssistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions="You are Jaidivya Kumar Lohani, speaking directly to a recruiter in a voice interview. Be natural, enthusiastic, and professional.",
            chat_ctx=chat_ctx
        )

# FastAPI app for web interface and token generation
app = FastAPI(title="Jaidivya AI Voice Assistant")

@app.get("/", response_class=HTMLResponse)
async def get_homepage():
    """Serve the main interface"""
    html_content = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Chat with Jaidivya - AI Assistant</title>
        <script src="https://unpkg.com/livekit-client@2.1.0/dist/livekit-client.umd.js"></script>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                margin: 0;
                padding: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .container {
                background: white;
                border-radius: 20px;
                padding: 40px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.1);
                max-width: 500px;
                width: 90%;
                text-align: center;
            }
            
            h1 {
                color: #333;
                margin-bottom: 10px;
                font-size: 2.5em;
            }
            
            .subtitle {
                color: #666;
                margin-bottom: 30px;
                font-size: 1.1em;
            }
            
            .profile-section {
                background: #f8f9fa;
                padding: 20px;
                border-radius: 15px;
                margin-bottom: 30px;
            }
            
            .profile-section h3 {
                color: #333;
                margin-bottom: 15px;
            }
            
            .profile-section p {
                color: #666;
                line-height: 1.6;
                margin-bottom: 10px;
            }
            
            .connect-button {
                background: linear-gradient(45deg, #667eea, #764ba2);
                color: white;
                border: none;
                padding: 15px 40px;
                font-size: 1.2em;
                border-radius: 50px;
                cursor: pointer;
                transition: all 0.3s ease;
                margin: 10px;
            }
            
            .connect-button:hover {
                transform: translateY(-2px);
                box-shadow: 0 10px 20px rgba(0,0,0,0.2);
            }
            
            .connect-button:disabled {
                background: #ccc;
                cursor: not-allowed;
                transform: none;
            }
            
            .status {
                margin-top: 20px;
                padding: 15px;
                border-radius: 10px;
                font-weight: bold;
            }
            
            .status.connecting {
                background: #fff3cd;
                color: #856404;
            }
            
            .status.connected {
                background: #d4edda;
                color: #155724;
            }
            
            .status.error {
                background: #f8d7da;
                color: #721c24;
            }
            
            .controls {
                margin-top: 20px;
                display: none;
            }
            
            .controls.visible {
                display: block;
            }
            
            .control-button {
                background: #28a745;
                color: white;
                border: none;
                padding: 10px 20px;
                margin: 5px;
                border-radius: 25px;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .control-button:hover {
                background: #218838;
            }
            
            .control-button.muted {
                background: #dc3545;
            }
            
            .instructions {
                background: #e3f2fd;
                padding: 20px;
                border-radius: 15px;
                margin-bottom: 20px;
                text-align: left;
            }
            
            .instructions h4 {
                color: #1976d2;
                margin-bottom: 10px;
            }
            
            .instructions ul {
                color: #666;
                padding-left: 20px;
            }
            
            .instructions li {
                margin-bottom: 5px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🤖 Jaidivya AI</h1>
            <p class="subtitle">AI/ML Engineer & Voice Assistant</p>
            
            <div class="profile-section">
                <h3>About Jaidivya</h3>
                <p><strong>Education:</strong> B.Tech in Computer Science (AI Specialization)</p>
                <p><strong>Institution:</strong> Manipal Institute of Technology, Bangalore</p>
                <p><strong>Specialization:</strong> AI/ML, Deep Learning, Generative AI</p>
                <p><strong>Experience:</strong> Backend Development, Speech Recognition, ML Models</p>
            </div>
            
            <div class="instructions">
                <h4>How to interact:</h4>
                <ul>
                    <li>Click "Start Voice Chat" to begin</li>
                    <li>Allow microphone access when prompted</li>
                    <li>Speak naturally - ask about experience, projects, or skills</li>
                    <li>The AI will respond in Jaidivya's voice</li>
                </ul>
            </div>
            
            <button id="connectBtn" class="connect-button" onclick="connectToRoom()">
                🎤 Start Voice Chat
            </button>
            
            <div id="status" class="status" style="display: none;"></div>
            
            <div id="controls" class="controls">
                <button id="muteBtn" class="control-button" onclick="toggleMute()">
                    🔊 Mute
                </button>
                <button class="control-button" onclick="disconnectFromRoom()" style="background: #dc3545;">
                    📞 End Call
                </button>
            </div>
        </div>

        <script>
            let room = null;
            let isMuted = false;
            
            async function connectToRoom() {
                const connectBtn = document.getElementById('connectBtn');
                const status = document.getElementById('status');
                const controls = document.getElementById('controls');
                
                try {
                    connectBtn.disabled = true;
                    status.style.display = 'block';
                    status.className = 'status connecting';
                    status.textContent = 'Connecting to Jaidivya AI...';
                    
                    // Request microphone permission
                    await navigator.mediaDevices.getUserMedia({ audio: true });
                    
                    // Initialize LiveKit room
                    room = new LiveKitClient.Room({
                        adaptiveStream: true,
                        dynacast: true,
                    });
                    
                    // Set up event listeners
                    room.on('connected', () => {
                        status.className = 'status connected';
                        status.textContent = '🎤 Connected! You can now speak with Jaidivya AI';
                        controls.classList.add('visible');
                    });
                    
                    room.on('disconnected', () => {
                        status.className = 'status error';
                        status.textContent = 'Disconnected from chat';
                        connectBtn.disabled = false;
                        connectBtn.textContent = '🎤 Start Voice Chat';
                        controls.classList.remove('visible');
                    });
                    
                    room.on('trackSubscribed', (track, publication, participant) => {
                        if (track.kind === 'audio') {
                            const audioElement = track.attach();
                            document.body.appendChild(audioElement);
                            audioElement.play();
                        }
                    });
                    
                    // Get access token and connect
                    const token = await getAccessToken();
                    const wsUrl = await getWebSocketUrl();
                    await room.connect(wsUrl, token);
                    
                    connectBtn.textContent = '🔄 Reconnect';
                    
                } catch (error) {
                    console.error('Failed to connect:', error);
                    status.className = 'status error';
                    status.textContent = 'Failed to connect: ' + error.message;
                    connectBtn.disabled = false;
                }
            }
            
            async function getAccessToken() {
                const response = await fetch('/api/token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        roomName: 'jaidivya-interview-' + Date.now(),
                        participantName: 'Recruiter-' + Math.random().toString(36).substr(2, 5)
                    })
                });
                
                if (!response.ok) {
                    throw new Error('Failed to get access token');
                }
                
                const data = await response.json();
                return data.token;
            }
            
            async function getWebSocketUrl() {
                const response = await fetch('/api/config');
                const data = await response.json();
                return data.wsUrl;
            }
            
            function toggleMute() {
                const muteBtn = document.getElementById('muteBtn');
                
                if (room && room.localParticipant) {
                    if (isMuted) {
                        room.localParticipant.setMicrophoneEnabled(true);
                        muteBtn.textContent = '🔊 Mute';
                        muteBtn.classList.remove('muted');
                    } else {
                        room.localParticipant.setMicrophoneEnabled(false);
                        muteBtn.textContent = '🔇 Unmute';
                        muteBtn.classList.add('muted');
                    }
                    isMuted = !isMuted;
                }
            }
            
            function disconnectFromRoom() {
                if (room) {
                    room.disconnect();
                }
            }
        </script>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)

@app.post("/api/token")
async def generate_token(request: Request):
    """Generate LiveKit access token"""
    try:
        data = await request.json()
        room_name = data.get("roomName", "jaidivya-interview")
        participant_name = data.get("participantName", "Recruiter")
        
        # LiveKit credentials from environment
        api_key = os.getenv("LIVEKIT_API_KEY")
        api_secret = os.getenv("LIVEKIT_API_SECRET")
        
        if not api_key or not api_secret:
            return JSONResponse(
                status_code=500,
                content={"error": "LiveKit credentials not configured"}
            )
        
        # Create access token
        token = api.AccessToken(api_key, api_secret) \
            .with_identity(participant_name) \
            .with_name(participant_name) \
            .with_grants(api.VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
            ))
        
        jwt_token = token.to_jwt()
        
        return JSONResponse({
            "token": jwt_token,
            "roomName": room_name,
            "participantName": participant_name
        })
        
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to generate token: {str(e)}"}
        )

@app.get("/api/config")
async def get_config():
    """Get LiveKit configuration"""
    return JSONResponse({
        "wsUrl": os.getenv("LIVEKIT_URL", "wss://your-project.livekit.cloud")
    })

async def livekit_entrypoint(ctx: agents.JobContext):
    """LiveKit agent entrypoint"""
    await ctx.connect()

    session = AgentSession(
        vad=silero.VAD.load(),
        stt=openai.STT(),
        llm=openai.realtime.RealtimeModel(voice="echo"),
        tts=openai.TTS(),
    )

    await session.start(
        room=ctx.room,
        agent=JaidivyaAssistant(),
        room_input_options=RoomInputOptions(
            noise_cancellation=noise_cancellation.BVC(),
        ),
    )
    
    # Generate initial greeting
    await session.generate_reply(
        instructions="Introduce yourself as Jaidivya Kumar Lohani, mention you're excited to speak with them about AI/ML opportunities, and ask what they'd like to know about your background."
    )

def run_livekit_agent():
    """Run LiveKit agent in a separate thread"""
    cli.run_app(WorkerOptions(entrypoint_fnc=livekit_entrypoint))

if __name__ == "__main__":
    # Start LiveKit agent in background thread
    agent_thread = threading.Thread(target=run_livekit_agent, daemon=True)
    agent_thread.start()
    
    # Start FastAPI server
    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)