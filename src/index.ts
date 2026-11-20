#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import crypto from "crypto";
import fs from "fs";
import { google, tasks_v1 } from "googleapis";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { createOAuthClient } from "./Auth.js";
import { TaskActions, TaskResources } from "./Tasks.js";

const tasks = google.tasks("v1");

function createServer() {
const server = new Server(
  {
    name: "example-servers/gtasks",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  },
);

server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
  const [allTasks, nextPageToken] = await TaskResources.list(request, tasks);
  return {
    resources: allTasks.map((task) => ({
      uri: `gtasks:///${task.id}`,
      mimeType: "text/plain",
      name: task.title,
    })),
    nextCursor: nextPageToken,
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const task = await TaskResources.read(request, tasks);

  const taskDetails = [
    `Title: ${task.title || "No title"}`,
    `Status: ${task.status || "Unknown"}`,
    `Due: ${task.due || "Not set"}`,
    `Notes: ${task.notes || "No notes"}`,
    `Hidden: ${task.hidden || "Unknown"}`,
    `Parent: ${task.parent || "Unknown"}`,
    `Deleted?: ${task.deleted || "Unknown"}`,
    `Completed Date: ${task.completed || "Unknown"}`,
    `Position: ${task.position || "Unknown"}`,
    `ETag: ${task.etag || "Unknown"}`,
    `Links: ${task.links || "Unknown"}`,
    `Kind: ${task.kind || "Unknown"}`,
    `Status: ${task.status || "Unknown"}`,
    `Created: ${task.updated || "Unknown"}`,
    `Updated: ${task.updated || "Unknown"}`,
  ].join("\n");

  return {
    contents: [
      {
        uri: request.params.uri,
        mimeType: "text/plain",
        text: taskDetails,
      },
    ],
  };
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "search",
        description: "Search for a task in Google Tasks",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "list",
        description: "List all tasks in Google Tasks",
        inputSchema: {
          type: "object",
          properties: {
            cursor: {
              type: "string",
              description: "Cursor for pagination",
            },
          },
        },
      },
      {
        name: "create",
        description: "Create a new task in Google Tasks",
        inputSchema: {
          type: "object",
          properties: {
            taskListId: {
              type: "string",
              description: "Task list ID",
            },
            title: {
              type: "string",
              description: "Task title",
            },
            notes: {
              type: "string",
              description: "Task notes",
            },
            due: {
              type: "string",
              description: "Due date (YYYY-MM-DD or ISO 8601 format, e.g. 2025-03-19)",
            },
          },
          required: ["title"],
        },
      },
      {
        name: "clear",
        description: "Clear completed tasks from a Google Tasks task list",
        inputSchema: {
          type: "object",
          properties: {
            taskListId: {
              type: "string",
              description: "Task list ID",
            },
          },
          required: ["taskListId"],
        },
      },
      {
        name: "delete",
        description: "Delete a task in Google Tasks",
        inputSchema: {
          type: "object",
          properties: {
            taskListId: {
              type: "string",
              description: "Task list ID",
            },
            id: {
              type: "string",
              description: "Task id",
            },
          },
          required: ["id", "taskListId"],
        },
      },
      {
        name: "list-tasklists",
        description: "List all task lists in Google Tasks",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "update",
        description: "Update a task in Google Tasks",
        inputSchema: {
          type: "object",
          properties: {
            taskListId: {
              type: "string",
              description: "Task list ID",
            },
            id: {
              type: "string",
              description: "Task ID",
            },
            uri: {
              type: "string",
              description: "Task URI",
            },
            title: {
              type: "string",
              description: "Task title",
            },
            notes: {
              type: "string",
              description: "Task notes",
            },
            status: {
              type: "string",
              enum: ["needsAction", "completed"],
              description: "Task status (needsAction or completed)",
            },
            due: {
              type: "string",
              description: "Due date (YYYY-MM-DD or ISO 8601 format, e.g. 2025-03-19)",
            },
          },
          required: ["id", "uri"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "search") {
    const taskResult = await TaskActions.search(request, tasks);
    return taskResult;
  }
  if (request.params.name === "list") {
    const taskResult = await TaskActions.list(request, tasks);
    return taskResult;
  }
  if (request.params.name === "list-tasklists") {
    const response = await tasks.tasklists.list();
    const taskLists = response.data.items || [];
    const formatted = taskLists
      .map((list) => `${list.title} (ID: ${list.id})`)
      .join("\n");
    return {
      content: [
        {
          type: "text",
          text:
            taskLists.length > 0
              ? `Found ${taskLists.length} task lists:\n${formatted}`
              : "No task lists found",
        },
      ],
    };
  }
  if (request.params.name === "create") {
    const taskResult = await TaskActions.create(request, tasks);
    return taskResult;
  }
  if (request.params.name === "update") {
    const taskResult = await TaskActions.update(request, tasks);
    return taskResult;
  }
  if (request.params.name === "delete") {
    const taskResult = await TaskActions.delete(request, tasks);
    return taskResult;
  }
  if (request.params.name === "clear") {
    const taskResult = await TaskActions.clear(request, tasks);
    return taskResult;
  }
  throw new Error("Tool not found");
});

return server;
}

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const credentialsPath = path.join(rootDir, ".gtasks-server-credentials.json");
const oauthKeysPath = path.join(rootDir, "gcp-oauth.keys.json");

async function authenticateAndSaveCredentials() {
  const { authenticate } = await import("@google-cloud/local-auth");
  console.log("Launching auth flow…");
  console.log(oauthKeysPath);
  const auth = await authenticate({
    keyfilePath: oauthKeysPath,
    scopes: ["https://www.googleapis.com/auth/tasks"],
  });
  fs.writeFileSync(credentialsPath, JSON.stringify(auth.credentials));
  console.log("Credentials saved. You can now run the server.");
}

function loadGoogleAuth() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } =
    process.env;
  if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REFRESH_TOKEN) {
    return createOAuthClient(
      { installed: { client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET } },
      { refresh_token: GOOGLE_REFRESH_TOKEN },
    );
  }

  if (!fs.existsSync(credentialsPath)) {
    console.error(
      "Credentials not found. Please run with 'auth' argument first.",
    );
    process.exit(1);
  }
  const oauthKeys = JSON.parse(fs.readFileSync(oauthKeysPath, "utf-8"));
  const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf-8"));
  return createOAuthClient(oauthKeys, credentials);
}

async function runStdio() {
  google.options({ auth: loadGoogleAuth() });
  await createServer().connect(new StdioServerTransport());
}

const sha256 = (value: string) =>
  crypto.createHash("sha256").update(value).digest();

async function runHttp() {
  const mcpKey = process.env.MCP_KEY;
  if (!mcpKey || mcpKey.length < 32) {
    console.error("MCP_KEY is required in http mode (at least 32 characters).");
    process.exit(1);
  }
  const keyHash = sha256(mcpKey);
  const isAuthorized = (candidate?: string) =>
    !!candidate && crypto.timingSafeEqual(sha256(candidate), keyHash);

  google.options({ auth: loadGoogleAuth() });

  const reply = (res: http.ServerResponse, status: number, body: object) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  const httpServer = http.createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url ?? "/", "http://localhost");
      if (pathname === "/healthz") return reply(res, 200, { status: "ok" });

      const match = pathname.match(/^\/mcp(?:\/([^/]+))?$/);
      if (!match) return reply(res, 404, { error: "Not found" });

      const bearer = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
      const pathKey = match[1] && decodeURIComponent(match[1]);
      if (!isAuthorized(bearer) && !isAuthorized(pathKey)) {
        return reply(res, 401, { error: "Unauthorized" });
      }

      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return reply(res, 405, { error: "Method not allowed" });
      }

      const server = createServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on("close", () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("Request failed:", error instanceof Error ? error.message : error);
      if (!res.headersSent) reply(res, 500, { error: "Internal error" });
    }
  });

  const port = Number(process.env.PORT ?? 3000);
  httpServer.listen(port, () => console.log(`gtasks MCP listening on ${port}`));
}

if (process.argv[2] === "auth") {
  authenticateAndSaveCredentials().catch(console.error);
} else if (process.argv[2] === "http") {
  runHttp().catch(console.error);
} else {
  runStdio().catch(console.error);
}
