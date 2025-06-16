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
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
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

# FastAPI app for API endpoints only
app = FastAPI(title="Jaidivya AI Voice Assistant API")

# Add CORS middleware to allow frontend connections
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    """Root endpoint"""
    return {"message": "Jaidivya AI Voice Assistant API", "status": "running"}

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
        "wsUrl": os.getenv("LIVEKIT_URL")
    })

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

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