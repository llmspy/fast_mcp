# Fast MCP Extension

This extension brings [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) support to `llms.py`, allowing you to extend LLM capabilities with a wide range of external tools and services.

## Features

- **Parallel Discovery**: All configured MCP servers are discovered concurrently for fast startup times.
- **Standardized Tool Access**: Connect to any MCP-compliant server (Node.js, Python, etc.) seamlessly.
- **Dynamic Discovery**: Automatically discovers and registers all tools exposed by the configured servers.
- **Deterministic Registration**: Tools are registered in configuration order; if multiple servers provide tools with the same name, the later server in the config overrides earlier ones.
- **Reliable Execution**: Each tool execution uses a fresh connection to the MCP server to ensure isolation and reliability.
- **Error Logging**: Detailed stderr logs for both discovery and tool execution are stored in the `logs/` directory.

## Configuration

The extension manages MCP servers via a `mcp.json` configuration file. It searches for this file in two locations (first match wins):

1. **User Config**: `~/.llms/user/default/fast_mcp/mcp.json`
2. **Default Config**: The `ui/mcp.json` file bundled with the extension.

### Server Configuration Options

Each server in `mcpServers` supports the [mcp_config fields](https://gofastmcp.com/python-sdk/fastmcp-mcp_config):

| Field         | Type   | Required | Description |
|---------------|--------|----------|-------------|
| `command`     | string | Yes      | The executable to run (e.g., `npx`, `uvx`, `uv`, `python`) |
| `args`        | array  | No       | Command-line arguments passed to the command |
| `env`         | object | No       | Environment variables to set for the server process |
| `timeout`     | number | No       | Timeout in seconds for tool execution |
| `description` | string | No       | A human-readable description of the server |

### Environment Variable Substitution

To allow for flexible and shared configurations, you can reference environment variables using the `$` prefix in both `args` and `env` values, e.g:

- `$PWD` - Current working directory
- `$GEMINI_API_KEY` - Any environment variable

**Selective Registration**: MCP servers are only registered if **all** referenced environment variables are available. If any variable is missing, that server is skipped during discovery. This allows you to maintain a single shared config with optional servers.

### Example `mcp.json`

```json
{
    "mcpServers": {
        "filesystem": {
            "command": "npx",
            "args": [
                "-y",
                "@modelcontextprotocol/server-filesystem",
                "$PWD"
            ]
        },
        "git": {
            "command": "uvx",
            "args": [
                "mcp-server-git",
                "--repository",
                "$PWD"
            ]
        },
        "MiniMax": {
            "command": "uvx",
            "args": [
                "minimax-mcp",
                "-y"
            ],
            "env": {
                "MINIMAX_API_KEY": "$MINIMAX_API_KEY",
                "MINIMAX_MCP_BASE_PATH": "$PWD",
                "MINIMAX_API_HOST": "https://api.minimax.io",
                "MINIMAX_API_RESOURCE_MODE": "url"
            }
        },
        "gemini-gen": {
            "description": "Gemini Image and Audio TTS generation",
            "command": "uvx",
            "args": [
                "gemini-gen-mcp"
            ],
            "env": {
                "GEMINI_API_KEY": "$GEMINI_API_KEY"
            }
        }
    }
}
```

## How It Works

### Discovery Phase (Startup)

1. The extension loads `mcp.json` and filters out servers with missing environment variables
2. All valid servers are discovered **in parallel**
3. Each server is started, queried for its available tools via `list_tools()`
4. Tools are registered in **config order** (deterministic - later servers override earlier ones for duplicate tool names)

### Execution Phase (Runtime)

When a tool is invoked:

1. A **fresh connection** is established to the appropriate MCP server
2. The tool is executed with the provided arguments (configurable timeout, default 60s)
3. The connection is closed after execution

This fresh-connection-per-execution approach ensures reliability and isolation between tool calls.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_TIMEOUT` | `60.0` | Timeout in seconds for MCP tool execution |
| `MCP_LOG_ERRORS` | `0` | Set to `1` to enable detailed stderr logging for tool execution |

## Troubleshooting

If tools are not appearing:

- Check that the MCP server command is accessible in your `PATH`
- Verify that all required environment variables are exported
- Enable detailed error logging with `MCP_LOG_ERRORS=1`
- Review the logs in the `logs/` directory for specific error messages

If tools are timing out:

- Increase the timeout with `MCP_TIMEOUT=120` (or higher value in seconds)

### Log Files

Logs are stored in the extension's `logs/` directory:

| Log File | Description |
|----------|-------------|
| `{server}_discovery.stderr.log` | Stderr output from server during discovery phase |
| `{tool_name}.stderr.log`        | Stderr output from tool execution (when `MCP_LOG_ERRORS=1`) |

## Requirements

- Python 3.9+ (for dict insertion order guarantee)
- [fastmcp](https://pypi.org/project/fastmcp/) - MCP client library
