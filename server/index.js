#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const OSASCRIPT_TIMEOUT = 30000;

/**
 * Escapes a string for safe interpolation into AppleScript.
 * Uses JSON.stringify to handle quotes, backslashes, newlines, and control characters.
 */
function escapeAppleScriptString(str) {
  if (typeof str !== "string") {
    return "";
  }
  // JSON.stringify adds surrounding quotes, so we slice them off
  return JSON.stringify(str).slice(1, -1);
}

/**
 * Validates and returns a safe integer within the specified range.
 * Throws if the value is not a valid integer or out of range.
 */
function validateInteger(value, name, min = -Infinity, max = Infinity) {
  const num = Number(value);
  if (!Number.isInteger(num)) {
    throw new Error(`${name} must be an integer`);
  }
  if (num < min || num > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return num;
}

/**
 * Validates and returns a safe number within the specified range.
 * Throws if the value is not a valid finite number or out of range.
 */
function validateNumber(value, name, min = -Infinity, max = Infinity) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`${name} must be a valid number`);
  }
  if (num < min || num > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return num;
}

/**
 * Validates and returns a boolean value.
 * Throws if the value is not a boolean.
 */
function validateBoolean(value, name) {
  if (typeof value !== "boolean") {
    throw new Error(`${name} must be a boolean`);
  }
  return value;
}

/**
 * Validates that a string is a properly formatted Spotify URI.
 * Valid formats: spotify:track:xxx, spotify:album:xxx, spotify:playlist:xxx, etc.
 */
function isValidSpotifyUri(uri) {
  if (typeof uri !== "string") {
    return false;
  }
  // Spotify URIs follow the pattern: spotify:type:id
  // Types include: track, album, artist, playlist, show, episode, user
  // IDs are base62 encoded (alphanumeric)
  const spotifyUriPattern = /^spotify:(track|album|artist|playlist|show|episode|user|collection)(:[a-zA-Z0-9]+)+$/;
  return spotifyUriPattern.test(uri);
}

class SpotifyServer {
  constructor() {
    this.server = new Server(
      {
        name: "spotify",
        version: "0.0.3",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupHandlers();
  }

  async executeAppleScript(script) {
    try {
      const { stdout, stderr } = await execFileAsync(
        "osascript",
        ["-e", script],
        {
          timeout: OSASCRIPT_TIMEOUT,
          maxBuffer: 1024 * 1024,
        },
      );
      if (stderr) {
        console.error("AppleScript stderr:", stderr);
      }
      return stdout.trim();
    } catch (error) {
      console.error("Failed to execute AppleScript:", error);
      throw error;
    }
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "spotify_play",
          description: "Resume playback",
          inputSchema: {
            type: "object",
            properties: {},
          },
          annotations: {
            readOnlyHint: false,
            idempotentHint: true,
          },
        },
        {
          name: "spotify_pause",
          description: "Pause playback",
          inputSchema: {
            type: "object",
            properties: {},
          },
          annotations: {
            readOnlyHint: false,
            idempotentHint: true,
          },
        },
        {
          name: "spotify_playpause",
          description: "Toggle play/pause",
          inputSchema: {
            type: "object",
            properties: {},
          },
          annotations: {
            readOnlyHint: false,
            idempotentHint: false,
          },
        },
        {
          name: "spotify_next_track",
          description: "Skip to the next track",
          inputSchema: {
            type: "object",
            properties: {},
          },
          annotations: {
            readOnlyHint: false,
            idempotentHint: false,
          },
        },
        {
          name: "spotify_previous_track",
          description: "Skip to the previous track",
          inputSchema: {
            type: "object",
            properties: {},
          },
          annotations: {
            readOnlyHint: false,
            idempotentHint: false,
          },
        },
        {
          name: "spotify_play_track",
          description: "Start playback of a track by URI",
          inputSchema: {
            type: "object",
            properties: {
              uri: {
                type: "string",
                description: "The Spotify URI of the track to play",
              },
              context: {
                type: "string",
                description: "Optional context URI (playlist, album, etc)",
              },
            },
            required: ["uri"],
          },
          annotations: {
            readOnlyHint: false,
            idempotentHint: true,
          },
        },
        {
          name: "spotify_get_current_track",
          description: "Get information about the current playing track",
          inputSchema: {
            type: "object",
            properties: {},
          },
          annotations: {
            readOnlyHint: true,
          },
        },
        {
          name: "spotify_get_player_state",
          description: "Get the current player state (playing, paused, stopped)",
          inputSchema: {
            type: "object",
            properties: {},
          },
          annotations: {
            readOnlyHint: true,
          },
        },
        {
          name: "spotify_set_volume",
          description: "Set the sound output volume (0-100)",
          inputSchema: {
            type: "object",
            properties: {
              volume: {
                type: "integer",
                description: "Volume level (0-100)",
                minimum: 0,
                maximum: 100,
              },
            },
            required: ["volume"],
          },
          annotations: {
            readOnlyHint: false,
            idempotentHint: true,
          },
        },
        {
          name: "spotify_get_volume",
          description: "Get the current volume",
          inputSchema: {
            type: "object",
            properties: {},
          },
          annotations: {
            readOnlyHint: true,
          },
        },
        {
          name: "spotify_set_position",
          description: "Set the player position within the current track",
          inputSchema: {
            type: "object",
            properties: {
              position: {
                type: "number",
                description: "Position in seconds",
                minimum: 0,
              },
            },
            required: ["position"],
          },
          annotations: {
            readOnlyHint: false,
            idempotentHint: true,
          },
        },
        {
          name: "spotify_get_position",
          description: "Get the player position within the current track",
          inputSchema: {
            type: "object",
            properties: {},
          },
          annotations: {
            readOnlyHint: true,
          },
        },
        {
          name: "spotify_set_repeat",
          description: "Turn repeat on or off",
          inputSchema: {
            type: "object",
            properties: {
              enabled: {
                type: "boolean",
                description: "Enable or disable repeat",
              },
            },
            required: ["enabled"],
          },
          annotations: {
            readOnlyHint: false,
            idempotentHint: true,
          },
        },
        {
          name: "spotify_get_repeat",
          description: "Get repeat status",
          inputSchema: {
            type: "object",
            properties: {},
          },
          annotations: {
            readOnlyHint: true,
          },
        },
        {
          name: "spotify_set_shuffle",
          description: "Turn shuffle on or off",
          inputSchema: {
            type: "object",
            properties: {
              enabled: {
                type: "boolean",
                description: "Enable or disable shuffle",
              },
            },
            required: ["enabled"],
          },
          annotations: {
            readOnlyHint: false,
            idempotentHint: true,
          },
        },
        {
          name: "spotify_get_shuffle",
          description: "Get shuffle status",
          inputSchema: {
            type: "object",
            properties: {},
          },
          annotations: {
            readOnlyHint: true,
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (!request.params.name) {
        throw new Error("Tool name is required");
      }

      const toolName = request.params.name;
      const args = request.params.arguments || {};

      try {
        let result;

        switch (toolName) {
          case "spotify_play":
            result = await this.executeAppleScript(
              'tell application "Spotify" to play',
            );
            break;

          case "spotify_pause":
            result = await this.executeAppleScript(
              'tell application "Spotify" to pause',
            );
            break;

          case "spotify_playpause":
            result = await this.executeAppleScript(
              'tell application "Spotify" to playpause',
            );
            break;

          case "spotify_next_track":
            result = await this.executeAppleScript(
              'tell application "Spotify" to next track',
            );
            break;

          case "spotify_previous_track":
            result = await this.executeAppleScript(
              'tell application "Spotify" to previous track',
            );
            break;

          case "spotify_play_track":
            // Validate URIs to prevent injection attacks
            if (!isValidSpotifyUri(args.uri)) {
              throw new Error("Invalid Spotify URI format");
            }
            if (args.context && !isValidSpotifyUri(args.context)) {
              throw new Error("Invalid Spotify context URI format");
            }
            // Escape strings as defense-in-depth even after validation
            const safeUri = escapeAppleScriptString(args.uri);
            const safeContext = args.context
              ? escapeAppleScriptString(args.context)
              : null;
            const playScript = safeContext
              ? `tell application "Spotify" to play track "${safeUri}" in context "${safeContext}"`
              : `tell application "Spotify" to play track "${safeUri}"`;
            result = await this.executeAppleScript(playScript);
            break;

          case "spotify_get_current_track":
            const trackInfo = await this.executeAppleScript(`
              tell application "Spotify"
                if player state is not stopped then
                  set trackName to name of current track
                  set trackArtist to artist of current track
                  set trackAlbum to album of current track
                  set trackDuration to duration of current track
                  set trackPopularity to popularity of current track
                  set trackId to id of current track
                  set trackUrl to spotify url of current track
                  return "Name: " & trackName & "\\nArtist: " & trackArtist & "\\nAlbum: " & trackAlbum & "\\nDuration: " & trackDuration & " ms\\nPopularity: " & trackPopularity & "\\nID: " & trackId & "\\nURL: " & trackUrl
                else
                  return "No track is currently playing"
                end if
              end tell
            `);
            result = trackInfo;
            break;

          case "spotify_get_player_state":
            const state = await this.executeAppleScript(
              'tell application "Spotify" to return player state as string',
            );
            result = state;
            break;

          case "spotify_set_volume":
            const safeVolume = validateInteger(args.volume, "volume", 0, 100);
            result = await this.executeAppleScript(
              `tell application "Spotify" to set sound volume to ${safeVolume}`,
            );
            break;

          case "spotify_get_volume":
            result = await this.executeAppleScript(
              'tell application "Spotify" to return sound volume',
            );
            break;

          case "spotify_set_position":
            const safePosition = validateNumber(args.position, "position", 0);
            result = await this.executeAppleScript(
              `tell application "Spotify" to set player position to ${safePosition}`,
            );
            break;

          case "spotify_get_position":
            result = await this.executeAppleScript(
              'tell application "Spotify" to return player position',
            );
            break;

          case "spotify_set_repeat":
            const safeRepeat = validateBoolean(args.enabled, "enabled");
            result = await this.executeAppleScript(
              `tell application "Spotify" to set repeating to ${safeRepeat}`,
            );
            break;

          case "spotify_get_repeat":
            result = await this.executeAppleScript(
              'tell application "Spotify" to return repeating',
            );
            break;

          case "spotify_set_shuffle":
            const safeShuffle = validateBoolean(args.enabled, "enabled");
            result = await this.executeAppleScript(
              `tell application "Spotify" to set shuffling to ${safeShuffle}`,
            );
            break;

          case "spotify_get_shuffle":
            result = await this.executeAppleScript(
              'tell application "Spotify" to return shuffling',
            );
            break;

          default:
            throw new Error(`Unknown tool: ${toolName}`);
        }

        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Spotify MCP server running on stdio");
  }
}

const server = new SpotifyServer();
server.run().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});