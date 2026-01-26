import { ref, computed, inject, onMounted, onUnmounted } from 'vue'

let ext

const McpServerModal = {
    template: `
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-100" @click.self="$emit('close')">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                    {{ isEdit ? 'Edit MCP Server' : 'Add MCP Server' }}
                </h3>
                <button type="button" @click="$emit('close')" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                </button>
            </div>
            <div class="p-4 space-y-4 overflow-y-auto flex-1">
                <div v-if="!isEdit">
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Server Name</label>
                    <input
                        v-model="serverName"
                        type="text"
                        placeholder="e.g., filesystem"
                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
                <div v-else>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Server Name</label>
                    <div class="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-md text-gray-900 dark:text-white font-mono text-sm">
                        {{ serverName }}
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Configuration (JSON)</label>
                    <textarea
                        v-model="configJson"
                        rows="14"
                        :placeholder='JSON.stringify({"command":"uvx", "args":["mcp-server-git","--repository","$PWD"]}, null, 2)'
                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                    ></textarea>
                </div>
                <div v-if="error" class="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md">
                    <p class="text-sm text-red-700 dark:text-red-300">{{ error }}</p>
                </div>
            </div>
            <div class="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
                <button type="button"
                    @click="$emit('close')"
                    class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    Cancel
                </button>
                <button type="button"
                    @click="save"
                    :disabled="saving"
                    class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {{ saving ? 'Saving...' : (isEdit ? 'Update' : 'Add') }}
                </button>
            </div>
        </div>
    </div>
    `,
    props: {
        isEdit: { type: Boolean, default: false },
        initialName: { type: String, default: '' },
        initialConfig: { type: Object, default: () => ({}) }
    },
    emits: ['close', 'saved'],
    setup(props, { emit }) {
        const ctx = inject('ctx')
        const serverName = ref(props.initialName)
        const configJson = ref(props.isEdit ? JSON.stringify(props.initialConfig, null, 2) : '')
        const error = ref(null)
        const saving = ref(false)

        async function save() {
            error.value = null

            if (!serverName.value.trim()) {
                error.value = 'Server name is required'
                return
            }

            let config
            try {
                config = JSON.parse(configJson.value)
            } catch (e) {
                error.value = 'Invalid JSON: ' + e.message
                return
            }

            if (!config.command) {
                error.value = 'Configuration must include a "command" field'
                return
            }

            saving.value = true

            try {
                let api
                if (props.isEdit) {
                    api = await ext.putJson('mcpServers/' + encodeURIComponent(serverName.value), config)
                } else {
                    api = await ext.postJson('mcpServers', { name: serverName.value, ...config })
                }

                if (api.error) {
                    error.value = api.error.message || 'An error occurred'
                } else {
                    emit('saved', api.response)
                    emit('close')
                }
            } catch (e) {
                error.value = e.message || 'An error occurred'
            } finally {
                saving.value = false
            }
        }

        let sub
        onMounted(() => {
            sub = ctx.events.subscribe(`keydown:Escape`, () => emit('close'))
        })
        onUnmounted(() => sub?.unsubscribe())
        
        return {
            serverName,
            configJson,
            error,
            saving,
            save
        }
    }
}

const DeleteConfirmModal = {
    template: `
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-100" @click.self="$emit('close')">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4">
            <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Delete MCP Server</h3>
            </div>
            <div class="p-4">
                <p class="text-gray-700 dark:text-gray-300">
                    Are you sure you want to delete <span class="font-semibold">{{ serverName }}</span>?
                </p>
                <div v-if="error" class="mt-3 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md">
                    <p class="text-sm text-red-700 dark:text-red-300">{{ error }}</p>
                </div>
            </div>
            <div class="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
                <button type="button"
                    @click="$emit('close')"
                    class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    Cancel
                </button>
                <button type="button"
                    @click="deleteServer"
                    :disabled="deleting"
                    class="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {{ deleting ? 'Deleting...' : 'Delete' }}
                </button>
            </div>
        </div>
    </div>
    `,
    props: {
        serverName: { type: String, required: true }
    },
    emits: ['close', 'deleted'],
    setup(props, { emit }) {
        const error = ref(null)
        const deleting = ref(false)

        async function deleteServer() {
            error.value = null
            deleting.value = true

            try {
                const api = await ext.deleteJson('mcpServers/' + encodeURIComponent(props.serverName))

                if (api.error) {
                    error.value = api.error.message || 'An error occurred'
                } else {
                    emit('deleted', api.response)
                    emit('close')
                }
            } catch (e) {
                error.value = e.message || 'An error occurred'
            } finally {
                deleting.value = false
            }
        }

        return {
            error,
            deleting,
            deleteServer
        }
    }
}

const McpToolPageHeader = {
    components: { McpServerModal, DeleteConfirmModal },
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
            <!-- Add Server Button -->
            <div class="flex justify-end">
                <button type="button"
                    @click.stop="openAddModal"
                    class="-mb-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                    <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                    </svg>
                    Add Server
                </button>
            </div>

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
                        <div class="absolute top-2 right-2 flex items-center gap-1">
                            <button type="button"
                                @click.stop="openEditModal(name, config)"
                                class="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                title="Edit server"
                            >
                                <svg class="size-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83l3.75 3.75l1.83-1.83z"/></svg>
                            </button>
                            <button type="button"
                                @click.stop="openDeleteModal(name)"
                                class="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                title="Delete server"
                            >
                                <svg class="size-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                            </button>
                            <button type="button"
                                @click.stop="copyConfig(name, config)"
                                class="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                :title="copying === name ? 'Copied!' : 'Copy config'"
                            >
                                <svg v-if="copying === name" class="size-3.5 text-green-600 dark:text-green-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="m9.55 18l-5.7-5.7l1.425-1.425L9.55 15.15l9.175-9.175L20.15 7.4z"/></svg>
                                <svg v-else xmlns="http://www.w3.org/2000/svg" class="size-4" viewBox="0 0 24 24"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2m0 16H8V7h11z"></path></svg>
                            </button>
                        </div>
                        <div class="flex items-center gap-2 mb-2">
                            <span :title="JSON.stringify(config, null, 2)" class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100 dark:bg-green-900">
                                <svg class="w-3 h-3 text-green-600 dark:text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                                </svg>
                            </span>
                            <span class="font-medium text-gray-900 dark:text-white">{{ name }}</span>
                            <span v-if="config.description" class="text-xs text-gray-500 dark:text-gray-400">&middot;</span>
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
                                    <span @click="$ctx.tools?.selectTool({ group:name, tool })"
                                        v-for="tool in config.tools"
                                        :key="tool"
                                        class="font-mono px-1.5 py-0.5 rounded"
                                        :class="$ctx.tools?.selectedTool === tool ? 'font-semibold cursor-default text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/50' : 'cursor-pointer  text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700'"
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
                        class="relative bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700"
                    >
                        <button type="button"
                            @click.stop="openDeleteModal(name)"
                            class="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                            title="Delete server"
                        >
                            <svg class="size-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                        </button>
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
                <a href="https://gofastmcp.com/python-sdk/fastmcp-mcp_config" target="_blank" class="underline hover:text-gray-900 dark:hover:text-gray-100">
                MCP server configurations</a>
                saved to <code class="font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300">{{ configPath }}</code>
                &middot;
                explore <a href="https://mcpservers.org" target="_blank" class="underline hover:text-gray-900 dark:hover:text-gray-100">mcpservers.org</a>
            </div>

            <!-- Restart Required Message -->
            <div v-if="pendingRestart" class="mt-3 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div class="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                    <svg class="w-5 h-5 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                    </svg>
                    <span>Server restart required for changes to take effect.</span>
                </div>
            </div>
        </div>

        <!-- Modals -->
        <McpServerModal
            v-if="showAddModal"
            @close="showAddModal = false"
            @saved="onServerSaved"
        />
        <McpServerModal
            v-if="editingServer"
            :is-edit="true"
            :initial-name="editingServer.name"
            :initial-config="editingServer.config"
            @close="editingServer = null"
            @saved="onServerSaved"
        />
        <DeleteConfirmModal
            v-if="deletingServer"
            :server-name="deletingServer"
            @close="deletingServer = null"
            @deleted="(response) => onServerDeleted(response, deletingServer)"
        />
    </div>
    `,
    setup() {
        const copying = ref(null)
        const showAddModal = ref(false)
        const editingServer = ref(null)
        const deletingServer = ref(null)
        const pendingRestart = ref(false)
        const mcpServers = computed(() => ext.state.info?.mcpServers || {})
        const disabledServers = computed(() => ext.state.info?.disabledServers || {})
        const enabledCount = computed(() => Object.keys(mcpServers.value).length)
        const disabledCount = computed(() => Object.keys(disabledServers.value).length)
        const configPath = computed(() => ext.state.info?.configPath)

        async function copyConfig(name, config) {
            const configCopy = { ...config }
            delete configCopy.tools
            const json = JSON.stringify({ [name]: configCopy }, null, 2)
            await navigator.clipboard.writeText(json)
            copying.value = name
            setTimeout(() => {
                copying.value = null
            }, 2000)
        }

        function openAddModal() {
            showAddModal.value = true
        }

        function openEditModal(name, config) {
            const configCopy = { ...config }
            delete configCopy.tools
            editingServer.value = { name, config: configCopy }
        }

        function openDeleteModal(name) {
            deletingServer.value = name
        }

        function onServerSaved(response) {
            if (response?.mcpServers) {
                ext.setState({
                    info: {
                        ...ext.state.info,
                        mcpServers: response.mcpServers
                    }
                })
                pendingRestart.value = true
            }
        }

        function onServerDeleted(response, deletedName) {
            const updates = {}
            if (response?.mcpServers) {
                updates.mcpServers = response.mcpServers
            }
            // Also remove from disabledServers if it was there
            if (deletedName && ext.state.info?.disabledServers?.[deletedName]) {
                const newDisabled = { ...ext.state.info.disabledServers }
                delete newDisabled[deletedName]
                updates.disabledServers = newDisabled
            }
            if (Object.keys(updates).length > 0) {
                ext.setState({
                    info: {
                        ...ext.state.info,
                        ...updates
                    }
                })
                pendingRestart.value = true
            }
        }

        return {
            ext,
            copying,
            showAddModal,
            editingServer,
            deletingServer,
            pendingRestart,
            mcpServers,
            disabledServers,
            enabledCount,
            disabledCount,
            configPath,
            copyConfig,
            openAddModal,
            openEditModal,
            openDeleteModal,
            onServerSaved,
            onServerDeleted,
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