"use client";

import { useCloud } from "@/cloud/useCloud";
import React, { createContext, useState } from "react";
import { useCallback } from "react";
import { useConfig } from "./useConfig";
import { useToast } from "@/components/toast/ToasterProvider";

export type ConnectionMode = "cloud" | "manual" | "env";

type TokenGeneratorData = {
  shouldConnect: boolean;
  wsUrl: string;
  token: string;
  mode: ConnectionMode;
  disconnect: () => Promise<void>;
  connect: (mode: ConnectionMode) => Promise<void>;
};

const ConnectionContext = createContext<TokenGeneratorData | undefined>(
  undefined,
);

// Helper function to validate URL
const isValidUrl = (urlString: string): boolean => {
  try {
    const url = new URL(urlString);
    return url.protocol === 'ws:' || url.protocol === 'wss:' || url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

export const ConnectionProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { generateToken, wsUrl: cloudWSUrl } = useCloud();
  const { setToastMessage } = useToast();
  const { config } = useConfig();
  const [connectionDetails, setConnectionDetails] = useState<{
    wsUrl: string;
    token: string;
    mode: ConnectionMode;
    shouldConnect: boolean;
  }>({ wsUrl: "", token: "", shouldConnect: false, mode: "manual" });

  const connect = useCallback(
    async (mode: ConnectionMode) => {
      let token = "";
      let url = "";
      
      try {
        if (mode === "cloud") {
          try {
            token = await generateToken();
          } catch (error) {
            setToastMessage({
              type: "error",
              message:
                "Failed to generate token, you may need to increase your role in this LiveKit Cloud project.",
            });
            return;
          }
          url = cloudWSUrl;
        } else if (mode === "env") {
          const envUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
          if (!envUrl) {
            setToastMessage({
              type: "error",
              message: "NEXT_PUBLIC_LIVEKIT_URL is not set",
            });
            return;
          }
          
          if (!isValidUrl(envUrl)) {
            setToastMessage({
              type: "error",
              message: "NEXT_PUBLIC_LIVEKIT_URL is not a valid URL",
            });
            return;
          }
          
          url = envUrl;
          const body: Record<string, any> = {};
          if (config.settings.room_name) {
            body.roomName = config.settings.room_name;
          }
          if (config.settings.participant_id) {
            body.participantId = config.settings.participant_id;
          }
          if (config.settings.participant_name) {
            body.participantName = config.settings.participant_name;
          }
          if (config.settings.agent_name) {
            body.agentName = config.settings.agent_name;
          }
          if (config.settings.metadata) {
            body.metadata = config.settings.metadata;
          }
          const attributesArray = Array.isArray(config.settings.attributes)
            ? config.settings.attributes
            : [];
          if (attributesArray?.length) {
            const attributes = attributesArray.reduce(
              (acc, attr) => {
                if (attr.key) {
                  acc[attr.key] = attr.value;
                }
                return acc;
              },
              {} as Record<string, string>,
            );
            body.attributes = attributes;
          }
          
          try {
            const response = await fetch(`/api/token`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(body),
            });
            
            if (!response.ok) {
              throw new Error(`Failed to fetch token: ${response.statusText}`);
            }
            
            const { accessToken } = await response.json();
            token = accessToken;
          } catch (error) {
            setToastMessage({
              type: "error",
              message: `Failed to fetch token: ${error instanceof Error ? error.message : 'Unknown error'}`,
            });
            return;
          }
        } else {
          token = config.settings.token;
          url = config.settings.ws_url;
        }
        
        // Validate URL before setting connection details
        if (!url) {
          setToastMessage({
            type: "error",
            message: "WebSocket URL is empty",
          });
          return;
        }
        
        if (!isValidUrl(url)) {
          setToastMessage({
            type: "error",
            message: `Invalid WebSocket URL: ${url}`,
          });
          return;
        }
        
        if (!token) {
          setToastMessage({
            type: "error",
            message: "Token is empty",
          });
          return;
        }
        
        setConnectionDetails({ wsUrl: url, token, shouldConnect: true, mode });
      } catch (error) {
        setToastMessage({
          type: "error",
          message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    },
    [
      cloudWSUrl,
      config.settings.token,
      config.settings.ws_url,
      config.settings.room_name,
      config.settings.participant_name,
      config.settings.agent_name,
      config.settings.participant_id,
      config.settings.metadata,
      config.settings.attributes,
      generateToken,
      setToastMessage,
    ],
  );

  const disconnect = useCallback(async () => {
    setConnectionDetails((prev) => ({ ...prev, shouldConnect: false }));
  }, []);

  return (
    <ConnectionContext.Provider
      value={{
        wsUrl: connectionDetails.wsUrl,
        token: connectionDetails.token,
        shouldConnect: connectionDetails.shouldConnect,
        mode: connectionDetails.mode,
        connect,
        disconnect,
      }}
    >
      {children}
    </ConnectionContext.Provider>
  );
};

export const useConnection = () => {
  const context = React.useContext(ConnectionContext);
  if (context === undefined) {
    throw new Error("useConnection must be used within a ConnectionProvider");
  }
  return context;
};