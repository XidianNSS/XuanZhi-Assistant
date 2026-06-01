import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const readAll = async (...paths) => (await Promise.all(paths.map((path) => read(path)))).join('\n');
const assistantStyleModules = [
  'src/styles/assistant.css',
  'src/styles/assistant/shell.css',
  'src/styles/assistant/sidebar.css',
  'src/styles/assistant/agent-create.css',
  'src/styles/assistant/file-space.css',
  'src/styles/assistant/settings.css',
  'src/styles/assistant/responsive.css',
];
const readAssistantStyles = () => readAll(...assistantStyleModules);
const exists = async (path) => {
  try {
    await access(new URL(`../${path}`, import.meta.url));
    return true;
  } catch {
    return false;
  }
};

test('assistant shell exposes the QClaw-style workspace structure', async () => {
  const sidebar = await read('src/components/assistant/Sidebar.tsx');
  const assistantCss = await readAssistantStyles();

  assert.match(sidebar, /assistant-nav-rail/, 'expected a narrow navigation rail in the sidebar');
  assert.match(sidebar, /key:\s*'chat'/, 'expected chat to remain in the rail');
  assert.match(sidebar, /key:\s*'file'/, 'expected files to remain in the rail');
  assert.doesNotMatch(sidebar, /key:\s*'(expert|task|connect|memory|lab)'/, 'expected only chat and files in the rail');
  assert.match(sidebar, /nav-rail-bottom/, 'expected the bottom settings entry to remain');
  assert.match(sidebar, /nav-rail-icon/, 'expected the bottom settings icon to remain');
  assert.doesNotMatch(sidebar, /<BrandLockup \/>/, 'expected the sidebar brand lockup to be removed');
  assert.match(assistantCss, /--nav-rail-width:\s*68px/, 'expected a fixed narrow rail token');
  assert.match(assistantCss, /grid-template-columns:\s*var\(--nav-rail-width\) var\(--agent-sidebar-width\)/, 'expected rail + agent list columns');
});

test('settings dialog is promoted to a static settings center', async () => {
  const sidebar = await read('src/components/assistant/Sidebar.tsx');
  const assistantCss = await readAssistantStyles();

  assert.match(sidebar, /settings-shell/, 'expected settings center markup');
  assert.match(sidebar, /settings-menu-item is-active/, 'expected a selected settings section');
  assert.match(sidebar, /settings-switch is-on/, 'expected static switch controls');
  assert.match(assistantCss, /settings-modal/, 'expected dedicated settings modal sizing');
});

test('rail avatar opens settings instead of the login dialog', async () => {
  const sidebar = await read('src/components/assistant/Sidebar.tsx');
  const assistantCss = await readAssistantStyles();

  assert.match(sidebar, /nav-avatar-trigger/, 'expected the rail avatar to be an account trigger');
  assert.match(sidebar, /setSettingsOpen\(true\)/, 'expected avatar click to open settings');
  assert.doesNotMatch(sidebar, /setAccountLoginOpen|AccountLoginDialog|account-login-shell/, 'expected the login dialog code to be removed from the sidebar');
  assert.doesNotMatch(sidebar, /aria-label="账户菜单"/, 'expected the footer ellipsis account trigger to be removed');
  assert.doesNotMatch(sidebar, /sidebar-footer/, 'expected the footer account block to be removed');
  assert.doesNotMatch(assistantCss, /account-login-/, 'expected account login modal styling to be removed');
});

test('conversation list uses inline pending spinners instead of status groups', async () => {
  const sidebar = await read('src/components/assistant/Sidebar.tsx');
  const assistantCss = await readAssistantStyles();

  assert.doesNotMatch(sidebar, /groupable=/, 'expected status grouping to be removed');
  assert.doesNotMatch(sidebar, /group:\s*taskStatusMeta/, 'expected conversation items not to assign status groups');
  assert.doesNotMatch(sidebar, /已完成/, 'expected completed group label to be removed from sidebar logic');
  assert.match(sidebar, /hasActiveTask/, 'expected the agent card to know when any task is active');
  assert.match(sidebar, /agent-card-spinner/, 'expected the active agent avatar to render a spinner badge');
  assert.match(sidebar, /conversation-item-spinner/, 'expected active conversation items to render a leading spinner');
  assert.doesNotMatch(sidebar, /conversation-title-spinner/, 'expected active conversation items not to render duplicate tail spinners');
  assert.doesNotMatch(sidebar, /task\.status !== 'completed'/, 'expected failed or cancelled terminal tasks not to spin');
  assert.match(sidebar, /isTaskActive\(task\.status\)/, 'expected spinner visibility to use an active-task helper');

  const activeStatusList = sidebar.match(/activeTaskStatuses = new Set<Task\['status'\]>\(\[(?<statuses>[\s\S]*?)\]\)/);
  assert.ok(activeStatusList?.groups?.statuses, 'expected an explicit active task status list');
  assert.match(activeStatusList.groups.statuses, /'created'/, 'expected newly created tasks to show pending indicator');
  assert.match(activeStatusList.groups.statuses, /'planning'/, 'expected planning tasks to show pending indicator');
  assert.match(activeStatusList.groups.statuses, /'running'/, 'expected running tasks to show pending indicator');
  assert.match(activeStatusList.groups.statuses, /'waiting_approval'/, 'expected approval-waiting tasks to show pending indicator');
  assert.doesNotMatch(activeStatusList.groups.statuses, /'completed'|'failed'/, 'expected terminal tasks to hide pending indicator');
  assert.match(assistantCss, /agent-card-spinner/, 'expected active agent avatar spinner styling in CSS');
  assert.match(assistantCss, /conversation-item-spinner/, 'expected active conversation icon spinner styling in CSS');
});

test('task execution workspace is removed from the basic chat surface', async () => {
  const shell = await read('src/components/assistant/AssistantShell.tsx');
  const header = await read('src/components/assistant/WorkspaceHeader.tsx');
  const chatPanel = await read('src/components/chat/ChatPanel.tsx');
  const assistantCss = await readAssistantStyles();
  const chatCss = await read('src/styles/chat.css');

  assert.doesNotMatch(shell, /AgentWorkspace/, 'expected the right task workspace component to be removed from the shell');
  assert.doesNotMatch(shell, /workspaceCollapsed|toggleWorkspace|task-workspace/, 'expected right workspace collapse state to be removed');
  assert.doesNotMatch(header, /workspaceCollapsed|onToggleWorkspace|workspace-toggle/, 'expected the header not to expose a workspace toggle');
  assert.doesNotMatch(header, /pendingApprovalCount|pendingApprovalSummaries|pending-approval-button/, 'expected global header approval entry to be removed');
  assert.doesNotMatch(shell, /pendingApprovalSummaries|pendingApprovalCount/, 'expected approval prompts to stay scoped to the active chat');
  assert.doesNotMatch(chatPanel, /AgentTimeline|ArtifactPanel/, 'expected progress and artifact modules to be removed from the chat panel');
  assert.doesNotMatch(chatPanel, /events|artifacts|inline-task-activity|inline-final-artifacts/, 'expected the chat panel to keep only the basic message surface');
  assert.doesNotMatch(shell, /activeEvents|activeArtifacts|activeTaskFinished/, 'expected task progress and artifact view state to be removed');
  assert.doesNotMatch(shell, /getTaskEvents|getTaskArtifacts|eventsByTask|artifactsByTask/, 'expected task progress and artifact snapshot loading to be removed');
  assert.match(shell, /activePendingApprovals/, 'expected pending approvals to be derived for the active chat');
  assert.match(shell, /composer-approval-stack/, 'expected approval prompts above the composer');
  assert.equal(await exists('src/components/agent/AgentWorkspace.tsx'), false, 'expected the old right workspace component file to be deleted');
  assert.equal(await exists('src/components/agent/AgentTimeline.tsx'), false, 'expected the inline progress component file to be deleted');
  assert.equal(await exists('src/components/artifacts/ArtifactPanel.tsx'), false, 'expected the artifact panel component file to be deleted');
  assert.equal(await exists('src/components/artifacts/ArtifactViewer.tsx'), false, 'expected the artifact viewer component file to be deleted');
  assert.doesNotMatch(chatCss, /inline-task-activity|inline-final-artifacts/, 'expected inline progress and artifact chat styles to be deleted');
  assert.match(chatCss, /composer-approval-stack/, 'expected composer approval prompt styles');
  assert.doesNotMatch(assistantCss, /agent-progress|agent-tool-call|agent-workspace|task-workspace|artifact-panel|artifact-viewer/, 'expected unused workspace, progress, and artifact styles to be deleted');
});

test('task streams are isolated when switching conversations', async () => {
  const shell = await read('src/components/assistant/AssistantShell.tsx');
  const chatCanvas = await read('src/components/chat/ChatCanvas.tsx');

  assert.match(shell, /streamGenerationRef/, 'expected stream subscriptions to use a generation guard');
  assert.match(shell, /getStreamEventTaskId/, 'expected stream events to be checked against their source task');
  assert.match(shell, /eventTaskId !== taskId/, 'expected stale task stream events to be ignored');
  assert.match(shell, /streamGeneration !== streamGenerationRef\.current/, 'expected late async stream setup to be ignored');
  assert.match(shell, /case 'message\.updated'/, 'expected streamed assistant message updates to be merged into the active task');
  assert.doesNotMatch(chatCanvas, /typing:\s*\{\s*effect:\s*'typing'/, 'expected historical assistant messages not to replay typing on conversation switch');
});

test('assistant messages render model markdown instead of raw markdown text', async () => {
  const chatCanvas = await read('src/components/chat/ChatCanvas.tsx');
  const markdownContentExists = await exists('src/components/chat/MarkdownContent.tsx');
  const chatCss = await read('src/styles/chat.css');

  assert.equal(markdownContentExists, true, 'expected a dedicated assistant markdown renderer component');
  const markdownContent = await read('src/components/chat/MarkdownContent.tsx');
  assert.match(markdownContent, /@ant-design\/x-markdown/, 'expected the renderer to use @ant-design/x-markdown');
  assert.match(markdownContent, /className="assistant-markdown"/, 'expected XMarkdown to receive the assistant markdown class');
  assert.match(markdownContent, /content=\{content\}/, 'expected XMarkdown to receive the assistant content');
  assert.match(markdownContent, /hasNextChunk:\s*streaming/, 'expected XMarkdown streaming to track the live message state');
  assert.match(markdownContent, /tail:\s*streaming/, 'expected XMarkdown to show a streaming tail only for live messages');
  assert.match(chatCanvas, /<MarkdownContent content=\{message\.content\}/, 'expected assistant messages to use MarkdownContent');
  assert.match(chatCanvas, /streaming=\{message\.status === 'streaming'\}/, 'expected assistant message status to enable streaming markdown');
  assert.match(chatCanvas, /message\.role === 'assistant'/, 'expected markdown rendering to be scoped to assistant messages');
  assert.match(chatCss, /assistant-markdown/, 'expected markdown content styles');
  assert.match(chatCss, /assistant-markdown strong/, 'expected bold markdown styling');
  assert.match(chatCss, /assistant-markdown ol/, 'expected ordered-list markdown styling');
});

test('composer keeps only base input actions without capability toggles', async () => {
  const composer = await read('src/components/chat/ChatComposer.tsx');
  const data = await read('src/data/assistantData.tsx');
  const chatCss = await read('src/styles/chat.css');

  assert.doesNotMatch(composer, /toolTags|sender-footer-tools|<Tag|<Space/, 'expected composer capability toggles to be removed');
  assert.doesNotMatch(data, /export const toolTags/, 'expected unused composer capability metadata to be deleted');
  assert.doesNotMatch(chatCss, /sender-footer-tools|sender-footer \.ant-tag/, 'expected deleted composer toggle styles not to remain');
  assert.match(composer, /sender-footer-actions/, 'expected base composer actions to remain');
  assert.match(composer, /paperclip/, 'expected attachment action to remain');
});

test('new agent flow shows a template picker and isolates conversations per agent', async () => {
  const shell = await read('src/components/assistant/AssistantShell.tsx');
  const sidebar = await read('src/components/assistant/Sidebar.tsx');
  const picker = await read('src/components/assistant/AgentCreatePage.tsx');
  const data = await read('src/data/assistantData.tsx');
  const assistantCss = await readAssistantStyles();

  assert.match(shell, /DEFAULT_AGENT_ID/, 'expected a stable default agent identity');
  assert.match(shell, /localAgents/, 'expected locally-created agents to be tracked');
  assert.match(shell, /activeAgentId/, 'expected active agent selection state');
  assert.match(shell, /taskAgentMap/, 'expected tasks to be mapped to the owning agent');
  assert.match(shell, /activeAgentTasks/, 'expected the conversation list to be filtered by active agent');
  assert.match(shell, /showAgentCreatePage/, 'expected New Agent to route to the creation page');
  assert.match(shell, /createAgentFromTemplate/, 'expected selecting a template to add an agent');
  assert.match(shell, /<AgentCreatePage/, 'expected the agent creation page to render in the main workspace');

  assert.match(sidebar, /agentItems\.map/, 'expected the sidebar to render multiple agents');
  assert.match(sidebar, /onAgentSelect/, 'expected clicking an agent to switch agent context');
  assert.match(sidebar, /onCreateAgent/, 'expected the New Agent button to open the picker instead of a blank chat');

  assert.match(picker, /agent-create-page/, 'expected a dedicated agent creation surface');
  assert.match(picker, /agentTemplates\.map/, 'expected several template cards');
  assert.match(picker, /agent-template-card/, 'expected selectable agent template cards');
  assert.match(data, /export const agentTemplates/, 'expected mock agent template data');
  assert.match(assistantCss, /agent-create-page/, 'expected creation page layout styles');
  assert.match(assistantCss, /agent-template-card/, 'expected template card styles');
  assert.match(assistantCss, /agent-list/, 'expected sidebar multi-agent list styles');
});

test('file workspace renders the screenshot-style file space', async () => {
  const shell = await read('src/components/assistant/AssistantShell.tsx');
  const sidebar = await read('src/components/assistant/Sidebar.tsx');
  const filePage = await read('src/components/files/FileSpacePage.tsx');
  const assistantCss = await readAssistantStyles();

  assert.match(sidebar, /activeWorkspace/, 'expected the sidebar rail to track the active workspace');
  assert.match(sidebar, /onWorkspaceChange/, 'expected rail items to switch workspaces');
  assert.doesNotMatch(sidebar, /key:\s*'file'[\s\S]*disabled:\s*true/, 'expected the file rail item to be enabled');
  assert.match(sidebar, /file-sidebar-panel/, 'expected a dedicated file-space sidebar panel');
  assert.match(sidebar, /file-category-list/, 'expected file categories in the sidebar');
  assert.match(sidebar, /文件空间/, 'expected the file sidebar title');

  assert.match(shell, /WorkspaceView = 'home' \| 'chat' \| 'agent-picker' \| 'file'/, 'expected file to be a workspace view');
  assert.match(shell, /showFileSpace/, 'expected a file workspace route handler');
  assert.match(shell, /<FileSpacePage/, 'expected the file space page to render in the main workspace');

  assert.match(filePage, /file-space-page/, 'expected a dedicated file page surface');
  assert.match(filePage, /搜索文件名/, 'expected the top file search input');
  assert.match(filePage, /全部Agent/, 'expected the agent filter control');
  assert.match(filePage, /1 个文件/, 'expected the file count');
  assert.match(filePage, /请提供你的出生信息:/, 'expected grouped file source title');
  assert.match(filePage, /task-summary_20260527_1525\.md/, 'expected the mock markdown file row');
  assert.match(filePage, /file-view-toggle/, 'expected list/grid view controls');

  assert.match(assistantCss, /file-space-page/, 'expected file page layout styles');
  assert.match(assistantCss, /file-sidebar-panel/, 'expected file sidebar styles');
  assert.match(assistantCss, /file-card/, 'expected file card styles');
});

test('assistant styles are split by feature module', async () => {
  const assistantCss = await read('src/styles/assistant.css');
  const responsiveCss = await read('src/styles/responsive.css');

  assert.match(assistantCss, /@import '\.\/assistant\/shell\.css'/, 'expected shell styles to live in an assistant module');
  assert.match(assistantCss, /@import '\.\/assistant\/sidebar\.css'/, 'expected sidebar styles to live in an assistant module');
  assert.match(assistantCss, /@import '\.\/assistant\/agent-create\.css'/, 'expected agent creation styles to live in an assistant module');
  assert.match(assistantCss, /@import '\.\/assistant\/file-space\.css'/, 'expected file-space styles to live in an assistant module');
  assert.match(assistantCss, /@import '\.\/assistant\/settings\.css'/, 'expected settings styles to live in an assistant module');
  assert.match(responsiveCss, /@import '\.\/assistant\/responsive\.css'/, 'expected assistant responsive rules to load in the final responsive cascade');
  assert.ok(assistantCss.length < 500, 'expected assistant.css to be a small manifest, not a monolithic stylesheet');

  for (const path of assistantStyleModules.slice(1)) {
    assert.equal(await exists(path), true, `expected ${path} to exist`);
  }
});

test('home and chat styling follow the approved visual contract', async () => {
  const data = await read('src/data/assistantData.tsx');
  const chatCss = await read('src/styles/chat.css');
  const uiCss = await read('src/styles/ui.css');

  assert.match(data, /tone:\s*'lavender'/, 'expected colored prompt card metadata');
  assert.match(chatCss, /prompt-tone-lavender/, 'expected prompt tone styles');
  assert.doesNotMatch(chatCss, /inline-final-artifacts/, 'expected completed task artifacts to be removed from the chat flow');
  assert.match(uiCss, /--radius:\s*8px/, 'expected shadcn-like radius token');
  assert.match(uiCss, /--background:\s*#ffffff/, 'expected shadcn-like background token');
});
