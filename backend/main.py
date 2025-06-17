import asyncio
import os
import logging
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

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),  # Console output
        logging.FileHandler('agent.log')  # File output
    ]
)
logger = logging.getLogger(__name__)

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
        logger.info("JaidivyaAssistant initialized")

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

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=livekit_entrypoint))