"use client";

import { LoadingSVG } from "@/components/button/LoadingSVG";
import { ChatMessageType } from "@/components/chat/ChatTile";
import { AudioInputTile } from "@/components/config/AudioInputTile";
import { ConfigurationPanelItem } from "@/components/config/ConfigurationPanelItem";
import { PlaygroundHeader } from "@/components/playground/PlaygroundHeader";
import {
  PlaygroundTab,
  PlaygroundTabbedTile,
  PlaygroundTile,
} from "@/components/playground/PlaygroundTile";
import { useConfig } from "@/hooks/useConfig";
import { TranscriptionTile } from "@/transcriptions/TranscriptionTile";
import {
  BarVisualizer,
  useConnectionState,
  useDataChannel,
  useLocalParticipant,
  useRoomInfo,
  useTracks,
  useVoiceAssistant,
  useRoomContext,
} from "@livekit/components-react";
import { ConnectionState, LocalParticipant, Track } from "livekit-client";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";

export interface PlaygroundMeta {
  name: string;
  value: string;
}

export interface PlaygroundProps {
  logo?: ReactNode;
  onConnect: (connect: boolean, opts?: { token: string; url: string }) => void;
}

const headerHeight = 56;

export default function Playground({
  logo,
  onConnect,
}: PlaygroundProps) {
  const { config } = useConfig();
  const { name } = useRoomInfo();
  const [transcripts, setTranscripts] = useState<ChatMessageType[]>([]);
  const { localParticipant } = useLocalParticipant();
  const voiceAssistant = useVoiceAssistant();
  const roomState = useConnectionState();
  const tracks = useTracks();
  const room = useRoomContext();

  useEffect(() => {
    if (roomState === ConnectionState.Connected) {
      // Only enable microphone, no camera
      localParticipant.setMicrophoneEnabled(config.settings.inputs.mic);
    }
  }, [config, localParticipant, roomState]);

  const localTracks = tracks.filter(
    ({ participant }) => participant instanceof LocalParticipant,
  );
  const localMicTrack = localTracks.find(
    ({ source }) => source === Track.Source.Microphone,
  );

  const onDataReceived = useCallback(
    (msg: any) => {
      if (msg.topic === "transcription") {
        const decoded = JSON.parse(
          new TextDecoder("utf-8").decode(msg.payload),
        );
        let timestamp = new Date().getTime();
        if ("timestamp" in decoded && decoded.timestamp > 0) {
          timestamp = decoded.timestamp;
        }
        setTranscripts([
          ...transcripts,
          {
            name: "You",
            message: decoded.text,
            timestamp: timestamp,
            isSelf: true,
          },
        ]);
      }
    },
    [transcripts],
  );

  useDataChannel(onDataReceived);

  useEffect(() => {
    document.body.style.setProperty("--lk-theme-color", "#3b82f6"); // blue-500
    document.body.style.setProperty("--lk-drop-shadow", "#3b82f6 0px 0px 18px");
  }, []);

  const audioTileContent = useMemo(() => {
    if (roomState === ConnectionState.Disconnected) {
      return (
        <div className="flex flex-col items-center justify-center gap-2 text-gray-700 text-center w-full">
          No agent audio track. Connect to get started.
        </div>
      );
    }

    if (!voiceAssistant.audioTrack) {
      return (
        <div className="flex flex-col items-center gap-2 text-gray-700 text-center w-full">
          <LoadingSVG />
          Waiting for agent audio track…
        </div>
      );
    }

    return (
      <div
        className="flex items-center justify-center w-full h-48 [--lk-va-bar-width:30px] [--lk-va-bar-gap:20px] [--lk-fg:var(--lk-theme-color)]"
      >
        <BarVisualizer
          state={voiceAssistant.state}
          trackRef={voiceAssistant.audioTrack}
          barCount={5}
          options={{ minHeight: 20 }}
        />
      </div>
    );
  }, [voiceAssistant.audioTrack, roomState, voiceAssistant.state]);

  const chatTileContent = useMemo(() => {
    if (voiceAssistant.agent) {
      return (
        <TranscriptionTile
          agentAudioTrack={voiceAssistant.audioTrack}
          accentColor="blue"
        />
      );
    }
    return <></>;
  }, [voiceAssistant.audioTrack, voiceAssistant.agent]);

  const settingsTileContent = useMemo(() => (
    <div className="flex flex-col h-full w-full items-start overflow-y-auto">
      {config.description && (
        <ConfigurationPanelItem title="Description">
          {config.description}
        </ConfigurationPanelItem>
      )}

      {localMicTrack && (
        <ConfigurationPanelItem title="Microphone" source={Track.Source.Microphone}>
          <AudioInputTile trackRef={localMicTrack} />
        </ConfigurationPanelItem>
      )}
    </div>
  ), [
    config.description,
    localMicTrack,
  ]);

  const mobileTabs: PlaygroundTab[] = [];

  if (config.settings.outputs.audio) {
    mobileTabs.push({
      title: "Audio",
      content: <PlaygroundTile className="w-full h-full grow">{audioTileContent}</PlaygroundTile>,
    });
  }

  if (config.settings.chat) {
    mobileTabs.push({ title: "Chat", content: chatTileContent });
  }

  mobileTabs.push({
    title: "Settings",
    content: (
      <PlaygroundTile
        padding={false}
        backgroundColor="gray-950"
        className="h-full w-full basis-1/4 items-start overflow-y-auto flex"
        childrenClassName="h-full grow items-start"
      >
        {settingsTileContent}
      </PlaygroundTile>
    ),
  });

  return (
    <>
      <PlaygroundHeader
        title="Hey, How are you?"
        logo={null} // Remove logo
        githubLink={undefined}
        height={headerHeight}
        accentColor="blue"
        connectionState={roomState}
        onConnectClicked={() => onConnect(roomState === ConnectionState.Disconnected)}
      />
      <div className="flex gap-4 py-4 grow w-full" style={{ height: `calc(100% - ${headerHeight}px)` }}>
        <div className="flex flex-col grow basis-1/2 gap-4 h-full lg:hidden">
          <PlaygroundTabbedTile className="h-full" tabs={mobileTabs} initialTab={mobileTabs.length - 1} />
        </div>
        <div className={`flex-col grow basis-1/2 gap-4 h-full hidden lg:${!config.settings.outputs.audio ? "hidden" : "flex"}`}>
          {config.settings.outputs.audio && (
            <PlaygroundTile title="Agent Audio" className="w-full h-full grow">
              {audioTileContent}
            </PlaygroundTile>
          )}
        </div>
        {config.settings.chat && (
          <PlaygroundTile title="Chat" className="h-full grow basis-1/4 hidden lg:flex">
            {chatTileContent}
          </PlaygroundTile>
        )}
        <PlaygroundTile
          padding={false}
          backgroundColor="gray-950"
          className="h-full w-full basis-1/4 items-start overflow-y-auto hidden max-w-[480px] lg:flex"
          childrenClassName="h-full grow items-start"
        >
          {settingsTileContent}
        </PlaygroundTile>
      </div>
    </>
  );
}