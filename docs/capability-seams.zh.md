<!-- 英文原始檔由 scripts/gen-doc-graphs.ts 生成；本中文件案是透過雙語配對維護的經評審對側。
     更新時先執行 `pnpm run gen-doc-graphs` 更新英文，再更新本檔案並執行 `pnpm run verify-translation-pairing --write docs/capability-seams.md` 重新記錄配對。 -->

# 能力 Seams 與核心服務

[English](capability-seams.md) | 中文

服務可以是核心主幹服務、可替換的能力 seam、組合包／組合點或獨立服務。下圖展示了擁有服務宣告的包、已知實作包，以及直接消費該服務的包。

```mermaid
flowchart LR
  pkg_hmr["hmr"]
  svc_hmr["ctx.hmr<br/>Serialized module and configuration reloads"]
  pkg_app_boot["app-boot"]
  pkg_client_ui_plugin_manager["client-ui-plugin-manager"]
  svc_pluginRegistryProbe["ctx.pluginRegistryProbe<br/>Host registry response comparison"]
  pkg_plugin_manager["plugin-manager"]
  svc_pluginManager["ctx.pluginManager<br/>Current-profile plugin and bundle management"]
  pkg_ui_settings_plugin_inventory["ui-settings-plugin-inventory"]
  svc_profileContext["ctx.profileContext<br/>Launcher-owned profile data"]
  pkg_client_connection["client-connection"]
  svc_connection["ctx.connection<br/>Authenticated browser transport"]
  pkg_api_gateway["api-gateway"]
  pkg_host_frontend_static["host-frontend-static"]
  pkg_mcp_resources["mcp-resources"]
  svc_mcpResources["ctx.mcpResources<br/>Scoped MCP resource access"]
  pkg_mcp_client["mcp-client"]
  pkg_browser_use["browser-use"]
  svc_browserUse["ctx.browserUse<br/>Browser-use provider registration"]
  pkg_experimental_browser_use_playwright_mcp["experimental-browser-use-playwright-mcp"]
  pkg_experimental_browser_use_chrome_devtools_mcp["experimental-browser-use-chrome-devtools-mcp"]
  pkg_experimental_browser_use_stagehand_native["experimental-browser-use-stagehand-native"]
  pkg_computer_use["computer-use"]
  svc_computerUse["ctx.computerUse<br/>Computer-use provider registration"]
  pkg_experimental_computer_use_cua_driver_mcp["experimental-computer-use-cua-driver-mcp"]
  pkg_experimental_computer_use_cua_driver_native["experimental-computer-use-cua-driver-native"]
  pkg_office_to_pdf["office-to-pdf"]
  svc_officeToPdf["ctx.officeToPdf<br/>Office to PDF conversion"]
  pkg_client_ui_sidebar_documentpreview["client-ui-sidebar-documentpreview"]
  pkg_attachment["attachment"]
  svc_attachments["ctx.attachments<br/>Durable binary attachment storage"]
  pkg_attachment_local["attachment-local"]
  pkg_api_session_controller["api-session-controller"]
  pkg_tool_fs["tool-fs"]
  pkg_llm_pi_ai["llm-pi-ai"]
  pkg_llm_deepseek["llm-deepseek"]
  pkg_client_file_upload["client-file-upload"]
  svc_fileUploads["ctx.fileUploads<br/>Agent-scoped staged file uploads"]
  pkg_client_ui_sidebar_browser["client-ui-sidebar-browser"]
  svc_sidebarBrowser["ctx.sidebarBrowser<br/>Agent requests to open pages in the app Browser"]
  pkg_llm_claude_code["llm-claude-code"]
  pkg_llm["llm"]
  svc_llm["ctx.llm<br/>LLM adapter registry"]
  pkg_llm_replay["llm-replay"]
  pkg_agent_loop["agent-loop"]
  pkg_compaction_basic["compaction-basic"]
  pkg_deepseek_llm_api_extensions["deepseek-llm-api-extensions"]
  svc_deepseekLlmApiExtensions["ctx.deepseekLlmApiExtensions<br/>Official DeepSeek request extensions"]
  pkg_session_log_deepseek["session-log-deepseek"]
  pkg_plugin_package_inventory_deepseek["plugin-package-inventory-deepseek"]
  pkg_token_meter["token-meter"]
  svc_tokenMeter["ctx.tokenMeter<br/>Replay token measurement"]
  pkg_compaction_tool_result_pruner["compaction-tool-result-pruner"]
  svc_toolResultPruner["ctx.toolResultPruner<br/>Model-free tool-result pruning"]
  pkg_session["session"]
  svc_sessions["ctx.sessions<br/>In-memory session store"]
  pkg_agent["agent"]
  pkg_session_persistence["session-persistence"]
  pkg_session_query["session-query"]
  pkg_session_query_sqlite["session-query-sqlite"]
  pkg_subagent_in_process_driver["subagent-in-process-driver"]
  pkg_invariants["invariants"]
  pkg_message_feedback["message-feedback"]
  pkg_experimental_api_speech_to_text["experimental-api-speech-to-text"]
  svc_speechController["ctx.speechController<br/>Experimental transcription Remote"]
  svc_sessionController["ctx.sessionController<br/>Host Session Remote controller"]
  svc_sessionFileReferences["ctx.sessionFileReferences<br/>Session-addressed file-reference Remote adapter"]
  svc_sessionSkillCatalog["ctx.sessionSkillCatalog<br/>Session-addressed skill Remote adapter"]
  pkg_api_job_controller["api-job-controller"]
  svc_jobController["ctx.jobController<br/>Host job Remote controller"]
  pkg_api_settings_controller["api-settings-controller"]
  svc_credentialsController["ctx.credentialsController<br/>Host credential-surface Remote controller"]
  svc_settingsController["ctx.settingsController<br/>Host settings-surface Remote controller"]
  pkg_api_workspace_files["api-workspace-files"]
  svc_workspaceFiles["ctx.workspaceFiles<br/>Host workspace file Remote service"]
  pkg_workspace_changes["workspace-changes"]
  svc_workspaceChanges["ctx.workspaceChanges<br/>Host per-turn changed-file summaries"]
  pkg_api_terminal_controller["api-terminal-controller"]
  svc_terminalController["ctx.terminalController<br/>Session interactive terminal Remote controller"]
  pkg_api_workspace_controller["api-workspace-controller"]
  svc_workspaceController["ctx.workspaceController<br/>Host Workspace Remote controller"]
  pkg_client_ui_git["client-ui-git"]
  svc_gitController["ctx.gitController<br/>Source Control and GitHub Remote controller"]
  svc_claudeCodeUsage["ctx.claudeCodeUsage<br/>Claude Code plan usage Remote"]
  svc_directoryPickerController["ctx.directoryPickerController<br/>Host directory-picking Remote controller"]
  svc_invariants["ctx.invariants<br/>Package-owned invariant registry"]
  pkg_scope["scope"]
  pkg_typert_registry["typert-registry"]
  svc_typert["ctx.typert<br/>Runtime type registry"]
  pkg_typert_loader["typert-loader"]
  svc_typertGateway["ctx.typertGateway<br/>Typert Host invocation gateway"]
  svc_sessionPersistence["ctx.sessionPersistence<br/>Durable session persistence seam"]
  pkg_session_persistence_jsonl["session-persistence-jsonl"]
  pkg_tool_bash["tool-bash"]
  pkg_hooks_claude_code["hooks-claude-code"]
  pkg_hooks_codex["hooks-codex"]
  pkg_config_editor["config-editor"]
  svc_configEditor["ctx.configEditor<br/>Profile configuration edits"]
  pkg_settings["settings"]
  pkg_agent_default_model["agent-default-model"]
  svc_settings["ctx.settings<br/>Plugin configuration forms"]
  pkg_tool_subagent["tool-subagent"]
  svc_subagentModelSelection["ctx.subagentModelSelection<br/>Subagent model-selection preference"]
  pkg_credentials["credentials"]
  svc_credentials["ctx.credentials<br/>Credential seam"]
  pkg_credentials_local["credentials-local"]
  pkg_deepseek_account["deepseek-account"]
  svc_deepseekAccount["ctx.deepseekAccount<br/>DeepSeek account"]
  pkg_deepseek_account_platform["deepseek-account-platform"]
  pkg_api_account_controller["api-account-controller"]
  pkg_authorization["authorization"]
  svc_authorization["ctx.authorization<br/>Authorization flow registry"]
  pkg_host_product_telemetry_otel["host-product-telemetry-otel"]
  svc_productTelemetry["ctx.productTelemetry<br/>Product usage event sender"]
  pkg_session_telemetry["session-telemetry"]
  svc_sessionTelemetry["ctx.sessionTelemetry<br/>Session telemetry seam"]
  pkg_session_telemetry_otel["session-telemetry-otel"]
  pkg_storage["storage"]
  svc_storage["ctx.storage<br/>Non-session storage hub"]
  pkg_storage_json["storage-json"]
  pkg_storage_sqlite["storage-sqlite"]
  pkg_storage_domain["storage-domain"]
  svc_storageDomain["ctx.storageDomain<br/>Domain data facility"]
  pkg_workspace["workspace"]
  svc_messageFeedback["ctx.messageFeedback<br/>Lifecycle-bound message feedback"]
  pkg_command_feedback["command-feedback"]
  svc_sessionFeedback["ctx.sessionFeedback<br/>Session-level feedback recorder"]
  svc_workspaceRegistry["ctx.workspaceRegistry<br/>Workspace entity registry"]
  svc_sessionQuery["ctx.sessionQuery<br/>Session reads, traces, filters, and search"]
  pkg_session_reference["session-reference"]
  pkg_tool_session_query["tool-session-query"]
  pkg_file_reference["file-reference"]
  svc_fileReferences["ctx.fileReferences<br/>File reference discovery"]
  pkg_file_reference_local["file-reference-local"]
  svc_sessionReferenceResolver["ctx.sessionReferenceResolver<br/>Cross-session snapshot preparation"]
  pkg_session_title["session-title"]
  svc_sessionTitle["ctx.sessionTitle<br/>Log-backed session titles"]
  pkg_session_title_first_prompt_llm["session-title-first-prompt-llm"]
  pkg_session_title_all_prompts_llm["session-title-all-prompts-llm"]
  pkg_system_prompt["system-prompt"]
  svc_systemPrompt["ctx.systemPrompt<br/>System prompt assembly registry"]
  pkg_tools["tools"]
  pkg_tool_terminal["tool-terminal"]
  pkg_tool_web["tool-web"]
  svc_tools["ctx.tools<br/>Tool registry and guarded execution pipeline"]
  pkg_tool_ask_user["tool-ask-user"]
  pkg_tool_cordis["tool-cordis"]
  pkg_tool_skill["tool-skill"]
  pkg_tool_todo["tool-todo"]
  pkg_user_questions["user-questions"]
  svc_userQuestions["ctx.userQuestions<br/>Human question/answer seam"]
  pkg_plan_mode["plan-mode"]
  svc_planMode["ctx.planMode<br/>Plan collaboration state"]
  pkg_agent_preset_registry["agent-preset-registry"]
  svc_agentPresets["ctx.agentPresets<br/>Per-session agent composition"]
  pkg_commands["commands"]
  svc_commands["ctx.commands<br/>Human command registry"]
  pkg_session_projection["session-projection"]
  svc_sessionProjections["ctx.sessionProjections<br/>Session projection units"]
  pkg_session_projection_cache["session-projection-cache"]
  svc_sessionProjectionCache["ctx.sessionProjectionCache<br/>Persisted projection cache"]
  pkg_skill["skill"]
  svc_skills["ctx.skills<br/>Skill provider registry"]
  pkg_skill_badge["skill-badge"]
  pkg_skill_filesystem["skill-filesystem"]
  pkg_skill_office["skill-office"]
  svc_agents["ctx.agents<br/>Agent service"]
  pkg_acp["acp"]
  svc_agentDefaultModel["ctx.agentDefaultModel<br/>Default Agent model selection"]
  pkg_headless["headless"]
  svc_agentLoop["ctx.agentLoop<br/>Concrete loop driver"]
  pkg_base["base"]
  pkg_sdk_minimal["sdk-minimal"]
  pkg_schedule["schedule"]
  svc_schedule["ctx.schedule<br/>Host scheduled messages"]
  pkg_goal["goal"]
  svc_goals["ctx.goals<br/>Same-session goal domain"]
  pkg_ssh["ssh"]
  svc_ssh["ctx.ssh<br/>POSIX SSH connection owner"]
  pkg_fs_ssh["fs-ssh"]
  pkg_subprocess_ssh["subprocess-ssh"]
  pkg_sandbox_ssh["sandbox-ssh"]
  pkg_subprocess["subprocess"]
  svc_subprocess["ctx.subprocess<br/>Subprocess seam"]
  pkg_subprocess_local["subprocess-local"]
  pkg_bash_local["bash-local"]
  pkg_bash_sandbox["bash-sandbox"]
  pkg_terminal_bash["terminal-bash"]
  pkg_lsp_stdio["lsp-stdio"]
  pkg_subagent_acp["subagent-acp"]
  pkg_subagent_codex["subagent-codex"]
  pkg_subagent_claude_code["subagent-claude-code"]
  pkg_shell["shell"]
  svc_shell["ctx.shell<br/>Bash executor seam"]
  pkg_pwsh_local["pwsh-local"]
  pkg_tool_pwsh["tool-pwsh"]
  pkg_shell_env["shell-env"]
  svc_shellEnv["ctx.shellEnv<br/>Managed bash environment registry"]
  pkg_terminal["terminal"]
  svc_terminals["ctx.terminals<br/>Persistent PTY session registry"]
  pkg_sandbox["sandbox"]
  svc_sandbox["ctx.sandbox<br/>Process-sandbox seam"]
  pkg_sandbox_local["sandbox-local"]
  pkg_sandbox_policy["sandbox-policy"]
  svc_sandboxPolicy["ctx.sandboxPolicy<br/>Sandbox policy home"]
  pkg_fs_sandbox["fs-sandbox"]
  pkg_user_approval["user-approval"]
  svc_approval["ctx.approval<br/>Approval seam"]
  pkg_permission_presets["permission-presets"]
  svc_permissionPresets["ctx.permissionPresets<br/>Permission presets"]
  pkg_ptc_runtime["ptc-runtime"]
  svc_ptcRuntime["ctx.ptcRuntime<br/>PTC execution seam"]
  pkg_ptc_runtime_node["ptc-runtime-node"]
  pkg_experimental_ptc_runtime_python["experimental-ptc-runtime-python"]
  pkg_workflow_ptc["workflow-ptc"]
  pkg_fs["fs"]
  svc_fs["ctx.fs<br/>Filesystem provider seam"]
  pkg_fs_local["fs-local"]
  pkg_fs_observation_policy["fs-observation-policy"]
  pkg_compaction["compaction"]
  svc_compaction["ctx.compaction<br/>Compaction seam"]
  pkg_subagent["subagent"]
  svc_subagents["ctx.subagents<br/>Subagent provider and continuation service"]
  pkg_subagent_spawn_in_process["subagent-spawn-in-process"]
  pkg_subagent_fork_in_process["subagent-fork-in-process"]
  pkg_subagent_dsh_sdk["subagent-dsh-sdk"]
  pkg_tool_subagent_control["tool-subagent-control"]
  pkg_tool_ralph["tool-ralph"]
  pkg_experimental_speech_to_text["experimental-speech-to-text"]
  svc_speechToText["ctx.speechToText<br/>Experimental speech recognition providers"]
  pkg_experimental_speech_to_text_sensevoice["experimental-speech-to-text-sensevoice"]
  pkg_experimental_agent_team["experimental-agent-team"]
  svc_agentTeams["ctx.agentTeams<br/>Agent Teams coordination domain"]
  pkg_experimental_tool_agent_team["experimental-tool-agent-team"]
  pkg_inspector["inspector"]
  svc_inspector["ctx.inspector<br/>Cross-realm runtime inspection"]
  pkg_jobs["jobs"]
  svc_jobs["ctx.jobs<br/>Background job registry"]
  pkg_jobs_local["jobs-local"]
  pkg_tool_jobs["tool-jobs"]
  pkg_web["web"]
  svc_web["ctx.web<br/>Web access provider registry"]
  pkg_web_search_exa["web-search-exa"]
  pkg_web_search_perplexity["web-search-perplexity"]
  pkg_web_search_deepseek["web-search-deepseek"]
  pkg_web_fetch_http["web-fetch-http"]
  pkg_spill["spill"]
  svc_spillStore["ctx.spillStore<br/>Spill storage seam"]
  pkg_spill_local["spill-local"]
  pkg_spill_policy["spill-policy"]
  pkg_host_directory_picker["host-directory-picker"]
  svc_directoryPicker["ctx.directoryPicker<br/>Workspace-directory picking seam"]
  pkg_host_directory_picker_native["host-directory-picker-native"]
  pkg_host_directory_picker_browse["host-directory-picker-browse"]
  pkg_host_webserver["host-webserver"]
  svc_webServer["ctx.webServer<br/>HTTP route registration"]
  pkg_client_modules["client-modules"]
  pkg_client_hmr["client-hmr"]
  svc_clientModules["ctx.clientModules<br/>Client plugin graph host"]
  pkg_workflow["workflow"]
  svc_workflowEngine["ctx.workflowEngine<br/>Workflow script engine"]
  pkg_tool_workflow["tool-workflow"]
  pkg_webhook["webhook"]
  svc_webhookRuntime["ctx.webhookRuntime<br/>Webhook rule runtime"]
  pkg_webhook_github["webhook-github"]
  pkg_lsp["lsp"]
  svc_lsp["ctx.lsp<br/>Language-server navigation seam"]
  pkg_tool_lsp["tool-lsp"]
  pkg_cordis_host_runner["cordis-host-runner"]
  svc_dynamicCordisRunner["ctx.dynamicCordisRunner<br/>Dynamic Cordis package host runner"]
  svc_cordisInspect["ctx.cordisInspect<br/>Dynamic Cordis inspect registry"]
  pkg_agent --> svc_agents
  pkg_agent_default_model --> svc_agentDefaultModel
  pkg_agent_loop --> svc_agentLoop
  pkg_agent_preset_registry --> svc_agentPresets
  pkg_api_gateway --> svc_typertGateway
  pkg_api_job_controller --> svc_jobController
  pkg_api_session_controller --> svc_sessionController
  pkg_api_session_controller --> svc_sessionFileReferences
  pkg_api_session_controller --> svc_sessionSkillCatalog
  pkg_api_settings_controller --> svc_credentialsController
  pkg_api_settings_controller --> svc_settingsController
  pkg_api_terminal_controller --> svc_terminalController
  pkg_api_workspace_controller --> svc_directoryPickerController
  pkg_api_workspace_controller --> svc_workspaceController
  pkg_api_workspace_files --> svc_workspaceFiles
  pkg_app_boot --> svc_profileContext
  pkg_attachment --> svc_attachments
  pkg_attachment_local --> svc_attachments
  pkg_authorization --> svc_authorization
  pkg_bash_local --> svc_shell
  pkg_bash_sandbox --> svc_shell
  pkg_browser_use --> svc_browserUse
  pkg_client_connection --> svc_connection
  pkg_client_file_upload --> svc_fileUploads
  pkg_client_modules --> svc_clientModules
  pkg_client_ui_git --> svc_gitController
  pkg_client_ui_plugin_manager --> svc_pluginRegistryProbe
  pkg_client_ui_sidebar_browser --> svc_sidebarBrowser
  pkg_command_feedback --> svc_sessionFeedback
  pkg_commands --> svc_commands
  pkg_compaction --> svc_compaction
  pkg_compaction_basic --> svc_compaction
  pkg_compaction_tool_result_pruner --> svc_toolResultPruner
  pkg_computer_use --> svc_computerUse
  pkg_config_editor --> svc_configEditor
  pkg_cordis_host_runner --> svc_cordisInspect
  pkg_cordis_host_runner --> svc_dynamicCordisRunner
  pkg_credentials --> svc_credentials
  pkg_credentials_local --> svc_credentials
  pkg_deepseek_account --> svc_deepseekAccount
  pkg_deepseek_account_platform --> svc_deepseekAccount
  pkg_deepseek_llm_api_extensions --> svc_deepseekLlmApiExtensions
  pkg_experimental_agent_team --> svc_agentTeams
  pkg_experimental_api_speech_to_text --> svc_speechController
  pkg_experimental_browser_use_chrome_devtools_mcp --> svc_browserUse
  pkg_experimental_browser_use_playwright_mcp --> svc_browserUse
  pkg_experimental_browser_use_stagehand_native --> svc_browserUse
  pkg_experimental_computer_use_cua_driver_mcp --> svc_computerUse
  pkg_experimental_computer_use_cua_driver_native --> svc_computerUse
  pkg_experimental_ptc_runtime_python --> svc_ptcRuntime
  pkg_experimental_speech_to_text --> svc_speechToText
  pkg_experimental_speech_to_text_sensevoice --> svc_speechToText
  pkg_file_reference --> svc_fileReferences
  pkg_file_reference_local --> svc_fileReferences
  pkg_fs --> svc_fs
  pkg_fs_local --> svc_fs
  pkg_fs_sandbox --> svc_fs
  pkg_fs_ssh --> svc_fs
  pkg_goal --> svc_goals
  pkg_hmr --> svc_hmr
  pkg_host_directory_picker --> svc_directoryPicker
  pkg_host_directory_picker_browse --> svc_directoryPicker
  pkg_host_directory_picker_native --> svc_directoryPicker
  pkg_host_product_telemetry_otel --> svc_productTelemetry
  pkg_host_webserver --> svc_webServer
  pkg_inspector --> svc_inspector
  pkg_invariants --> svc_invariants
  pkg_jobs --> svc_jobs
  pkg_jobs_local --> svc_jobs
  pkg_llm --> svc_llm
  pkg_llm_claude_code --> svc_claudeCodeUsage
  pkg_llm_deepseek --> svc_llm
  pkg_llm_pi_ai --> svc_llm
  pkg_llm_replay --> svc_llm
  pkg_lsp --> svc_lsp
  pkg_lsp_stdio --> svc_lsp
  pkg_mcp_client --> svc_mcpResources
  pkg_mcp_resources --> svc_mcpResources
  pkg_message_feedback --> svc_messageFeedback
  pkg_office_to_pdf --> svc_officeToPdf
  pkg_permission_presets --> svc_permissionPresets
  pkg_plan_mode --> svc_planMode
  pkg_plugin_manager --> svc_pluginManager
  pkg_plugin_package_inventory_deepseek --> svc_deepseekLlmApiExtensions
  pkg_ptc_runtime --> svc_ptcRuntime
  pkg_ptc_runtime_node --> svc_ptcRuntime
  pkg_pwsh_local --> svc_shell
  pkg_sandbox --> svc_sandbox
  pkg_sandbox_local --> svc_sandbox
  pkg_sandbox_policy --> svc_sandboxPolicy
  pkg_sandbox_ssh --> svc_sandbox
  pkg_schedule --> svc_schedule
  pkg_session --> svc_sessions
  pkg_session_log_deepseek --> svc_deepseekLlmApiExtensions
  pkg_session_persistence --> svc_sessionPersistence
  pkg_session_persistence_jsonl --> svc_sessionPersistence
  pkg_session_projection --> svc_sessionProjections
  pkg_session_projection_cache --> svc_sessionProjectionCache
  pkg_session_query --> svc_sessionQuery
  pkg_session_query_sqlite --> svc_sessionQuery
  pkg_session_reference --> svc_sessionReferenceResolver
  pkg_session_telemetry --> svc_sessionTelemetry
  pkg_session_telemetry_otel --> svc_sessionTelemetry
  pkg_session_title --> svc_sessionTitle
  pkg_session_title_all_prompts_llm --> svc_sessionTitle
  pkg_session_title_first_prompt_llm --> svc_sessionTitle
  pkg_settings --> svc_settings
  pkg_shell --> svc_shell
  pkg_shell_env --> svc_shellEnv
  pkg_skill --> svc_skills
  pkg_skill_badge --> svc_skills
  pkg_skill_filesystem --> svc_skills
  pkg_skill_office --> svc_skills
  pkg_spill --> svc_spillStore
  pkg_spill_local --> svc_spillStore
  pkg_ssh --> svc_ssh
  pkg_storage --> svc_storage
  pkg_storage_domain --> svc_storageDomain
  pkg_storage_json --> svc_storage
  pkg_storage_sqlite --> svc_storage
  pkg_subagent --> svc_subagents
  pkg_subagent_acp --> svc_subagents
  pkg_subagent_claude_code --> svc_subagents
  pkg_subagent_codex --> svc_subagents
  pkg_subagent_dsh_sdk --> svc_subagents
  pkg_subagent_fork_in_process --> svc_subagents
  pkg_subagent_spawn_in_process --> svc_subagents
  pkg_subprocess --> svc_subprocess
  pkg_subprocess_local --> svc_subprocess
  pkg_subprocess_ssh --> svc_subprocess
  pkg_system_prompt --> svc_systemPrompt
  pkg_terminal --> svc_terminals
  pkg_terminal_bash --> svc_terminals
  pkg_token_meter --> svc_tokenMeter
  pkg_tool_subagent --> svc_subagentModelSelection
  pkg_tools --> svc_tools
  pkg_typert_registry --> svc_typert
  pkg_user_approval --> svc_approval
  pkg_user_questions --> svc_userQuestions
  pkg_web --> svc_web
  pkg_web_fetch_http --> svc_web
  pkg_web_search_deepseek --> svc_web
  pkg_web_search_exa --> svc_web
  pkg_web_search_perplexity --> svc_web
  pkg_webhook --> svc_webhookRuntime
  pkg_workflow --> svc_workflowEngine
  pkg_workflow_ptc --> svc_workflowEngine
  pkg_workspace --> svc_workspaceRegistry
  pkg_workspace_changes --> svc_workspaceChanges
  svc_agentDefaultModel --> pkg_api_session_controller
  svc_agentDefaultModel --> pkg_headless
  svc_agentLoop --> pkg_base
  svc_agentLoop --> pkg_sdk_minimal
  svc_agentTeams --> pkg_experimental_tool_agent_team
  svc_agents --> pkg_acp
  svc_agents --> pkg_agent_loop
  svc_agents --> pkg_subagent_in_process_driver
  svc_approval --> pkg_acp
  svc_approval --> pkg_tool_bash
  svc_approval --> pkg_tools
  svc_attachments --> pkg_api_session_controller
  svc_attachments --> pkg_llm_deepseek
  svc_attachments --> pkg_llm_pi_ai
  svc_attachments --> pkg_tool_fs
  svc_authorization --> pkg_llm_pi_ai
  svc_browserUse --> pkg_experimental_browser_use_chrome_devtools_mcp
  svc_browserUse --> pkg_experimental_browser_use_playwright_mcp
  svc_browserUse --> pkg_experimental_browser_use_stagehand_native
  svc_clientModules --> pkg_client_hmr
  svc_compaction --> pkg_compaction_basic
  svc_computerUse --> pkg_experimental_computer_use_cua_driver_mcp
  svc_computerUse --> pkg_experimental_computer_use_cua_driver_native
  svc_configEditor --> pkg_agent_default_model
  svc_configEditor --> pkg_settings
  svc_connection --> pkg_api_gateway
  svc_connection --> pkg_host_frontend_static
  svc_cordisInspect --> pkg_tool_cordis
  svc_credentials --> pkg_api_settings_controller
  svc_credentials --> pkg_llm_deepseek
  svc_credentials --> pkg_llm_pi_ai
  svc_deepseekAccount --> pkg_api_account_controller
  svc_deepseekAccount --> pkg_llm_deepseek
  svc_deepseekLlmApiExtensions --> pkg_llm_deepseek
  svc_directoryPicker --> pkg_api_workspace_controller
  svc_dynamicCordisRunner --> pkg_tool_cordis
  svc_fileReferences --> pkg_api_session_controller
  svc_fileUploads --> pkg_api_session_controller
  svc_fs --> pkg_tool_fs
  svc_hmr --> pkg_app_boot
  svc_invariants --> pkg_agent
  svc_invariants --> pkg_agent_loop
  svc_invariants --> pkg_scope
  svc_invariants --> pkg_session
  svc_jobs --> pkg_api_job_controller
  svc_jobs --> pkg_tool_bash
  svc_jobs --> pkg_tool_jobs
  svc_jobs --> pkg_tool_pwsh
  svc_jobs --> pkg_tool_subagent
  svc_jobs --> pkg_tool_terminal
  svc_llm --> pkg_agent_loop
  svc_llm --> pkg_compaction_basic
  svc_lsp --> pkg_tool_lsp
  svc_mcpResources --> pkg_mcp_resources
  svc_officeToPdf --> pkg_client_ui_sidebar_documentpreview
  svc_pluginManager --> pkg_plugin_manager
  svc_pluginManager --> pkg_ui_settings_plugin_inventory
  svc_pluginRegistryProbe --> pkg_client_ui_plugin_manager
  svc_profileContext --> pkg_plugin_manager
  svc_ptcRuntime --> pkg_tools
  svc_ptcRuntime --> pkg_workflow_ptc
  svc_sandbox --> pkg_bash_sandbox
  svc_sandbox --> pkg_terminal_bash
  svc_sandboxPolicy --> pkg_bash_sandbox
  svc_sandboxPolicy --> pkg_fs_sandbox
  svc_sandboxPolicy --> pkg_terminal_bash
  svc_sessionPersistence --> pkg_agent_loop
  svc_sessionPersistence --> pkg_hooks_claude_code
  svc_sessionPersistence --> pkg_hooks_codex
  svc_sessionPersistence --> pkg_message_feedback
  svc_sessionPersistence --> pkg_session_query
  svc_sessionPersistence --> pkg_session_query_sqlite
  svc_sessionPersistence --> pkg_tool_bash
  svc_sessionProjectionCache --> pkg_api_session_controller
  svc_sessionProjectionCache --> pkg_session_query
  svc_sessionProjectionCache --> pkg_session_reference
  svc_sessionProjections --> pkg_api_session_controller
  svc_sessionProjections --> pkg_session_title
  svc_sessionProjections --> pkg_tool_todo
  svc_sessionQuery --> pkg_session_reference
  svc_sessionQuery --> pkg_tool_session_query
  svc_sessions --> pkg_agent
  svc_sessions --> pkg_agent_loop
  svc_sessions --> pkg_invariants
  svc_sessions --> pkg_message_feedback
  svc_sessions --> pkg_session_persistence
  svc_sessions --> pkg_session_query
  svc_sessions --> pkg_session_query_sqlite
  svc_sessions --> pkg_subagent_in_process_driver
  svc_settings --> pkg_api_settings_controller
  svc_shell --> pkg_hooks_claude_code
  svc_shell --> pkg_hooks_codex
  svc_shell --> pkg_tool_bash
  svc_shell --> pkg_tool_pwsh
  svc_shellEnv --> pkg_tool_bash
  svc_shellEnv --> pkg_tool_pwsh
  svc_sidebarBrowser --> pkg_llm_claude_code
  svc_skills --> pkg_tool_skill
  svc_speechToText --> pkg_experimental_api_speech_to_text
  svc_spillStore --> pkg_spill_policy
  svc_ssh --> pkg_fs_ssh
  svc_ssh --> pkg_sandbox_ssh
  svc_ssh --> pkg_subprocess_ssh
  svc_storage --> pkg_storage_domain
  svc_storageDomain --> pkg_workspace
  svc_subagentModelSelection --> pkg_tool_subagent
  svc_subagents --> pkg_tool_ralph
  svc_subagents --> pkg_tool_subagent
  svc_subagents --> pkg_tool_subagent_control
  svc_subprocess --> pkg_bash_local
  svc_subprocess --> pkg_bash_sandbox
  svc_subprocess --> pkg_lsp_stdio
  svc_subprocess --> pkg_subagent_acp
  svc_subprocess --> pkg_subagent_claude_code
  svc_subprocess --> pkg_subagent_codex
  svc_subprocess --> pkg_terminal_bash
  svc_systemPrompt --> pkg_agent_loop
  svc_systemPrompt --> pkg_tool_fs
  svc_systemPrompt --> pkg_tool_terminal
  svc_systemPrompt --> pkg_tool_web
  svc_systemPrompt --> pkg_tools
  svc_terminals --> pkg_tool_terminal
  svc_tokenMeter --> pkg_compaction_basic
  svc_toolResultPruner --> pkg_compaction_basic
  svc_tools --> pkg_agent_loop
  svc_tools --> pkg_tool_ask_user
  svc_tools --> pkg_tool_bash
  svc_tools --> pkg_tool_cordis
  svc_tools --> pkg_tool_fs
  svc_tools --> pkg_tool_skill
  svc_tools --> pkg_tool_subagent
  svc_tools --> pkg_tool_terminal
  svc_tools --> pkg_tool_todo
  svc_tools --> pkg_tool_web
  svc_typert --> pkg_api_gateway
  svc_typert --> pkg_typert_loader
  svc_userQuestions --> pkg_tool_ask_user
  svc_web --> pkg_tool_web
  svc_webServer --> pkg_client_connection
  svc_webServer --> pkg_client_hmr
  svc_webServer --> pkg_client_modules
  svc_webhookRuntime --> pkg_webhook_github
  svc_workflowEngine --> pkg_tool_ralph
  svc_workflowEngine --> pkg_tool_workflow
  svc_workspaceRegistry --> pkg_api_session_controller
  svc_workspaceRegistry --> pkg_api_workspace_controller
  svc_fs -. event gate .-> pkg_fs_observation_policy
```

| ctx 鍵 | 角色 | 所屬包 | 實作 | 直接消費方 | 配套外掛 | 說明 |
| --- | --- | --- | --- | --- | --- | --- |
| `ctx.hmr` | `core` | [`hmr`](../packages/boot/hmr) | - | [`app-boot`](../packages/boot/app-boot) | - | 負責模組和精確設定監聽；應用修改共用其佇列，自動過載等待應用檔案鎖。 |
| `ctx.pluginRegistryProbe` | `core` | [`client-ui-plugin-manager`](../packages/client/ui-plugin-manager) | - | [`client-ui-plugin-manager`](../packages/client/ui-plugin-manager) | - | 在 Host 上並行比較公共安裝源回應；初始安裝源推薦由 Client 負責。 |
| `ctx.pluginManager` | `core` | [`plugin-manager`](../packages/boot/plugin-manager) | - | [`plugin-manager`](../packages/boot/plugin-manager), `ui-settings-plugin-inventory` | - | 與 CLI 共享 profile 包操作，並向 Web 和 Agent 呼叫方分別報告持久狀態與執行狀態。 |
| `ctx.profileContext` | `core` | [`app-boot`](../packages/boot/app-boot) | - | [`plugin-manager`](../packages/boot/plugin-manager) | - | dsh launcher 提供純資料形式的 profile 位置與組合輸入；過載排程由 dsh-hmr 負責。 |
| `ctx.connection` | `core` | [`client-connection`](../packages/client/connection) | - | [`api-gateway`](../packages/api/gateway), [`host-frontend-static`](../packages/host/frontend-static) | - | 負責瀏覽器認證與共享 HTTP 請求分發；API 介面卡註冊端點和流。 |
| `ctx.mcpResources` | `seam` | [`mcp-resources`](../packages/mcp/mcp-resources) | [`mcp-client`](../packages/mcp/mcp-client) | [`mcp-resources`](../packages/mcp/mcp-resources) | - | 連線所有者提供的操作在呼叫 agent 的作用域內服務於共享資源工具。 |
| `ctx.browserUse` | `seam` | [`browser-use`](../packages/browser-use/browser-use) | [`experimental-browser-use-playwright-mcp`](../packages/experimental/browser-use-playwright-mcp), [`experimental-browser-use-chrome-devtools-mcp`](../packages/experimental/browser-use-chrome-devtools-mcp), [`experimental-browser-use-stagehand-native`](../packages/experimental/browser-use-stagehand-native) | [`experimental-browser-use-playwright-mcp`](../packages/experimental/browser-use-playwright-mcp), [`experimental-browser-use-chrome-devtools-mcp`](../packages/experimental/browser-use-chrome-devtools-mcp), [`experimental-browser-use-stagehand-native`](../packages/experimental/browser-use-stagehand-native) | - | 每個服務實例註冊一個提供者擁有的名稱。提供者按即時 Session 擁有自己的工具與瀏覽器資源；共享服務不提供瀏覽器操作 API。 |
| `ctx.computerUse` | `seam` | [`computer-use`](../packages/computer-use/computer-use) | [`experimental-computer-use-cua-driver-mcp`](../packages/experimental/computer-use-cua-driver-mcp), [`experimental-computer-use-cua-driver-native`](../packages/experimental/computer-use-cua-driver-native) | [`experimental-computer-use-cua-driver-mcp`](../packages/experimental/computer-use-cua-driver-mcp), [`experimental-computer-use-cua-driver-native`](../packages/experimental/computer-use-cua-driver-native) | - | 每個服務實例只註冊一個提供者自定的名稱。各提供者也擁有自己的模型工具；服務不提供通用操作 API、執行時選擇或 Session 流程鎖。 |
| `ctx.officeToPdf` | `core` | [`office-to-pdf`](../packages/document/office-to-pdf) | - | [`client-ui-sidebar-documentpreview`](../packages/client/ui-sidebar-documentpreview) | - | 已授權的 Office 位元組在主機上使用已宣告的原生目標引擎轉換；未宣告原生目標時使用 Node WASM。 |
| `ctx.attachments` | `seam` | [`attachment`](../packages/attachment/attachment) | [`attachment-local`](../packages/attachment/attachment-local) | [`api-session-controller`](../packages/api/session-controller), [`tool-fs`](../packages/fs/tool-fs), [`llm-pi-ai`](../packages/llm/llm-pi-ai), [`llm-deepseek`](../packages/llm/llm-deepseek) | - | 主機會在工作階段事件之前提交已接受的圖片；提供者介面卡將已授權的持久引用解析為提供者原生內容。 |
| `ctx.fileUploads` | `core` | [`client-file-upload`](../packages/client/file-upload) | - | [`api-session-controller`](../packages/api/session-controller) | - | 負責流式接收、持久儲存和暫存回執生命週期；Session Controller 將回執繫結到已接受的提交。 |
| `ctx.sidebarBrowser` | `core` | [`client-ui-sidebar-browser`](../packages/client/ui-sidebar-browser) | - | [`llm-claude-code`](../packages/llm/llm-claude-code) | - | 把即時開啟請求分發給已連線的應用視窗，由視窗在發起請求的 Session 中新開 Browser tab。 |
| `ctx.llm` | `seam` | [`llm`](../packages/llm/llm) | [`llm-deepseek`](../packages/llm/llm-deepseek), [`llm-pi-ai`](../packages/llm/llm-pi-ai), [`llm-replay`](../packages/test-support/llm-replay) | [`agent-loop`](../packages/core/agent-loop), [`compaction-basic`](../packages/compaction/compaction-basic) | - | 介面卡註冊提供者實作；agent loop（智慧代理迴圈）與壓縮功能呼叫提供者無關的流服務。 |
| `ctx.deepseekLlmApiExtensions` | `seam` | [`deepseek-llm-api-extensions`](../packages/llm/deepseek-llm-api-extensions) | [`session-log-deepseek`](../packages/session/session-log-deepseek), [`plugin-package-inventory-deepseek`](../packages/llm/plugin-package-inventory-deepseek) | [`llm-deepseek`](../packages/llm/llm-deepseek) | - | 外掛準備彼此獨立的頂層欄位；官方介面卡會合並這些欄位，並在 HTTP 接受後提交其交付狀態。 |
| `ctx.tokenMeter` | `core` | [`token-meter`](../packages/llm/token-meter) | - | [`compaction-basic`](../packages/compaction/compaction-basic) | - | 擁有按工作階段隔離的回放摺疊區；壓力消費方共享不可變且帶修訂版本的測量結果。 |
| `ctx.toolResultPruner` | `core` | [`compaction-tool-result-pruner`](../packages/compaction/compaction-tool-result-pruner) | - | [`compaction-basic`](../packages/compaction/compaction-basic) | - | 在摘要壓縮前，透過可回放的單節點表層替換來改寫過大的目前工具結果。 |
| `ctx.sessions` | `core` | [`session`](../packages/core/session) | - | [`agent-loop`](../packages/core/agent-loop), [`agent`](../packages/core/agent), [`session-persistence`](../packages/session/session-persistence), [`session-query`](../packages/session-query/session-query), [`session-query-sqlite`](../packages/session-query/session-query-sqlite), [`subagent-in-process-driver`](../packages/subagent/subagent-in-process-driver), [`invariants`](../packages/runtime-diagnostics/invariants), [`message-feedback`](../packages/feedback/message-feedback) | - | 擁有僅追加的 Session 實例，並行出持久的工作階段事件流。 |
| `ctx.speechController` | `core` | [`experimental-api-speech-to-text`](../packages/experimental/api-speech-to-text) | - | - | - | 在 Provider 呼叫前驗證受限的瀏覽器音訊。 |
| `ctx.sessionController` | `core` | [`api-session-controller`](../packages/api/session-controller) | - | - | - | 負責 Session 命令、冷讀取、持久事件跟隨、即時控制狀態、模型目錄、workspace 開啟與 Agent 啟用策略。 |
| `ctx.sessionFileReferences` | `core` | [`api-session-controller`](../packages/api/session-controller) | - | - | - | 透過 Session Controller 的既有 Agent lookup 策略委託檔案引用發現。 |
| `ctx.sessionSkillCatalog` | `core` | [`api-session-controller`](../packages/api/session-controller) | - | - | - | 在不啟用冷 Agent 的前提下列出 Session 組合中允許使用者呼叫的 skill。 |
| `ctx.jobController` | `core` | [`api-job-controller`](../packages/api/job-controller) | - | - | - | 經生成的 Remote namespace 流式傳送一個後臺任務的觀測 record；名冊仍在工作階段控制流上。 |
| `ctx.credentialsController` | `core` | [`api-settings-controller`](../packages/api/settings-controller) | - | - | - | 把憑證引用 seam 投影到生成的 Remote namespace：批次扇出、檢視投影與拒絕對映都在這裡，而不在 seam Definition 上。 |
| `ctx.settingsController` | `core` | [`api-settings-controller`](../packages/api/settings-controller) | - | - | - | 把使用者設定 seam 投影到生成的 Remote namespace：讀取一律脫敏，所有拒絕在這裡分類，而不在 seam Definition 上。 |
| `ctx.workspaceFiles` | `core` | [`api-workspace-files`](../packages/api/workspace-files) | - | - | - | 為工作階段工作區根內的檔案提供 stat、分頁文字、位元組視窗、目錄列舉與變更流，經 lstat、包含關係與 stat 重檢限定。 |
| `ctx.workspaceChanges` | `core` | [`workspace-changes`](../packages/deliverables/workspace-changes) | - | - | - | Serves the summary each workspace/changes event announced and each listed file's turn-start and turn-end comparison, by Session and event sequence, until that Session is disposed; the log carries only the turn. |
| `ctx.terminalController` | `core` | [`api-terminal-controller`](../packages/api/terminal-controller) | - | - | - | 透過子程序提供者與型別化 Remote 傳輸管理使用者終端程序、解析預設 shell，並恢復有界終端螢幕。 |
| `ctx.workspaceController` | `core` | [`api-workspace-controller`](../packages/api/workspace-controller) | - | - | - | 透過生成的 Remote namespace 負責 Workspace 命令和可在重連後收斂的 Workspace 狀態投遞。 |
| `ctx.gitController` | `core` | [`client-ui-git`](../packages/client/ui-git) | - | - | - | 透過 subprocess 提供者在工作階段資料夾中執行 git 與 GitHub CLI，並經由生成的 Remote namespace 提供儲存庫狀態、提交、同步、登入、複製與釋出。 |
| `ctx.claudeCodeUsage` | `core` | [`llm-claude-code`](../packages/llm/llm-claude-code) | - | - | - | 透過控制請求讀取 Claude Code 登入帳號的方案視窗，並向每個應用視窗提供一份新鮮的回答。 |
| `ctx.directoryPickerController` | `core` | [`api-workspace-controller`](../packages/api/workspace-controller) | - | - | - | 把選目錄 seam 送上線：能力門禁、取消傳播，以及瀏覽器目錄流程用於分支判斷的 seam 錯誤碼。 |
| `ctx.invariants` | `core` | [`invariants`](../packages/runtime-diagnostics/invariants) | - | [`session`](../packages/core/session), [`agent`](../packages/core/agent), [`scope`](../packages/core/scope), [`agent-loop`](../packages/core/agent-loop) | - | 配套子路徑註冊所屬包本地的檢查；該服務負責選擇、唯一性、子 fiber，以及標明所屬包的失敗。 |
| `ctx.typert` | `core` | [`typert-registry`](../packages/typert/registry) | - | [`typert-loader`](../packages/typert/loader), [`api-gateway`](../packages/api/gateway) | - | 外掛直接或透過 dsh-typert-loader 註冊即時 zod 貢獻；API 閘道消費呼叫描述符和提供者，其他執行時消費方則在各自邊界查詢 schema 與反射中繼資料。 |
| `ctx.typertGateway` | `core` | [`api-gateway`](../packages/api/gateway) | - | - | - | 將生成的 Remote 描述符與即時 Cordis 服務關聯，解析已註冊的身份，並透過共享的 Connection RPC 載體提供一元呼叫。 |
| `ctx.sessionPersistence` | `seam` | [`session-persistence`](../packages/session/session-persistence) | [`session-persistence-jsonl`](../packages/session/session-persistence-jsonl) | [`agent-loop`](../packages/core/agent-loop), [`tool-bash`](../packages/shell/tool-bash), [`hooks-claude-code`](../packages/hooks/hooks-claude-code), [`hooks-codex`](../packages/hooks/hooks-codex), [`session-query`](../packages/session-query/session-query), [`session-query-sqlite`](../packages/session-query/session-query-sqlite), [`message-feedback`](../packages/feedback/message-feedback) | - | JSONL backend 把 SessionEvent 詞彙持久化為每個 Session 一份產物。 |
| `ctx.configEditor` | `core` | [`config-editor`](../packages/boot/config-editor) | - | [`settings`](../packages/settings/settings), [`agent-default-model`](../packages/core/agent-default-model) | - | Persists profile config patches under the application file lock and HMR queue, then reconciles Loader entries. |
| `ctx.settings` | `core` | [`settings`](../packages/settings/settings) | - | [`api-settings-controller`](../packages/api/settings-controller) | - | Forms project volatile Config fields from active profile entries and delegate validated edits to config-editor. Plugins consume their own Config references. |
| `ctx.subagentModelSelection` | `core` | [`tool-subagent`](../packages/subagent/tool-subagent) | - | [`tool-subagent`](../packages/subagent/tool-subagent) | - | 擁有預設關閉的設定名稱空間；Agent 作用域的委派工具會在組合新頂層 Session 時讀取它。 |
| `ctx.credentials` | `seam` | [`credentials`](../packages/credentials/credentials) | [`credentials-local`](../packages/credentials/credentials-local) | [`api-settings-controller`](../packages/api/settings-controller), [`llm-deepseek`](../packages/llm/llm-deepseek), [`llm-pi-ai`](../packages/llm/llm-pi-ai) | - | 設定攜帶對機密資訊的引用；提供者擁有實際值。消費方按操作解析，因此輪換後的憑證會在緊接著的下一次請求中生效；settings controller 提供不含實際值的檢視和只寫儲存。 |
| `ctx.deepseekAccount` | `seam` | [`deepseek-account`](../packages/credentials/deepseek-account) | [`deepseek-account-platform`](../packages/credentials/deepseek-account-platform) | [`api-account-controller`](../packages/api/account-controller), [`llm-deepseek`](../packages/llm/llm-deepseek) | - | Host 負責瀏覽器授權和本地憑證；UI 使用方只接收不含 token 的狀態。 |
| `ctx.authorization` | `seam` | [`authorization`](../packages/credentials/authorization) | - | [`llm-pi-ai`](../packages/llm/llm-pi-ai) | - | flow 由知道如何取得某份憑證的外掛註冊，並以其寫入的記錄為鍵；seam 擁有這段對話與"每個鍵同時只跑一次嘗試"的生命週期，而非協定本身。 |
| `ctx.productTelemetry` | `service` | [`host-product-telemetry-otel`](../packages/host/product-telemetry-otel) | - | - | - | 透過 OTLP/HTTP 傳送顯式提交的分析事件；僅掛載外掛不會採集資訊。 |
| `ctx.sessionTelemetry` | `seam` | [`session-telemetry`](../packages/session/session-telemetry) | [`session-telemetry-otel`](../packages/session/session-telemetry-otel) | - | - | 該 seam 捕捉工作階段記錄、進行脫敏並交給一個後端；沒有其他元件消費該服務，其輸出會離開目前程序。 |
| `ctx.storage` | `seam` | [`storage`](../packages/storage/storage) | [`storage-json`](../packages/storage/storage-json), [`storage-sqlite`](../packages/storage/storage-sqlite) | [`storage-domain`](../packages/storage/storage-domain) | - | 各後端以不同名稱並列註冊；資料形態（領域優先）掛載到樞紐上，並將型別化操作轉換為不透明的 KV 單元原語。 |
| `ctx.storageDomain` | `core` | [`storage-domain`](../packages/storage/storage-domain) | - | [`workspace`](../packages/workspace/workspace) | - | 等待所有已設定後端就緒，然後將領域形態釋出為一個受生命週期約束的服務，用於型別化持久狀態。 |
| `ctx.messageFeedback` | `core` | [`message-feedback`](../packages/feedback/message-feedback) | - | - | - | 擁有權威 Session 日誌中的逐 assistant 訊息回饋、目標驗證、逐條目 compare-and-set 及 Host 一元 Remote 契約。回饋不進入模型歷史；日誌匯出遵循消費方策略。 |
| `ctx.sessionFeedback` | `core` | [`command-feedback`](../packages/feedback/command-feedback) | - | - | - | 透過 Host 一元 Remote 契約在 live Session 上把一條帶分類的 Session 級評價記錄為僅寫日誌的 feedback/record 事件；/feedback 命令共用同一個生產方。 |
| `ctx.workspaceRegistry` | `core` | [`workspace`](../packages/workspace/workspace) | - | [`api-workspace-controller`](../packages/api/workspace-controller), [`api-session-controller`](../packages/api/session-controller) | - | 透過領域設施擁有帶 WorkspaceId 品牌型別的記錄；穩定的 sessionIds 帳戶驅動 Host RPC 與 GUI 投影。 |
| `ctx.sessionQuery` | `seam` | [`session-query`](../packages/session-query/session-query) | [`session-query-sqlite`](../packages/session-query/session-query-sqlite) | [`session-reference`](../packages/context/session-reference), [`tool-session-query`](../packages/session-query/tool-session-query) | - | 該介面提供精確讀取、過濾和追蹤；具體後端還提供全文協調、排序、摘要片段和遊標世代，而模型消費方負責工作區權限與不含遊標的渲染。 |
| `ctx.fileReferences` | `seam` | [`file-reference`](../packages/context/file-reference) | [`file-reference-local`](../packages/context/file-reference-local) | [`api-session-controller`](../packages/api/session-controller) | - | 該介面返回 Agent cwd 內僅含路徑的補全候選；提供者負責名稱空間存取與排序，但不讀取檔案內容。 |
| `ctx.sessionReferenceResolver` | `core` | [`session-reference`](../packages/context/session-reference) | - | - | - | 將目前表層中有界的對話快照投影為持久但不可信的訊息上下文；Host 介面卡負責提及語法。 |
| `ctx.sessionTitle` | `seam` | [`session-title`](../packages/session/session-title) | [`session-title-first-prompt-llm`](../packages/session/session-title-first-prompt-llm), [`session-title-all-prompts-llm`](../packages/session/session-title-all-prompts-llm) | - | - | 負責確定性退回、最新標題摺疊區，以及唯一的可選非同步提供者註冊。 |
| `ctx.systemPrompt` | `core` | [`system-prompt`](../packages/core/system-prompt) | - | [`agent-loop`](../packages/core/agent-loop), [`tools`](../packages/core/tools), [`tool-fs`](../packages/fs/tool-fs), [`tool-terminal`](../packages/terminal/tool-terminal), [`tool-web`](../packages/web/tool-web) | - | 為每個步驟收集提示詞各部分和麵向模型的工具 schema。 |
| `ctx.tools` | `core` | [`tools`](../packages/core/tools) | - | [`agent-loop`](../packages/core/agent-loop), [`tool-ask-user`](../packages/interaction/tool-ask-user), [`tool-bash`](../packages/shell/tool-bash), [`tool-cordis`](../packages/extensions/tool-cordis), [`tool-fs`](../packages/fs/tool-fs), [`tool-terminal`](../packages/terminal/tool-terminal), [`tool-skill`](../packages/skill/tool-skill), [`tool-subagent`](../packages/subagent/tool-subagent), [`tool-todo`](../packages/todo/tool-todo), [`tool-web`](../packages/web/tool-web) | - | 註冊能力，負責 PTC mode 傳輸，並讓呼叫依次經過策略前處理、單調守衛、環繞分派、策略後處理和最終結果觀測。 |
| `ctx.userQuestions` | `seam` | [`user-questions`](../packages/interaction/user-questions) | - | [`tool-ask-user`](../packages/interaction/tool-ask-user) | - | UI 前端提供目前生效的人工回答提供者；tool-ask-user 在提供者無關的 ask() promise 上暫停工具呼叫。 |
| `ctx.planMode` | `core` | [`plan-mode`](../packages/plan/plan-mode) | - | - | - | 摺疊已記錄的計劃／模式狀態，在輪次邊界重新整理使用者選擇，渲染由部署方擁有的指導資訊，註冊 /plan，並在狀態轉換期間保持計劃退出 schema 穩定。 |
| `ctx.agentPresets` | `core` | [`agent-preset-registry`](../packages/preset/agent-preset-registry) | - | - | - | 立即掛載 YAML 宣告的 preset 版本，把 Agent 和冷讀取繫結到作用域內的貢獻，並保留已替換的版本，直到最後一個使用者釋放它。 |
| `ctx.commands` | `core` | [`commands`](../packages/interaction/commands) | - | - | - | 外掛註冊直接面向人的命令，而不會把呼叫傳送給模型。 |
| `ctx.sessionProjections` | `core` | [`session-projection`](../packages/session/session-projection) | - | [`api-session-controller`](../packages/api/session-controller), [`tool-todo`](../packages/todo/tool-todo), [`session-title`](../packages/session/session-title) | - | 各領域註冊由狀態驅動的摺疊單元；主動驅動過程維護每個工作階段的水位狀態，Session controller 提供 baseline 並推送發生變化的值。 |
| `ctx.sessionProjectionCache` | `core` | [`session-projection-cache`](../packages/session/session-projection-cache) | - | [`api-session-controller`](../packages/api/session-controller), [`session-query`](../packages/session-query/session-query), [`session-reference`](../packages/context/session-reference) | - | 按工作階段持久儲存投影單元狀態的檢查點（節流檢查點，以及輪次／結束／分離時的必選檢查點），提供快取投影檢視，並加速 prepared Session 的投影恢復。 |
| `ctx.skills` | `seam` | [`skill`](../packages/skill/skill) | [`skill-badge`](../packages/skill/skill-badge), [`skill-filesystem`](../packages/skill/skill-filesystem), [`skill-office`](../packages/skill/skill-office) | [`tool-skill`](../packages/skill/tool-skill) | - | 合併提供者的 skill（技能）目錄；tool-skill 渲染工作階段字首目錄，並載入完整的 skill 正文。 |
| `ctx.agents` | `core` | [`agent`](../packages/core/agent) | - | [`agent-loop`](../packages/core/agent-loop), [`acp`](../packages/acp/acp), [`subagent-in-process-driver`](../packages/subagent/subagent-in-process-driver) | - | 擁有即時 Agent 控制代碼、建立／恢復工廠 seam，以及程序本地的發起方傳播。 |
| `ctx.agentDefaultModel` | `core` | [`agent-default-model`](../packages/core/agent-default-model) | - | [`api-session-controller`](../packages/api/session-controller), [`headless`](../packages/bundle/headless) | - | Reads the default ModelSelection from volatile Config and saves selections through the profile editor. |
| `ctx.agentLoop` | `bundle` | [`agent-loop`](../packages/core/agent-loop) | - | [`base`](../packages/bundle/base), [`sdk-minimal`](../packages/bundle/sdk-minimal) | - | 唯一的具體迴圈外掛；擴充功能包依賴 dsh-agent 的事件和服務，而不依賴此包。 |
| `ctx.schedule` | `core` | [`schedule`](../packages/schedule/schedule) | - | - | - | 獨立於 Session 的載入狀態儲存任務，並將到期訊息排入原 Session。 |
| `ctx.goals` | `core` | [`goal`](../packages/goal/goal) | - | - | - | 從工作階段日誌摺疊帶修訂版本的目標狀態，並將即時延續啟用保留在程序本地。 |
| `ctx.ssh` | `core` | [`ssh`](../packages/ssh/ssh) | - | [`fs-ssh`](../packages/ssh/fs-ssh), [`subprocess-ssh`](../packages/ssh/subprocess-ssh), [`sandbox-ssh`](../packages/ssh/sandbox-ssh) | - | 負責一條經過認證的 OpenSSH 連線、已安裝輔助程式身份、獨立程式流，以及配套遠端提供者的斷連清理。 |
| `ctx.subprocess` | `seam` | [`subprocess`](../packages/subprocess/subprocess) | [`subprocess-local`](../packages/subprocess/subprocess-local), [`subprocess-ssh`](../packages/ssh/subprocess-ssh) | [`bash-local`](../packages/shell/bash-local), [`bash-sandbox`](../packages/shell/bash-sandbox), [`terminal-bash`](../packages/terminal/terminal-bash), [`lsp-stdio`](../packages/lsp/lsp-stdio), [`subagent-acp`](../packages/subagent/subagent-acp), [`subagent-codex`](../packages/subagent/subagent-codex), [`subagent-claude-code`](../packages/subagent/subagent-claude-code) | - | Bash 執行器、PTY shell 後端、LSP Host，以及程序外 ACP、Codex 和 Claude Code subagent 後端都透過 ctx.subprocess 執行 spawn；該服務負責程序座標、程序樹／工作階段生命週期、stdio 處置、終端機制和 kill 升級。 |
| `ctx.shell` | `seam` | [`shell`](../packages/shell/shell) | [`bash-local`](../packages/shell/bash-local), [`bash-sandbox`](../packages/shell/bash-sandbox), [`pwsh-local`](../packages/shell/pwsh-local) | [`tool-bash`](../packages/shell/tool-bash), [`tool-pwsh`](../packages/shell/tool-pwsh), [`hooks-claude-code`](../packages/hooks/hooks-claude-code), [`hooks-codex`](../packages/hooks/hooks-codex) | - | 面向模型的 shell 工具和掛鉤橋接消費此 seam；沙箱、遠端或 PowerShell 執行器可以替換 bash-local，而無需改動這些消費方。 |
| `ctx.shellEnv` | `core` | [`shell-env`](../packages/shell/shell-env) | - | [`tool-bash`](../packages/shell/tool-bash), [`tool-pwsh`](../packages/shell/tool-pwsh) | - | 外掛宣告限定於 effect 作用域的 DSH_* 事實；每個 shell 工具在每次執行時收集一份可信快照，其執行器據此重建名稱空間。 |
| `ctx.terminals` | `seam` | [`terminal`](../packages/terminal/terminal) | [`terminal-bash`](../packages/terminal/terminal-bash) | [`tool-terminal`](../packages/terminal/tool-terminal) | - | 註冊表負責精確到 Agent 的工作階段身份和清理；後端負責終端機制，tool-terminal 則提供限定於所有者作用域的模型介面。 |
| `ctx.sandbox` | `seam` | [`sandbox`](../packages/sandbox/sandbox) | [`sandbox-local`](../packages/sandbox/sandbox-local), [`sandbox-ssh`](../packages/ssh/sandbox-ssh) | [`bash-sandbox`](../packages/shell/bash-sandbox), [`terminal-bash`](../packages/terminal/terminal-bash) | - | 消費方交出即將執行 spawn 的確切 argv；與配套子程序提供者共享執行環境的後端按每次呼叫的策略包裝該 argv，並報告強制執行情況。 |
| `ctx.sandboxPolicy` | `core` | [`sandbox-policy`](../packages/sandbox/sandbox-policy) | - | [`bash-sandbox`](../packages/shell/bash-sandbox), [`fs-sandbox`](../packages/fs/fs-sandbox), [`terminal-bash`](../packages/terminal/terminal-bash) | - | 統一儲存部署預設模式和工作區根目錄；只有沙箱執行器和提供者讀取該服務（工具層使用它同時匯出的純 `sandbox/mode` 摺疊區）。兩類強制執行元件都讀取該服務，因此 bash 與 fs 不會限制到不同的根目錄。 |
| `ctx.approval` | `seam` | [`user-approval`](../packages/interaction/user-approval) | - | [`tools`](../packages/core/tools), [`tool-bash`](../packages/shell/tool-bash), [`acp`](../packages/acp/acp) | - | 一次性權限決策透過 `approval/request` waterfall（瀑布式事件）分派；回答方是監聽器（即 ACP 為自身 agent 提供的橋接），沒有回答方時以 `unavailable` 關閉失敗。 |
| `ctx.permissionPresets` | `core` | [`permission-presets`](../packages/interaction/permission-presets) | - | - | - | 面向使用者的預設表（`workspace-write`／`danger-full-access`），將沙箱模式與審批策略選項組合在一起；一次切換會寫入一個 `permission/preset` 事件，並貫通到兩個選項事件。 |
| `ctx.ptcRuntime` | `seam` | [`ptc-runtime`](../packages/ptc-runtime/ptc-runtime) | [`ptc-runtime-node`](../packages/ptc-runtime/ptc-runtime-node), [`experimental-ptc-runtime-python`](../packages/experimental/ptc-runtime-python) | [`tools`](../packages/core/tools), [`workflow-ptc`](../packages/workflow/workflow-ptc) | - | 使用 Host 提供的非同步繫結執行程式；tools 負責 PTC 呈現，workflow-ptc 負責工作流編排。 |
| `ctx.fs` | `seam` | [`fs`](../packages/fs/fs) | [`fs-local`](../packages/fs/fs-local), [`fs-sandbox`](../packages/fs/fs-sandbox), [`fs-ssh`](../packages/ssh/fs-ssh) | [`tool-fs`](../packages/fs/tool-fs) | [`fs-observation-policy`](../packages/fs/fs-observation-policy) | tool-fs 透過 ctx.fs 執行讀取／寫入／編輯；fs-sandbox 按共享沙箱模式限制變更；fs-observation-policy 透過 fs/* 事件門禁貢獻基於觀測狀態的檢查。 |
| `ctx.compaction` | `seam` | [`compaction`](../packages/compaction/compaction) | [`compaction-basic`](../packages/compaction/compaction-basic) | [`compaction-basic`](../packages/compaction/compaction-basic) | - | 基礎後端消費步驟後的壓力事件和請求錯誤恢復事件；不存在面向模型的壓縮工具。 |
| `ctx.subagents` | `seam` | [`subagent`](../packages/subagent/subagent) | [`subagent-spawn-in-process`](../packages/subagent/subagent-spawn-in-process), [`subagent-fork-in-process`](../packages/subagent/subagent-fork-in-process), [`subagent-acp`](../packages/subagent/subagent-acp), [`subagent-codex`](../packages/subagent/subagent-codex), [`subagent-claude-code`](../packages/subagent/subagent-claude-code), [`subagent-dsh-sdk`](../packages/subagent/subagent-dsh-sdk) | [`tool-subagent`](../packages/subagent/tool-subagent), [`tool-subagent-control`](../packages/subagent/tool-subagent-control), [`tool-ralph`](../packages/workflow/tool-ralph) | - | 提供者實作傳輸；該服務還負責可選的、基於 Activation 的延續編排，tool-subagent 選擇一次性或可延續委派，tool-subagent-control 傳遞後續訊息，而 tool-ralph 要求一條全新的結構化輸出路由。 |
| `ctx.speechToText` | `seam` | [`experimental-speech-to-text`](../packages/experimental/speech-to-text) | [`experimental-speech-to-text-sensevoice`](../packages/experimental/speech-to-text-sensevoice) | [`experimental-api-speech-to-text`](../packages/experimental/api-speech-to-text) | - | 路由顯式選擇的識別器；瀏覽器使用帶認證的 Remote，並在提交前將轉寫保留在草稿中。 |
| `ctx.agentTeams` | `core` | [`experimental-agent-team`](../packages/experimental/agent-team) | - | [`experimental-tool-agent-team`](../packages/experimental/tool-agent-team) | - | 負責隱式 Root roster、持久 peer mailbox、共享任務 DAG 與 continuable child 生命週期；tool-agent-team 提供模型控制工具。 |
| `ctx.inspector` | `core` | `inspector` | - | - | - | 負責 Worker 託管的 CDP target，以及獨立於傳輸的 Host 和 Client observation 與 Cordis tree query API。 |
| `ctx.jobs` | `seam` | [`jobs`](../packages/jobs/jobs) | [`jobs-local`](../packages/jobs/jobs-local) | [`tool-bash`](../packages/shell/tool-bash), [`tool-pwsh`](../packages/shell/tool-pwsh), [`tool-terminal`](../packages/terminal/tool-terminal), [`tool-subagent`](../packages/subagent/tool-subagent), [`tool-jobs`](../packages/jobs/tool-jobs), [`api-job-controller`](../packages/api/job-controller) | - | 生產方（後臺 bash/pwsh、PTY 傳送和 subagent 委派）登記正在執行的工作；宣告 record 的 job 還為非消費觀察者流式提供原始輸出；tool-jobs 是面向模型的控制器，用於讀取、列出和終止這些工作；jobs-local 是程序本地註冊表。 |
| `ctx.web` | `seam` | [`web`](../packages/web/web) | [`web-search-exa`](../packages/web/web-search-exa), [`web-search-perplexity`](../packages/web/web-search-perplexity), [`web-search-deepseek`](../packages/web/web-search-deepseek), [`web-fetch-http`](../packages/web/web-fetch-http) | [`tool-web`](../packages/web/tool-web) | - | 搜尋和抓取提供者註冊到同一個 ctx.web seam；tool-web 負責穩定的面向模型名稱。 |
| `ctx.spillStore` | `seam` | [`spill`](../packages/spill/spill) | [`spill-local`](../packages/spill/spill-local) | [`spill-policy`](../packages/spill/spill-policy) | - | 後端儲存過大的工具文字，並返回面向模型的定位資訊和取回提示；spill-policy 是 tools/post-execute 消費方，負責決定何時 spill。 |
| `ctx.directoryPicker` | `seam` | [`host-directory-picker`](../packages/host/directory-picker) | [`host-directory-picker-native`](../packages/host/directory-picker-native), [`host-directory-picker-browse`](../packages/host/directory-picker-browse) | [`api-workspace-controller`](../packages/api/workspace-controller) | - | 帶判別標記的互動能力：原生後端在 Host 顯示裝置上開啟一個作業系統選擇器，瀏覽後端為應用內瀏覽器提供列表與建立原語；雙端後端透過其瀏覽器側填充 ui-workspace 目錄流程的 slot（不透過協定釋出）。 |
| `ctx.webServer` | `core` | [`host-webserver`](../packages/host/webserver) | - | [`client-connection`](../packages/client/connection), [`client-modules`](../packages/client/modules), [`client-hmr`](../packages/client/hmr) | - | 普通的 node:http 載體：具名路由註冊表、索引轉換 tap，以及靜態 dist 退回；Web 傳輸外掛註冊自己的路由。 |
| `ctx.clientModules` | `core` | [`client-modules`](../packages/client/modules) | - | [`client-hmr`](../packages/client/hmr) | - | 透過增量 `dsh.client` 掃描組合 __DSH_BOOT__ 入口圖，提供外掛組合包，並通知重建／圖變更訂閱方。 |
| `ctx.workflowEngine` | `seam` | [`workflow`](../packages/workflow/workflow) | [`workflow-ptc`](../packages/workflow/workflow-ptc) | [`tool-workflow`](../packages/workflow/tool-workflow), [`tool-ralph`](../packages/workflow/tool-ralph) | - | 每個上下文使用一個引擎，與 bash 相同，且沒有具名提供者註冊表；通用工作流與固定 Ralph 消費方啟動執行，其中的 agent() 呼叫透過 ctx.subagents 扇出。 |
| `ctx.webhookRuntime` | `core` | [`webhook`](../packages/webhook/webhook) | - | [`webhook-github`](../packages/webhook/webhook-github) | - | 提供者介面卡分派已認證交付；可信外掛註冊獨立的程序本地規則，runtime 把非 null 結果轉換為普通的 Workspace-backed Session，不保留交付或完成狀態。 |
| `ctx.lsp` | `seam` | [`lsp`](../packages/lsp/lsp) | [`lsp-stdio`](../packages/lsp/lsp-stdio) | [`tool-lsp`](../packages/lsp/tool-lsp) | - | 提供者註冊與選擇，加上恰好四種操作的標準化查詢執行；該 seam 不提供協定逃生口，後端必須轉換為標準化請求和結果。 |
| `ctx.dynamicCordisRunner` | `core` | [`cordis-host-runner`](../packages/extensions/cordis-host-runner) | - | [`tool-cordis`](../packages/extensions/tool-cordis) | - | 擁有記憶體定義註冊表、Host 半的 vm 沙箱和 request-run 往返流程；瀏覽器頁面透過其 Remote 名稱空間線上存取同一服務。 |
| `ctx.cordisInspect` | `core` | [`cordis-host-runner`](../packages/extensions/cordis-host-runner) | - | [`tool-cordis`](../packages/extensions/tool-cordis) | - | 註冊 Host inspect 提供者、映像 Client 提供者 manifest，並透過動態 Cordis 傳輸路由 Client 查詢。 |

維護模式：混合模式。服務從 Cordis 宣告中發現；介面、實作和消費方角色在 `scripts/gen-doc-graphs.ts` 中分類，並設有完整性守衛。
