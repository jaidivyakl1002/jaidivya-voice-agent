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
import logging

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),  # Console output
    ]
)
logger = logging.getLogger(__name__)

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
            instructions="You are Jaidivya Kumar Lohani, speaking directly to a recruiter in a voice interview. Be natural, enthusiastic, and professional. Introduce yourself and greet the user.",
            chat_ctx=chat_ctx
        )

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
        
        logger.info(f"Generating token for room: {room_name}, participant: {participant_name}")
        
        # LiveKit credentials from environment
        api_key = os.getenv("LIVEKIT_API_KEY")
        api_secret = os.getenv("LIVEKIT_API_SECRET")
        
        if not api_key or not api_secret:
            logger.error("LiveKit credentials not configured")
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
        logger.info(f"Token generated successfully for {participant_name}")
        
        return JSONResponse({
            "token": jwt_token,
            "roomName": room_name,
            "participantName": participant_name
        })
        
    except Exception as e:
        logger.error(f"Failed to generate token: {str(e)}")
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

@app.get("/api/agent-status")
async def agent_status():
    """Check agent status"""
    return {"agent_running": agent_thread.is_alive() if 'agent_thread' in globals() else False}

async def livekit_entrypoint(ctx: agents.JobContext):
    """LiveKit agent entrypoint"""
    logger.info("LiveKit agent starting...")
    
    try:
        await ctx.connect()
        logger.info(f"Connected to room: {ctx.room.name}")

        session = AgentSession(
            vad=silero.VAD.load(),
            stt=openai.STT(),
            llm=openai.realtime.RealtimeModel(voice="echo"),
            tts=openai.TTS(),
        )
        
        logger.info("Agent session created, starting...")

        await session.start(
            room=ctx.room,
            agent=JaidivyaAssistant(),
            room_input_options=RoomInputOptions(
                noise_cancellation=noise_cancellation.BVC(),
            ),
        )
        
        logger.info("Agent session started successfully")
        
        # Generate initial greeting
        logger.info("Generating initial greeting...")
        await session.generate_reply(
            instructions="Introduce yourself as Jaidivya Kumar Lohani, mention you're excited to speak with them about AI/ML opportunities, and ask what they'd like to know about your background."
        )
        logger.info("Initial greeting generated")
        
    except Exception as e:
        logger.error(f"Error in LiveKit agent: {str(e)}", exc_info=True)
        raise

def run_livekit_agent():
    """Run LiveKit agent in a separate thread"""
    try:
        logger.info("Starting LiveKit agent worker...")
        cli.run_app(WorkerOptions(entrypoint_fnc=livekit_entrypoint))
    except Exception as e:
        logger.error(f"LiveKit agent crashed: {str(e)}", exc_info=True)

if __name__ == "__main__":
    logger.info("Starting application...")
    
    # Start LiveKit agent in background thread (non-daemon for better debugging)
    agent_thread = threading.Thread(target=run_livekit_agent, daemon=False)
    agent_thread.start()
    logger.info("LiveKit agent thread started")
    
    # Give the agent a moment to start
    import time
    time.sleep(2)
    
    # Start FastAPI server
    port = int(os.getenv("PORT", 8080))
    logger.info(f"Starting FastAPI server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")