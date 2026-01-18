import { ref, computed } from 'vue'

let ext

const McpToolPageHeader = {
    template: `
    <div class="text-sm flex flex-col items-end">
        <!-- Collapsed Header -->
        <div
            @click="ext.setPrefs({ expanded: !ext.prefs.expanded })"
            class="inline-flex items-center gap-2 cursor-pointer select-none group"
        >
            <svg
                class="w-5 h-5 text-gray-500 transition-transform duration-200"
                :class="{ 'rotate-90': ext.prefs.expanded }"
                xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"
            >
                <path d="M10 17l5-5-5-5v10z"/>
            </svg>
            <span class="font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100">
                MCP Servers
            </span>
            <span v-if="enabledCount > 0" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                :title="Object.keys(mcpServers).join('\\n')">
                {{ enabledCount }} enabled
            </span>
            <span v-if="disabledCount > 0" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
                :title="Object.keys(disabledServers).join('\\n')">
                {{ disabledCount }} disabled
            </span>
            <span v-if="enabledCount === 0 && disabledCount === 0" class="text-gray-500 dark:text-gray-400">
                No servers configured
            </span>
        </div>

        <!-- Expanded Content -->
        <div v-if="ext.prefs.expanded" class="mt-3 pb-4 space-y-4 w-full">
            <!-- Enabled Servers -->
            <div v-if="enabledCount > 0">
                <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    Enabled Servers
                </h4>
                <div class="space-y-2">
                    <div
                        v-for="(config, name) in mcpServers"
                        :key="name"
                        class="relative rounded-lg p-3 border border-gray-200 dark:border-gray-700"
                    >
                        <button type="button"
                            @click.stop="copyConfig(name, config)"
                            class="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                            :title="copying === name ? 'Copied!' : JSON.stringify(config, null, 2)"
                        >
                            <svg v-if="copying === name" class="size-3.5 text-green-600 dark:text-green-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="m9.55 18l-5.7-5.7l1.425-1.425L9.55 15.15l9.175-9.175L20.15 7.4z"/></svg>
                            <svg v-else xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2m0 16H8V7h11z"></path></svg>
                        </button>
                        <div class="flex items-center gap-2 mb-2">
                            <span :title="JSON.stringify(config, null, 2)" class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100 dark:bg-green-900">
                                <svg class="w-3 h-3 text-green-600 dark:text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                                </svg>
                            </span>
                            <span class="font-medium text-gray-900 dark:text-white">{{ name }}</span>
                            <span class="text-xs text-gray-500 dark:text-gray-400">&middot;</span>
                            <span v-if="config.description" class="text-xs text-gray-500 dark:text-gray-400">{{ config.description }}</span>
                        </div>
                        <div class="pl-7 space-y-1 text-xs">
                            <div class="flex items-start gap-2">
                                <span class="text-gray-500 dark:text-gray-400 w-16 flex-shrink-0">Command:</span>
                                <code class="font-mono text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{{ config.command }}</code>
                            </div>
                            <div v-if="config.args?.length" class="flex items-start gap-2">
                                <span class="text-gray-500 dark:text-gray-400 w-16 flex-shrink-0">Args:</span>
                                <div class="flex flex-wrap gap-1">
                                    <code
                                        v-for="(arg, idx) in config.args"
                                        :key="idx"
                                        class="font-mono text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded"
                                    >{{ arg }}</code>
                                </div>
                            </div>
                            <div v-if="config.env && Object.keys(config.env).length > 0" class="flex items-start gap-2">
                                <span class="text-gray-500 dark:text-gray-400 w-16 flex-shrink-0">Env:</span>
                                <div class="flex flex-wrap gap-1">
                                    <span
                                        v-for="(value, key) in config.env"
                                        :key="key"
                                        class="font-mono text-gray-700 dark:text-gray-300 bg-blue-50 dark:bg-blue-900/30 px-1.5 pt-0.5 rounded border border-blue-200 dark:border-blue-800"
                                    >{{ key }}</span>
                                </div>
                            </div>
                            <div v-if="config.tools?.length" class="flex items-start gap-2">
                                <span class="text-gray-500 dark:text-gray-400 w-16 flex-shrink-0">Tools:</span>
                                <div class="flex flex-wrap gap-1">
                                    <span
                                        v-for="tool in config.tools"
                                        :key="tool"
                                        class="font-mono text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/50 px-1.5 py-0.5 rounded"
                                    >{{ tool }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Disabled Servers -->
            <div v-if="disabledCount > 0">
                <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                    Disabled Servers
                </h4>
                <div class="space-y-2">
                    <div
                        v-for="(config, name) in disabledServers"
                        :key="name"
                        class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700"
                    >
                        <div class="flex items-center gap-2 mb-2">
                            <svg class="size-4 text-yellow-500 dark:text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M449.07 399.08L278.64 82.58c-12.08-22.44-44.26-22.44-56.35 0L51.87 399.08A32 32 0 0 0 80 446.25h340.89a32 32 0 0 0 28.18-47.17m-198.6-1.83a20 20 0 1 1 20-20a20 20 0 0 1-20 20m21.72-201.15l-5.74 122a16 16 0 0 1-32 0l-5.74-121.95a21.73 21.73 0 0 1 21.5-22.69h.21a21.74 21.74 0 0 1 21.73 22.7Z"/></svg>
                            <span class="font-medium text-gray-900 dark:text-white">{{ name }}</span>
                        </div>
                        <div v-if="config.missingEnvVars?.length" class="pl-6">
                            <div class="flex items-start gap-2 text-xs">
                                <span class="text-orange-600 dark:text-orange-400 flex-shrink-0">Missing env vars:</span>
                                <div class="flex flex-wrap gap-1">
                                    <code
                                        v-for="envVar in config.missingEnvVars"
                                        :key="envVar"
                                        class="font-mono text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/50 px-1.5 py-0.5 rounded"
                                    >{{ envVar }}</code>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Config Path -->
            <div v-if="configPath" class="text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700">
                Add 
                <a href="https://gofastmcp.com/python-sdk/fastmcp-mcp_config" target="_blank" class="underline hover:text-gray-900 dark:hover:text-gray-100">
                MCP server configurations
                </a>
                to <code class="font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300">{{ configPath }}</code>
                &middot;
                explore <a href="https://mcpservers.org" target="_blank" class="underline hover:text-gray-900 dark:hover:text-gray-100">mcpservers.org</a>
            </div>
        </div>
    </div>
    `,
    setup() {
        const copying = ref(null)
        const mcpServers = computed(() => ext.state.info?.mcpServers || {})
        const disabledServers = computed(() => ext.state.info?.disabledServers || {})
        const enabledCount = computed(() => Object.keys(mcpServers.value).length)
        const disabledCount = computed(() => Object.keys(disabledServers.value).length)
        const configPath = computed(() => ext.state.info?.configPath)

        async function copyConfig(name, config) {
            const json = JSON.stringify({ [name]: config }, null, 2)
            await navigator.clipboard.writeText(json)
            copying.value = name
            setTimeout(() => {
                copying.value = null
            }, 2000)
        }

        return {
            ext,
            copying,
            mcpServers,
            disabledServers,
            enabledCount,
            disabledCount,
            configPath,
            copyConfig,
        }
    }
}

export default {
    install(ctx) {
        ext = ctx.scope('fast_mcp')

        ctx.components({ McpToolPageHeader })

        ctx.tools?.setToolPageHeaders({
            fast_mcp: McpToolPageHeader
        })
    },

    async load(ctx) {
        const api = await ext.getJson('info')
        ext.setState({
            info: api.response || {}
        })
    }
}