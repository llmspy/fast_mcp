import asyncio
import json
import os
from pathlib import Path

from aiohttp import web
from fastmcp import Client
from fastmcp.client import StdioTransport

MCP_LOG_ERRORS = os.getenv("MCP_LOG_ERRORS", "0") == 1
MCP_TIMEOUT = float(os.getenv("MCP_TIMEOUT", "60.0"))

g_valid_servers = {}
g_valid_servers_tools = {}

g_default_mcp_config = {
    "mcpServers": {"filesystem": {"command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "$PWD", "$LLMS_HOME/.agent"]}}
}

def from_mcp_result(content):
    if hasattr(content, "model_dump"):
        return content.model_dump()
    elif hasattr(content, "dict"):
        return content.dict()

    try:
        return {k: v for k, v in vars(content).items() if not k.startswith("_")}
    except Exception:
        return content


def create_tool_wrapper(ctx, tool_name, server_params):
    """
    Creates an async wrapper function for an MCP tool.
    Uses a fresh client connection for every execution to ensure reliability.
    """

    async def specific_tool_wrapper(**kwargs):
        log_file = None
        if MCP_LOG_ERRORS:
            log_dir = os.path.join(ctx.path, "logs")
            fs_safe_name = tool_name.replace("/", "_")
            os.makedirs(log_dir, exist_ok=True)  # Ensure log directory exists
            log_file = Path(os.path.join(log_dir, f"{fs_safe_name}.stderr.log"))

        ctx.dbg(f"Executing {tool_name} with fresh connection...")

        try:
            transport = StdioTransport(
                command=server_params["cmd"],
                args=server_params["args"],
                env=server_params["env"],
                log_file=log_file,
            )
            async with Client(transport=transport) as client:
                ctx.dbg(f"client.call_tool('{tool_name}','{json.dumps(kwargs)}')")
                result = await client.call_tool(tool_name, kwargs, timeout=MCP_TIMEOUT)

                if hasattr(result, "content"):
                    output = []
                    for content in result.content:
                        output.append(from_mcp_result(content))
                    ctx.dbg(f"{tool_name} output: {len(output)} blocks")
                    return output
                else:
                    ctx.dbg(f"{tool_name} output type: {type(result)}")
                    return result

        except Exception as e:
            ctx.err(f"Error executing tool {tool_name}", e)
            return f"Error executing tool: {e}"

    specific_tool_wrapper.__name__ = tool_name
    return specific_tool_wrapper


def read_mcp_config(ctx):
    """Returns the original MCP config (without env var expansion)"""
    candidate_paths = []
    # return default prompts for all users if exists
    candidate_paths.append(os.path.join(ctx.get_user_path(), "fast_mcp", "mcp.json"))
    # otherwise return the default prompts from this repo
    candidate_paths.append(os.path.join(ctx.path, "ui", "mcp.json"))

    # iterate all candidate paths and when exists return its json
    for path in candidate_paths:
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                try:
                    txt = f.read()
                    ret = json.loads(txt)
                except Exception as e:
                    ctx.log(f"Failed to parse mcp.json at {path}: {e}")
                    continue

                return ret
    return {"mcpServers": {}}


def get_missing_env_vars(server_conf):
    missing_vars = set()
    # Check args for env var references
    args = server_conf.get("args", [])
    for arg in args:
        if isinstance(arg, str) and arg.startswith("$"):
            env_var = arg[1:]
            if os.getenv(env_var) is None and not env_var.startswith("LLMS_HOME"):
                missing_vars.add(env_var)

    # Check env for env var references
    env = server_conf.get("env", {})
    for key, val in env.items():
        if isinstance(val, str) and val.startswith("$"):
            env_var = val[1:]
            if os.getenv(env_var) is None and not env_var.startswith("LLMS_HOME"):
                missing_vars.add(env_var)

    return list(missing_vars)

def get_arg_value(ctx, arg, server_name):
    if arg is None:
        return None, None
    if isinstance(arg, str) and arg.startswith("$"):
        env_var = arg[1:]
        env_val = os.getenv(env_var)
        if not env_val and env_var.startswith("LLMS_HOME"):
            # Special case: default LLMS_HOME to user path
            env_val = arg.replace("$LLMS_HOME", ctx.get_home_path())
        if env_val is None:
            return None, f"Environment variable {env_var} not found for server {server_name}, removing server config"
        else:
            return env_val, None
    else:
        return arg, None

def get_mcp_config(ctx):
    ret = read_mcp_config(ctx)
    if "mcpServers" in ret:
        mcpServers = ret.get("mcpServers")
        valid_servers = {}

        for name, config in mcpServers.items():
            if "args" in config and isinstance(config["args"], list):
                new_args = []
                missing_env = False
                for arg in config["args"]:
                    arg_val, error = get_arg_value(ctx, arg, server_name=name)
                    if error:
                        ctx.dbg(error)
                        missing_env = True
                        break
                    new_args.append(arg_val)
                if not missing_env:
                    config["args"] = new_args

            if "env" in config and isinstance(config["env"], dict):
                new_env = {}
                for key, val in config["env"].items():
                    arg_val, error = get_arg_value(ctx, val, server_name=name)
                    if error:
                        ctx.dbg(error)
                        missing_env = True
                        break
                    new_env[key] = arg_val
                if not missing_env:
                    config["env"] = new_env

            if not missing_env:
                valid_servers[name] = config

        ret["mcpServers"] = valid_servers
        global g_valid_servers
        g_valid_servers = valid_servers
    return ret


async def discover_server(ctx, name, server_conf):
    """
    Discover tools from a single MCP server.
    Returns a list of (tool, server_params) tuples, or empty list on error.
    """
    cmd = server_conf.get("command")
    args = server_conf.get("args", [])
    env = server_conf.get("env")

    if not cmd:
        ctx.log(f"Skipping MCP server {name}: No command specified")
        return []

    try:
        log_dir = os.path.join(ctx.path, "logs")
        os.makedirs(log_dir, exist_ok=True)
        log_file = Path(os.path.join(log_dir, f"{name}_discovery.stderr.log"))

        ctx.log(f"Discovering tools for MCP server: {name}...")

        transport = StdioTransport(command=cmd, args=args, env=env, log_file=log_file)

        async with Client(transport=transport) as client:
            tools = await client.list_tools()
            ctx.log(f"Connected to {name}. Found {len(tools)} tools.")

            server_params = {"cmd": cmd, "args": args, "env": env}
            return [(tool, server_params) for tool in tools]

    except Exception as e:
        ctx.log(f"Error initializing MCP server {name}: {e}")
        return []


def install(ctx):
    async def get_info(request):
        config = read_mcp_config(ctx)
        ret = {
            "configPath": os.path.join(ctx.get_user_path(), "fast_mcp", "mcp.json"),
        }
        if "mcpServers" in config:
            # Filter to only include servers that are valid
            filtered_servers = {
                name: server_config for name, server_config in config["mcpServers"].items() if name in g_valid_servers
            }
            for name in filtered_servers:
                filtered_servers[name]["tools"] = g_valid_servers_tools.get(name, [])
            ret["mcpServers"] = filtered_servers
            disabled_servers = {
                name: {"missingEnvVars": get_missing_env_vars(server_config)}
                for name, server_config in config["mcpServers"].items()
                if name not in g_valid_servers
            }
            ret["disabledServers"] = disabled_servers
        return web.json_response(ret)

    ctx.add_get("info", get_info)

    async def add_mcp_server(request):
        mcpServer = await request.json()
        name = mcpServer.get("name")
        command = mcpServer.get("command")

        if not name:
            raise Exception("Missing required field 'name'.")
        if not command:
            raise Exception("Missing required field 'command'.")

        config_path = os.path.join(ctx.get_user_path(), "fast_mcp", "mcp.json")
        os.makedirs(os.path.dirname(config_path), exist_ok=True)
        if not os.path.exists(config_path):
            with open(config_path, "w", encoding="utf-8") as f:
                json.dump(g_default_mcp_config, f, indent=2)

        config = read_mcp_config(ctx)
        mcp_servers = config.get("mcpServers", {})

        if name in mcp_servers:
            raise Exception(f"MCP server with name '{name}' already exists.")

        new_mcp_server = mcpServer.copy()
        del new_mcp_server["name"]
        mcp_servers[name] = new_mcp_server
        config["mcpServers"] = mcp_servers

        # merge with existing config
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)

        return web.json_response(config)

    ctx.add_post("mcpServers", add_mcp_server)

    async def update_mcp_server(request):
        name = request.match_info.get("name")
        mcpServer = await request.json()
        command = mcpServer.get("command")

        if not command:
            raise Exception("Missing required field 'command'.")

        config_path = os.path.join(ctx.get_user_path(), "fast_mcp", "mcp.json")
        config = read_mcp_config(ctx)
        mcp_servers = config.get("mcpServers", {})

        if name not in mcp_servers:
            raise Exception(f"MCP server with name '{name}' does not exist.")

        updated_mcp_server = mcpServer.copy()
        mcp_servers[name] = updated_mcp_server
        config["mcpServers"] = mcp_servers

        # merge with existing config
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)

        return web.json_response(config)

    ctx.add_put("mcpServers/{name}", update_mcp_server)

    async def delete_mcp_server(request):
        name = request.match_info.get("name")

        config_path = os.path.join(ctx.get_user_path(), "fast_mcp", "mcp.json")
        config = read_mcp_config(ctx)
        mcp_servers = config.get("mcpServers", {})

        if name not in mcp_servers:
            raise Exception(f"MCP server with name '{name}' does not exist.")

        del mcp_servers[name]
        config["mcpServers"] = mcp_servers

        # merge with existing config
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)

        return web.json_response(config)

    ctx.add_delete("mcpServers/{name}", delete_mcp_server)


async def load(ctx):
    """
    Load MCP servers and discover their tools.
    Discoveries run in parallel for speed, but tools are registered in config order
    to ensure deterministic behavior (later servers override earlier ones).
    """
    mcp_config = get_mcp_config(ctx)

    if not mcp_config or "mcpServers" not in mcp_config:
        ctx.log("No MCP servers configured.")
        return

    ctx.dbg(f"mcpConfig:\n{json.dumps(mcp_config, indent=2)}")

    # Get server names in config order (Python 3.7+ dicts maintain insertion order)
    server_names = list(mcp_config["mcpServers"].keys())

    # Run all server discoveries in parallel
    tasks = [discover_server(ctx, name, mcp_config["mcpServers"][name]) for name in server_names]
    results = await asyncio.gather(*tasks)

    # Register tools in config order for deterministic behavior
    # (later servers can override tools from earlier servers)
    for name, server_tools in zip(server_names, results):
        for tool, server_params in server_tools:
            tool_def = {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.inputSchema,
                },
            }
            wrapper = create_tool_wrapper(ctx, tool.name, server_params=server_params)
            ctx.register_tool(wrapper, tool_def, group=name)

            if name not in g_valid_servers_tools:
                g_valid_servers_tools[name] = []
            g_valid_servers_tools[name].append(tool.name)


__install__ = install
__load__ = load
