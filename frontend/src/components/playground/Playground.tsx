"use client";

import { LoadingSVG } from "@/components/button/LoadingSVG";
import { ChatMessageType } from "@/components/chat/ChatTile";
import { AudioInputTile } from "@/components/config/AudioInputTile";
import { ConfigurationPanelItem } from "@/components/config/ConfigurationPanelItem";
import { NameValueRow } from "@/components/config/NameValueRow";
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
  VideoTrack,
  useConnectionState,
  useDataChannel,
  useLocalParticipant,
  useRoomInfo,
  useTracks,
  useVoiceAssistant,
  useRoomContext,
  useParticipantAttributes,
} from "@livekit/components-react";
import { ConnectionState, LocalParticipant, Track } from "livekit-client";
import { QRCodeSVG } from "qrcode.react";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { EditableNameValueRow } from "@/components/config/NameValueRow";
import { AttributesInspector } from "@/components/config/AttributesInspector";
import { RpcPanel } from "./RpcPanel";

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
  const { config, setUserSettings } = useConfig();
  const { name } = useRoomInfo();
  const [transcripts, setTranscripts] = useState<ChatMessageType[]>([]);
  const { localParticipant } = useLocalParticipant();
  const voiceAssistant = useVoiceAssistant();
  const roomState = useConnectionState();
  const tracks = useTracks();
  const room = useRoomContext();

  const [rpcMethod, setRpcMethod] = useState("");
  const [rpcPayload, setRpcPayload] = useState("");

  useEffect(() => {
    if (roomState === ConnectionState.Connected) {
      localParticipant.setCameraEnabled(config.settings.inputs.camera);
      localParticipant.setMicrophoneEnabled(config.settings.inputs.mic);
    }
  }, [config, localParticipant, roomState]);

  const localTracks = tracks.filter(
    ({ participant }) => participant instanceof LocalParticipant,
  );
  const localScreenTrack = localTracks.find(
    ({ source }) => source === Track.Source.ScreenShare,
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

  const handleRpcCall = useCallback(async () => {
    if (!voiceAssistant.agent || !room) {
      throw new Error("No agent or room available");
    }
    return await room.localParticipant.performRpc({
      destinationIdentity: voiceAssistant.agent.identity,
      method: rpcMethod,
      payload: rpcPayload,
    });
  }, [room, rpcMethod, rpcPayload, voiceAssistant.agent]);

  const agentAttributes = useParticipantAttributes({
    participant: voiceAssistant.agent,
  });

  const settingsTileContent = useMemo(() => (
    <div className="flex flex-col h-full w-full items-start overflow-y-auto">
      {config.description && (
        <ConfigurationPanelItem title="Description">
          {config.description}
        </ConfigurationPanelItem>
      )}

      <ConfigurationPanelItem title="Room">
        <div className="flex flex-col gap-2">
          <EditableNameValueRow
            name="Room name"
            value={
              roomState === ConnectionState.Connected
                ? name
                : config.settings.room_name
            }
            valueColor="blue-500"
            onValueChange={(value) => {
              const newSettings = { ...config.settings, room_name: value };
              setUserSettings(newSettings);
            }}
            placeholder="Auto"
            editable={roomState !== ConnectionState.Connected}
          />
          <NameValueRow
            name="Status"
            value={
              roomState === ConnectionState.Connecting ? (
                <LoadingSVG diameter={16} strokeWidth={2} />
              ) : (
                roomState.charAt(0).toUpperCase() + roomState.slice(1)
              )
            }
            valueColor={
              roomState === ConnectionState.Connected ? "blue-500" : "gray-500"
            }
          />
        </div>
      </ConfigurationPanelItem>

      <ConfigurationPanelItem title="Agent">
        <div className="flex flex-col gap-2">
          <EditableNameValueRow
            name="Agent name"
            value={
              roomState === ConnectionState.Connected
                ? config.settings.agent_name || "None"
                : config.settings.agent_name || ""
            }
            valueColor="blue-500"
            onValueChange={(value) => {
              const newSettings = { ...config.settings, agent_name: value };
              setUserSettings(newSettings);
            }}
            placeholder="None"
            editable={roomState !== ConnectionState.Connected}
          />
          <NameValueRow
            name="Identity"
            value={
              voiceAssistant.agent
                ? voiceAssistant.agent.identity
                : roomState === ConnectionState.Connected
                ? <LoadingSVG diameter={12} strokeWidth={2} />
                : "No agent connected"
            }
            valueColor={voiceAssistant.agent ? "blue-500" : "gray-500"}
          />
          {roomState === ConnectionState.Connected && voiceAssistant.agent && (
            <AttributesInspector
              attributes={Object.entries(
                agentAttributes.attributes || {},
              ).map(([key, value], index) => ({
                id: `agent-attr-${index}`,
                key,
                value: String(value),
              }))}
              onAttributesChange={() => {}}
              themeColor="blue"
              disabled={true}
            />
          )}
        </div>
      </ConfigurationPanelItem>

      <ConfigurationPanelItem title="User">
        <div className="flex flex-col gap-2">
          <EditableNameValueRow
            name="Name"
            value={
              roomState === ConnectionState.Connected
                ? localParticipant?.name || ""
                : config.settings.participant_name || ""
            }
            valueColor="blue-500"
            onValueChange={(value) => {
              const newSettings = { ...config.settings, participant_name: value };
              setUserSettings(newSettings);
            }}
            placeholder="Auto"
            editable={roomState !== ConnectionState.Connected}
          />
          <EditableNameValueRow
            name="Identity"
            value={
              roomState === ConnectionState.Connected
                ? localParticipant?.identity || ""
                : config.settings.participant_id || ""
            }
            valueColor="blue-500"
            onValueChange={(value) => {
              const newSettings = { ...config.settings, participant_id: value };
              setUserSettings(newSettings);
            }}
            placeholder="Auto"
            editable={roomState !== ConnectionState.Connected}
          />
          <AttributesInspector
            attributes={config.settings.attributes || []}
            onAttributesChange={(newAttributes) => {
              const newSettings = { ...config.settings, attributes: newAttributes };
              setUserSettings(newSettings);
            }}
            metadata={config.settings.metadata}
            onMetadataChange={(metadata) => {
              const newSettings = { ...config.settings, metadata };
              setUserSettings(newSettings);
            }}
            themeColor="blue"
            disabled={false}
            connectionState={roomState}
          />
        </div>
      </ConfigurationPanelItem>

      {roomState === ConnectionState.Connected && config.settings.inputs.screen && (
        <ConfigurationPanelItem title="Screen" source={Track.Source.ScreenShare}>
          {localScreenTrack ? (
            <VideoTrack className="rounded-sm border border-gray-800 opacity-70 w-full" trackRef={localScreenTrack} />
          ) : (
            <div className="flex items-center justify-center text-gray-700 text-center w-full h-full">
              Press the button above to share your screen.
            </div>
          )}
        </ConfigurationPanelItem>
      )}

      {roomState === ConnectionState.Connected && voiceAssistant.agent && (
        <RpcPanel
          config={config}
          rpcMethod={rpcMethod}
          rpcPayload={rpcPayload}
          setRpcMethod={setRpcMethod}
          setRpcPayload={setRpcPayload}
          handleRpcCall={handleRpcCall}
        />
      )}

      {localMicTrack && (
        <ConfigurationPanelItem title="Microphone" source={Track.Source.Microphone}>
          <AudioInputTile trackRef={localMicTrack} />
        </ConfigurationPanelItem>
      )}

      {config.show_qr && (
        <ConfigurationPanelItem title="QR Code">
          <QRCodeSVG value={window.location.href} width="128" />
        </ConfigurationPanelItem>
      )}
    </div>
  ), [
    config,
    roomState,
    localParticipant,
    localScreenTrack,
    localMicTrack,
    name,
    voiceAssistant.agent,
    agentAttributes.attributes,
    rpcMethod,
    rpcPayload,
    handleRpcCall,
    setUserSettings,
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
        logo={logo}
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